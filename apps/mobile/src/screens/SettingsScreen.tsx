import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>Free</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connected Accounts</Text>
        <Text style={styles.hint}>Connect your social accounts to publish posts.</Text>
        <TouchableOpacity style={styles.connectButton}>
          <Text style={styles.connectButtonText}>+ Connect Facebook</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.connectButton}>
          <Text style={styles.connectButtonText}>+ Connect Instagram</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.connectButton}>
          <Text style={styles.connectButtonText}>+ Connect LinkedIn</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <Text style={styles.hint}>Push notifications are enabled. You'll be notified when new leads are detected.</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={() => Alert.alert('Logged out')}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 14, color: '#94a3b8' },
  value: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  connectButton: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  connectButtonText: { color: '#60a5fa', fontSize: 14, fontWeight: '500' },
  logoutButton: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#dc2626' },
  logoutText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
});
