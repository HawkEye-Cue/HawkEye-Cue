import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface Props {
  navigation: any;
  onLogin: () => void;
}

const API_URL = 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const COGNITO_CLIENT_ID = '333anc07o123neh75j0d5ui4dk';

export default function LoginScreen({ navigation, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      // Use Cognito InitiateAuth with USER_SRP_AUTH via the mobile client
      // For simplicity, using USER_PASSWORD_AUTH (mobile client supports it if configured)
      const response = await fetch(
        `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          },
          body: JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: COGNITO_CLIENT_ID,
            AuthParameters: {
              USERNAME: email,
              PASSWORD: password,
            },
          }),
        }
      );

      const data = await response.json();

      if (data.__type) {
        Alert.alert('Login Failed', data.message || 'Invalid credentials');
        return;
      }

      // Store token securely
      const idToken = data.AuthenticationResult?.IdToken;
      if (idToken) {
        // TODO: Store in SecureStore
        onLogin();
      } else {
        Alert.alert('Error', 'Unexpected response from auth service');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🦅</Text>
      <Text style={styles.title}>HawkEye-Cue</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#64748b"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#f59e0b', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 14, color: '#f1f5f9', fontSize: 15, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#60a5fa', textAlign: 'center', marginTop: 16, fontSize: 14 },
});
