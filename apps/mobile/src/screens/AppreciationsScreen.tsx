import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { apiRequest } from '../utils/api';

interface Appreciation { id: string; taggerName: string; platform: string; postContent: string; thanked: boolean; createdAt: string; }

const platformIcons: Record<string, string> = { facebook: '📘', instagram: '📷', linkedin: '💼', tiktok: '🎵' };

export default function AppreciationsScreen() {
  const [items, setItems] = useState<Appreciation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    try {
      const res = await apiRequest<any>('GET', '/appreciations');
      setItems(res.items || res.appreciations || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  async function handleThank(id: string) {
    try {
      await apiRequest('PUT', `/appreciations/${id}/thank`);
      setItems(items.map((i) => i.id === id ? { ...i, thanked: true } : i));
    } catch { /* ignore */ }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
      <Text style={styles.title}>🙏 Appreciations</Text>
      <Text style={styles.subtitle}>People who mentioned or recommended you</Text>

      {loading ? <Text style={styles.emptyText}>Loading...</Text> : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🙏</Text>
          <Text style={styles.emptyText}>No appreciations yet</Text>
          <Text style={[styles.emptyText, { fontSize: 12 }]}>When someone tags or recommends you, it shows up here</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.name}>{platformIcons[item.platform] || '📱'} {item.taggerName}</Text>
              {item.thanked && <Text style={{ color: '#22c55e', fontSize: 12 }}>✓ Thanked</Text>}
            </View>
            <Text style={styles.content} numberOfLines={3}>"{item.postContent}"</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            {!item.thanked && (
              <TouchableOpacity style={styles.thankBtn} onPress={() => handleThank(item.id)}>
                <Text style={styles.thankBtnText}>🙏 Thank Them</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#94a3b8', marginBottom: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  name: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  content: { fontSize: 13, color: '#cbd5e1', fontStyle: 'italic', marginTop: 6, marginBottom: 4 },
  date: { fontSize: 11, color: '#64748b' },
  thankBtn: { backgroundColor: '#d9770622', borderWidth: 1, borderColor: '#d9770644', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 8 },
  thankBtnText: { color: '#fbbf24', fontSize: 13, fontWeight: '500' },
});
