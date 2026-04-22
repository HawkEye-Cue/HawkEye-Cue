import { HECard } from '../components/DesignSystem';
import { trades } from '../data/tradeData';
import { ChevronRight } from 'lucide-react';

interface TradeSelectionScreenProps {
  onSelectTrade: (tradeId: string) => void;
}

export function TradeSelectionScreen({ onSelectTrade }: TradeSelectionScreenProps) {
  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="text-center mt-8 px-4">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#1D4ED8] to-[#22C55E] rounded-3xl mb-4 shadow-lg">
          <span className="text-5xl">🦅</span>
        </div>
        <h1 className="text-3xl font-bold text-[#0F172A] mb-2">Welcome to HawkEye-Cue</h1>
        <p className="text-base text-[#64748B] leading-relaxed max-w-sm mx-auto">
          The social media scheduler built for mom & pop shops
        </p>
      </div>

      <div className="text-center px-4">
        <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Choose Your Industry</h2>
        <p className="text-sm text-[#64748B] max-w-sm mx-auto">
          We'll customize your experience with industry-specific content and templates
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {trades.map((trade) => (
          <button
            key={trade.id}
            onClick={() => onSelectTrade(trade.id)}
            className="w-full group"
          >
            <HECard className="hover:border-2 transition-all cursor-pointer hover:shadow-lg"
              style={{ borderColor: 'transparent', '--hover-border': trade.color } as any}
            >
              <div className="flex items-center gap-4">
                <div
                  className="p-4 rounded-2xl text-3xl shadow-sm group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: trade.bgColor }}
                >
                  {trade.icon}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-lg font-semibold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                    {trade.name}
                  </h3>
                  <p className="text-sm text-[#64748B]">{trade.description}</p>
                </div>
                <ChevronRight
                  className="w-5 h-5 text-[#64748B] group-hover:text-[#1D4ED8] group-hover:translate-x-1 transition-all"
                />
              </div>
            </HECard>
          </button>
        ))}
      </div>

      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="px-3 py-1 bg-gradient-to-r from-[#1D4ED8] to-[#22C55E] text-white rounded-full font-medium shadow-sm">
            {trades.length} Industries Available
          </span>
        </div>
        <p className="text-xs text-[#64748B] px-4">
          Don't worry, you can change your industry anytime
        </p>
      </div>
    </div>
  );
}
