import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/*
 * The one Supabase client.
 *
 * Both values are public by design — they ship inside the browser bundle. The
 * anon key grants nothing on its own: every table is behind RLS and every policy
 * requires a row in `app_user` (architecture-spec §4.2). The `service_role` key
 * must never appear anywhere in src/.
 *
 * Missing configuration fails here, loudly, at module load. A client built from
 * `undefined` produces a `fetch` to the string "undefined/rest/v1/..." and a
 * confusing network error three screens later.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. Copy .env.example to .env and fill them in from the Supabase dashboard.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // There is no signup route and no email-link flow; nothing ever arrives
    // back in the URL, so leave the address bar alone.
    detectSessionInUrl: false,
  },
})
