import { useState, useEffect } from 'react';
import { HECard } from '../components/DesignSystem';
import { CheckCircle, XCircle, Clock, AlertCircle, Calendar } from 'lucide-react';

interface NotificationsScreenProps {
  onNavigate: (page: string) => void;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'calendar';
  title: string;
  message: string;
  time: string;
  read: boolean;
  actionable?: boolean;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  time?: string;
  type: string;
  description?: string;
}

export function NotificationsScreen({ onNavigate }: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    // Load calendar events from localStorage
    const loadCalendarNotifications = () => {
      const tradeId = localStorage.getItem('selectedTrade');
      if (!tradeId) return [];

      const eventsStr = localStorage.getItem(`calendarEvents_${tradeId}`);
      if (!eventsStr) return [];

      const events: CalendarEvent[] = JSON.parse(eventsStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get events for today and next 7 days
      const upcomingEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const diffTime = eventDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      });

      return upcomingEvents.map(event => {
        const eventDate = new Date(event.date);
        const isToday = eventDate.toDateString() === today.toDateString();
        const isTomorrow = eventDate.toDateString() === new Date(today.getTime() + 86400000).toDateString();

        let timeStr = '';
        if (isToday) {
          timeStr = event.time ? `Today at ${event.time}` : 'Today';
        } else if (isTomorrow) {
          timeStr = event.time ? `Tomorrow at ${event.time}` : 'Tomorrow';
        } else {
          timeStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (event.time) timeStr += ` at ${event.time}`;
        }

        return {
          id: `calendar-${event.id}`,
          type: 'calendar' as const,
          title: event.title,
          message: event.description || 'Tap to view in calendar',
          time: timeStr,
          read: false,
          actionable: true,
        };
      });
    };

    const staticNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: 'Post Published',
        message: 'Your Facebook post went live successfully',
        time: '2 min ago',
        read: false,
        actionable: false,
      },
      {
        id: '2',
        type: 'warning',
        title: 'Posting Window Open',
        message: 'Brighton Moms Group allows posting today',
        time: '1 hour ago',
        read: false,
        actionable: false,
      },
      {
        id: '3',
        type: 'info',
        title: 'New Opportunity',
        message: '2 people engaged with your post',
        time: '3 hours ago',
        read: false,
        actionable: false,
      },
    ];

    const calendarNotifs = loadCalendarNotifications();
    setNotifications([...calendarNotifs, ...staticNotifications]);
  }, []);

  const handleNotificationClick = (notif: Notification) => {
    if (notif.actionable && notif.type === 'calendar') {
      onNavigate('calendar');
    }
  };

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#22C55E]" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-[#EF4444]" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-[#F97316]" />;
      case 'calendar':
        return <Calendar className="w-5 h-5 text-[#8B5CF6]" />;
      default:
        return <Clock className="w-5 h-5 text-[#3B82F6]" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-[#64748B]">{unreadCount} unread</p>
          )}
        </div>
        <button
          onClick={markAllRead}
          className="text-sm text-[#1D4ED8] hover:underline"
        >
          Mark all read
        </button>
      </div>

      {notifications.length === 0 ? (
        <HECard>
          <p className="text-center text-[#64748B] py-8">
            No notifications yet. Calendar events will appear here!
          </p>
        </HECard>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <HECard
              key={notif.id}
              className={`${notif.read ? 'opacity-60' : ''} ${
                notif.actionable ? 'cursor-pointer hover:border-[#1D4ED8]' : ''
              } transition-all`}
              onClick={() => handleNotificationClick(notif)}
            >
              <div className="flex gap-3">
                <div className="flex-shrink-0 mt-1">{getIcon(notif.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-[#0F172A]">{notif.title}</h3>
                    {!notif.read && (
                      <span className="w-2 h-2 bg-[#1D4ED8] rounded-full flex-shrink-0 mt-1.5"></span>
                    )}
                  </div>
                  <p className="text-sm text-[#64748B] mb-1">{notif.message}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#64748B]">{notif.time}</p>
                    {notif.actionable && (
                      <p className="text-xs text-[#1D4ED8] font-medium">
                        Tap to view →
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </HECard>
          ))}
        </div>
      )}
    </div>
  );
}
