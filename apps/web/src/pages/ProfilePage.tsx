import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword } from '@social-lead-gen/shared';
import { ApiClient } from '@social-lead-gen/shared';

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + digits + symbols;

  // Guarantee at least one from each category
  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill remaining with random chars (total 16)
  for (let i = 4; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default function ProfilePage() {
  const { user, changePassword, updatePhone, refreshUser, getToken } = useAuth();

  // Password change
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Phone
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);

  // MFA preference
  const [mfaMethod, setMfaMethod] = useState<'email' | 'sms'>('email');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [mfaError, setMfaError] = useState('');

  useEffect(() => {
    refreshUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.phone) setPhone(user.phone);
  }, [user?.phone]);

  // Fetch MFA preference from backend
  useEffect(() => {
    async function fetchMfaPref() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const sub = await client.getSubscription(); // reuse to get user profile
        // We'll use a dedicated endpoint or piggyback — for now fetch from profile
      } catch { /* ignore */ }
    }
    fetchMfaPref();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMfaSave() {
    setMfaLoading(true);
    setMfaError('');
    setMfaSuccess('');

    if (mfaMethod === 'sms' && !phone) {
      setMfaError('Please add a phone number first to use SMS verification.');
      setMfaLoading(false);
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/profile/mfa`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ mfaMethod }),
      });
      if (!res.ok) throw new Error('Failed to update MFA preference');
      setMfaSuccess(`Verification codes will be sent via ${mfaMethod === 'sms' ? 'text message' : 'email'}.`);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Failed to save preference.');
    } finally {
      setMfaLoading(false);
    }
  }

  const passwordValidation = validatePassword(newPassword);
  const canSubmitPassword = passwordValidation.valid && newPassword === confirmNewPassword && oldPassword.length > 0;

  function handleGeneratePassword() {
    const generated = generateSecurePassword();
    setNewPassword(generated);
    setConfirmNewPassword(generated);
    setShowNewPassword(true);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.errors.join('. '));
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordSuccess('Password updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowNewPassword(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAuthorizedException') {
          setPasswordError('Current password is incorrect.');
        } else if (err.name === 'InvalidPasswordException') {
          setPasswordError('New password does not meet requirements.');
        } else {
          setPasswordError(err.message || 'Failed to update password.');
        }
      } else {
        setPasswordError('Failed to update password.');
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleUpdatePhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError('');
    setPhoneSuccess('');

    const cleaned = phone.trim();
    if (cleaned && !/^\+\d{10,15}$/.test(cleaned)) {
      setPhoneError('Phone must be in format +1XXXXXXXXXX (include country code).');
      return;
    }

    setPhoneLoading(true);
    try {
      await updatePhone(cleaned);
      setPhoneSuccess('Phone number updated.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update phone number.';
      setPhoneError(message);
    } finally {
      setPhoneLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Profile</h2>

      {/* Account Info */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Account Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Email</span>
            <span className="text-white">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">User ID</span>
            <span className="text-slate-500 text-xs font-mono">{user?.sub}</span>
          </div>
        </div>
      </div>

      {/* Phone Number */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Phone Number</h3>

        {phoneError && (
          <div className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg mb-3 text-sm">{phoneError}</div>
        )}
        {phoneSuccess && (
          <div className="bg-green-900/30 text-green-400 px-3 py-2 rounded-lg mb-3 text-sm">{phoneSuccess}</div>
        )}

        <form onSubmit={handleUpdatePhone} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Cell Phone (E.164 format)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Include country code, e.g. +1 for US</p>
          </div>
          <button
            type="submit"
            disabled={phoneLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {phoneLoading ? 'Saving...' : 'Save Phone Number'}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Login Verification (MFA)</h3>
        <p className="text-sm text-slate-400 mb-3">
          Choose how you receive your 6-digit login verification code.
        </p>

        {mfaError && (
          <div className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg mb-3 text-sm">{mfaError}</div>
        )}
        {mfaSuccess && (
          <div className="bg-green-900/30 text-green-400 px-3 py-2 rounded-lg mb-3 text-sm">{mfaSuccess}</div>
        )}

        <div className="space-y-2 mb-3">
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-700/50 border-slate-600" style={mfaMethod === 'email' ? { borderColor: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.05)' } : {}}>
            <input
              type="radio"
              name="mfaMethod"
              value="email"
              checked={mfaMethod === 'email'}
              onChange={() => setMfaMethod('email')}
              className="w-4 h-4"
            />
            <div>
              <span className="text-sm font-medium text-white">Email</span>
              <p className="text-xs text-slate-400">Code sent to {user?.email}</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-700/50 border-slate-600" style={mfaMethod === 'sms' ? { borderColor: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.05)' } : {}}>
            <input
              type="radio"
              name="mfaMethod"
              value="sms"
              checked={mfaMethod === 'sms'}
              onChange={() => setMfaMethod('sms')}
              className="w-4 h-4"
            />
            <div>
              <span className="text-sm font-medium text-white">Text Message (SMS)</span>
              <p className="text-xs text-slate-400">{phone ? `Code sent to ${phone}` : 'Add a phone number first'}</p>
            </div>
          </label>
        </div>

        <button
          onClick={handleMfaSave}
          disabled={mfaLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {mfaLoading ? 'Saving...' : 'Save Preference'}
        </button>
      </div>

      {/* Change Password Section */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Change Password</h3>

        {passwordError && (
          <div className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg mb-3 text-sm">{passwordError}</div>
        )}
        {passwordSuccess && (
          <div className="bg-green-900/30 text-green-400 px-3 py-2 rounded-lg mb-3 text-sm">{passwordSuccess}</div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-slate-400">New Password</label>
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
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 pr-16"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                {showNewPassword ? 'Hide' : 'Show'}
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
            <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              required
              autoComplete="new-password"
            />
            {confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <button
            type="submit"
            disabled={passwordLoading || !canSubmitPassword}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
