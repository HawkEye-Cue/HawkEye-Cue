import { HEButton, HECard, StatCard } from '../components/DesignSystem';
import { tradeContent } from '../data/tradeData';

interface OpportunitiesScreenProps {
  tradeId: string;
}

export function OpportunitiesScreen({ tradeId }: OpportunitiesScreenProps) {
  const content = tradeContent[tradeId];

  return (
    <div className="flex flex-col gap-4 pb-20">
      <h1 className="text-2xl font-bold text-[#0F172A]">Opportunities</h1>

      <StatCard value={String(content.opportunities.length)} label="This Week" />

      {content.opportunities.map((opportunity, idx) => (
        <HECard key={idx}>
          <h2 className="text-lg font-semibold text-[#0F172A] mb-2">
            {idx === 0 ? 'Top Post' : 'Recent'}
          </h2>
          <p className="text-base text-[#64748B]">
            {opportunity.title} → {opportunity.description}
          </p>
        </HECard>
      ))}

      <HEButton variant="primary">+ Add Opportunity</HEButton>
    </div>
  );
}
