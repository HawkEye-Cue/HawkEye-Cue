import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function CollaborateScreen() {
  const [wingmanName, setWingmanName] = useState('');
  const [wingmanKeywords, setWingmanKeywords] = useState<string[]>([]);
  const [newKw, setNewKw] = useState('');

  function addKeyword() {
    if (!newKw.trim() || wingmanKeywords.includes(newKw.trim())) return;
    setWingmanKeywords([...wingmanKeywords, newKw.trim()]);
    setNewKw('');
  }

  function removeKeyword(idx: number) {
    setWingmanKeywords(wingmanKeywords.filter((_, i) => i !== idx));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Collaborate</Text>
      <Text style={styles.subtitle}>Build relationships that generate referrals</Text>

      {/* Wingman Section */}
      <View style={[styles.card, { borderColor: '#f59e0b33' }]}>
        <Text style={[styles.cardTitle, { color: '#fbbf24' }]}>🤝 Wingman — Relationship Builder</Text>
        <Text style={styles.desc}>Add keywords for your referral partners. When you see posts matching these, shout them out!</Text>

        <Text style={styles.label}>Your Wingman's Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Mike's Roofing, Sarah at State Farm..."
          placeholderTextColor="#64748b"
          value={wingmanName}
          onChangeText={setWingmanName}
        />

        <Text style={styles.label}>Wingman Keywords</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="+ Add keyword..."
            placeholderTextColor="#64748b"
            value={newKw}
            onChangeText={setNewKw}
            onSubmitEditing={addKeyword}
          />
          <TouchableOpacity style={styles.addKwBtn} onPress={addKeyword}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>+</Text>
          </TouchableOpacity>
        </View>

        {wingmanKeywords.length > 0 && (
          <View style={styles.kwList}>
            {wingmanKeywords.map((kw, idx) => (
              <View key={idx} style={styles.kwTag}>
                <Text style={styles.kwText}>{kw}</Text>
                <TouchableOpacity onPress={() => removeKeyword(idx)}>
                  <Text style={{ color: '#ef4444', marginLeft: 6 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {wingmanName && wingmanKeywords.length > 0 && (
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>How it works:</Text>
            <Text style={styles.tipText}>When you see posts containing "{wingmanKeywords[0]}" while scrolling, recommend {wingmanName}. They'll reciprocate with referrals.</Text>
          </View>
        )}
      </View>

      {/* Collaboration Board */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Collaboration Board</Text>
        <Text style={styles.desc}>Connect with other trades in your area. Post referral requests and build partnerships.</Text>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>View Network Board →</Text>
        </TouchableOpacity>
      </View>

      {/* Contacts */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📇 My Contacts</Text>
        <Text style={styles.desc}>Keep track of your referral partners and their info.</Text>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>Manage Contacts →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#94a3b8', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  desc: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  label: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  input: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, color: '#f1f5f9', fontSize: 14, marginBottom: 10 },
  addKwBtn: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  kwList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  kwTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  kwText: { fontSize: 12, color: '#fbbf24' },
  tipBox: { backgroundColor: '#f59e0b11', borderWidth: 1, borderColor: '#f59e0b22', borderRadius: 10, padding: 12, marginTop: 8 },
  tipTitle: { fontSize: 12, fontWeight: '600', color: '#fbbf24', marginBottom: 4 },
  tipText: { fontSize: 11, color: '#94a3b8' },
  actionBtn: { backgroundColor: '#1d4ed8', borderRadius: 10, padding: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
