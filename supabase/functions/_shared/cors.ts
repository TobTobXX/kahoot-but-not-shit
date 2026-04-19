// Canonical CORS headers for Supabase Edge Functions called from the browser.
// The Supabase JS client sends all four of these headers on every request.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
