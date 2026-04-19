import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeKey) {
    console.error('[webhook] STRIPE_SECRET_KEY is not set')
    return new Response('Server misconfiguration: STRIPE_SECRET_KEY not set', { status: 500 })
  }
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set')
    return new Response('Server misconfiguration: STRIPE_WEBHOOK_SECRET not set', { status: 500 })
  }

  const stripe = new Stripe(stripeKey)

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.error('[webhook] request is missing the Stripe-Signature header')
    return new Response('Missing Stripe-Signature header', { status: 400 })
  }

  // Signature verification requires the raw body — do NOT parse as JSON first
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', (err as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

  console.log(`[webhook] received event ${event.type} (id: ${event.id})`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  switch (event.type) {
    // Fired when the user completes the Stripe Checkout flow.
    // Store the customer and subscription IDs and grant Pro access.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.subscription_data?.metadata?.supabase_user_id
        ?? session.metadata?.supabase_user_id

      if (!userId) {
        console.error('[webhook] checkout.session.completed: no supabase_user_id in metadata — cannot grant Pro. Session:', session.id)
        break
      }

      console.log(`[webhook] checkout.session.completed: granting Pro to user ${userId}, customer ${session.customer}, subscription ${session.subscription}`)

      const { error } = await supabase.from('profiles').update({
        is_pro: true,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      }).eq('id', userId)

      if (error) {
        console.error(`[webhook] checkout.session.completed: DB update failed for user ${userId}:`, error)
      } else {
        console.log(`[webhook] checkout.session.completed: Pro granted to user ${userId}`)
      }
      break
    }

    // Fired on the initial payment and on every annual renewal.
    // Ensures is_pro stays true after a successful renewal charge.
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id

      if (!customerId) {
        console.error('[webhook] invoice.paid: event has no customer ID — cannot confirm Pro. Invoice:', invoice.id)
        break
      }

      console.log(`[webhook] invoice.paid: looking up profile for Stripe customer ${customerId}`)

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (fetchError || !data) {
        console.error(`[webhook] invoice.paid: no profile found for Stripe customer ${customerId}:`, fetchError)
        break
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('id', data.id)

      if (error) {
        console.error(`[webhook] invoice.paid: DB update failed for user ${data.id}:`, error)
      } else {
        console.log(`[webhook] invoice.paid: Pro confirmed for user ${data.id}`)
      }
      break
    }

    // Fired when a subscription is cancelled (by the user, by Stripe due to
    // failed payment recovery, or by an admin action). Revoke Pro access.
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id

      if (!customerId) {
        console.error('[webhook] customer.subscription.deleted: event has no customer ID — cannot revoke Pro. Subscription:', subscription.id)
        break
      }

      console.log(`[webhook] customer.subscription.deleted: looking up profile for Stripe customer ${customerId}`)

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (fetchError || !data) {
        console.error(`[webhook] customer.subscription.deleted: no profile found for Stripe customer ${customerId}:`, fetchError)
        break
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: false, stripe_subscription_id: null })
        .eq('id', data.id)

      if (error) {
        console.error(`[webhook] customer.subscription.deleted: DB update failed for user ${data.id}:`, error)
      } else {
        console.log(`[webhook] customer.subscription.deleted: Pro revoked for user ${data.id}`)
      }
      break
    }

    default:
      console.log(`[webhook] unhandled event type: ${event.type} (id: ${event.id}) — ignoring`)
  }

  // Always return 200 — Stripe retries on non-2xx responses
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
