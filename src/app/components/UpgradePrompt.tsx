import { HEButton, HECard } from './DesignSystem';
import { Crown, Sparkles, X } from 'lucide-react';

interface UpgradePromptProps {
  feature: string;
  requiredPlan: string;
  onUpgrade: () => void;
  onClose: () => void;
}

export function UpgradePrompt({ feature, requiredPlan, onUpgrade, onClose }: UpgradePromptProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <HECard className="max-w-sm w-full border-2 border-[#F59E0B]">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#FEF3C7] rounded-lg">
              <Crown className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <h2 className="text-lg font-bold text-[#0F172A]">Upgrade Required</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#F1F5F9] rounded transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-base text-[#0F172A] mb-3">
            <strong>{feature}</strong> is available on the{' '}
            <strong className="text-[#1D4ED8]">{requiredPlan}</strong> plan.
          </p>
          <div className="flex items-start gap-2 text-sm text-[#64748B]">
            <Sparkles className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
            <p>
              Upgrade to unlock this feature along with unlimited AI rewrites, advanced
              analytics, and priority support.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <HEButton variant="secondary" onClick={onClose} className="flex-1">
            Maybe Later
          </HEButton>
          <HEButton variant="primary" onClick={onUpgrade} className="flex-1">
            <Crown className="w-4 h-4 mr-1" />
            Upgrade Now
          </HEButton>
        </div>
      </HECard>
    </div>
  );
}

interface FeatureLockBadgeProps {
  requiredPlan: string;
  onClick: () => void;
}

export function FeatureLockBadge({ requiredPlan, onClick }: FeatureLockBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 bg-[#FEF3C7] text-[#F59E0B] rounded-full text-xs font-semibold hover:bg-[#FDE68A] transition-colors"
    >
      <Crown className="w-3 h-3" />
      {requiredPlan}
    </button>
  );
}
