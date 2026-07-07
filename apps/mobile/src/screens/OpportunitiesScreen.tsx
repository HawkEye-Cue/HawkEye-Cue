import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function OpportunitiesScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Leads</Text>
      <View style={styles.card}>
        <Text style={styles.emoji}>🦅</Text>
        <Text style={styles.cardText}>No leads detected yet</Text>
        <Text style={styles.hint}>
          The system scans your connected social accounts every 15 minutes for keyword matches.
          Add keywords in Settings to start detecting leads.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  emoji: { fontSize: 40, marginBottom: 12 },
  cardText: { fontSize: 16, fontWeight: '500', color: '#f1f5f9', textAlign: 'center' },
  hint: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
