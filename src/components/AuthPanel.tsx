import { useState, type FC } from 'react'
import { getAppUrl } from '../lib/appUrl'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'

export type AuthMode = 'sign-in' | 'create-account' | 'forgot-password' | 'set-new-password'

interface AuthPanelProps {
  user: UserProfile | null
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onAuthChanged: (message?: string) => void
  onSignOut: () => void
  loading?: boolean
}

const MIN_PASSWORD_LENGTH = 8

const modeTitles: Record<AuthMode, string> = {
  'sign-in': 'Sign in to manage programmes',
  'create-account': 'Create an admin account',
  'forgot-password': 'Reset your password',
  'set-new-password': 'Set a new password',
}

const AuthPanel: FC<AuthPanelProps> = ({ user, mode, onModeChange, onAuthChanged, onSignOut, loading = false }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const changeMode = (nextMode: AuthMode) => {
    setError(null)
    setMessage(null)
    setPassword('')
    setConfirmPassword('')
    onModeChange(nextMode)
  }

  const validatePassword = () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    }

    if ((mode === 'create-account' || mode === 'set-new-password') && password !== confirmPassword) {
      return 'Passwords do not match.'
    }

    return null
  }

  const runAuthAction = async (action: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const successMessage = await action()
      setMessage(successMessage)
      onAuthChanged(successMessage)
    } catch (authError) {
      const authMessage = authError instanceof Error ? authError.message : 'Authentication failed.'
      setError(authMessage)
    } finally {
      setBusy(false)
    }
  }

  const createAccount = () =>
    runAuthAction(async () => {
      const cleanEmail = email.trim()
      if (!cleanEmail) throw new Error('Enter your email address.')
      const passwordError = validatePassword()
      if (passwordError) throw new Error(passwordError)

      const appUrl = getAppUrl()
      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback`,
        },
      })

      if (signUpError) throw signUpError
      changeMode('sign-in')
      return 'Account created. Check your email if confirmation is required.'
    })

  const signIn = () =>
    runAuthAction(async () => {
      const cleanEmail = email.trim()
      if (!cleanEmail) throw new Error('Enter your email address.')
      if (!password) throw new Error('Enter your password.')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (signInError) throw signInError
      return 'Signed in.'
    })

  const sendPasswordReset = () =>
    runAuthAction(async () => {
      const cleanEmail = email.trim()
      if (!cleanEmail) throw new Error('Enter your email address.')

      const appUrl = getAppUrl()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${appUrl}/auth/reset-password`,
      })

      if (resetError) throw resetError
      return 'Password reset email sent.'
    })

  const updatePassword = () =>
    runAuthAction(async () => {
      const passwordError = validatePassword()
      if (passwordError) throw new Error(passwordError)

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      window.history.replaceState(null, '', '/')
      changeMode('sign-in')
      return 'Password updated. You can now continue.'
    })

  if (user && mode !== 'set-new-password') {
    return (
      <section id="admin" className="panel auth-card">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Programme dashboard</h2>
        </div>
        <div className="auth-row">
          <span>{user.email ?? user.id}</span>
          <button type="button" className="secondary-button" onClick={onSignOut} disabled={loading || busy}>
            Sign out
          </button>
        </div>
      </section>
    )
  }

  return (
    <section id="admin" className="panel auth-card auth-panel">
      <div className="auth-panel-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>{modeTitles[mode]}</h2>
        </div>
        {mode !== 'set-new-password' ? (
          <div className="auth-mode-tabs" aria-label="Authentication mode">
            <button type="button" className={mode === 'sign-in' ? 'active' : ''} onClick={() => changeMode('sign-in')}>
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'create-account' ? 'active' : ''}
              onClick={() => changeMode('create-account')}
            >
              Create account
            </button>
          </div>
        ) : null}
      </div>

      <div className="stacked-form">
        {mode !== 'set-new-password' ? (
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
        ) : null}

        {mode !== 'forgot-password' ? (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </label>
        ) : null}

        {mode === 'create-account' || mode === 'set-new-password' ? (
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {error ? <div className="toast error">{error}</div> : null}
        {message ? <div className="toast success">{message}</div> : null}

        {mode === 'sign-in' ? (
          <button type="button" className="primary-button" onClick={signIn} disabled={loading || busy}>
            Sign in
          </button>
        ) : null}
        {mode === 'create-account' ? (
          <button type="button" className="primary-button" onClick={createAccount} disabled={loading || busy}>
            Create account
          </button>
        ) : null}
        {mode === 'forgot-password' ? (
          <button type="button" className="primary-button" onClick={sendPasswordReset} disabled={loading || busy}>
            Send password reset email
          </button>
        ) : null}
        {mode === 'set-new-password' ? (
          <button type="button" className="primary-button" onClick={updatePassword} disabled={loading || busy}>
            Update password
          </button>
        ) : null}

        {mode === 'sign-in' ? (
          <button type="button" className="text-button" onClick={() => changeMode('forgot-password')}>
            Forgot password?
          </button>
        ) : null}
        {mode === 'forgot-password' ? (
          <button type="button" className="text-button" onClick={() => changeMode('sign-in')}>
            Back to sign in
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default AuthPanel
