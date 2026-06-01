import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import './AuthModal.css';

interface AuthModalProps {
  mode: 'login' | 'signup';
  onClose: () => void;
  onAuthenticated: () => void;
  onToggleMode: () => void;
}

export default function AuthModal({
  mode,
  onClose,
  onAuthenticated,
  onToggleMode,
}: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const { signIn, signUp, signInWithGoogle, isLoading, error, clearError } =
    useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === 'login') {
      await signIn(email, password);
      const { session } = useAuthStore.getState();
      if (session) {
        onAuthenticated();
      }
    } else {
      await signUp(email, password);
      const { session, error: signUpError } = useAuthStore.getState();
      if (!signUpError) {
        if (session) {
          onAuthenticated();
        } else {
          setSignUpSuccess(true);
        }
      }
    }
  };

  const handleGoogleAuth = async () => {
    clearError();
    await signInWithGoogle();
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-logo">
            <div className="auth-logo-icon">N</div>
            <span>Nami</span>
          </div>
          <button className="auth-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="auth-modal-body">
          {signUpSuccess ? (
            <div className="auth-success-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
              <div className="auth-success-icon" style={{ fontSize: '48px', marginBottom: '16px' }}>✉️</div>
              <h2 className="auth-title">Verify your email</h2>
              <p className="auth-subtitle" style={{ marginBottom: '24px', opacity: 0.85, fontSize: '14px', lineHeight: '1.5', color: '#a0aec0' }}>
                We've sent a verification link to <strong style={{ color: '#fff' }}>{email}</strong>. <br />Please check your inbox to activate your account and start editing!
              </p>
              <button className="auth-submit-btn" onClick={onClose} style={{ width: '100%' }}>
                Got it
              </button>
            </div>
          ) : (
            <>
              <h2 className="auth-title">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="auth-subtitle">
                {mode === 'login'
                  ? 'Sign in to continue editing'
                  : 'Start creating with AI-powered tools'}
              </p>

              {/* Google OAuth */}
              <button
                className="auth-google-btn"
                onClick={handleGoogleAuth}
                disabled={isLoading}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>

              <div className="auth-divider">
                <span>or</span>
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Email</label>
                  <input
                    type="email"
                    className="auth-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="spinner sm" />
                  ) : mode === 'login' ? (
                    'Sign In'
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>

              {mode === 'login' && (
                <a href="#" className="auth-forgot-link" onClick={(e) => e.preventDefault()}>
                  Forgot password?
                </a>
              )}

              <div className="auth-toggle">
                {mode === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button className="auth-toggle-btn" onClick={onToggleMode}>
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button className="auth-toggle-btn" onClick={onToggleMode}>
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
