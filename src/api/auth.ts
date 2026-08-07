import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/*
 * Authentication (architecture-spec §5.2). Login only — there is no signup
 * route, deliberately: public signup is disabled on the project, and the app
 * offering a form that always fails would be worse than offering none.
 *
 * Authentication is not authorisation. A successful login says the credentials
 * were right; it says nothing about access. Every table is gated on a row in
 * `app_user`, which only `service_role` can create (architecture-spec §4.2), so
 * a logged-in stranger reads nothing. `useIsAllowlisted` is what the UI needs to
 * tell that apart from "the shop has no data yet".
 */

export type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'signedOut'; session: null }
  | { status: 'signedIn'; session: Session }

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null })

  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setState(
        data.session
          ? { status: 'signedIn', session: data.session }
          : { status: 'signedOut', session: null },
      )
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut', session: null })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
