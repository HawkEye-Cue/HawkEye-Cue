import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

export default function ContentCreatorScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create Content</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Tone</Text>
        <View style={styles.row}>
          {['Professional', 'Casual', 'Educational', 'Urgent'].map((t) => (
            <TouchableOpacity key={t} style={styles.chip}>
              <Text style={styles.chipText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Platforms</Text>
        <View style={styles.row}>
          {['Facebook', 'Instagram', 'LinkedIn', 'TikTok'].map((p) => (
            <TouchableOpacity key={p} style={styles.chip}>
              <Text style={styles.chipText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>✨ Generate Content</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, marginTop: 48 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#374151' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: '#475569' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
