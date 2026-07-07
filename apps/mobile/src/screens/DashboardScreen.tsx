import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

export default function DashboardScreen({ navigation }: any) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>

      {/* Lead Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lead Summary</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>New</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#eab308' }]}>0</Text>
            <Text style={styles.statLabel}>Followed Up</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#22c55e' }]}>0</Text>
            <Text style={styles.statLabel}>Converted</Text>
          </View>
        </View>
      </View>

      {/* AI Post Suggestion */}
      <View style={[styles.card, styles.highlightCard]}>
        <Text style={styles.cardTitle}>✨ AI Post Suggestion</Text>
        <Text style={styles.cardText}>Generate a post tailored for your trade.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Create')}>
          <Text style={styles.primaryButtonText}>Generate Post</Text>
        </TouchableOpacity>
      </View>

      {/* Today's Scheduled Posts */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Scheduled Posts</Text>
        <Text style={styles.cardText}>No posts scheduled for today</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  highlightCard: { borderColor: '#7c3aed' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#94a3b8' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#60a5fa' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
