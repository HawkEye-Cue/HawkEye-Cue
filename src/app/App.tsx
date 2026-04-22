import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { TradeSelectionScreen } from './screens/TradeSelectionScreen';
import { LandingPage } from './screens/LandingPage';
import { HomeScreen } from './screens/HomeScreen';
import { CreateScreen } from './screens/CreateScreen';
import { AdaptScreen } from './screens/AdaptScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { CuesScreen } from './screens/CuesScreen';
import { OpportunitiesScreen } from './screens/OpportunitiesScreen';
import { MoreScreen } from './screens/MoreScreen';
import { TerritoriesScreen } from './screens/TerritoriesScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { PlatformsScreen } from './screens/PlatformsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { PricingScreen } from './screens/PricingScreen';
import { KeywordsScreen } from './screens/KeywordsScreen';

type Page = 'home' | 'create' | 'adapt' | 'calendar' | 'cues' | 'opportunities' | 'more' | 'territories' | 'analytics' | 'platforms' | 'notifications' | 'pricing' | 'keywords';

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('home');

  // Check if user has visited before
  useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisited');
    if (hasVisited) {
      setShowLanding(false);
    }
  }, []);

  useEffect(() => {
    const savedTrade = localStorage.getItem('selectedTrade');
    if (savedTrade) {
      setSelectedTrade(savedTrade);
    }
  }, []);

  const handleSelectTrade = (tradeId: string) => {
    setSelectedTrade(tradeId);
    localStorage.setItem('selectedTrade', tradeId);
  };

  const handleResetTrade = () => {
    localStorage.removeItem('selectedTrade');
    setSelectedTrade(null);
  };

  const navigate = (page: string) => {
    setCurrentPage(page as Page);
  };

  const handleGetStarted = () => {
    localStorage.setItem('hasVisited', 'true');
    setShowLanding(false);
  };

  const handleViewPricing = () => {
    setShowLanding(false);
    setCurrentPage('pricing');
  };

  const renderScreen = () => {
    if (!selectedTrade) {
      return null;
    }

    switch (currentPage) {
      case 'home':
        return <HomeScreen tradeId={selectedTrade} onNavigate={navigate} />;
      case 'create':
        return <CreateScreen tradeId={selectedTrade} onNavigate={navigate} />;
      case 'adapt':
        return <AdaptScreen tradeId={selectedTrade} onNavigate={navigate} />;
      case 'calendar':
        return <CalendarScreen tradeId={selectedTrade} onNavigate={navigate} />;
      case 'cues':
        return <CuesScreen tradeId={selectedTrade} />;
      case 'opportunities':
        return <OpportunitiesScreen tradeId={selectedTrade} />;
      case 'more':
        return <MoreScreen tradeId={selectedTrade} onNavigate={navigate} onChangeTrade={() => setSelectedTrade(null)} />;
      case 'territories':
        return <TerritoriesScreen tradeId={selectedTrade} onNavigate={navigate} />;
      case 'analytics':
        return <AnalyticsScreen />;
      case 'platforms':
        return <PlatformsScreen />;
      case 'keywords':
        return <KeywordsScreen tradeId={selectedTrade!} onNavigate={navigate} />;
      case 'notifications':
        return <NotificationsScreen onNavigate={navigate} />;
      case 'pricing':
        return <PricingScreen onNavigate={navigate} />;
      default:
        return <HomeScreen tradeId={selectedTrade} onNavigate={navigate} />;
    }
  };

  const getActiveNav = (): string => {
    if (['cues', 'adapt', 'territories', 'analytics', 'platforms', 'notifications', 'pricing'].includes(currentPage)) {
      return 'home';
    }
    return currentPage;
  };

  // Show landing page for first-time visitors
  if (showLanding) {
    return (
      <div className="size-full overflow-y-auto">
        <LandingPage onGetStarted={handleGetStarted} onViewPricing={handleViewPricing} />
      </div>
    );
  }

  // Show trade selection if no trade selected
  if (!selectedTrade) {
    return (
      <div className="size-full bg-[#F8FAFC] overflow-y-auto">
        <div className="max-w-[390px] mx-auto min-h-screen p-4">
          <TradeSelectionScreen onSelectTrade={handleSelectTrade} />
        </div>
      </div>
    );
  }

  return (
    <div className="size-full bg-[#F8FAFC] overflow-y-auto">
      <TopBar onNavigate={navigate} onResetTrade={handleResetTrade} />
      <div className="max-w-[390px] mx-auto min-h-screen p-4 pt-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav active={getActiveNav()} onNavigate={navigate} />
    </div>
  );
}