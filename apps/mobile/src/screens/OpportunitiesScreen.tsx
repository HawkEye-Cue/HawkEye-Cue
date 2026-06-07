import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function OpportunitiesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Opportunities</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#2563eb' }]}>0</Text>
          <Text style={styles.statLabel}>New</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>0</Text>
          <Text style={styles.statLabel}>Converted</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardText}>
          No opportunities yet. Configure keywords to start detecting leads!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, marginTop: 48 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statNumber: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  cardText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
