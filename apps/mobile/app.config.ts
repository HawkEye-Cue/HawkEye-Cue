import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Social Lead Gen',
  slug: 'social-lead-gen',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    backgroundColor: '#2563eb',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.socialleadgen.app',
    infoPlist: {
      NSCameraUsageDescription: 'Used to capture photos for social media posts',
      NSPhotoLibraryUsageDescription: 'Used to select photos for social media posts',
      NSFaceIDUsageDescription: 'Used for biometric authentication',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#2563eb',
    },
    package: 'com.socialleadgen.app',
    permissions: ['CAMERA', 'READ_EXTERNAL_STORAGE'],
  },
  plugins: [
    'expo-notifications',
    'expo-secure-store',
    'expo-image-picker',
    'expo-local-authentication',
  ],
  scheme: 'socialleadgen',
};

export default config;
