import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PRICE_ID = 'price_1TNyDcCvpz2eeScnkE4VutU2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Authenticate user from their JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  // User-scoped client — respects RLS, lets us call getUser()
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  // Service-role client — needed to read/write stripe_customer_id which the user
  // must not be able to set themselves
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Get or create a Stripe Customer for this user
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, is_pro')
    .eq('id', user.id)
    .single()

  if (profile?.is_pro) {
    return new Response(
      JSON.stringify({ error: 'Already a Pro subscriber' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let customerId = profile?.stripe_customer_id ?? null

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // Use the request Origin so success/cancel URLs work on any deployment
  const origin = req.headers.get('origin') ?? 'http://localhost:5173'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `${origin}/profile?checkout=success`,
    cancel_url: `${origin}/profile`,
    // Embed user ID so the webhook can look the user up without a DB round-trip
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  })

  return new Response(
    JSON.stringify({ url: session.url }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
