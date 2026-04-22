import { Bell, Crown } from 'lucide-react';
import { useState, useEffect } from 'react';

interface TopBarProps {
  onNavigate: (page: string) => void;
  onResetTrade?: () => void;
}

export function TopBar({ onNavigate, onResetTrade }: TopBarProps) {
  const [unreadCount, setUnreadCount] = useState(3);
  const [currentPlan] = useState('Starter');

  // Update notification count from calendar events
  useEffect(() => {
    const updateCount = () => {
      const tradeId = localStorage.getItem('selectedTrade');
      if (!tradeId) {
        setUnreadCount(3);
        return;
      }

      const eventsStr = localStorage.getItem(`calendarEvents_${tradeId}`);
      if (!eventsStr) {
        setUnreadCount(3);
        return;
      }

      const events = JSON.parse(eventsStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcomingEvents = events.filter((event: any) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      });

      // Base notifications (3) + upcoming calendar events
      setUnreadCount(3 + upcomingEvents.length);
    };

    updateCount();

    // Update count every 30 seconds
    const interval = setInterval(updateCount, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 bg-white border-b border-[#E2E8F0] z-50">
      <div className="max-w-[390px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('pricing')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#F59E0B] to-[#F97316] text-white rounded-full text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Crown className="w-3.5 h-3.5" />
            Upgrade
          </button>

          {onResetTrade && (
            <button
              onClick={onResetTrade}
              className="text-xs text-[#64748B] hover:text-[#1D4ED8] transition-colors underline"
              title="Change Industry"
            >
              Switch
            </button>
          )}
        </div>

        <button
          onClick={() => onNavigate('notifications')}
          className="relative p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
        >
          <Bell className="w-5 h-5 text-[#0F172A]" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#EF4444] text-white text-xs rounded-full flex items-center justify-center font-medium">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
