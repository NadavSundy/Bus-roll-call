import type { FC } from 'react'
import type { UserProfile } from '../types'

interface AuthPanelProps {
  user: UserProfile | null
  email: string
  onEmailChange: (value: string) => void
  onSignIn: () => void
  onSignOut: () => void
  loading: boolean
  authMessage: string | null
}

const AuthPanel: FC<AuthPanelProps> = ({
  user,
  email,
  onEmailChange,
  onSignIn,
  onSignOut,
  loading,
  authMessage,
}) => {
  return (
    <div className="panel auth-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Login</p>
          <h2>Sign in to manage groups</h2>
        </div>
      </div>

      {user ? (
        <div className="auth-row">
          <span>Signed in as {user.email ?? user.id}</span>
          <button type="button" onClick={onSignOut} disabled={loading} className="secondary-button">
            Sign out
          </button>
        </div>
      ) : (
        <div className="auth-row auth-form">
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="you@example.com"
          />
          <button type="button" onClick={onSignIn} disabled={!email.trim() || loading} className="primary-button">
            Send magic link
          </button>
        </div>
      )}
      {authMessage ? <p className="auth-message">{authMessage}</p> : null}
    </div>
  )
}

export default AuthPanel
