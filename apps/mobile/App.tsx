import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Platform, View, Text } from 'react-native';

// WebView doesn't work on web, so we use an iframe fallback
let WebViewComponent: any = null;
try {
  WebViewComponent = require('react-native-webview').WebView;
} catch {
  // Web fallback
}

function WebApp() {
  if (Platform.OS === 'web') {
    // On web preview, just redirect to the actual site
    if (typeof window !== 'undefined') {
      window.location.href = 'https://hawkeyecue.com';
    }
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Redirecting to hawkeyecue.com...</Text>
      </View>
    );
  }

  if (!WebViewComponent) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>WebView not available</Text>
      </View>
    );
  }

  return (
    <WebViewComponent
      source={{ uri: 'https://hawkeyecue.com' }}
      style={styles.webview}
      startInLoadingState={true}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      sharedCookiesEnabled={true}
      allowsBackForwardNavigationGestures={true}
      pullToRefreshEnabled={true}
      overScrollMode="content"
      cacheEnabled={false}
      incognito={false}
      cacheMode="LOAD_NO_CACHE"
    />
  );
}

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <WebApp />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webview: {
    flex: 1,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 100,
  },
});
