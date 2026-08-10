// Authenticates with the production Supabase project and calls store_today().
// Run by .github/workflows/keepalive.yml every 3 days.
// Required env: PROD_SUPABASE_URL, PROD_SUPABASE_ANON_KEY, KEEPALIVE_EMAIL, KEEPALIVE_PASSWORD
const { PROD_SUPABASE_URL, PROD_SUPABASE_ANON_KEY, KEEPALIVE_EMAIL, KEEPALIVE_PASSWORD } =
  process.env

if (!PROD_SUPABASE_URL || !PROD_SUPABASE_ANON_KEY || !KEEPALIVE_EMAIL || !KEEPALIVE_PASSWORD) {
  console.error('Missing required env vars. Check GitHub secrets configuration.')
  process.exit(1)
}

const authRes = await fetch(`${PROD_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: PROD_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: KEEPALIVE_EMAIL, password: KEEPALIVE_PASSWORD }),
})

if (!authRes.ok) {
  console.error(`Auth failed: ${authRes.status} ${await authRes.text()}`)
  process.exit(1)
}

const { access_token } = await authRes.json()

const pingRes = await fetch(`${PROD_SUPABASE_URL}/rest/v1/rpc/store_today`, {
  method: 'POST',
  headers: {
    apikey: PROD_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
})

if (!pingRes.ok) {
  console.error(`Ping failed: ${pingRes.status} ${await pingRes.text()}`)
  process.exit(1)
}

console.log(`store_today: ${await pingRes.text()}`)
