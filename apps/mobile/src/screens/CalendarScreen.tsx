import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { apiRequest } from '../utils/api';

interface CalendarEvent { id: string; date: string; title: string; type: string; completed: boolean; }

export default function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  async function fetchEvents() {
    try {
      const res = await apiRequest<any>('GET', '/calendar/events');
      setEvents(res.events || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchEvents(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchEvents(); setRefreshing(false); };

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await apiRequest<CalendarEvent>('POST', '/calendar/events', { date: todayStr, title: newTitle.trim(), type: 'task' });
      setEvents([...events, res]);
      setNewTitle('');
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  async function toggleComplete(id: string) {
    try {
      const res = await apiRequest<any>('PUT', `/calendar/events/${id}/toggle`);
      setEvents(events.map((e) => e.id === id ? { ...e, completed: res.completed } : e));
    } catch { /* ignore */ }
  }

  const todayEvents = events.filter((e) => e.date === todayStr);
  const upcomingEvents = events.filter((e) => e.date > todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
      <Text style={styles.title}>Calendar</Text>

      {/* Add Quick Task */}
      <View style={styles.addRow}>
        <TextInput style={styles.addInput} placeholder="Add a task for today..." placeholderTextColor="#64748b" value={newTitle} onChangeText={setNewTitle} onSubmitEditing={handleAdd} />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={adding || !newTitle.trim()}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Today's Events */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Today</Text>
        {todayEvents.length === 0 ? (
          <Text style={styles.emptyText}>No tasks for today</Text>
        ) : (
          todayEvents.map((event) => (
            <TouchableOpacity key={event.id} onPress={() => toggleComplete(event.id)} style={styles.eventRow}>
              <View style={[styles.checkbox, event.completed && styles.checkboxDone]} />
              <Text style={[styles.eventTitle, event.completed && styles.eventDone]}>{event.title}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Upcoming */}
      {upcomingEvents.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📆 Upcoming</Text>
          {upcomingEvents.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.eventDate}>{event.date.slice(5)}</Text>
              <Text style={styles.eventTitle}>{event.title}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  addInput: { flex: 1, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, color: '#f1f5f9', fontSize: 14 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 10, width: 44, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 10 },
  emptyText: { color: '#64748b', fontSize: 13 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#33415544' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#64748b' },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  eventTitle: { fontSize: 14, color: '#e2e8f0', flex: 1 },
  eventDone: { textDecorationLine: 'line-through', color: '#64748b' },
  eventDate: { fontSize: 11, color: '#f59e0b', width: 40 },
});
