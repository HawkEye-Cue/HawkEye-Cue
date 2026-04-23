import { useState } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { auth } from '../../lib/supabase';

interface SignupScreenProps {
  onSignup: () => void;
  onLoginClick: () => void;
}

export function SignupScreen({ onSignup, onLoginClick }: SignupScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await auth.signUp(email, password);
      setSuccess(true);
      // Auto-login after signup
      setTimeout(() => {
        onSignup();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-[#F8FAFC] flex items-center justify-center p-4">
        <HECard className="max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-[#22C55E] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#0F172A] mb-2">
            Account Created!
          </h2>
          <p className="text-sm text-[#64748B] mb-4">
            Welcome to HawkEye-Cue! Redirecting you to the app...
          </p>
        </HECard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-4xl">🦅</span>
            <span className="text-2xl font-bold text-[#0F172A]">HawkEye-Cue</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] mb-2">Get Started Free</h1>
          <p className="text-sm text-[#64748B]">7-day free trial • No credit card required</p>
        </div>

        <HECard>
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                  placeholder="••••••••"
                  required
                />
              </div>
              <p className="text-xs text-[#64748B] mt-1">
                At least 6 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <HEButton
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </HEButton>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[#64748B]">
              Already have an account?{' '}
              <button
                onClick={onLoginClick}
                className="text-[#1D4ED8] font-medium hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </HECard>

        <p className="text-center text-xs text-[#64748B] mt-6">
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
