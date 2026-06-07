import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ContentCreatorScreen from './src/screens/ContentCreatorScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{ tabBarIcon: () => <Text>🏠</Text> }}
      />
      <Tab.Screen
        name="Create"
        component={ContentCreatorScreen}
        options={{ tabBarIcon: () => <Text>✨</Text> }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ tabBarIcon: () => <Text>📅</Text> }}
      />
      <Tab.Screen
        name="Leads"
        component={OpportunitiesScreen}
        options={{ tabBarIcon: () => <Text>🎯</Text> }}
      />
      <Tab.Screen
        name="More"
        component={SettingsScreen}
        options={{ tabBarIcon: () => <Text>⚙️</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const isAuthenticated = false; // Replace with auth state

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer
        linking={{
          prefixes: ['socialleadgen://'],
          config: {
            screens: {
              Main: {
                screens: {
                  Leads: 'opportunities/:id?',
                  Home: '',
                },
              },
            },
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
