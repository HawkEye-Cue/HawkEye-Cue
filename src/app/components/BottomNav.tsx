import { Home, Calendar, PlusCircle, Target, MoreHorizontal } from 'lucide-react';

interface BottomNavProps {
  active: string;
  onNavigate: (page: string) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'create', label: 'Create', icon: PlusCircle, highlighted: true },
    { id: 'opportunities', label: 'Opps', icon: Target },
    { id: 'more', label: 'More', icon: MoreHorizontal },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-3">
      <div className="max-w-[390px] mx-auto flex justify-around items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center gap-1 transition-colors"
            >
              <Icon
                className={`w-6 h-6 ${
                  item.highlighted
                    ? 'text-[#22C55E]'
                    : isActive
                    ? 'text-[#1D4ED8]'
                    : 'text-[#64748B]'
                }`}
              />
              <span
                className={`text-xs ${
                  item.highlighted
                    ? 'text-[#22C55E]'
                    : isActive
                    ? 'text-[#1D4ED8] font-medium'
                    : 'text-[#64748B]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
