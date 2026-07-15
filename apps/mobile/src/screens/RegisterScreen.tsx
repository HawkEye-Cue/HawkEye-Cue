import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { signUp, confirmSignUp, signIn } from '../utils/api';

export default function RegisterScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) { Alert.alert('Error', 'Please fill all fields'); return; }
    if (password !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return; }
    if (password.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password);
      setStep('confirm');
      Alert.alert('Check Your Email', 'We sent a verification code to your email.');
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message);
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!code.trim()) { Alert.alert('Error', 'Please enter the verification code'); return; }
    setLoading(true);
    try {
      await confirmSignUp(email.trim().toLowerCase(), code.trim());
      Alert.alert('Success', 'Account verified! Please sign in.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e: any) {
      Alert.alert('Verification Failed', e.message);
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.logo}>🦅</Text>
        <Text style={styles.title}>HawkEye-Cue</Text>
        <Text style={styles.subtitle}>{step === 'register' ? 'Create your account' : 'Verify your email'}</Text>

        {step === 'register' ? (
          <>
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password (8+ characters)" placeholderTextColor="#64748b" value={password} onChangeText={setPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor="#64748b" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput style={styles.input} placeholder="Verification code" placeholderTextColor="#64748b" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <TouchableOpacity style={styles.button} onPress={handleConfirm} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#f59e0b', textAlign: 'center', marginBottom: 4, letterSpacing: 2 },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 16, color: '#f1f5f9', fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#60a5fa', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
