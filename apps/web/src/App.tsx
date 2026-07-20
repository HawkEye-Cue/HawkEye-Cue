import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ConfirmPage from './pages/ConfirmPage';
import ConfirmMeetingPage from './pages/ConfirmMeetingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import ContentCreatorPage from './pages/ContentCreatorPage';
import CreatePage from './pages/CreatePage';
import CalendarPage from './pages/CalendarPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import SalesPage from './pages/SalesPage';
import TeamPage from './pages/TeamPage';
import HawkInsightsPage from './pages/HawkInsightsPage';
import NetworkPage from './pages/NetworkPage';
import AppreciationsPage from './pages/AppreciationsPage';
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
                <Route path="/" element={<DashboardPage />} />
                <Route path="/create" element={<CreatePage />} />
                <Route path="/calendar" element={<CreatePage />} />
                <Route path="/opportunities" element={<OpportunitiesPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/hawk-insights" element={<HawkInsightsPage />} />
                <Route path="/network" element={<NetworkPage />} />
                <Route path="/appreciations" element={<AppreciationsPage />} />
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
