import ContentCreatorPage from './ContentCreatorPage';
import CalendarPage from './CalendarPage';

export default function CreatePage() {
  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
      {/* Content Creator - Left/Top */}
      <div className="min-w-0">
        <ContentCreatorPage />
      </div>
      {/* Calendar - Right/Bottom */}
      <div className="min-w-0">
        <CalendarPage />
      </div>
    </div>
  );
}
