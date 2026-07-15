import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native';
import { apiRequest } from '../utils/api';

interface Deal {
  id: string; name: string; value: number; stage: string; policyType: string;
  folio: string; leadSource: string; leadSourceNote: string; createdAt: string;
}

const STAGES = ['prospect', 'contacted', 'quoted', 'closing', 'won', 'lost'];
const STAGE_COLORS: Record<string, string> = { prospect: '#64748b', contacted: '#3b82f6', quoted: '#eab308', closing: '#a855f7', won: '#22c55e', lost: '#ef4444' };

export default function SalesScreen() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  async function fetchDeals() {
    try {
      const res = await apiRequest<{ deals: Deal[] }>('GET', '/sales/deals');
      setDeals(res.deals || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchDeals(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchDeals(); setRefreshing(false); };

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const res = await apiRequest<Deal>('POST', '/sales/deals', { name: name.trim(), value: parseFloat(value) || 0, stage: 'prospect' });
      setDeals([res, ...deals]);
      setName(''); setValue(''); setShowAdd(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setAdding(false); }
  }

  async function handleStageChange(dealId: string, newStage: string) {
    try {
      await apiRequest('PUT', `/sales/deals/${dealId}`, { stage: newStage });
      setDeals(deals.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));
    } catch { /* ignore */ }
  }

  const filtered = filter === 'all' ? deals : deals.filter((d) => d.stage === filter);
  const wonValue = deals.filter((d) => d.stage === 'won').reduce((s, d) => s + d.value, 0);
  const activeDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage)).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
      <Text style={styles.title}>Sales Tracker</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{activeDeals}</Text><Text style={styles.statLabel}>Active</Text></View>
        <View style={styles.statCard}><Text style={[styles.statValue, { color: '#22c55e' }]}>${wonValue.toLocaleString()}</Text><Text style={styles.statLabel}>Won</Text></View>
        <View style={styles.statCard}><Text style={[styles.statValue, { color: '#60a5fa' }]}>{deals.length}</Text><Text style={styles.statLabel}>Total</Text></View>
      </View>

      {/* Add Deal */}
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(!showAdd)}>
        <Text style={styles.addBtnText}>{showAdd ? '− Cancel' : '+ Add Deal'}</Text>
      </TouchableOpacity>

      {showAdd && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="Contact name *" placeholderTextColor="#64748b" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Value ($)" placeholderTextColor="#64748b" value={value} onChangeText={setValue} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={adding || !name.trim()}>
            <Text style={styles.saveBtnText}>{adding ? 'Saving...' : 'Save Deal'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['all', ...STAGES].map((s) => (
            <TouchableOpacity key={s} onPress={() => setFilter(s)} style={[styles.filterBtn, filter === s && styles.filterBtnActive]}>
              <Text style={[styles.filterText, filter === s && { color: '#fff' }]}>{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Deals */}
      {filtered.map((deal) => (
        <View key={deal.id} style={styles.dealCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.dealName}>{deal.name}</Text>
            {deal.value > 0 && <Text style={styles.dealValue}>${deal.value.toLocaleString()}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={[styles.stageBadge, { borderColor: STAGE_COLORS[deal.stage] || '#64748b' }]}>
              <Text style={[styles.stageText, { color: STAGE_COLORS[deal.stage] || '#64748b' }]}>{deal.stage}</Text>
            </View>
            {deal.policyType ? <Text style={styles.dealMeta}>{deal.policyType}</Text> : null}
          </View>
          {/* Stage buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {STAGES.map((s) => (
                <TouchableOpacity key={s} onPress={() => handleStageChange(deal.id, s)} disabled={deal.stage === s} style={[styles.miniBtn, deal.stage === s && { backgroundColor: STAGE_COLORS[s] + '33' }]}>
                  <Text style={[styles.miniBtnText, { color: STAGE_COLORS[s] }]}>{s.slice(0, 4)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}

      {filtered.length === 0 && !loading && (
        <View style={styles.empty}><Text style={styles.emptyText}>No deals yet. Add your first one above!</Text></View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  input: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, color: '#f1f5f9', fontSize: 14, marginBottom: 8 },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  filterBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterText: { fontSize: 12, color: '#94a3b8' },
  dealCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  dealName: { fontSize: 15, fontWeight: '600', color: '#f1f5f9' },
  dealValue: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  dealMeta: { fontSize: 11, color: '#f59e0b' },
  stageBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  stageText: { fontSize: 11, fontWeight: '500' },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334155' },
  miniBtnText: { fontSize: 10, fontWeight: '500' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14 },
});
