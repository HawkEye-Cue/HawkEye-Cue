import { useState } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import { Check, Star, Zap, Users, Crown, X } from 'lucide-react';
import { PlanComparison } from '../components/PlanComparison';

interface PricingScreenProps {
  onNavigate: (page: string) => void;
}

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  period: string;
  icon: any;
  color: string;
  bgColor: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  badge?: string;
  badgeColor?: string;
  special?: string;
}

export function PricingScreen({ onNavigate }: PricingScreenProps) {
  const [showComparison, setShowComparison] = useState(false);

  const plans: Plan[] = [
    {
      id: 'beta',
      name: 'Beta Founders',
      price: 15,
      originalPrice: 29,
      period: '/month',
      icon: Crown,
      color: '#F59E0B',
      bgColor: '#FEF3C7',
      description: 'Everything in Starter + Keyword Tracking - Locked for 12 months',
      badge: '⚡ LIMITED OFFER',
      badgeColor: '#F59E0B',
      special: 'Only 12 spots remaining!',
      features: [
        { text: 'Everything in Starter plan', included: true },
        { text: 'Facebook Keyword Tracking with Extension', included: true },
        { text: 'Locked price for 12 months', included: true },
        { text: 'Lifetime founder badge', included: true },
        { text: 'Priority support', included: true },
        { text: 'Early access to new features', included: true },
      ],
      cta: 'Claim Founder Pricing',
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 29,
      period: '/month',
      icon: Star,
      color: '#1D4ED8',
      bgColor: '#DBEAFE',
      description: 'For local business owners',
      features: [
        { text: '1 User', included: true },
        { text: '1 Business', included: true },
        { text: 'Calendar & Scheduling', included: true },
        { text: 'Daily Cues', included: true },
        { text: 'Opportunities Tracking', included: true },
        { text: 'Territories Tracker', included: true },
        { text: 'Notes', included: true },
        { text: 'Limited AI rewrites (10/month)', included: true },
        { text: 'Facebook Keyword Tracking', included: false },
        { text: 'Post Adaptation', included: false },
        { text: 'Unlimited AI usage', included: false },
        { text: 'Advanced Analytics', included: false },
      ],
      cta: 'Start with Starter',
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 49,
      period: '/month',
      icon: Zap,
      color: '#22C55E',
      bgColor: '#D1FAE5',
      description: 'For active business owners who post often',
      badge: '🔥 MOST POPULAR',
      badgeColor: '#22C55E',
      features: [
        { text: 'Everything in Starter', included: true },
        { text: 'Facebook Keyword Tracking with Extension', included: true },
        { text: 'Up to 5 connected accounts', included: true },
        { text: 'Unlimited AI usage', included: true },
        { text: 'Daily Cue Suggestions', included: true },
        { text: 'Post Adaptation for all platforms', included: true },
        { text: 'Denied/Failed post tracking', included: true },
        { text: 'Advanced Analytics & Reporting', included: true },
        { text: 'Priority AI processing', included: true },
        { text: 'Multiple brands', included: false },
        { text: 'Team collaboration', included: false },
      ],
      cta: 'Upgrade to Growth',
    },
    {
      id: 'team',
      name: 'Team / Agency',
      price: 79,
      period: '/month',
      icon: Users,
      color: '#8B5CF6',
      bgColor: '#EDE9FE',
      description: 'For teams and agencies',
      features: [
        { text: 'Everything in Growth', included: true },
        { text: 'Up to 10 users', included: true },
        { text: 'Multiple brands or locations', included: true },
        { text: 'Shared notes & calendars', included: true },
        { text: 'Team Cues', included: true },
        { text: 'Approval workflows', included: true },
        { text: 'Role-based permissions', included: true },
        { text: 'White-label reporting', included: true },
        { text: 'Dedicated account manager', included: true },
      ],
      cta: 'Get Team Plan',
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#0F172A] mb-2">Choose Your Plan</h1>
        <p className="text-base text-[#64748B] px-4 leading-relaxed mb-3">
          The social media scheduler built for mom & pop shops that helps you know{' '}
          <strong className="text-[#0F172A]">what to post</strong>,{' '}
          <strong className="text-[#0F172A]">when to post</strong>, and{' '}
          <strong className="text-[#0F172A]">how to turn it into opportunities</strong>
        </p>
        <div className="inline-block px-4 py-2 bg-gradient-to-r from-[#22C55E] to-[#10B981] text-white rounded-full text-sm font-semibold">
          🎉 7-Day Free Trial on All Plans
        </div>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isBeta = plan.id === 'beta';

          return (
            <HECard
              key={plan.id}
              className={`relative overflow-hidden ${
                isBeta ? 'border-2 border-[#F59E0B] shadow-lg' : ''
              }`}
            >
              {plan.badge && (
                <div
                  className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: `${plan.badgeColor}20`,
                    color: plan.badgeColor,
                  }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="flex items-start gap-3 mb-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: plan.bgColor }}
                >
                  <Icon className="w-6 h-6" style={{ color: plan.color }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-[#0F172A]">{plan.name}</h2>
                  <p className="text-sm text-[#64748B]">{plan.description}</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  {plan.originalPrice && (
                    <span className="text-lg text-[#64748B] line-through">
                      ${plan.originalPrice}
                    </span>
                  )}
                  <span className="text-3xl font-bold text-[#0F172A]">
                    ${plan.price}
                  </span>
                  <span className="text-base text-[#64748B]">{plan.period}</span>
                </div>
                <p className="text-xs text-[#22C55E] font-semibold mt-1">
                  First 7 days free
                </p>
                {plan.special && (
                  <p className="text-sm font-semibold text-[#F59E0B] mt-1">
                    {plan.special}
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    {feature.included ? (
                      <Check className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-5 h-5 flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        feature.included ? 'text-[#0F172A]' : 'text-[#64748B]'
                      }`}
                    >
                      {feature.text}
                    </span>
                  </div>
                ))}
              </div>

              <HEButton
                variant={isBeta ? 'primary' : 'secondary'}
                className="w-full"
                onClick={() => alert(`Starting 7-day free trial for ${plan.name} plan!`)}
              >
                {plan.cta}
              </HEButton>
              <p className="text-xs text-center text-[#64748B] mt-2">
                Start your 7-day free trial
              </p>
            </HECard>
          );
        })}
      </div>

      <HECard className="bg-gradient-to-r from-[#1D4ED8]/10 to-[#22C55E]/10 border border-[#1D4ED8]/20">
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">
          💡 Not sure which plan is right?
        </h3>
        <p className="text-sm text-[#64748B] mb-3">
          Try any plan free for 7 days! Start with Starter and upgrade anytime as your business grows. No contracts, cancel anytime.
        </p>
        <button
          onClick={() => setShowComparison(true)}
          className="text-sm text-[#1D4ED8] font-medium"
        >
          Compare all features →
        </button>
      </HECard>

      {showComparison && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <div className="max-w-[390px] mx-auto p-4">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white py-3 border-b border-[#E2E8F0]">
              <h2 className="text-xl font-bold text-[#0F172A]">Compare Plans</h2>
              <button
                onClick={() => setShowComparison(false)}
                className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <PlanComparison />
          </div>
        </div>
      )}

      <HECard>
        <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-[#0F172A] mb-1">
              Can I change plans later?
            </h4>
            <p className="text-sm text-[#64748B]">
              Yes! You can upgrade or downgrade at any time. Changes take effect on your next billing cycle.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#0F172A] mb-1">
              What happens to my Beta Founders pricing?
            </h4>
            <p className="text-sm text-[#64748B]">
              Your $15/month rate is locked for 12 months from signup, including Facebook Keyword Tracking (normally Growth plan only). After 12 months, you'll move to regular pricing unless you renew the founder rate.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#0F172A] mb-1">
              How does the free trial work?
            </h4>
            <p className="text-sm text-[#64748B]">
              Every plan includes a 7-day free trial. No credit card required to start. Try all features risk-free, and only pay if you love it!
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#0F172A] mb-1">
              How does the AI usage work?
            </h4>
            <p className="text-sm text-[#64748B]">
              Starter includes 10 AI rewrites per month. Growth and Team plans have unlimited AI usage including post adaptation and daily suggestions.
            </p>
          </div>
        </div>
      </HECard>

      <div className="text-center">
        <p className="text-xs text-[#64748B]">
          All plans include 7-day free trial • No credit card required
        </p>
      </div>
    </div>
  );
}
