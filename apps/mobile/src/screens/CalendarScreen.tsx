import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function CalendarScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Calendar</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>Your scheduled posts and tasks will appear here.</Text>
        <Text style={styles.hint}>Use the Create tab to generate and schedule posts.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  cardText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  hint: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 8 },
});
