import { useState } from 'react';

interface GuideSection {
  title: string;
  icon: string;
  steps: string[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: 'Getting Started',
    icon: '🦅',
    steps: [
      'Pick your trade in Settings — this customizes keywords, policy types, and AI content for your industry.',
      'Add keywords that people use when they need your services (e.g. "looking for insurance", "need a roofer").',
      'Install the Chrome extension from the Web Store to detect leads while scrolling Facebook.',
      'Click "Activate Extension" in Settings so it syncs your login automatically.',
    ],
  },
  {
    title: 'Lead Detection & Quick Save',
    icon: '🎯',
    steps: [
      'The browser extension highlights posts matching your keywords while you scroll Facebook.',
      'Click "Save Lead" on any highlighted post to capture it instantly.',
      'On mobile, tap the 🎯 floating button (bottom-right of any page) to quick-save a lead with just a name and source.',
      'Add the lead\'s email address to enable automated cadence emails.',
      'Use the "Lead\'s Email" field when adding or editing a lead.',
    ],
  },
  {
    title: 'Flight Projection (Cadence)',
    icon: '🛫',
    steps: [
      'Your flight projection is an automatic follow-up schedule for each new lead.',
      'Go to Leads → tap "Flight Projection" to see and edit your cadence steps.',
      'Each step has a Day number, Type (📞 Call, 💬 Text, ✉️ Email), and a task description.',
      'Email-type steps auto-send to the lead if you\'ve connected Gmail/Outlook and entered the lead\'s email.',
      'Choose from preset protocols (Internet Lead, Social Warm, Referral) or build your own.',
      'Sundays are always skipped — if a step lands on Sunday, it moves to Monday.',
    ],
  },
  {
    title: 'Email Automation',
    icon: '✉️',
    steps: [
      'Go to Settings → Email Automation → Connect Gmail or Outlook.',
      'Use "AI Generate Templates" to create 4 professional follow-up emails tailored to your trade.',
      'Or click "Write Your Own" to craft personal messages. Use {name} as a placeholder.',
      'Once connected + templates saved + lead has an email → emails auto-send at 8am on scheduled days.',
      'Templates cover: Introduction (Day 1), Follow Up (Day 3), Check In (Day 7), Final Touch (Day 14).',
    ],
  },
  {
    title: 'Creating & Posting Content',
    icon: '✨',
    steps: [
      'Go to Create → pick your platform(s) → choose a tone and post type.',
      'Let AI generate a post or write your own. AI tailors content to each platform\'s style.',
      'Use "Copy & Open Next Flock" to speed through Facebook groups — it copies your post and opens the next group.',
      'Schedule posts for later or publish immediately via connected social accounts.',
      'Saved posts store full content so you can reuse, copy, or expand them anytime.',
    ],
  },
  {
    title: 'Sales Pipeline',
    icon: '💰',
    steps: [
      'Go to Sales → add deals as they move through your pipeline.',
      'Default stage is "Won" — just fill in the details and save.',
      'Backdate deals with the date picker if you closed something earlier.',
      'Track deals by producer (saved list so you don\'t retype names).',
      'Use Folio History to see past periods with stats — great for reviews and goal setting.',
      'When you "Mark as Converted" on a lead, it opens the Sales tab with the name pre-filled.',
    ],
  },
  {
    title: 'Summit (Team Features)',
    icon: '🏔️',
    steps: [
      'Upgrade to Summit ($99.99/mo with 7-day free trial) to unlock team features.',
      'Create a team and invite up to 5 members by email.',
      'Team calendar shows everyone\'s meetings with color-coded dots.',
      'Lead Nests show each member\'s leads count, sales count, and premium won.',
      'Transfer leads between team members with one click.',
      'Team wins celebrate closed deals across the group.',
    ],
  },
  {
    title: 'Daily Cues & Calendar',
    icon: '📅',
    steps: [
      'Your Dashboard shows today\'s cues — meetings, follow-ups, and flock reminders.',
      'Add meetings with times (shows AM/PM), reminders, and post schedules.',
      'Toggle between Month, Week, and Day views.',
      'Meeting reminders send email notifications 15 minutes before.',
      'Completed cues get checked off — track your daily progress.',
    ],
  },
  {
    title: 'Notifications & Emails',
    icon: '🔔',
    steps: [
      'The 🔔 bell in the header shows today\'s meetings, follow-ups, flocks, and team wins.',
      'Click any notification to jump to the relevant page. Dismiss with ✕.',
      'Email notifications: Daily digest at 8am, Weekly recap Mondays, New lead alerts, Meeting reminders.',
      'Manage which emails you receive in Settings → Email Notifications.',
      'Turn individual types on/off or disable all at once.',
    ],
  },
];

export default function HowToGuide({ onClose }: { onClose: () => void }) {
  const [expandedSection, setExpandedSection] = useState<number | null>(0);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] px-3" onClick={onClose}>
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">🦅 How to Use HawkEye-Cue</h2>
            <p className="text-xs text-slate-400">Your complete guide to every feature</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl px-2">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {GUIDE_SECTIONS.map((section, i) => (
            <div key={i} className="border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === i ? null : i)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{section.icon}</span>
                  <span className="text-sm font-medium text-white">{section.title}</span>
                </div>
                <span className="text-slate-500 text-sm">{expandedSection === i ? '▼' : '▶'}</span>
              </button>
              {expandedSection === i && (
                <div className="px-4 pb-4 space-y-2">
                  {section.steps.map((step, j) => (
                    <div key={j} className="flex items-start gap-2">
                      <span className="text-blue-400 text-xs mt-1 shrink-0">{j + 1}.</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Got it! 🦅
          </button>
        </div>
      </div>
    </div>
  );
}
