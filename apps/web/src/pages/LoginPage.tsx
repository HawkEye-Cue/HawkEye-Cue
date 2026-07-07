import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function cognitoErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAuthorizedException':
        return 'Incorrect email or password.';
      case 'UserNotFoundException':
        return 'No account found with that email.';
      case 'UserNotConfirmedException':
        return 'Please verify your email before signing in.';
      case 'PasswordResetRequiredException':
        return 'You need to reset your password.';
      case 'TooManyRequestsException':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return err.message || 'Sign in failed. Please try again.';
    }
  }
  return 'Sign in failed. Please try again.';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, confirmMfa, mfaPending } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // If login succeeded without MFA, navigate to dashboard
      // The mfaPending state will cause a re-render showing the MFA screen if needed
      navigate('/');
    } catch (err) {
      if (err instanceof Error && err.name === 'UserNotConfirmedException') {
        navigate('/confirm', { state: { email } });
        return;
      }
      if (err instanceof Error && err.message === 'CONFIRM_SIGN_UP') {
        navigate('/confirm', { state: { email } });
        return;
      }
      setError(cognitoErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmMfa(mfaCode);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // MFA code entry screen
  if (mfaPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 p-8">
          <h1 className="text-2xl font-bold text-center mb-2 text-white">Verification Code</h1>
          <p className="text-slate-400 text-center mb-6">
            A 6-digit code was sent via {mfaPending.mfaMethod} to{' '}
            <span className="text-white font-medium">{mfaPending.deliveredTo}</span>
          </p>

          {error && (
            <div className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Enter Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white text-center text-2xl tracking-[0.5em] placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                placeholder="000000"
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-4">
            Didn't receive a code? Check your spam folder or try signing in again.
          </p>
        </div>
      </div>
    );
  }

  // Normal login screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-center mb-2 text-white">HawkEye-Cue</h1>
        <p className="text-slate-400 text-center mb-6">Sign in to your account</p>

        {error && (
          <div className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-400 hover:underline">Sign up</Link>
        </p>
        <p className="text-center text-sm text-slate-400 mt-2">
          <Link to="/forgot-password" className="text-blue-400 hover:underline">Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}
