import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { CrmDestinationInfo, CrmConnection, FieldMapping } from '@social-lead-gen/shared';

// HawkEye lead fields that can be mapped to CRM fields.
const HAWKEYE_FIELDS: { key: string; label: string }[] = [
  { key: 'sourceAuthor', label: 'Lead name' },
  { key: 'contactEmail', label: 'Email' },
  { key: 'contactPhone', label: 'Phone' },
  { key: 'sourcePlatform', label: 'Social platform' },
  { key: 'sourceUrl', label: 'Source URL' },
  { key: 'leadSource', label: 'Lead source' },
  { key: 'leadSourceGroup', label: 'Source group' },
  { key: 'consentBasis', label: 'Consent basis' },
  { key: 'flightScore', label: 'Flight Score' },
  { key: 'suggestedResponse', label: 'Drafted response' },
  { key: 'leadNotes', label: 'Notes' },
  { key: 'status', label: 'Status' },
];

export default function CrmPage() {
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [destinations, setDestinations] = useState<CrmDestinationInfo[]>([]);
  const [connections, setConnections] = useState<CrmConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('');
  const [credential, setCredential] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  async function refresh() {
    try {
      const client = await buildClient();
      const [d, c] = await Promise.all([client.getCrmDestinations(), client.getCrmConnections()]);
      setDestinations(d.destinations || []);
      setConnections(c.connections || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDest = destinations.find((d) => d.type === selectedType);

  async function createConnection() {
    if (!selectedDest) return;
    if (selectedDest.availability !== 'available') {
      showToast('That CRM requires approval — not yet available');
      return;
    }
    setSaving(true);
    try {
      const client = await buildClient();
      const res = await client.createCrmConnection({
        destinationType: selectedType,
        credential: selectedType === 'webhook' || selectedType === 'csv' ? undefined : credential,
        webhookUrl: selectedType === 'webhook' ? webhookUrl : undefined,
        fieldMapping: {},
      });
      if (res.valid === false) {
        showToast(`⚠ Saved, but validation failed: ${res.reason || 'check credentials'}`);
      } else {
        showToast('✓ Connection saved');
      }
      setCredential(''); setWebhookUrl(''); setSelectedType('');
      refresh();
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Could not save connection'}`);
    } finally { setSaving(false); }
  }

  async function saveMapping(conn: CrmConnection, mapping: FieldMapping) {
    try {
      const client = await buildClient();
      await client.updateCrmConnection(conn.connectionId, { fieldMapping: mapping });
      showToast('✓ Mapping saved');
      refresh();
    } catch { showToast('❌ Could not save mapping'); }
  }

  async function activate(conn: CrmConnection) {
    try {
      const client = await buildClient();
      await client.activateCrmConnection(conn.connectionId);
      showToast('✓ Connection activated');
      refresh();
    } catch (e: any) {
      const unmapped = e?.data?.unmappedRequired || e?.unmappedRequired;
      showToast(unmapped ? `❌ Map required fields first: ${unmapped.join(', ')}` : '❌ Could not activate');
    }
  }

  async function remove(conn: CrmConnection) {
    if (!window.confirm(`Remove the ${conn.destinationType} connection? Leads already pushed stay in your CRM.`)) return;
    try {
      const client = await buildClient();
      await client.deleteCrmConnection(conn.connectionId);
      showToast('✓ Connection removed');
      refresh();
    } catch { showToast('❌ Could not remove'); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">
      <div>
        <h2 className="text-xl font-bold text-white">🔗 CRM Connections</h2>
        <p className="text-[11px] text-slate-400">Push the opportunities HawkEye finds straight into your CRM. We never post to social on your behalf.</p>
      </div>

      {loading ? (
        <div className="glass-card text-center text-slate-400 text-sm py-8">Loading…</div>
      ) : (
        <>
          {/* Existing connections */}
          {connections.length > 0 && (
            <div className="space-y-3">
              {connections.map((conn) => (
                <ConnectionCard
                  key={conn.connectionId}
                  conn={conn}
                  destination={destinations.find((d) => d.type === conn.destinationType)}
                  onSaveMapping={saveMapping}
                  onActivate={activate}
                  onRemove={remove}
                />
              ))}
            </div>
          )}

          {/* Add connection */}
          <div className="glass-card space-y-3">
            <h3 className="text-sm font-semibold text-white">Add a connection</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Destination</label>
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                <option value="">Select a CRM…</option>
                {destinations.map((d) => (
                  <option key={d.type} value={d.type} disabled={d.availability !== 'available'}>
                    {d.label}{d.availability !== 'available' ? ' — requires approval (not yet available)' : ''}
                  </option>
                ))}
              </select>
              {selectedDest && selectedDest.availability !== 'available' && (
                <p className="text-[11px] text-amber-300 mt-1">{selectedDest.reason || 'Not yet available.'}</p>
              )}
            </div>

            {selectedDest && selectedDest.availability === 'available' && selectedType === 'webhook' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Webhook / Zapier URL</label>
                <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
              </div>
            )}

            {selectedDest && selectedDest.availability === 'available' && selectedType !== 'webhook' && selectedType !== 'csv' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">API key / token</label>
                <input type="password" value={credential} onChange={(e) => setCredential(e.target.value)} placeholder="Paste your private token" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
                <p className="text-[10px] text-slate-500 mt-1">Stored encrypted. We never show it back or include it in your data export.</p>
              </div>
            )}

            {selectedDest && selectedDest.availability === 'available' && (
              <button onClick={createConnection} disabled={saving} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : 'Save connection'}
              </button>
            )}
          </div>

          <div className="text-center pt-2">
            <button onClick={() => navigate('/settings')} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">Back to Settings</button>
          </div>
        </>
      )}
    </div>
  );
}

function ConnectionCard({ conn, destination, onSaveMapping, onActivate, onRemove }: {
  conn: CrmConnection;
  destination?: CrmDestinationInfo;
  onSaveMapping: (c: CrmConnection, m: FieldMapping) => void;
  onActivate: (c: CrmConnection) => void;
  onRemove: (c: CrmConnection) => void;
}) {
  const required = destination?.requiredFields || [];
  const [mapping, setMapping] = useState<FieldMapping>(conn.fieldMapping || {});
  const [showMap, setShowMap] = useState(false);

  return (
    <div className={`glass-card border ${conn.active ? 'border-emerald-500/30' : 'border-white/10'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            {destination?.label || conn.destinationType}
            {conn.active && <span className="ml-2 text-[10px] text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">Active</span>}
          </p>
          <p className="text-[11px] text-slate-400">Credential: {conn.credentialMasked || '—'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowMap((s) => !s)} className="text-xs text-blue-400 hover:text-blue-300">{showMap ? 'Done' : 'Map fields'}</button>
          {!conn.active && <button onClick={() => onActivate(conn)} className="text-xs text-emerald-400 hover:text-emerald-300">Activate</button>}
          <button onClick={() => onRemove(conn)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
        </div>
      </div>

      {showMap && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <p className="text-[11px] text-slate-400">Map your CRM fields to HawkEye lead fields.{required.length > 0 && <> Required: <span className="text-white">{required.join(', ')}</span>.</>}</p>
          {(required.length > 0 ? required : ['email', 'name', 'phone', 'notes']).map((crmField) => (
            <div key={crmField} className="flex items-center gap-2">
              <span className="text-xs text-slate-300 w-28 shrink-0">{crmField}{required.includes(crmField) && <span className="text-red-400"> *</span>}</span>
              <select
                value={mapping[crmField] || ''}
                onChange={(e) => setMapping((m) => ({ ...m, [crmField]: e.target.value }))}
                className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"
              >
                <option value="">— not mapped —</option>
                {HAWKEYE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          ))}
          <button onClick={() => onSaveMapping(conn, mapping)} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg">Save mapping</button>
        </div>
      )}
    </div>
  );
}
