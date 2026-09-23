import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ConfirmPage from './pages/ConfirmPage';
import ConfirmMeetingPage from './pages/ConfirmMeetingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import TodayPage from './pages/TodayPage';
import PipelinePage from './pages/PipelinePage';
import DashboardPage from './pages/DashboardPage';
import ContentCreatorPage from './pages/ContentCreatorPage';
import CreatePage from './pages/CreatePage';
import TeamPage from './pages/TeamPage';
import HawkInsightsPage from './pages/HawkInsightsPage';
import NetworkPage from './pages/NetworkPage';
import KeywordsPage from './pages/KeywordsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
}

// Legacy /opportunities and /sales now live under the combined /pipeline tab.
// Preserve any query string (e.g. ?newDeal=Name from "Convert to Client").
function SalesRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/pipeline${search}`} replace />;
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/confirm-meeting" element={<ConfirmMeetingPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route
        path="/onboarding"
        element={
          <OnboardingGuard>
            <OnboardingPage />
          </OnboardingGuard>
        }
      />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/create" element={<CreatePage />} />
                <Route path="/calendar" element={<CreatePage />} />
                {/* Combined Leads + Deals tab */}
                <Route path="/pipeline" element={<PipelinePage />} />
                {/* Legacy paths keep working — redirect into the combined tab (preserving query like ?newDeal=) */}
                <Route path="/opportunities" element={<SalesRedirect />} />
                <Route path="/sales" element={<SalesRedirect />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/hawk-insights" element={<HawkInsightsPage />} />
                <Route path="/network" element={<NetworkPage />} />
                <Route path="/appreciations" element={<Navigate to="/network" replace />} />
                <Route path="/keywords" element={<KeywordsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
