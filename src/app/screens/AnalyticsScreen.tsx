import { useState } from 'react';
import { HECard, StatCard } from '../components/DesignSystem';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Heart, MessageCircle } from 'lucide-react';
import { FeatureLockBadge, UpgradePrompt } from '../components/UpgradePrompt';

export function AnalyticsScreen() {
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const weeklyData = [
    { day: 'Mon', posts: 3, engagement: 45 },
    { day: 'Tue', posts: 2, engagement: 32 },
    { day: 'Wed', posts: 4, engagement: 67 },
    { day: 'Thu', posts: 1, engagement: 23 },
    { day: 'Fri', posts: 3, engagement: 58 },
    { day: 'Sat', posts: 2, engagement: 41 },
    { day: 'Sun', posts: 1, engagement: 19 },
  ];

  const platformData = [
    { name: 'Facebook', value: 145 },
    { name: 'LinkedIn', value: 89 },
    { name: 'Instagram', value: 234 },
    { name: 'X', value: 67 },
    { name: 'TikTok', value: 312 },
  ];

  return (
    <div className="flex flex-col gap-4 pb-20">
      {showUpgradePrompt && (
        <UpgradePrompt
          feature="Advanced Analytics"
          requiredPlan="Growth"
          onUpgrade={() => {
            setShowUpgradePrompt(false);
            window.location.hash = 'pricing';
          }}
          onClose={() => setShowUpgradePrompt(false)}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">Analytics</h1>
        <FeatureLockBadge
          requiredPlan="Growth"
          onClick={() => setShowUpgradePrompt(true)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HECard className="text-center">
          <TrendingUp className="w-6 h-6 text-[#22C55E] mx-auto mb-2" />
          <div className="text-2xl font-bold text-[#0F172A]">847</div>
          <div className="text-xs text-[#64748B] mt-1">Total Reach</div>
        </HECard>
        <HECard className="text-center">
          <Users className="w-6 h-6 text-[#1D4ED8] mx-auto mb-2" />
          <div className="text-2xl font-bold text-[#0F172A]">234</div>
          <div className="text-xs text-[#64748B] mt-1">New Followers</div>
        </HECard>
        <HECard className="text-center">
          <Heart className="w-6 h-6 text-[#EF4444] mx-auto mb-2" />
          <div className="text-2xl font-bold text-[#0F172A]">512</div>
          <div className="text-xs text-[#64748B] mt-1">Total Likes</div>
        </HECard>
        <HECard className="text-center">
          <MessageCircle className="w-6 h-6 text-[#3B82F6] mx-auto mb-2" />
          <div className="text-2xl font-bold text-[#0F172A]">89</div>
          <div className="text-xs text-[#64748B] mt-1">Comments</div>
        </HECard>
      </div>

      <HECard>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Weekly Engagement</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="day" stroke="#64748B" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
            <Tooltip />
            <Line type="monotone" dataKey="engagement" stroke="#1D4ED8" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </HECard>

      <HECard>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Posts by Platform</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={platformData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="name" stroke="#64748B" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
            <Tooltip />
            <Bar dataKey="value" fill="#1D4ED8" />
          </BarChart>
        </ResponsiveContainer>
      </HECard>

      <HECard>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-3">Top Performing Post</h2>
        <p className="text-base text-[#64748B] mb-2">
          "If your insurance went up this year..."
        </p>
        <div className="flex gap-4 text-sm">
          <span className="text-[#64748B]">312 likes</span>
          <span className="text-[#64748B]">45 comments</span>
          <span className="text-[#64748B]">23 shares</span>
        </div>
      </HECard>
    </div>
  );
}
