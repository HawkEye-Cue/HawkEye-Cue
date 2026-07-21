import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTrade } from '../contexts/TradeContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity, OpportunityStatus, OpportunityStats } from '@social-lead-gen/shared';
import { useTeamData, MEMBER_COLORS, MEMBER_TEXT_COLORS } from '../hooks/useTeamData';

const FILTERS: { label: string; value: OpportunityStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Followed Up', value: 'followed_up' },
  { label: 'Converted', value: 'converted' },
];

const platformIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
  nextdoor: '🏡',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-900/40 text-blue-400 border-blue-500/20',
  followed_up: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/20',
  converted: 'bg-green-900/40 text-green-400 border-green-500/20',
  dismissed: 'bg-slate-900/40 text-slate-400 border-slate-500/20',
};

export default function OpportunitiesPage() {
  const { getToken, user } = useAuth();
  const { showToast } = useToast();
  const { selectedTrade } = useTrade();
  const [filter, setFilter] = useState<OpportunityStatus | 'all'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'platform' | 'keyword'>('none');
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<OpportunityStats>({ total: 0, new: 0, followedUp: 0, converted: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tier, setTier] = useState('free');
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadSource, setNewLeadSource] = useState('facebook-group');
  const [newLeadGroup, setNewLeadGroup] = useState('');
  const [newLeadNote, setNewLeadNote] = useState('');
  const [newLeadPolicyType, setNewLeadPolicyType] = useState('');
  const [newLeadCustomType, setNewLeadCustomType] = useState('');
  const [newLeadAssignee, setNewLeadAssignee] = useState('');
  const [userGroups, setUserGroups] = useState<string[]>([]);
  const [showTeamLeads, setShowTeamLeads] = useState(false);
  const [teamLeadFilter, setTeamLeadFilter] = useState('all');

  // Team data integration
  const { isInTeam, teamMembers, teamLeads, leadsNextCursor, fetchLeads, getMemberColorIndex } = useTeamData();

  // Fetch team leads when toggled
  useEffect(() => {
    if (showTeamLeads && isInTeam && teamLeads.length === 0) fetchLeads();
  }, [showTeamLeads, isInTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trade-specific policy types (same as SalesPage TRADE_CONFIGS)
  const LEAD_POLICY_TYPES: Record<string, string[]> = {
    'insurance-agent': ['Home', 'Auto', 'Life', 'Commercial', 'Motorcycle', 'Trailer', 'Boat', 'Umbrella', 'Renters', 'Condo', 'Flood', 'Bundle'],
    'health-insurance-agent': ['Individual', 'Family', 'Medicare', 'Medicaid', 'Group/Employer', 'Dental', 'Vision', 'Supplemental', 'Short-Term'],
    'insurance-producer': ['Home', 'Auto', 'Life', 'Commercial', 'Motorcycle', 'Trailer', 'Boat', 'Umbrella', 'Renters', 'Condo', 'Flood', 'Bundle'],
    'real-estate-agent': ['Single Family', 'Condo/Townhome', 'Multi-Family', 'Luxury', 'Land/Lot', 'Commercial', 'Investment Property', 'New Construction', 'Foreclosure'],
    'mortgage-lender': ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Refinance', 'HELOC', 'Reverse Mortgage', 'Construction'],
    'roofing': ['Shingle Replacement', 'Metal Roof', 'Flat Roof', 'Tile Roof', 'Roof Repair', 'Storm Damage', 'Inspection', 'Gutter Install', 'Skylight'],
    'general-contractor': ['Kitchen Remodel', 'Bathroom Remodel', 'Addition', 'Full Renovation', 'Basement Finish', 'Deck/Patio', 'Commercial Build-Out', 'New Construction', 'Repair'],
    'hvac-technician': ['AC Install', 'Furnace Install', 'AC Repair', 'Heating Repair', 'Maintenance Plan', 'Ductwork', 'Mini-Split', 'Thermostat', 'Air Quality'],
    'electrician': ['Panel Upgrade', 'Rewiring', 'Outlet/Switch Install', 'Lighting', 'Generator Install', 'EV Charger', 'Inspection', 'Commercial', 'Emergency Repair'],
    'plumber': ['Pipe Repair', 'Drain Cleaning', 'Water Heater', 'Sewer Line', 'Bathroom Remodel', 'Fixture Install', 'Gas Line', 'Emergency', 'Inspection'],
    'landscaper': ['Design & Install', 'Lawn Maintenance', 'Tree Service', 'Irrigation', 'Hardscape', 'Seasonal Cleanup', 'Sod/Turf', 'Garden Bed', 'Lighting'],
    'painter': ['Interior Full', 'Exterior Full', 'Single Room', 'Cabinet Painting', 'Deck Stain', 'Commercial', 'Touch-Up', 'Wallpaper Removal', 'Pressure Wash & Paint'],
    'auto-repair-shop': ['Engine Repair', 'Brake Service', 'Transmission', 'AC/Heating', 'Electrical', 'Suspension', 'Oil/Maintenance', 'Diagnostic', 'Tire Service'],
    'auto-broker': ['New Vehicle', 'Used Vehicle', 'Lease', 'Trade-In', 'Fleet Purchase', 'Luxury/Exotic', 'Commercial Vehicle', 'Financing'],
    'junk-removal': ['Residential Cleanout', 'Estate Cleanout', 'Construction Debris', 'Appliance Removal', 'Yard Waste', 'Commercial', 'Hoarding', 'Foreclosure'],
    'pool-service': ['Weekly Maintenance', 'Green Pool Cleanup', 'Equipment Repair', 'Pump/Filter Replace', 'Tile/Surface', 'Opening/Closing', 'Chemical Balance', 'Leak Repair'],
    'pool-builder': ['Inground Pool', 'Above Ground Pool', 'Pool Renovation', 'Spa/Hot Tub', 'Pool Deck', 'Water Feature', 'Pool House', 'Fencing'],
    'cosmetologist': ['Color', 'Cut & Style', 'Balayage/Highlights', 'Extensions', 'Keratin Treatment', 'Bridal', 'Perm/Relaxer', 'Package Deal'],
    'esthetician': ['Facial', 'Chemical Peel', 'Microneedling', 'Laser Treatment', 'Waxing Package', 'Acne Program', 'Anti-Aging Package', 'Body Treatment'],
    'yoga-teacher': ['Private Session', 'Group Class', 'Workshop', 'Retreat', 'Monthly Membership', 'Corporate', 'Teacher Training', 'Online Package'],
    'flooring-installer': ['Hardwood', 'Laminate', 'Vinyl Plank', 'Tile', 'Carpet', 'Epoxy', 'Refinishing', 'Commercial', 'Stairs'],
    'fence-company': ['Wood Privacy', 'Chain Link', 'Vinyl', 'Aluminum', 'Iron', 'Farm/Ranch', 'Gate Install', 'Repair', 'Commercial'],
    'deck-patio-builder': ['Composite Deck', 'Wood Deck', 'Paver Patio', 'Concrete Patio', 'Pergola', 'Screened Porch', 'Outdoor Kitchen', 'Repair/Resurface'],
    'window-door-installer': ['Window Replacement', 'Entry Door', 'Patio/Sliding Door', 'Storm Door', 'French Doors', 'Bay/Bow Window', 'Skylight', 'Commercial'],
    'garage-door-company': ['New Door Install', 'Opener Install', 'Spring Replacement', 'Panel Replacement', 'Full Replacement', 'Commercial Door', 'Maintenance', 'Emergency Repair'],
    'restoration': ['Water Damage', 'Fire Damage', 'Mold Remediation', 'Storm Damage', 'Sewage Cleanup', 'Smoke Damage', 'Reconstruction', 'Contents Cleaning'],
    'pest-control': ['General Pest', 'Termite Treatment', 'Rodent Control', 'Bed Bugs', 'Mosquito Service', 'Wildlife Removal', 'Commercial', 'Annual Plan'],
    'pressure-washer': ['House Wash', 'Driveway/Sidewalk', 'Deck/Fence', 'Roof Wash', 'Commercial', 'Fleet Wash', 'Gutter Brightening', 'Package Deal'],
    'home-inspector': ['Buyer Inspection', 'Pre-Listing', 'New Construction', 'Radon Test', 'Mold Inspection', 'Sewer Scope', 'Commercial', '4-Point', 'Wind Mitigation'],
    'handyman': ['Repair', 'Assembly', 'Mounting/Install', 'Painting', 'Drywall', 'Plumbing Fix', 'Electrical Fix', 'Odd Jobs'],
    'collision-center': ['Collision Repair', 'Dent Repair', 'Paint Job', 'Frame Straightening', 'Bumper Repair', 'Glass Replacement', 'Insurance Claim', 'Custom Paint'],
    'tint-shop': ['Automotive Tint', 'Residential Tint', 'Commercial Tint', 'Ceramic Package', 'PPF/Clear Bra', 'Windshield Tint', 'Strip & Re-Tint'],
    'wrap-shop': ['Full Wrap', 'Partial Wrap', 'Color Change', 'Commercial Fleet', 'Chrome Delete', 'Accents/Graphics', 'Interior Wrap', 'PPF'],
    'mobile-mechanic': ['Brake Service', 'Battery/Starter', 'Oil Change', 'Diagnostic', 'AC Repair', 'Belt/Hose', 'Electrical', 'Fleet Service'],
    'tire-shop': ['Full Set (4)', 'Pair (2)', 'Single Tire', 'Flat Repair', 'Alignment', 'Rotation/Balance', 'Custom Wheels', 'Commercial Tires'],
    'towing-company': ['Local Tow', 'Long Distance', 'Flatbed', 'Motorcycle Tow', 'Jump Start', 'Lockout', 'Tire Change', 'Winch-Out'],
    'gutter-service': ['Gutter Cleaning', 'Gutter Installation', 'Gutter Guards', 'Repair', 'Downspout Install', 'Commercial'],
    'appliance-repair': ['Washer', 'Dryer', 'Refrigerator', 'Dishwasher', 'Oven/Stove', 'Microwave', 'Ice Maker', 'Commercial'],
    'chimney-services': ['Chimney Sweep', 'Chimney Repair', 'Cap Install', 'Liner Install', 'Inspection', 'Fireplace Repair'],
    'septic-company': ['Pumping', 'Repair', 'Installation', 'Inspection', 'Drain Field', 'Tank Replacement'],
    'excavation-contractor': ['Foundation Dig', 'Grading', 'Land Clearing', 'Trenching', 'Demolition', 'Site Prep'],
    'insulation-contractor': ['Spray Foam', 'Blown-In', 'Batt Install', 'Removal', 'Attic', 'Crawl Space'],
    'welder': ['Structural', 'Fabrication', 'Repair', 'Aluminum', 'Stainless', 'Custom', 'Pipe'],
    'cabinet-maker': ['Kitchen Cabinets', 'Bathroom Vanity', 'Built-Ins', 'Closet System', 'Refacing', 'Custom Furniture'],
    'countertop-installer': ['Granite', 'Quartz', 'Marble', 'Butcher Block', 'Laminate', 'Concrete', 'Solid Surface'],
    'drywall-contractor': ['New Install', 'Repair', 'Texture', 'Finishing', 'Ceiling', 'Commercial'],
    'masonry': ['Brick', 'Stone', 'Block', 'Concrete', 'Retaining Wall', 'Repair', 'Chimney'],
    'stucco-contractor': ['New Install', 'Repair', 'Re-Coat', 'EIFS', 'Color Coat', 'Commercial'],
    'epoxy-flooring': ['Garage Floor', 'Commercial Floor', 'Metallic Epoxy', 'Flake System', 'Polyaspartic', 'Repair'],
    'commercial-cleaning': ['Office', 'Medical', 'Retail', 'Industrial', 'Post-Construction', 'Deep Clean'],
    'janitorial': ['Daily Service', 'Floor Care', 'Window Cleaning', 'Restroom Service', 'Trash Removal', 'Special Event'],
    'snow-removal': ['Residential', 'Commercial Lot', 'Sidewalk', 'De-Icing', 'Roof Snow', 'Seasonal Contract'],
    'arborist': ['Tree Removal', 'Trimming', 'Stump Grinding', 'Health Assessment', 'Emergency', 'Planting'],
    'equipment-rental': ['Excavator', 'Skid Steer', 'Lift', 'Generator', 'Trailer', 'Compactor', 'Tools'],
  };

  // Get policy types: first check localStorage (user-customized), then fall back to trade defaults
  const dealTypesKey = `hawkeye_deal_types_${selectedTrade?.id || 'default'}`;
  const [policyTypes, setPolicyTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem(dealTypesKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return selectedTrade ? (LEAD_POLICY_TYPES[selectedTrade.id] || ['Service', 'Project', 'Consultation', 'Contract', 'Custom']) : [];
  });

  useEffect(() => {
    const saved = localStorage.getItem(dealTypesKey);
    if (saved) { try { setPolicyTypes(JSON.parse(saved)); return; } catch { /* ignore */ } }
    setPolicyTypes(selectedTrade ? (LEAD_POLICY_TYPES[selectedTrade.id] || ['Service', 'Project', 'Consultation', 'Contract', 'Custom']) : []);
  }, [dealTypesKey, selectedTrade]);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Check tier
  useEffect(() => {
    buildClient().then((client) => client.request<{ tier: string }>('GET', '/subscription')).then((res) => setTier(res.tier || 'free')).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAccess = ['soar', 'team', 'summit'].includes(tier);

  // Load user's groups from calendar events (post type cues = groups)
  useEffect(() => {
    buildClient().then((client) => client.request<{ events: any[] }>('GET', '/calendar/events')).then((res) => {
      const posts = (res.events || []).filter((e: any) => e.type === 'post');
      const groupNames = [...new Set(posts.map((e: any) => e.title).filter(Boolean))].sort();
      setUserGroups(groupNames);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    try {
      const client = await buildClient();
      const [leadsResult, statsResult] = await Promise.all([
        client.getOpportunities({ status: filter !== 'all' ? filter : undefined }),
        client.getOpportunityStats(),
      ]);
      // Handle both { items: [...] } and { opportunities: [...] } formats
      const items = leadsResult.items || (leadsResult as any).opportunities || [];
      setLeads(items);
      setStats(statsResult);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchData();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdateStatus(id: string, newStatus: OpportunityStatus) {
    setUpdatingId(id);
    try {
      const client = await buildClient();
      await client.updateOpportunityStatus(id, newStatus);
      // Update local state
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: newStatus } : l));
      // Update stats
      setStats((prev) => {
        const updated = { ...prev };
        // Find old status to decrement
        const old = leads.find((l) => l.id === id);
        if (old) {
          if (old.status === 'new') updated.new = Math.max(0, updated.new - 1);
          else if (old.status === 'followed_up') updated.followedUp = Math.max(0, updated.followedUp - 1);
          else if (old.status === 'converted') updated.converted = Math.max(0, updated.converted - 1);
        }
        // Increment new status
        if (newStatus === 'new') updated.new++;
        else if (newStatus === 'followed_up') updated.followedUp++;
        else if (newStatus === 'converted') updated.converted++;
        return updated;
      });
      showToast('✓ Saved');
    } catch { /* ignore */ }
    finally { setUpdatingId(null); }
  }

  async function handleDelete(id: string) {
    try {
      const client = await buildClient();
      await client.deleteOpportunity(id);
      const deleted = leads.find((l) => l.id === id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setStats((prev) => {
        const updated = { ...prev, total: prev.total - 1 };
        if (deleted?.status === 'new') updated.new--;
        else if (deleted?.status === 'followed_up') updated.followedUp--;
        else if (deleted?.status === 'converted') updated.converted--;
        return updated;
      });
    } catch (e) {
      console.error('Failed to delete lead:', e);
      alert('Failed to delete: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function renderLeadCard(lead: Opportunity) {
    return (
      <div key={lead.id} className="glass-card">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{platformIcons[lead.sourcePlatform] || '📱'}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{lead.sourceAuthor}</p>
              <p className="text-xs text-slate-500">{(lead as any).keywordText || (lead as any).keywordId || 'Keyword match'} • {lead.sourcePlatform || ''} • {new Date(lead.detectedAt || (lead as any).createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[lead.status]}`}>
              {lead.status === 'followed_up' ? 'Followed Up' : lead.status === 'converted' ? 'Converted' : 'New'}
            </span>
            {(lead as any).policyType && (
              <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{(lead as any).policyType}</span>
            )}
            <button onClick={() => handleDelete(lead.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
          </div>
        </div>
        <p className="text-sm text-slate-300 italic bg-white/5 p-2 rounded-lg mb-3">&quot;{(lead.sourceContent || '').slice(0, 150)}{(lead.sourceContent || '').length > 150 ? '...' : ''}&quot;</p>
        <div className="flex flex-wrap items-center gap-2">
          {lead.status === 'new' && (
            <button onClick={() => handleUpdateStatus(lead.id, 'followed_up')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-600/30 disabled:opacity-50">
              {updatingId === lead.id ? '...' : '📞 Mark Followed Up'}
            </button>
          )}
          {(lead.status === 'new' || lead.status === 'followed_up') && (
            <button onClick={() => handleUpdateStatus(lead.id, 'converted')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs font-medium hover:bg-green-600/30 disabled:opacity-50">
              {updatingId === lead.id ? '...' : '✓ Mark Converted'}
            </button>
          )}
          {lead.sourceUrl && (
            <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 rounded-lg text-xs hover:bg-white/10">View Post ↗</a>
          )}
        </div>
        {/* Assigned To — inline editable */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-slate-500">👤</span>
          <select
            value={(lead as any).assignedTo || ''}
            onChange={async (e) => {
              const val = e.target.value;
              try {
                const client = await buildClient();
                await client.request('PUT', `/opportunities/${lead.id}/status`, { assignedTo: val || null });
                setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, assignedTo: val } as any : l));
                showToast('✓ Assigned');
              } catch { /* ignore */ }
            }}
            className="px-2 py-1 bg-slate-700/80 border border-slate-600/50 rounded text-xs text-slate-300 hover:border-slate-500 cursor-pointer"
          >
            <option value="">Unassigned</option>
            <option value={user?.email || ''}>Me ({user?.email?.split('@')[0] || 'me'})</option>
            {isInTeam && teamMembers.filter((m) => m.email !== user?.email).map((m) => (
              <option key={m.userId} value={m.email}>{m.email.split('@')[0]}</option>
            ))}
          </select>
          {(lead as any).assignedTo && (
            <span className="text-xs text-blue-400">{(lead as any).assignedTo.split('@')[0]}</span>
          )}
        </div>
        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">📝 Notes</summary>
          <textarea defaultValue={localStorage.getItem(`hawkeye_lead_note_${lead.id}`) || ''} onBlur={(e) => localStorage.setItem(`hawkeye_lead_note_${lead.id}`, e.target.value)} placeholder="Add notes about this lead..." className="w-full mt-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500 resize-none h-16" />
        </details>
      </div>
    );
  }

  if (!hasAccess && !loading) {
    return (
      <div className="space-y-6 text-center py-12">
        <div className="text-5xl">🎯</div>
        <h2 className="text-2xl font-bold text-white">Lead Detection</h2>
        <p className="text-slate-400 max-w-sm mx-auto">Find leads automatically from social media using keyword tracking and the browser extension. Available on the Soar plan.</p>
        <div className="max-w-sm mx-auto text-left mt-4 space-y-2">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">What you'll get:</p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li>🔑 Keyword tracking — get notified when someone mentions your services</li>
            <li>🦅 Browser extension — spots leads while you scroll Facebook, Instagram, LinkedIn</li>
            <li>📋 Lead pipeline — organize prospects from new to converted</li>
            <li>🔔 Real-time alerts — never miss an opportunity</li>
          </ul>
        </div>
        <a href="/settings" className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-black px-8 py-3 rounded-lg font-bold hover:opacity-90 transition-opacity mt-4">Upgrade to Soar — $24.99/mo</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Lead Cues</h2>
        <button onClick={() => setShowAddLead(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">
          + Add Lead
        </button>
      </div>

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">+ Add Lead</h3>
              <button onClick={() => setShowAddLead(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Lead Name / Contact</label>
                <input type="text" value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} placeholder="e.g. John Smith" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Source / Pipeline</label>
                <select value={newLeadSource} onChange={(e) => setNewLeadSource(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                  <option value="facebook-group">Facebook Group</option>
                  <option value="facebook-post">Facebook Post</option>
                  <option value="instagram-post">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="referral">Referral</option>
                  <option value="cold-call">Cold Call</option>
                  <option value="warm-call">Warm Call</option>
                  <option value="walk-in">Walk-In</option>
                  <option value="website">Website</option>
                  <option value="google-ad">Google Ad</option>
                  <option value="facebook-ad">Facebook Ad</option>
                  <option value="door-knock">Door Knock</option>
                  <option value="internet-lead">Internet Lead</option>
                  <option value="repeat-client">Repeat Client</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {newLeadSource === 'facebook-group' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Which Group?</label>
                  <select value={newLeadGroup} onChange={(e) => setNewLeadGroup(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                    <option value="">Select a group...</option>
                    {userGroups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
              {newLeadSource === 'internet-lead' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Lead Vendor</label>
                  <select value={newLeadGroup} onChange={(e) => setNewLeadGroup(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                    <option value="">Select vendor...</option>
                    <option value="QuoteWizard">QuoteWizard</option>
                    <option value="EverQuote">EverQuote</option>
                    <option value="Datalot">Datalot</option>
                    <option value="Hometown Quotes">Hometown Quotes</option>
                    <option value="SmartFinancial">SmartFinancial</option>
                    <option value="InsuranceLeads.com">InsuranceLeads.com</option>
                    <option value="NextGen Leads">NextGen Leads</option>
                    <option value="MediaAlpha">MediaAlpha</option>
                    <option value="Precise Leads">Precise Leads</option>
                    <option value="QuoteStorm">QuoteStorm</option>
                    <option value="Zillow">Zillow</option>
                    <option value="Realtor.com">Realtor.com</option>
                    <option value="Angi">Angi</option>
                    <option value="HomeAdvisor">HomeAdvisor</option>
                    <option value="Thumbtack">Thumbtack</option>
                    <option value="Yelp">Yelp</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Note (optional)</label>
                <input type="text" value={newLeadNote} onChange={(e) => setNewLeadNote(e.target.value)} placeholder="e.g. Asked about pricing" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Policy Type (optional)</label>
                <select value={newLeadPolicyType} onChange={(e) => { setNewLeadPolicyType(e.target.value); if (e.target.value !== 'other') setNewLeadCustomType(''); }} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                  <option value="">Select policy type...</option>
                  {policyTypes.map((pt) => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                  <option value="other">Other (type manually)</option>
                </select>
                {newLeadPolicyType === 'other' && (
                  <input
                    type="text"
                    value={newLeadCustomType}
                    onChange={(e) => setNewLeadCustomType(e.target.value)}
                    placeholder="Enter policy/product type..."
                    className="w-full mt-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Assigned To (optional)</label>
                <select value={newLeadAssignee} onChange={(e) => setNewLeadAssignee(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                  <option value="">Me ({user?.email?.split('@')[0] || 'current user'})</option>
                  {isInTeam && teamMembers.filter((m) => m.email !== user?.email).map((m) => (
                    <option key={m.userId} value={m.email}>{m.email.split('@')[0]}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={async () => {
                  if (!newLeadName.trim()) return;
                  try {
                    const client = await buildClient();
                    await client.request('POST', '/opportunities', {
                      keywordId: 'manual-entry',
                      sourceContent: newLeadNote || `Lead from ${newLeadSource}${newLeadGroup ? ': ' + newLeadGroup : ''}`,
                      sourcePlatform: newLeadSource.includes('facebook') ? 'facebook' : newLeadSource.includes('instagram') ? 'instagram' : newLeadSource.includes('linkedin') ? 'linkedin' : 'other',
                      sourceUrl: '',
                      sourceAuthor: newLeadName.trim(),
                      leadSource: newLeadSource,
                      leadSourceGroup: newLeadGroup || undefined,
                      policyType: newLeadPolicyType === 'other' ? (newLeadCustomType.trim() || undefined) : (newLeadPolicyType || undefined),
                      assignedTo: newLeadAssignee || undefined,
                    });
                    showToast('🎯 Lead added!');
                    setShowAddLead(false);
                    setNewLeadName('');
                    setNewLeadNote('');
                    setNewLeadGroup('');
                    setNewLeadPolicyType('');
                    setNewLeadCustomType('');
                    setNewLeadAssignee('');
                    fetchData();
                  } catch {
                    showToast('❌ Failed to add lead');
                  }
                }}
                disabled={!newLeadName.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Add Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-white/20 p-4 bg-slate-800/90 text-center">
          <div className="text-lg font-bold text-white">{stats.total}</div>
          <div className="text-xs text-slate-400">Total</div>
        </div>
        <div className="rounded-xl border border-blue-500/30 p-4 bg-slate-800/90 text-center">
          <div className="text-lg font-bold text-blue-400">{stats.new}</div>
          <div className="text-xs text-slate-400">New</div>
        </div>
        <div className="rounded-xl border border-yellow-500/30 p-4 bg-slate-800/90 text-center">
          <div className="text-lg font-bold text-yellow-400">{stats.followedUp}</div>
          <div className="text-xs text-slate-400">Followed Up</div>
        </div>
        <div className="rounded-xl border border-green-500/30 p-4 bg-slate-800/90 text-center">
          <div className="text-lg font-bold text-green-400">{stats.converted}</div>
          <div className="text-xs text-slate-400">Converted</div>
        </div>
      </div>

      {/* Team / Personal Toggle */}
      {isInTeam && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowTeamLeads(false)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!showTeamLeads ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}
          >
            My Leads
          </button>
          <button
            onClick={() => setShowTeamLeads(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${showTeamLeads ? 'bg-purple-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}
          >
            👥 Team Pool
          </button>
        </div>
      )}

      {/* Team Leads View */}
      {showTeamLeads && isInTeam ? (
        <div className="space-y-3">
          {/* Team member filter */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setTeamLeadFilter('all')} className={`px-2.5 py-1 rounded-lg text-xs ${teamLeadFilter === 'all' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 bg-white/5'}`}>All</button>
            {teamMembers.map((m, i) => (
              <button key={m.userId} onClick={() => setTeamLeadFilter(m.email)} className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 ${teamLeadFilter === m.email ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 bg-white/5'}`}>
                <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
                {m.email.split('@')[0]}
              </button>
            ))}
          </div>
          {/* Team leads list */}
          {teamLeads.length === 0 ? (
            <div className="glass-card text-center py-8">
              <p className="text-2xl mb-2">👥</p>
              <p className="text-sm text-slate-400">No team leads yet</p>
            </div>
          ) : (
            <>
              {teamLeads.filter((l) => teamLeadFilter === 'all' || l.addedByEmail === teamLeadFilter).map((lead) => {
                const colorIdx = getMemberColorIndex(lead.addedByEmail);
                return (
                  <div key={lead.id} className="glass-card flex items-center gap-3">
                    <div className={`w-1.5 h-10 rounded-full ${MEMBER_COLORS[colorIdx]} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{lead.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{lead.sourcePlatform}</span>
                        <span className={`text-xs ${MEMBER_TEXT_COLORS[colorIdx]}`}>{lead.addedBy}</span>
                        {lead.policyType && <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{lead.policyType}</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${lead.status === 'new' ? 'bg-blue-900/40 text-blue-400' : lead.status === 'followed_up' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-green-900/40 text-green-400'}`}>{lead.status.replace('_', ' ')}</span>
                  </div>
                );
              })}
              {leadsNextCursor && (
                <button onClick={() => fetchLeads(leadsNextCursor)} className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 bg-white/5 rounded-lg">Load More</button>
              )}
            </>
          )}
        </div>
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 min-h-[44px] rounded-full text-sm transition-all duration-200 ${
              filter === f.value
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Group By */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Group by:</span>
        {([['none', 'None'], ['platform', 'Platform'], ['keyword', 'Keyword']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setGroupBy(val)}
            className={`px-3 py-1 rounded-full text-xs ${groupBy === val ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Leads List */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading leads...</p>
      ) : leads.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-2xl mb-2">🦅</p>
          <p className="text-slate-300 font-medium">No lead cues yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Install the browser extension and configure keywords to start detecting leads!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupBy !== 'none' ? (
            // Grouped view
            (() => {
              const groups: Record<string, Opportunity[]> = {};
              for (const lead of leads) {
                const key = groupBy === 'platform'
                  ? (lead.sourcePlatform || 'unknown')
                  : ((lead as any).keywordText || (lead as any).keywordId || 'Unknown keyword');
                if (!groups[key]) groups[key] = [];
                groups[key].push(lead);
              }
              return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([groupName, groupLeads]) => (
                <details key={groupName} className="glass-card" open>
                  <summary className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-white">
                      {groupBy === 'platform' && <span className="mr-1">{platformIcons[groupName] || '📱'}</span>}
                      {groupBy === 'platform' ? groupName.charAt(0).toUpperCase() + groupName.slice(1) : groupName}
                    </span>
                    <span className="text-xs text-slate-500">{groupLeads.length} leads</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {groupLeads.map((lead) => renderLeadCard(lead))}
                  </div>
                </details>
              ));
            })()
          ) : (
            // Flat view
            leads.map((lead) => renderLeadCard(lead))
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
