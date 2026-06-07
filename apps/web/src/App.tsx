import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ConfirmPage from './pages/ConfirmPage';
import DashboardPage from './pages/DashboardPage';
import ContentCreatorPage from './pages/ContentCreatorPage';
import CalendarPage from './pages/CalendarPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import NetworkPage from './pages/NetworkPage';
import AppreciationsPage from './pages/AppreciationsPage';
import KeywordsPage from './pages/KeywordsPage';
import SettingsPage from './pages/SettingsPage';

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/create" element={<ContentCreatorPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/opportunities" element={<OpportunitiesPage />} />
                <Route path="/network" element={<NetworkPage />} />
                <Route path="/appreciations" element={<AppreciationsPage />} />
                <Route path="/keywords" element={<KeywordsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
