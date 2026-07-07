import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';

const TONES = ['professional', 'casual', 'educational', 'urgent'];
const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok'];

export default function ContentCreatorScreen() {
  const [tone, setTone] = useState('professional');
  const [baseText, setBaseText] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['facebook']);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<Record<string, string> | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleGenerate = async () => {
    if (platforms.length === 0) {
      Alert.alert('Error', 'Select at least one platform');
      return;
    }
    setLoading(true);
    setGenerated(null);
    try {
      // TODO: Call real API with stored token
      // For now show placeholder
      const result: Record<string, string> = {};
      for (const p of platforms) {
        result[p] = `[AI-generated ${tone} post for ${p}]`;
      }
      setGenerated(result);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create Content</Text>

      {/* Tone */}
      <View style={styles.card}>
        <Text style={styles.label}>Tone</Text>
        <View style={styles.row}>
          {TONES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, tone === t && styles.chipActive]}
              onPress={() => setTone(t)}
            >
              <Text style={[styles.chipText, tone === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Platforms */}
      <View style={styles.card}>
        <Text style={styles.label}>Platforms</Text>
        <View style={styles.row}>
          {PLATFORMS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, platforms.includes(p) && styles.chipActive]}
              onPress={() => togglePlatform(p)}
            >
              <Text style={[styles.chipText, platforms.includes(p) && styles.chipTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Base Text */}
      <View style={styles.card}>
        <Text style={styles.label}>Base Text</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Enter your message idea..."
          placeholderTextColor="#64748b"
          value={baseText}
          onChangeText={setBaseText}
          multiline
          numberOfLines={4}
        />
      </View>

      <TouchableOpacity style={styles.generateButton} onPress={handleGenerate} disabled={loading}>
        <Text style={styles.generateButtonText}>{loading ? '✨ Generating...' : '✨ Generate Content'}</Text>
      </TouchableOpacity>

      {/* Generated Content */}
      {generated && Object.entries(generated).map(([platform, content]) => (
        <View key={platform} style={styles.resultCard}>
          <Text style={styles.resultPlatform}>{platform}</Text>
          <Text style={styles.resultContent}>{content}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  label: { fontSize: 14, fontWeight: '500', color: '#94a3b8', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#94a3b8', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  textArea: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, color: '#f1f5f9', fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  generateButton: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#7c3aed' },
  resultPlatform: { fontSize: 14, fontWeight: '600', color: '#f59e0b', marginBottom: 8, textTransform: 'capitalize' },
  resultContent: { fontSize: 14, color: '#cbd5e1', lineHeight: 20 },
});
