import { HEButton, HECard } from '../components/DesignSystem';
import { BarChart3, Link, Map, Settings, FileText, Crown, Zap, RefreshCw, Search } from 'lucide-react';
import { trades } from '../data/tradeData';

interface MoreScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
  onChangeTrade: () => void;
}

export function MoreScreen({ tradeId, onNavigate, onChangeTrade }: MoreScreenProps) {
  const currentTrade = trades.find(t => t.id === tradeId);
  return (
    <div className="flex flex-col gap-4 pb-20">
      <h1 className="text-2xl font-bold text-[#0F172A]">More</h1>

      <HECard className="bg-gradient-to-r from-[#1D4ED8] to-[#22C55E] text-white">
        <div className="flex items-start gap-3 mb-3">
          <Zap className="w-6 h-6" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">Current Plan: Starter</h2>
            <p className="text-sm opacity-90">$29/month • 1 user • 1 business</p>
          </div>
        </div>
        <HEButton
          variant="secondary"
          onClick={() => onNavigate('pricing')}
          className="w-full bg-white text-[#1D4ED8] hover:bg-gray-50"
        >
          <Crown className="w-4 h-4 mr-2" />
          Upgrade Plan
        </HEButton>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3 mb-3">
          <div
            className="p-2 rounded-lg text-2xl"
            style={{ backgroundColor: currentTrade?.bgColor }}
          >
            {currentTrade?.icon}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Current Industry</h2>
            <p className="text-base text-[#64748B]">{currentTrade?.name}</p>
            <p className="text-xs text-[#64748B] mt-1">{currentTrade?.description}</p>
          </div>
        </div>
        <HEButton
          variant="secondary"
          onClick={() => {
            localStorage.removeItem('selectedTrade');
            onChangeTrade();
          }}
          className="w-full"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Change Industry
        </HEButton>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3 mb-3">
          <BarChart3 className="w-6 h-6 text-[#1D4ED8] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Analytics</h2>
            <p className="text-base text-[#64748B] mb-3">
              View performance metrics and insights
            </p>
          </div>
        </div>
        <HEButton variant="secondary" onClick={() => onNavigate('analytics')}>
          View Analytics
        </HEButton>
      </HECard>

      <HECard className="bg-gradient-to-r from-[#8B5CF6]/10 to-[#EC4899]/10 border-2 border-[#8B5CF6]/20">
        <div className="flex items-start gap-3 mb-3">
          <Search className="w-6 h-6 text-[#8B5CF6] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">🔍 Keyword Tracking</h2>
            <p className="text-base text-[#64748B] mb-3">
              Monitor Facebook for leads automatically
            </p>
          </div>
        </div>
        <HEButton variant="primary" onClick={() => onNavigate('keywords')}>
          Manage Keywords
        </HEButton>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3 mb-3">
          <Link className="w-6 h-6 text-[#1D4ED8] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Platform Connections</h2>
            <p className="text-base text-[#64748B] mb-3">
              Connect and manage social accounts
            </p>
          </div>
        </div>
        <HEButton variant="secondary" onClick={() => onNavigate('platforms')}>
          Manage Platforms
        </HEButton>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3 mb-3">
          <Map className="w-6 h-6 text-[#1D4ED8] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Territories</h2>
            <p className="text-base text-[#64748B] mb-3">
              Manage your groups and posting rules
            </p>
          </div>
        </div>
        <HEButton variant="secondary" onClick={() => onNavigate('territories')}>
          View Territories
        </HEButton>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3">
          <FileText className="w-6 h-6 text-[#1D4ED8] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Post Status</h2>
            <p className="text-base text-[#64748B]">Track your scheduled and posted content</p>
          </div>
        </div>
      </HECard>

      <HECard>
        <div className="flex items-start gap-3">
          <Settings className="w-6 h-6 text-[#1D4ED8] mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">Settings</h2>
            <p className="text-base text-[#64748B]">Notifications, accounts, and preferences</p>
          </div>
        </div>
      </HECard>

      <HECard className="bg-gradient-to-r from-[#1D4ED8]/10 to-[#22C55E]/10">
        <h2 className="text-lg font-semibold text-[#0F172A] mb-1">🦅 HawkEye-Cue MVP</h2>
        <p className="text-sm text-[#64748B]">Version 1.0.0</p>
        <p className="text-sm text-[#64748B] mt-2">Your daily Cue to grow</p>
      </HECard>
    </div>
  );
}
