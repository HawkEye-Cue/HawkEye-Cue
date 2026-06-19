import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword } from '@social-lead-gen/shared';

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + digits + symbols;

  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { forgotPassword, forgotPasswordSubmit } = useAuth();
  const navigate = useNavigate();

  const passwordValidation = validatePassword(newPassword);
  const canSubmitReset = passwordValidation.valid && newPassword === confirmPassword && code.length > 0;

  function handleGeneratePassword() {
    const generated = generateSecurePassword();
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep('confirm');
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'UserNotFoundException') {
          setError('No account found with that email.');
        } else if (err.name === 'LimitExceededException') {
          setError('Too many attempts. Please wait and try again.');
        } else {
          setError(err.message || 'Failed to send reset code.');
        }
      } else {
        setError('Failed to send reset code.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!passwordValidation.valid) {
      setError(passwordValidation.errors.join('. '));
      return;
    }

    setLoading(true);
    try {
      await forgotPasswordSubmit(email, code, newPassword);
      navigate('/login', { state: { message: 'Password reset successful. Please sign in.' } });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'CodeMismatchException') {
          setError('Invalid verification code.');
        } else if (err.name === 'ExpiredCodeException') {
          setError('Code has expired. Please request a new one.');
        } else {
          setError(err.message || 'Failed to reset password.');
        }
      } else {
        setError('Failed to reset password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-center mb-2 text-white">Reset Password</h1>
        <p className="text-slate-400 text-center mb-6">
          {step === 'request'
            ? "Enter your email and we'll send a verification code."
            : 'Enter the code from your email and your new password.'}
        </p>

        {error && (
          <div className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                required
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                required
                autoComplete="one-time-code"
              />
              <p className="text-xs text-slate-500 mt-1">Check your email for the 6-digit code</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-300">New Password</label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Generate Secure Password
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 pr-16"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {newPassword && (
                <ul className="mt-1 text-xs space-y-0.5">
                  <li className={newPassword.length >= 8 ? 'text-green-600' : 'text-red-500'}>
                    {newPassword.length >= 8 ? '✓' : '✗'} At least 8 characters
                  </li>
                  <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : 'text-red-500'}>
                    {/[A-Z]/.test(newPassword) ? '✓' : '✗'} One uppercase letter
                  </li>
                  <li className={/\d/.test(newPassword) ? 'text-green-600' : 'text-red-500'}>
                    {/\d/.test(newPassword) ? '✓' : '✗'} One number
                  </li>
                  <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600' : 'text-red-500'}>
                    {/[^A-Za-z0-9]/.test(newPassword) ? '✓' : '✗'} One symbol
                  </li>
                </ul>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                required
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !canSubmitReset}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-400 mt-4">
          <Link to="/login" className="text-blue-400 hover:underline">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
