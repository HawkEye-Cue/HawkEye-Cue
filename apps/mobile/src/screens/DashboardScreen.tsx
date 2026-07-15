import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { apiRequest } from '../utils/api';

export default function DashboardScreen({ navigation }: any) {
  const [leadStats, setLeadStats] = useState({ total: 0, new: 0, followedUp: 0, converted: 0 });
  const [deals, setDeals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    try {
      const [statsRes, dealsRes] = await Promise.all([
        apiRequest<any>('GET', '/opportunities/stats').catch(() => null),
        apiRequest<any>('GET', '/sales/deals').catch(() => null),
      ]);
      if (statsRes) {
        const s = statsRes.stats || statsRes;
        setLeadStats({ total: s.total || 0, new: s.new || 0, followedUp: s.followedUp || s.followed_up || 0, converted: s.converted || 0 });
      }
      if (dealsRes?.deals) {
        setDeals(dealsRes.deals);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchData(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const activeDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage)).length;
  const wonValue = deals.filter((d) => d.stage === 'won').reduce((s, d) => s + (d.value || 0), 0);
  const followUps = deals.filter((d) => ['prospect', 'contacted', 'quoted'].includes(d.stage) && new Date(d.createdAt) < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
      <Text style={styles.header}>🦅 HawkEye-Cue</Text>
      <Text style={styles.title}>Dashboard</Text>

      {/* Lead Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#60a5fa' }]}>{leadStats.new}</Text>
          <Text style={styles.statLabel}>New Leads</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#eab308' }]}>{leadStats.followedUp}</Text>
          <Text style={styles.statLabel}>Followed Up</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#22c55e' }]}>{leadStats.converted}</Text>
          <Text style={styles.statLabel}>Converted</Text>
        </View>
      </View>

      {/* Sales Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰 Sales Pipeline</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: 20 }]}>{activeDeals}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: 20, color: '#22c55e' }]}>${wonValue.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Won</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Sales')}>
          <Text style={styles.linkBtnText}>View Sales →</Text>
        </TouchableOpacity>
      </View>

      {/* Follow-Ups Due */}
      {followUps.length > 0 && (
        <View style={[styles.card, { borderColor: '#f59e0b33' }]}>
          <Text style={[styles.cardTitle, { color: '#fbbf24' }]}>📋 Follow-Ups Due ({followUps.length})</Text>
          {followUps.slice(0, 3).map((d) => (
            <View key={d.id} style={styles.followUpItem}>
              <Text style={styles.followUpName}>{d.name}</Text>
              <Text style={styles.followUpMeta}>{d.policyType || d.stage} · {Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000)}d ago</Text>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Create')}>
          <Text style={styles.actionBtnText}>✨ Create Post</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#166534' }]} onPress={() => navigation.navigate('Sales')}>
          <Text style={styles.actionBtnText}>💰 Add Deal</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  header: { fontSize: 14, color: '#f59e0b', fontWeight: '700', textAlign: 'center', letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#f1f5f9' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 10 },
  linkBtn: { marginTop: 8 },
  linkBtnText: { color: '#60a5fa', fontSize: 13 },
  followUpItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#334155' },
  followUpName: { fontSize: 14, color: '#f1f5f9' },
  followUpMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  actionBtn: { backgroundColor: '#1d4ed8', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
