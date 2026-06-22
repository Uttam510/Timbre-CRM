import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses the service role key so API routes can
// read/write the leads table. Never expose the service key to the browser.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
