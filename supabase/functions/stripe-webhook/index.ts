import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing Stripe-Signature header', { status: 400 })
  }

  // Signature verification requires the raw body — do NOT parse as JSON first
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    )
  } catch (err) {
    console.error('[webhook] Signature verification failed:', (err as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

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
        console.warn('[webhook] checkout.session.completed: no supabase_user_id in metadata')
        break
      }

      const { error } = await supabase.from('profiles').update({
        is_pro: true,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      }).eq('id', userId)

      if (error) console.error('[webhook] checkout.session.completed DB error:', error.message)
      else console.log(`[webhook] checkout.session.completed: granted Pro to ${userId}`)
      break
    }

    // Fired on the initial payment and on every annual renewal.
    // Ensures is_pro stays true after a successful renewal charge.
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id

      if (!customerId) break

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (fetchError || !data) {
        console.warn('[webhook] invoice.paid: no profile found for customer', customerId)
        break
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('id', data.id)

      if (error) console.error('[webhook] invoice.paid DB error:', error.message)
      else console.log(`[webhook] invoice.paid: confirmed Pro for ${data.id}`)
      break
    }

    // Fired when a subscription is cancelled (by the user, by Stripe due to
    // failed payment recovery, or by an admin action). Revoke Pro access.
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id

      if (!customerId) break

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (fetchError || !data) {
        console.warn('[webhook] subscription.deleted: no profile found for customer', customerId)
        break
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: false, stripe_subscription_id: null })
        .eq('id', data.id)

      if (error) console.error('[webhook] subscription.deleted DB error:', error.message)
      else console.log(`[webhook] subscription.deleted: revoked Pro for ${data.id}`)
      break
    }

    default:
      console.log(`[webhook] Unhandled event type: ${event.type}`)
  }

  // Always return 200 — Stripe retries on non-2xx responses
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
