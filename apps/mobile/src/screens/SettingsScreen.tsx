import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { apiRequest, getUserEmail } from '../utils/api';

interface Props {
  onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: Props) {
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState('free');

  useEffect(() => {
    getUserEmail().then((e) => setEmail(e || ''));
    apiRequest<any>('GET', '/subscription').then((res) => {
      setTier(res.tier || 'free');
    }).catch(() => {});
  }, []);

  const tierLabels: Record<string, string> = { free: '🪺 Nest (Free)', base: '🪺 Nest', growth: '🦅 Flight', soar: '🚀 Soar', team: '🏔️ Summit' };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{email}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Plan</Text><Text style={[styles.value, { color: '#f59e0b' }]}>{tierLabels[tier] || tier}</Text></View>
      </View>

      {/* Quick Links */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Links</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL('https://hawkeyecue.com/settings')}>
          <Text style={styles.linkText}>🔑 Manage Keywords</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL('https://hawkeyecue.com/hawk-insights')}>
          <Text style={styles.linkText}>🦅 Hawk Insights</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL('https://hawkeyecue.com/team')}>
          <Text style={styles.linkText}>👥 Team Management</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Contact */}
      <View style={styles.card}>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:briannafrashier@hawkeyecue.com')}>
          <Text style={styles.linkText}>📧 Contact Us: briannafrashier@hawkeyecue.com</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={() => {
        Alert.alert('Log Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: onLogout },
        ]);
      }}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>HawkEye-Cue v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 14, color: '#94a3b8' },
  value: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#33415544' },
  linkText: { fontSize: 14, color: '#60a5fa' },
  arrow: { color: '#64748b' },
  logoutBtn: { backgroundColor: '#991b1b', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  logoutText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 20 },
});
