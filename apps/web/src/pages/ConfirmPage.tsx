import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ConfirmPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { confirmSignUp, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string })?.email ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      navigate('/login', { state: { confirmed: true } });
    } catch (err) {
      if (err instanceof Error) {
        switch (err.name) {
          case 'CodeMismatchException':
            setError('Incorrect code. Please check and try again.');
            break;
          case 'ExpiredCodeException':
            setError('Code has expired. Click "Resend code" to get a new one.');
            break;
          default:
            setError(err.message || 'Verification failed. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMessage('');
    setError('');
    setResending(true);
    try {
      await resendCode(email);
      setResendMessage('A new code has been sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-center mb-2 text-white">Verify Email</h1>
        <p className="text-slate-400 text-center mb-6">
          Enter the 6-digit code sent to <strong className="text-white">{email}</strong>
        </p>

        {error && (
          <div className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
        )}
        {resendMessage && (
          <div className="bg-green-900/30 text-green-400 px-4 py-2 rounded-lg mb-4 text-sm">{resendMessage}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Confirmation Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-500"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full mt-3 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors"
        >
          {resending ? 'Sending...' : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
