import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

interface Deal {
  id: string;
  name: string;
  value: number;
  stage: string;
  policyType: string;
  folio: string; // e.g. "2026-06-18 to 2026-07-17"
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  trade: string;
  createdAt: string;
}

const STAGES = [
  { id: 'prospect', label: 'Prospect', color: 'bg-slate-500/20 border-slate-500/30 text-slate-300' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 border-blue-500/30 text-blue-300' },
  { id: 'quoted', label: 'Quoted', color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300' },
  { id: 'closing', label: 'Closing', color: 'bg-purple-500/20 border-purple-500/30 text-purple-300' },
  { id: 'won', label: 'Won', color: 'bg-green-500/20 border-green-500/30 text-green-300' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500/20 border-red-500/30 text-red-300' },
];

const POLICY_TYPES = [
  'Home', 'Auto', 'Life', 'Commercial', 'Motorcycle', 'Trailer',
  'Boat', 'Umbrella', 'Renters', 'Condo', 'Flood', 'Bundle', 'Other',
];

export default function SalesPage() {
  const { getToken } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  // Folio default (saved once, auto-populates new deals)
  const [defaultFolioStart, setDefaultFolioStart] = useState(() => localStorage.getItem('hawkeye_folio_start') || '');
  const [defaultFolioEnd, setDefaultFolioEnd] = useState(() => localStorage.getItem('hawkeye_folio_end') || '');
  const [editingFolio, setEditingFolio] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState('prospect');
  const [policyType, setPolicyType] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [folioFilter, setFolioFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function fetchDeals() {
      try {
        const client = await buildClient();
        const result = await client.request<{ deals: Deal[] }>('GET', '/sales/deals');
        setDeals(result.deals || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchDeals();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const client = await buildClient();
      const result = await client.request<Deal>('POST', '/sales/deals', {
        name: name.trim(), value: parseFloat(value) || 0, stage,
        policyType, folio: (defaultFolioStart && defaultFolioEnd) ? `${defaultFolioStart} to ${defaultFolioEnd}` : '', contactName: name.trim(), contactEmail, contactPhone, notes,
      });
      setDeals([result, ...deals]);
      resetForm();
      setShowAdd(false);
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  async function handleUpdateStage(dealId: string, newStage: string) {
    try {
      const client = await buildClient();
      await client.request('PUT', `/sales/deals/${dealId}`, { stage: newStage });
      setDeals(deals.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));

      // 🎉 Celebrate when deal moves to Won!
      if (newStage === 'won') {
        // Pure DOM confetti (no canvas worker needed)
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
        const ctr = document.createElement('div');
        ctr.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden;';
        document.body.appendChild(ctr);
        for (let i = 0; i < 80; i++) {
          const p = document.createElement('div');
          const col = colors[Math.floor(Math.random() * colors.length)];
          const l = Math.random() * 100;
          const d = Math.random() * 0.5;
          const s = Math.random() * 8 + 4;
          p.style.cssText = 'position:absolute;left:' + l + '%;top:-10px;width:' + s + 'px;height:' + s + 'px;background:' + col + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '0') + ';animation:confetti-fall 2.5s ease-in ' + d + 's forwards;';
          ctr.appendChild(p);
        }
        if (!document.getElementById('confetti-style')) {
          const st = document.createElement('style');
          st.id = 'confetti-style';
          st.textContent = '@keyframes confetti-fall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }';
          document.head.appendChild(st);
        }
        setTimeout(() => ctr.remove(), 3500);

        // Send Sale-Cue email to team
        const deal = deals.find((d) => d.id === dealId);
        const teamEmails = (localStorage.getItem('hawkeye_team_emails') || '').split('\n').map((e) => e.trim()).filter(Boolean);
        if (teamEmails.length > 0 && deal) {
          try {
            await client.request('POST', '/sales/notify', {
              emails: teamEmails,
              dealName: deal.name,
              dealValue: deal.value,
              policyType: deal.policyType,
              folio: deal.folio,
            });
          } catch { /* non-fatal */ }
        }
      }
    } catch { /* ignore */ }
  }

  async function handleDelete(dealId: string) {
    try {
      const client = await buildClient();
      await client.request('DELETE', `/sales/deals/${dealId}`);
      setDeals(deals.filter((d) => d.id !== dealId));
    } catch { /* ignore */ }
  }

  function resetForm() {
    setName(''); setValue(''); setStage('prospect'); setPolicyType('');
    setContactName(''); setContactEmail(''); setContactPhone(''); setNotes('');
  }

  const filtered = (() => {
    let result = filter === 'all' ? deals : deals.filter((d) => d.stage === filter);
    if (folioFilter !== 'all') result = result.filter((d) => d.folio === folioFilter);
    return result;
  })();

  // Get unique folios for the dropdown
  const availableFolios = [...new Set(deals.map((d) => d.folio).filter(Boolean))].sort().reverse();

  // Stats
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const wonValue = deals.filter((d) => d.stage === 'won').reduce((sum, d) => sum + d.value, 0);
  const activeDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Sales Tracker</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-500"
        >
          {showAdd ? '−' : '+ Add Deal'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-white">{activeDeals}</div>
          <div className="text-xs text-slate-400">Active</div>
        </div>
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-green-400">${wonValue.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Won</div>
        </div>
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-blue-400">${totalValue.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Pipeline</div>
        </div>
      </div>

      {/* Folio Settings */}
      <div className="glass-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">📅 Current Folio</p>
            {defaultFolioStart && defaultFolioEnd ? (
              <p className="text-xs text-slate-400">{defaultFolioStart} to {defaultFolioEnd}</p>
            ) : (
              <p className="text-xs text-amber-400">Not set — tap Edit to configure</p>
            )}
          </div>
          <button
            onClick={() => setEditingFolio(!editingFolio)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {editingFolio ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingFolio && (
          <div className="mt-3 flex gap-2 items-center">
            <input
              type="date"
              value={defaultFolioStart}
              onChange={(e) => { setDefaultFolioStart(e.target.value); localStorage.setItem('hawkeye_folio_start', e.target.value); }}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={defaultFolioEnd}
              onChange={(e) => { setDefaultFolioEnd(e.target.value); localStorage.setItem('hawkeye_folio_end', e.target.value); }}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
            />
          </div>
        )}
      </div>

      {/* Add Deal Form */}
      {showAdd && (
        <div className="glass-card space-y-3 animate-scale-in">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name *" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
          <div className="flex gap-2">
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value ($)" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
              {STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost').map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <select value={policyType} onChange={(e) => setPolicyType(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
            <option value="">Select policy type...</option>
            {POLICY_TYPES.map((pt) => (
              <option key={pt} value={pt}>{pt}</option>
            ))}
          </select>
          {defaultFolioStart && defaultFolioEnd && (
            <p className="text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg">📅 Folio: {defaultFolioStart} to {defaultFolioEnd}</p>
          )}
          <div className="flex gap-2">
            <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-16" />
          <button onClick={handleAdd} disabled={adding || !name.trim()} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50">
            {adding ? 'Saving...' : 'Save Deal'}
          </button>
        </div>
      )}

      {/* Edit Deal Modal */}
      {editingDeal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-sm animate-scale-in space-y-3">
            <h3 className="font-bold text-white">Edit Deal</h3>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name *" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
            <div className="flex gap-2">
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value ($)" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              <select value={policyType} onChange={(e) => setPolicyType(e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                <option value="">Policy type</option>
                {POLICY_TYPES.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-none h-16" />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const client = await buildClient();
                    await client.request('PUT', `/sales/deals/${editingDeal.id}`, {
                      name: name.trim(),
                      value: parseFloat(value) || 0,
                      policyType,
                      contactName: name.trim(),
                      contactEmail,
                      contactPhone,
                      notes,
                    });
                    setDeals(deals.map((d) => d.id === editingDeal.id ? { ...d, name: name.trim(), value: parseFloat(value) || 0, policyType, contactEmail, contactPhone, notes } : d));
                    setEditingDeal(null);
                    resetForm();
                  } catch { /* ignore */ }
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-500"
              >
                Save Changes
              </button>
              <button onClick={() => { setEditingDeal(null); resetForm(); }} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folio Filter */}
      {availableFolios.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Folio:</span>
          <select
            value={folioFilter}
            onChange={(e) => setFolioFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
          >
            <option value="all">All Periods</option>
            {availableFolios.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stage Filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-3 px-3">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400'}`}>All ({deals.length})</button>
        {STAGES.map((s) => {
          const count = deals.filter((d) => d.stage === s.id).length;
          return (
            <button key={s.id} onClick={() => setFilter(s.id)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${filter === s.id ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400'}`}>
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Deals List */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-2xl mb-2">💰</p>
          <p className="text-slate-300 font-medium">No deals yet</p>
          <p className="text-sm text-slate-500 mt-1">Add your first deal to start tracking your sales pipeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((deal) => {
            const stageInfo = STAGES.find((s) => s.id === deal.stage) || STAGES[0];
            return (
              <details key={deal.id} className="glass-card">
                <summary className="flex items-center justify-between cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{deal.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${stageInfo.color}`}>{stageInfo.label}</span>
                      {deal.policyType && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{deal.policyType}</span>}
                      {deal.folio && <span className="text-xs text-slate-500">{deal.folio}</span>}
                      {deal.value > 0 && <span className="text-xs text-green-400">${deal.value.toLocaleString()}</span>}
                    </div>
                  </div>
                </summary>
                <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                  {/* Contact info */}
                  {(deal.contactName || deal.contactPhone || deal.contactEmail) && (
                    <div className="text-xs text-slate-400 space-y-0.5">
                      {deal.contactName && <p>👤 {deal.contactName}</p>}
                      {deal.contactPhone && <p>📞 {deal.contactPhone}</p>}
                      {deal.contactEmail && <p>✉️ {deal.contactEmail}</p>}
                    </div>
                  )}
                  {deal.notes && <p className="text-xs text-slate-500 italic">{deal.notes}</p>}

                  {/* Stage buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleUpdateStage(deal.id, s.id)}
                        disabled={deal.stage === s.id}
                        className={`px-2 py-1 rounded text-xs border transition-all ${deal.stage === s.id ? stageInfo.color + ' font-medium' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Edit & Delete */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        const newName = prompt('Edit name:', deal.name);
                        if (newName && newName.trim() !== deal.name) {
                          buildClient().then((client) => {
                            client.request('PUT', `/sales/deals/${deal.id}`, { name: newName.trim() });
                            setDeals(deals.map((d) => d.id === deal.id ? { ...d, name: newName.trim() } : d));
                          });
                        }
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(deal.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                  {confirmDeleteId === deal.id && (
                    <div className="mt-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-red-300 mb-2">Are you sure you want to delete this deal? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const client = await buildClient();
                              await client.request('DELETE', `/sales/deals/${deal.id}`);
                              setDeals(deals.filter((d) => d.id !== deal.id));
                            } catch { /* ignore */ }
                            setConfirmDeleteId(null);
                          }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-500"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        setEditingDeal(deal);
                        setName(deal.name);
                        setValue(String(deal.value || ''));
                        setPolicyType(deal.policyType || '');
                        setContactPhone(deal.contactPhone || '');
                        setContactEmail(deal.contactEmail || '');
                        setNotes(deal.notes || '');
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(deal.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {/* Delete confirmation */}
                  {confirmDeleteId === deal.id && (
                    <div className="mt-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                      <p className="text-sm text-red-300 mb-2">Are you sure you want to delete this deal?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const client = await buildClient();
                              await client.request('DELETE', `/sales/deals/${deal.id}`);
                              setDeals(deals.filter((d) => d.id !== deal.id));
                            } catch { /* ignore */ }
                            setConfirmDeleteId(null);
                          }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-500"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* Folio Total */}
      {filtered.length > 0 && (
        <div className="glass-card-strong border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Folio Total</p>
              <p className="text-xs text-slate-400">{filtered.length} deal{filtered.length !== 1 ? 's' : ''} {folioFilter !== 'all' ? `in ${folioFilter}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-400">${filtered.reduce((sum, d) => sum + d.value, 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500">Won: ${filtered.filter((d) => d.stage === 'won').reduce((sum, d) => sum + d.value, 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Emails for Sale-Cue notifications */}
      <details className="glass-card">
        <summary className="text-sm font-medium text-white cursor-pointer">🔔 Sale-Cue Team Notifications</summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-400">Add team emails below. When a deal is marked as "Won", everyone on this list gets a Sale-Cue notification email.</p>
          <textarea
            defaultValue={localStorage.getItem('hawkeye_team_emails') || ''}
            onBlur={(e) => localStorage.setItem('hawkeye_team_emails', e.target.value)}
            placeholder="Enter emails, one per line:&#10;team@example.com&#10;agent2@example.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-20"
          />
          <p className="text-xs text-slate-500">Emails are saved locally. Sale-Cue emails are sent when you move a deal to "Won".</p>
        </div>
      </details>
    </div>
  );
}
