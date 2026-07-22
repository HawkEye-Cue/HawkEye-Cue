import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTrade } from '../contexts/TradeContext';
import { useCalendar } from '../contexts/CalendarContext';
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

// Default lead follow-up protocol
const DEFAULT_LEAD_PROTOCOL = [
  { day: 0, type: 'call', task: 'Call the lead — introduce yourself, ask about their needs' },
  { day: 1, type: 'sms', task: 'Send follow-up text if no answer yesterday' },
  { day: 3, type: 'call', task: 'Call #2 — try a different time of day' },
  { day: 5, type: 'email', task: 'Send a value email or quote if you have their info' },
  { day: 7, type: 'call', task: 'Call #3 — one week check-in' },
  { day: 14, type: 'sms', task: 'Two-week follow-up text: still here if you need help' },
];

export default function OpportunitiesPage() {
  const { getToken, user } = useAuth();
  const { showToast } = useToast();
  const { selectedTrade } = useTrade();
  const { events, addEvent } = useCalendar();
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
  const [newLeadBucket, setNewLeadBucket] = useState('');
  const [userGroups, setUserGroups] = useState<string[]>([]);
  const [showTeamLeads, setShowTeamLeads] = useState(false);
  const [teamLeadFilter, setTeamLeadFilter] = useState('all');
  const [showProtocolEditor, setShowProtocolEditor] = useState(false);
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [showBucketManager, setShowBucketManager] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');

  // Buckets (persisted in localStorage)
  const bucketsKey = `hawkeye_lead_buckets_${user?.sub || 'default'}`;
  const [buckets, setBuckets] = useState<string[]>(() => {
    const saved = localStorage.getItem(bucketsKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return ['Cross Sell', 'Internet Lead', 'Social Media', 'Referral', 'Walk-In'];
  });

  function saveBuckets(b: string[]) {
    setBuckets(b);
    localStorage.setItem(bucketsKey, JSON.stringify(b));
  }

  // Lead follow-up protocol (customizable, persisted on server)
  const protocolKey = `hawkeye_lead_protocol_${user?.sub || 'default'}`;
  const [leadProtocol, setLeadProtocol] = useState<{ day: number; type: string; task: string }[]>(() => {
    const saved = localStorage.getItem(protocolKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return DEFAULT_LEAD_PROTOCOL;
  });
  const [leadFollowups, setLeadFollowups] = useState<Record<string, { steps: any[] }>>({});
  const hasSetProtocol = localStorage.getItem(`hawkeye_protocol_set_${user?.sub}`) === 'true';

  // Load protocol template from server
  useEffect(() => {
    async function loadTemplate() {
      try {
        const client = await buildClient();
        const result = await client.request<{ steps: any[] }>('GET', '/opportunities/protocol-template');
        if (result.steps && result.steps.length > 0) {
          setLeadProtocol(result.steps);
          localStorage.setItem(protocolKey, JSON.stringify(result.steps));
        }
      } catch { /* use local fallback */ }
    }
    loadTemplate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load follow-ups for all visible leads
  useEffect(() => {
    async function loadFollowups() {
      if (leads.length === 0) return;
      try {
        const client = await buildClient();
        const results: Record<string, { steps: any[] }> = {};
        for (const lead of leads.slice(0, 20)) {
          try {
            const r = await client.request<{ steps: any[] }>('GET', `/opportunities/${lead.id}/followups`);
            if (r.steps && r.steps.length > 0) results[lead.id] = { steps: r.steps };
          } catch { /* ignore individual failures */ }
        }
        setLeadFollowups(results);
      } catch { /* ignore */ }
    }
    loadFollowups();
  }, [leads.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const followup = leadFollowups[lead.id];
    const steps = followup?.steps || [];
    const completedSteps = steps.filter((s: any) => s.completed).length;
    const totalSteps = steps.length;
    const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const nextStep = steps.find((s: any) => !s.completed);

    return (
      <div key={lead.id} className="rounded-xl border border-white/20 p-4 bg-slate-800 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{platformIcons[lead.sourcePlatform] || '📱'}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{lead.sourceAuthor}</p>
                {(lead as any).policyType && (
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">{(lead as any).policyType}</span>
                )}
              </div>
              <p className="text-xs text-slate-500">{(lead as any).keywordText || (lead as any).keywordId || 'Keyword match'} • {lead.sourcePlatform || ''} • {new Date(lead.detectedAt || (lead as any).createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[lead.status]}`}>
              {lead.status === 'followed_up' ? 'Followed Up' : lead.status === 'converted' ? 'Converted' : 'New'}
            </span>
            <button onClick={() => handleDelete(lead.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
          </div>
        </div>

        {/* Protocol Progress Bar */}
        {totalSteps > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">{completedSteps}/{totalSteps} steps</span>
              <span className="text-[10px] text-slate-400">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextStep && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs">{nextStep.type === 'call' ? '📞' : nextStep.type === 'sms' ? '💬' : '✉️'}</span>
                <span className="text-xs text-blue-300">Next: {nextStep.task}</span>
                <span className="text-[10px] text-slate-500">Day {nextStep.day}</span>
                <button
                  onClick={async () => {
                    try {
                      const client = await buildClient();
                      const result = await client.request<{ steps: any[] }>('PUT', `/opportunities/${lead.id}/followups/${nextStep.idx}`, { completed: true });
                      setLeadFollowups((prev) => ({ ...prev, [lead.id]: { steps: result.steps } }));
                      showToast('✓ Step completed');
                    } catch { showToast('❌ Failed'); }
                  }}
                  className="ml-auto text-[10px] text-green-400 hover:text-green-300 bg-green-600/20 px-1.5 py-0.5 rounded font-medium"
                >
                  Done ✓
                </button>
              </div>
            )}
          </div>
        )}

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
        {/* Worked By */}
        {(lead as any).assignedTo && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Worked by:</span>
            <span className="text-xs text-blue-400 font-medium">{(lead as any).assignedTo.split('@')[0]}</span>
          </div>
        )}
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
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* Left column */}
      <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Lead Cues</h2>
        <button onClick={() => { setShowAddLead(true); setNewLeadAssignee(user?.email || ''); }} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 active:scale-95">
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
                <label className="block text-xs text-slate-400 mb-1">Bucket / Category</label>
                <select value={newLeadBucket} onChange={(e) => setNewLeadBucket(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                  <option value="">Select bucket...</option>
                  {buckets.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Expected Premium / Value ($)</label>
                <input type="number" id="newLeadPremium" placeholder="e.g. 1200" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Worked by</label>
                <select value={newLeadAssignee} onChange={(e) => setNewLeadAssignee(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                  <option value={user?.email || ''}>Me ({user?.email?.split('@')[0] || 'me'})</option>
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
                      assignedTo: newLeadAssignee || user?.email || undefined,
                      bucket: newLeadBucket || undefined,
                      expectedPremium: parseFloat((document.getElementById('newLeadPremium') as HTMLInputElement)?.value) || undefined,
                    });
                    showToast('🎯 Lead added!');
                    setShowAddLead(false);
                    setNewLeadName('');
                    setNewLeadNote('');
                    setNewLeadGroup('');
                    setNewLeadPolicyType('');
                    setNewLeadCustomType('');
                    setNewLeadAssignee('');
                    setNewLeadBucket('');
                    fetchData();

                    // Auto-schedule follow-up protocol on calendar (linked to lead)
                    if (leadProtocol.length > 0) {
                      const startDate = new Date();
                      for (const step of leadProtocol) {
                        const eventDate = new Date(startDate);
                        eventDate.setDate(eventDate.getDate() + step.day);
                        const dateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
                        const icon = step.type === 'call' ? '📞' : step.type === 'sms' ? '💬' : '✉️';
                        addEvent({
                          date: dateStr,
                          title: `${icon} ${newLeadName.trim()} — ${step.task.slice(0, 60)}`,
                          type: 'reminder',
                          link: `/opportunities`,
                        });
                      }
                    }

                    // Show protocol editor first time
                    if (!hasSetProtocol) {
                      setShowProtocolEditor(true);
                      localStorage.setItem(`hawkeye_protocol_set_${user?.sub}`, 'true');
                    }
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

      {/* Hawk Nests — Lead Buckets */}
      {!loading && leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">🪹 Lead Nests</h3>
            <button onClick={() => setShowBucketManager(!showBucketManager)} className="text-xs text-blue-400 hover:text-blue-300">{showBucketManager ? 'Done' : 'Edit Nests'}</button>
          </div>

          {/* Bucket manager */}
          {showBucketManager && (
            <div className="rounded-xl border border-white/20 p-3 bg-slate-800 space-y-2">
              <div className="flex gap-2">
                <input type="text" value={newBucketName} onChange={(e) => setNewBucketName(e.target.value)} placeholder="New bucket name..." className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500" />
                <button onClick={() => { if (newBucketName.trim() && !buckets.includes(newBucketName.trim())) { saveBuckets([...buckets, newBucketName.trim()]); setNewBucketName(''); } }} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {buckets.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded-full text-xs text-slate-300">
                    {b}
                    <button onClick={() => saveBuckets(buckets.filter((x) => x !== b))} className="text-red-400 hover:text-red-300">✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Nest grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setActiveBucket(null)}
              className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all ${!activeBucket ? 'border-amber-500 bg-amber-500/15 scale-[1.03] shadow-lg shadow-amber-500/20' : 'border-white/20 bg-slate-800 hover:border-amber-500/40'}`}
            >
              <span className="text-3xl mb-1">🪹</span>
              <span className="text-2xl absolute top-2 right-2">🦅</span>
              <span className="text-2xl font-bold text-white">{leads.length}</span>
              <span className="text-xs text-slate-300 mt-1 font-medium">All Leads</span>
            </button>
            {buckets.map((bucket) => {
              const count = leads.filter((l) => {
                const lb = ((l as any).bucket || '').toLowerCase();
                const ls = ((l as any).leadSource || '').replace(/-/g, ' ').toLowerCase();
                const bLower = bucket.toLowerCase();
                return lb === bLower || ls === bLower || ((l as any).leadSource || '').toLowerCase() === bLower.replace(/ /g, '-');
              }).length;
              const isActive = activeBucket === bucket;
              return (
                <button
                  key={bucket}
                  onClick={() => setActiveBucket(isActive ? null : bucket)}
                  className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all ${isActive ? 'border-amber-500 bg-amber-500/15 scale-[1.03] shadow-lg shadow-amber-500/20' : 'border-white/20 bg-slate-800 hover:border-amber-500/40'}`}
                >
                  <span className="text-3xl mb-1">🪹</span>
                  <span className="text-2xl absolute top-2 right-2">🦅</span>
                  <div className="absolute top-2 right-2 w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                    <span className="text-xs font-bold text-black">{count}</span>
                  </div>
                  <span className="text-xs text-white mt-1 font-medium text-center leading-tight">{bucket}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Leads Table — scalable for hundreds */}
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
      ) : (() => {
        const filtered = leads
          .filter((lead) => {
            if (activeBucket) {
              const lb = ((lead as any).bucket || '').toLowerCase();
              const ls = ((lead as any).leadSource || '').toLowerCase();
              const bLower = activeBucket.toLowerCase();
              return lb === bLower || ls === bLower.replace(/ /g, '-');
            }
            return true;
          })
          .sort((a, b) => {
            if (a.status === 'new' && b.status !== 'new') return -1;
            if (b.status === 'new' && a.status !== 'new') return 1;
            return ((b as any).createdAt || '').localeCompare((a as any).createdAt || '');
          });

        const PAGE_SIZE = 25;
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const pageLeads = filtered.slice(0, PAGE_SIZE * Math.max(1, 1)); // We'll use "show more" instead of pages

        return (
          <div className="space-y-2">
            {/* Header bar */}
            <div className="flex items-center justify-between">
              {activeBucket && <p className="text-xs text-amber-400 font-medium">🪹 {activeBucket}</p>}
              <p className="text-xs text-slate-500 ml-auto">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wide font-semibold border-b border-white/20 bg-slate-700 rounded-t-lg">
              <span>Lead / Type</span>
              <span className="w-16 text-center">Status</span>
              <span className="w-20 text-center">Producer</span>
              <span className="w-16 text-center">Premium</span>
              <span className="w-10 text-center">Priority</span>
            </div>

            {/* Compact lead rows */}
            <div className="space-y-0.5 max-h-[600px] overflow-y-auto">
              {filtered.map((lead) => {
                const followup = leadFollowups[lead.id];
                const steps = followup?.steps || [];
                const completedSteps = steps.filter((s: any) => s.completed).length;
                const totalSteps = steps.length;
                const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
                const leadColor = localStorage.getItem(`hawkeye_lead_color_${lead.id}`) || '';
                const colorBorder = leadColor === 'yellow' ? 'border-l-4 border-l-yellow-400' : leadColor === 'green' ? 'border-l-4 border-l-green-400' : leadColor === 'red' ? 'border-l-4 border-l-red-400' : '';
                const colorBg = leadColor === 'yellow' ? 'bg-yellow-500/5' : leadColor === 'green' ? 'bg-green-500/5' : leadColor === 'red' ? 'bg-red-500/5' : '';

                return (
                  <details key={lead.id} className={`group rounded-lg border border-white/25 bg-slate-700 overflow-hidden ${colorBorder} ${colorBg}`}>
                    <summary className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2.5 cursor-pointer hover:bg-white/10">
                      {/* Name + Policy Type + Progress */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">{platformIcons[lead.sourcePlatform] || '📱'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-white font-semibold truncate">{lead.sourceAuthor}</span>
                            {(lead as any).policyType && (
                              <span className="text-[10px] font-bold text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded-full border border-amber-400/40 shrink-0">{(lead as any).policyType}</span>
                            )}
                          </div>
                          {totalSteps > 0 && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="w-16 h-1 bg-slate-600 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-400 to-green-400 rounded-full" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[9px] text-slate-400">{completedSteps}/{totalSteps}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Status */}
                      <span className={`w-16 text-center text-[10px] px-1.5 py-0.5 rounded-full border ${statusColors[lead.status]}`}>
                        {lead.status === 'followed_up' ? 'Active' : lead.status === 'converted' ? 'Won' : 'New'}
                      </span>
                      {/* Producer */}
                      <span className="w-20 text-center text-[10px] text-blue-300 font-medium truncate">
                        {(lead as any).assignedTo ? (lead as any).assignedTo.split('@')[0] : '—'}
                      </span>
                      {/* Premium */}
                      <span className="w-16 text-center text-[10px] text-green-400 font-medium">
                        {(lead as any).expectedPremium ? `$${Number((lead as any).expectedPremium).toLocaleString()}` : '—'}
                      </span>
                      {/* Color / Priority */}
                      <div className="w-10 flex justify-center gap-0.5">
                        {['yellow', 'green', 'red'].map((c) => (
                          <button
                            key={c}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); const current = localStorage.getItem(`hawkeye_lead_color_${lead.id}`); const newColor = current === c ? '' : c; localStorage.setItem(`hawkeye_lead_color_${lead.id}`, newColor); setLeads([...leads]); }}
                            className={`w-2.5 h-2.5 rounded-full border ${c === 'yellow' ? 'bg-yellow-400 border-yellow-300' : c === 'green' ? 'bg-green-400 border-green-300' : 'bg-red-400 border-red-300'} ${leadColor === c ? 'ring-1 ring-white scale-125' : 'opacity-50 hover:opacity-100'}`}
                          />
                        ))}
                      </div>
                    </summary>

                    {/* Expanded content — full lead details + call notes */}
                    <div className="px-3 pb-3 pt-2 border-t border-white/10 space-y-3 bg-slate-700">
                      {/* Lead info row */}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                        <span>📅 {new Date(lead.detectedAt || (lead as any).createdAt).toLocaleDateString()}</span>
                        <span>📱 {lead.sourcePlatform}</span>
                        {(lead as any).leadSource && <span>📍 {(lead as any).leadSource}</span>}
                        {(lead as any).assignedTo && <span>👤 {(lead as any).assignedTo.split('@')[0]}</span>}
                      </div>

                      {lead.sourceContent && (
                        <p className="text-xs text-slate-300 italic bg-white/5 p-2 rounded-lg border border-white/10">&quot;{lead.sourceContent.slice(0, 200)}&quot;</p>
                      )}

                      {/* Next Flight Projection step */}
                      {(() => {
                        const nextStep = steps.find((s: any) => !s.completed);
                        if (!nextStep) return null;
                        return (
                          <div className="flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 rounded-lg px-3 py-2">
                            <span className="text-sm">{nextStep.type === 'call' ? '📞' : nextStep.type === 'sms' ? '💬' : '✉️'}</span>
                            <span className="text-xs text-blue-200 flex-1 font-medium">Next: {nextStep.task}</span>
                            <button
                              onClick={async (e) => { e.stopPropagation(); try { const client = await buildClient(); const result = await client.request<{ steps: any[] }>('PUT', `/opportunities/${lead.id}/followups/${nextStep.idx}`, { completed: true }); setLeadFollowups((prev) => ({ ...prev, [lead.id]: { steps: result.steps } })); showToast('✓ Done'); } catch { showToast('❌ Failed'); } }}
                              className="text-xs text-green-400 bg-green-600/20 px-2.5 py-1 rounded font-medium"
                            >Done ✓</button>
                          </div>
                        );
                      })()}

                      {/* Call Notes — timestamped log */}
                      <div>
                        <p className="text-xs text-white font-semibold mb-2">📝 Activity Log</p>
                        {/* Previous notes */}
                        {(() => {
                          const notesRaw = localStorage.getItem(`hawkeye_lead_notes_${lead.id}`);
                          const notes: { text: string; date: string }[] = notesRaw ? (() => { try { return JSON.parse(notesRaw); } catch { return []; } })() : [];
                          return notes.length > 0 ? (
                            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
                              {notes.map((note, idx) => (
                                <div key={idx} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2">
                                  <p className="text-[10px] text-slate-500 mb-0.5">{note.date}</p>
                                  <p className="text-xs text-slate-200">{note.text}</p>
                                </div>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        {/* New note input */}
                        <div className="flex gap-2">
                          <textarea
                            id={`note-input-${lead.id}`}
                            placeholder="Add a note..."
                            className="flex-1 px-3 py-2 bg-slate-800 border border-white/20 rounded-lg text-white text-xs placeholder-slate-500 resize-none h-16 focus:border-blue-500/50 focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`note-input-${lead.id}`) as HTMLTextAreaElement;
                              if (!input || !input.value.trim()) return;
                              const notesRaw = localStorage.getItem(`hawkeye_lead_notes_${lead.id}`);
                              const notes: { text: string; date: string }[] = notesRaw ? (() => { try { return JSON.parse(notesRaw); } catch { return []; } })() : [];
                              const now = new Date();
                              const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                              notes.unshift({ text: input.value.trim(), date: dateStr });
                              localStorage.setItem(`hawkeye_lead_notes_${lead.id}`, JSON.stringify(notes));
                              input.value = '';
                              setLeads([...leads]); // force re-render
                              showToast('✓ Note saved');
                            }}
                            className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        {lead.status === 'new' && (
                          <button onClick={() => handleUpdateStatus(lead.id, 'followed_up')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-600/30 disabled:opacity-50">📞 Followed Up</button>
                        )}
                        {(lead.status === 'new' || lead.status === 'followed_up') && (
                          <button onClick={() => handleUpdateStatus(lead.id, 'converted')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs font-medium hover:bg-green-600/30 disabled:opacity-50">✓ Converted</button>
                        )}
                        {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-400 rounded-lg text-xs">View ↗</a>}
                        <button onClick={() => handleDelete(lead.id)} className="ml-auto px-3 py-1.5 text-red-400 text-xs hover:text-red-300 hover:bg-red-500/10 rounded-lg">Delete</button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            {/* Load more indicator */}
            {filtered.length > 25 && (
              <p className="text-xs text-slate-500 text-center py-2">Scroll to see all {filtered.length} leads</p>
            )}
          </div>
        );
      })()}

      {/* Lead Flight Projection — Visual Timeline */}
      </div>{/* end left column */}

      {/* Right column */}
      <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-white/20 p-4 bg-slate-800 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-white">🦅 Flight Projection</h3>
          <button onClick={() => setShowProtocolEditor(!showProtocolEditor)} className="text-xs text-blue-400 hover:text-blue-300">
            {showProtocolEditor ? 'Close' : 'Edit'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Your automated follow-up sequence. When you add a lead, these steps schedule as reminders on your calendar so every lead gets consistent outreach.</p>

        {/* Visual timeline */}
        {!showProtocolEditor && (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-gradient-to-b from-blue-500 via-amber-500 to-green-500 rounded-full" />
            <div className="space-y-3 pl-10">
              {leadProtocol.map((step, i) => {
                const colors = step.type === 'call' ? 'bg-blue-500 border-blue-400' : step.type === 'sms' ? 'bg-amber-500 border-amber-400' : 'bg-green-500 border-green-400';
                const icon = step.type === 'call' ? '📞' : step.type === 'sms' ? '💬' : '✉️';
                return (
                  <div key={i} className="relative">
                    {/* Node */}
                    <div className={`absolute -left-[26px] top-1 w-4 h-4 rounded-full ${colors} border-2 flex items-center justify-center`}>
                      <span className="text-[8px]">{icon}</span>
                    </div>
                    {/* Content */}
                    <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white bg-slate-600 px-1.5 py-0.5 rounded">Day {step.day}</span>
                        <span className="text-xs text-slate-300">{step.task}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {leadProtocol.length === 0 && <p className="text-xs text-slate-500 pl-10">No protocol set. Click Edit to create one.</p>}
          </div>
        )}

        {/* Protocol Editor */}
        {showProtocolEditor && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Customize your follow-up steps. These will auto-schedule on your calendar when you add a new lead.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {leadProtocol.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="number" min="0" max="90" value={step.day} onChange={(e) => { const p = [...leadProtocol]; p[i] = { ...p[i], day: parseInt(e.target.value) || 0 }; setLeadProtocol(p); }} className="w-14 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white text-center" />
                  <select value={step.type} onChange={(e) => { const p = [...leadProtocol]; p[i] = { ...p[i], type: e.target.value }; setLeadProtocol(p); }} className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white">
                    <option value="call">📞 Call</option>
                    <option value="sms">💬 Text</option>
                    <option value="email">✉️ Email</option>
                  </select>
                  <input type="text" value={step.task} onChange={(e) => { const p = [...leadProtocol]; p[i] = { ...p[i], task: e.target.value }; setLeadProtocol(p); }} className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-slate-500" placeholder="Describe the step..." />
                  <button onClick={() => { const p = [...leadProtocol]; p.splice(i, 1); setLeadProtocol(p); }} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLeadProtocol([...leadProtocol, { day: (leadProtocol[leadProtocol.length - 1]?.day || 0) + 3, type: 'call', task: '' }])} className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded text-xs hover:bg-blue-600/30">+ Add Step</button>
              <button onClick={async () => { 
                localStorage.setItem(protocolKey, JSON.stringify(leadProtocol)); 
                localStorage.setItem(`hawkeye_protocol_set_${user?.sub}`, 'true'); 
                try {
                  const client = await buildClient();
                  await client.request('PUT', '/opportunities/protocol-template', { steps: leadProtocol });
                } catch { /* fallback to localStorage only */ }
                setShowProtocolEditor(false); 
                showToast('✓ Protocol saved'); 
              }} className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded text-xs hover:bg-green-600/30">Save Protocol</button>
              <button onClick={() => { setLeadProtocol(DEFAULT_LEAD_PROTOCOL); }} className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-400 rounded text-xs hover:text-white">Reset Default</button>
            </div>
          </div>
        )}

        {/* 7-Day Follow-Up Calendar View */}
        {(() => {
          const now = new Date();
          const next7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() + i);
            return {
              date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
              dayNum: d.getDate(),
              isToday: i === 0,
            };
          });
          const followUpEvents = events.filter((e) => (e.type === 'reminder' || e.type === 'task') && next7.some((d) => d.date === e.date) && (e.title.includes('📞') || e.title.includes('💬') || e.title.includes('✉️')));

          return (
            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-xs text-slate-400 font-semibold mb-2">📅 Next 7 Days — Follow-Ups</p>
              <div className="grid grid-cols-7 gap-1">
                {next7.map((day) => {
                  const dayEvents = followUpEvents.filter((e) => e.date === day.date);
                  return (
                    <div key={day.date} className={`flex flex-col items-center p-2 rounded-lg border ${day.isToday ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/5'}`}>
                      <span className={`text-[10px] font-medium ${day.isToday ? 'text-blue-400' : 'text-slate-500'}`}>{day.dayName}</span>
                      <span className={`text-sm font-bold ${day.isToday ? 'text-white' : 'text-slate-300'}`}>{day.dayNum}</span>
                      {dayEvents.length > 0 ? (
                        <div className="mt-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-black">{dayEvents.length}</span>
                        </div>
                      ) : (
                        <div className="mt-1 w-6 h-6 rounded-full border border-slate-600 flex items-center justify-center">
                          <span className="text-[10px] text-slate-600">0</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Protocol Setup Prompt (first time) */}
      {showProtocolEditor && !hasSetProtocol && (
        <div className="rounded-xl border-2 border-purple-500/40 p-4 bg-purple-500/10">
          <p className="text-sm font-bold text-purple-300 mb-1">🎯 Set Up Your Lead Protocol</p>
          <p className="text-xs text-slate-300">This is your follow-up sequence. Every time you add a lead, these steps will auto-schedule on your calendar so you never miss a touch.</p>
        </div>
      )}
      </div>{/* end right column */}
    </div>
  );
}
