import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { apiRequest } from '../utils/api';

interface Lead { id: string; sourceAuthor: string; sourceContent: string; sourcePlatform: string; sourceUrl: string; status: string; createdAt: string; }

const platformIcons: Record<string, string> = { facebook: '📘', instagram: '📷', linkedin: '💼', tiktok: '🎵' };
const statusColors: Record<string, string> = { new: '#3b82f6', followed_up: '#eab308', converted: '#22c55e' };

export default function OpportunitiesScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchLeads() {
    try {
      const res = await apiRequest<any>('GET', '/opportunities');
      setLeads(res.opportunities || res.items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchLeads(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchLeads(); setRefreshing(false); };

  async function updateStatus(id: string, status: string) {
    try {
      await apiRequest('PUT', `/opportunities/${id}/status`, { status });
      setLeads(leads.map((l) => l.id === id ? { ...l, status } : l));
    } catch { /* ignore */ }
  }

  async function deleteLead(id: string) {
    try {
      await apiRequest('DELETE', `/opportunities/${id}`);
      setLeads(leads.filter((l) => l.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
      <Text style={styles.title}>Lead Cues</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={[styles.statValue, { color: '#3b82f6' }]}>{leads.filter((l) => l.status === 'new').length}</Text><Text style={styles.statLabel}>New</Text></View>
        <View style={styles.statCard}><Text style={[styles.statValue, { color: '#eab308' }]}>{leads.filter((l) => l.status === 'followed_up').length}</Text><Text style={styles.statLabel}>Followed Up</Text></View>
        <View style={styles.statCard}><Text style={[styles.statValue, { color: '#22c55e' }]}>{leads.filter((l) => l.status === 'converted').length}</Text><Text style={styles.statLabel}>Converted</Text></View>
      </View>

      {loading ? <Text style={styles.emptyText}>Loading...</Text> : leads.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🦅</Text>
          <Text style={styles.emptyText}>No leads yet</Text>
          <Text style={[styles.emptyText, { fontSize: 12 }]}>Install the browser extension to start detecting leads</Text>
        </View>
      ) : (
        leads.map((lead) => (
          <View key={lead.id} style={styles.leadCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leadAuthor}>{platformIcons[lead.sourcePlatform] || '📱'} {lead.sourceAuthor}</Text>
                <Text style={styles.leadDate}>{new Date(lead.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={[styles.statusBadge, { borderColor: statusColors[lead.status] || '#64748b' }]}>
                <Text style={[styles.statusText, { color: statusColors[lead.status] || '#64748b' }]}>{lead.status === 'followed_up' ? 'Followed Up' : lead.status}</Text>
              </View>
            </View>
            <Text style={styles.leadContent} numberOfLines={3}>"{lead.sourceContent}"</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {lead.status === 'new' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#eab30822' }]} onPress={() => updateStatus(lead.id, 'followed_up')}>
                  <Text style={{ color: '#eab308', fontSize: 12, fontWeight: '500' }}>📞 Followed Up</Text>
                </TouchableOpacity>
              )}
              {lead.status !== 'converted' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#22c55e22' }]} onPress={() => updateStatus(lead.id, 'converted')}>
                  <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '500' }}>✓ Converted</Text>
                </TouchableOpacity>
              )}
              {lead.sourceUrl && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(lead.sourceUrl)}>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>View ↗</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => deleteLead(lead.id)}>
                <Text style={{ color: '#ef4444', fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
  leadCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  leadAuthor: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  leadDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  leadContent: { fontSize: 13, color: '#cbd5e1', fontStyle: 'italic', marginTop: 8, backgroundColor: '#0f172a', padding: 8, borderRadius: 8 },
  statusBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '500', textTransform: 'capitalize' },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
});
