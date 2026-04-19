import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { AuthMiddleware } from "../_shared/jwt.ts";

const PRICE_ID = "price_1TO3tRCjpMVCrjw8OuWsYNCU";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return AuthMiddleware(req, async (req, userId, userEmail) => {
    console.log(`[checkout] request from user ${userId} (${userEmail})`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      console.error("[checkout] SUPABASE_URL is not set");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: SUPABASE_URL not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[checkout] STRIPE_SECRET_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: STRIPE_SECRET_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const stripe = new Stripe(stripeKey);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_pro")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error(`[checkout] failed to fetch profile for ${userId}:`, profileError);
      return new Response(
        JSON.stringify({ error: "Failed to load user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (profile?.is_pro) {
      console.log(`[checkout] user ${userId} is already Pro — rejecting`);
      return new Response(
        JSON.stringify({ error: "Already a Pro subscriber" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let customerId = profile?.stripe_customer_id ?? null;

    if (!customerId) {
      console.log(`[checkout] no Stripe customer for ${userId}, creating one`);
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      console.log(`[checkout] created Stripe customer ${customerId} for user ${userId}`);

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updateError) {
        console.error(`[checkout] failed to save stripe_customer_id for ${userId}:`, updateError);
        // Non-fatal: checkout can still proceed; the webhook will set it again on success.
      }
    } else {
      console.log(`[checkout] reusing existing Stripe customer ${customerId} for user ${userId}`);
    }

    const origin = req.headers.get("origin") ?? "http://localhost:5173";
    console.log(`[checkout] creating checkout session for customer ${customerId}, origin ${origin}`);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}/profile?checkout=success`,
      cancel_url: `${origin}/profile`,
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
    });

    console.log(`[checkout] session created: ${session.id} → ${session.url}`);

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  });
});
