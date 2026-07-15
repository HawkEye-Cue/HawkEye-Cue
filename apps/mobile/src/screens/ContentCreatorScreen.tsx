import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { apiRequest } from '../utils/api';

const TONES = ['professional', 'casual', 'educational', 'urgent'];
const LENGTHS = ['short', 'medium', 'long'];
const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok'];
const PLATFORM_ICONS: Record<string, string> = { facebook: '📘', instagram: '📷', linkedin: '💼', tiktok: '🎵' };

export default function ContentCreatorScreen() {
  const [tone, setTone] = useState('professional');
  const [postLength, setPostLength] = useState('medium');
  const [postType, setPostType] = useState('Tips');
  const [platforms, setPlatforms] = useState<string[]>(['facebook']);
  const [baseText, setBaseText] = useState('');
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  async function handleGenerate() {
    if (platforms.length === 0) { Alert.alert('Error', 'Select at least one platform'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await apiRequest<any>('POST', '/content/generate', { tone, postType, postLength, platforms, baseText: baseText || undefined });
      setResult(res.platformContent || { [platforms[0]]: res.content });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to generate');
    } finally { setLoading(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create Content</Text>

      {/* Tone */}
      <Text style={styles.label}>Tone</Text>
      <View style={styles.row}>
        {TONES.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTone(t)} style={[styles.chip, tone === t && styles.chipActive]}>
            <Text style={[styles.chipText, tone === t && { color: '#fff' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Length */}
      <Text style={styles.label}>Length</Text>
      <View style={styles.row}>
        {LENGTHS.map((l) => (
          <TouchableOpacity key={l} onPress={() => setPostLength(l)} style={[styles.chip, postLength === l && styles.chipActive]}>
            <Text style={[styles.chipText, postLength === l && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Platforms */}
      <Text style={styles.label}>Platforms</Text>
      <View style={styles.row}>
        {PLATFORMS.map((p) => (
          <TouchableOpacity key={p} onPress={() => togglePlatform(p)} style={[styles.chip, platforms.includes(p) && styles.chipActive]}>
            <Text style={[styles.chipText, platforms.includes(p) && { color: '#fff' }]}>{PLATFORM_ICONS[p]} {p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Post Type */}
      <Text style={styles.label}>Post Type</Text>
      <TextInput style={styles.input} placeholder="e.g. Tips, Before/After, Testimonial..." placeholderTextColor="#64748b" value={postType} onChangeText={setPostType} />

      {/* Base Text (optional) */}
      <Text style={styles.label}>Your message (optional)</Text>
      <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Write your own or leave blank for AI to create..." placeholderTextColor="#64748b" value={baseText} onChangeText={setBaseText} multiline />

      {/* Generate */}
      <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} disabled={loading}>
        <Text style={styles.generateBtnText}>{loading ? '✨ Generating...' : '✨ Generate Content'}</Text>
      </TouchableOpacity>

      {/* Results */}
      {result && Object.entries(result).map(([platform, content]) => (
        <View key={platform} style={styles.resultCard}>
          <Text style={styles.resultPlatform}>{PLATFORM_ICONS[platform] || '📱'} {platform}</Text>
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
  label: { fontSize: 13, color: '#94a3b8', marginBottom: 6, marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, color: '#94a3b8', textTransform: 'capitalize' },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, color: '#f1f5f9', fontSize: 14, marginBottom: 4 },
  generateBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#334155' },
  resultPlatform: { fontSize: 13, fontWeight: '600', color: '#f59e0b', marginBottom: 6, textTransform: 'capitalize' },
  resultContent: { fontSize: 13, color: '#e2e8f0', lineHeight: 20 },
});
