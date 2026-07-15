import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getToken, clearToken } from './src/utils/api';

// Screens
import DashboardScreen from './src/screens/DashboardScreen';
import ContentCreatorScreen from './src/screens/ContentCreatorScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import SalesScreen from './src/screens/SalesScreen';
import CollaborateScreen from './src/screens/CollaborateScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  } as any),
});

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label }: { label: string }) {
  const icons: Record<string, string> = {
    Home: '🏠', Create: '✨', Calendar: '📅', Leads: '🎯', Sales: '💰', Network: '🤝', More: '⚙️',
  };
  return <Text style={{ fontSize: 20 }}>{icons[label] || '•'}</Text>;
}

function MainTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#1e293b',
          height: 65,
          paddingBottom: 10,
          paddingTop: 5,
        },
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: () => <TabIcon label={route.name} />,
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Create" component={ContentCreatorScreen} />
      <Tab.Screen name="Sales" component={SalesScreen} />
      <Tab.Screen name="Leads" component={OpportunitiesScreen} />
      <Tab.Screen name="Network" component={CollaborateScreen} />
      <Tab.Screen name="More">
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      setIsLoggedIn(!!token);
    }
    checkAuth();
  }, []);

  // Request notification permissions
  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  const handleLogout = async () => {
    await clearToken();
    setIsLoggedIn(false);
  };

  if (isLoggedIn === null) {
    return null; // Loading
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      {isLoggedIn ? (
        <MainTabs onLogout={handleLogout} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLogin={() => setIsLoggedIn(true)} />}
          </Stack.Screen>
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
