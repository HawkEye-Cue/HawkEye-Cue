import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Action Items</Text>
        <Text style={styles.cueItem}>☐ Post content on social media</Text>
        <Text style={styles.cueItem}>☐ Check for new keyword matches</Text>
        <Text style={styles.cueItem}>☐ Follow up on recent leads</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>New</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#f59e0b' }]}>0</Text>
          <Text style={styles.statLabel}>Followed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>0</Text>
          <Text style={styles.statLabel}>Converted</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: '#eff6ff' }]}>
        <Text style={styles.cardTitle}>✨ AI Post Suggestion</Text>
        <Text style={styles.cardText}>Generate a post tailored to your trade.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, marginTop: 48 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#64748b' },
  cueItem: { fontSize: 14, paddingVertical: 4, color: '#334155' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#2563eb' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
});
