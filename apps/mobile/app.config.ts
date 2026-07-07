import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'HawkEye-Cue',
  slug: 'hawkeye-cue',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    backgroundColor: '#0f172a',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.hawkeyecue.app',
    infoPlist: {
      NSCameraUsageDescription: 'Used to capture photos for social media posts',
      NSPhotoLibraryUsageDescription: 'Used to select photos for social media posts',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0f172a',
    },
    package: 'com.hawkeyecue.app',
    permissions: ['CAMERA', 'READ_EXTERNAL_STORAGE'],
    googleServicesFile: './google-services.json',
  },
  plugins: [
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#f59e0b',
      },
    ],
    'expo-secure-store',
    'expo-image-picker',
  ],
  scheme: 'hawkeyecue',
  extra: {
    eas: {
      projectId: 'hawkeye-cue',
    },
    apiUrl: 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com',
    cognitoUserPoolId: 'us-east-1_33Q0cOjOf',
    cognitoClientId: '333anc07o123neh75j0d5ui4dk', // Mobile client ID
    cognitoRegion: 'us-east-1',
  },
};

export default config;
