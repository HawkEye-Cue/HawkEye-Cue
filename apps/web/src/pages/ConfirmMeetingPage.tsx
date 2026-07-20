import { useState, useEffect } from 'react';

export default function ConfirmMeetingPage() {
  const [status, setStatus] = useState<'loading' | 'confirmed' | 'error'>('loading');
  const [meeting, setMeeting] = useState<{ meetingTitle?: string; meetingDate?: string } | null>(null);

  useEffect(() => {
    async function confirm() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (!token) { setStatus('error'); return; }

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/calendar/invite/confirm?token=${token}`);
        if (!response.ok) throw new Error('Failed');
        const result = await response.json();
        setMeeting(result);
        setStatus('confirmed');
      } catch {
        setStatus('error');
      }
    }
    confirm();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'loading' && (
          <div className="space-y-4">
            <div className="text-4xl">⏳</div>
            <p className="text-white text-lg">Confirming your meeting...</p>
          </div>
        )}
        {status === 'confirmed' && (
          <div className="space-y-4">
            <div className="text-5xl">✅</div>
            <h1 className="text-2xl font-bold text-white">Meeting Confirmed!</h1>
            {meeting?.meetingTitle && <p className="text-lg text-amber-300">🤝 {meeting.meetingTitle}</p>}
            {meeting?.meetingDate && <p className="text-slate-400">{new Date(meeting.meetingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>}
            <p className="text-slate-500 text-sm mt-4">The organizer has been notified. See you there! 🦅</p>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="text-5xl">❌</div>
            <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
            <p className="text-slate-400">This invite link may have expired or already been confirmed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
