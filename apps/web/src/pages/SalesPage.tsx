import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

interface Deal {
  id: string;
  name: string;
  value: number;
  stage: string;
  policyType: string;
  folio: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  trade: string;
  leadSource: string;
  leadSourceNote: string;
  soldBy?: string;
  bundleItems?: { type: string; value: number }[];
  createdAt: string;
}

const LEAD_SOURCES = [
  { id: 'internet-lead', label: 'Internet Lead', icon: '🌐' },
  { id: 'facebook-post', label: 'Facebook Post', icon: '📱' },
  { id: 'instagram-post', label: 'Instagram Post', icon: '📸' },
  { id: 'linkedin-post', label: 'LinkedIn Post', icon: '💼' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'nextdoor', label: 'Nextdoor', icon: '🏘️' },
  { id: 'cold-call', label: 'Cold Call', icon: '📞' },
  { id: 'warm-call', label: 'Warm Call', icon: '🤙' },
  { id: 'referral', label: 'Referral', icon: '🤝' },
  { id: 'walk-in', label: 'Walk-In', icon: '🚶' },
  { id: 'website', label: 'Website Inquiry', icon: '🌐' },
  { id: 'email-campaign', label: 'Email Campaign', icon: '✉️' },
  { id: 'direct-mail', label: 'Direct Mail', icon: '📬' },
  { id: 'door-knock', label: 'Door Knock', icon: '🚪' },
  { id: 'networking-event', label: 'Networking Event', icon: '🎤' },
  { id: 'google-ad', label: 'Google Ad', icon: '🔍' },
  { id: 'facebook-ad', label: 'Facebook Ad', icon: '📣' },
  { id: 'yard-sign', label: 'Yard Sign', icon: '🪧' },
  { id: 'repeat-client', label: 'Repeat Client', icon: '🔄' },
  { id: 'hawkeye-lead', label: 'HawkEye-Cue Lead', icon: '🦅' },
  { id: 'other', label: 'Other', icon: '📌' },
];

// Internet Lead follow-up sequence — aggressive front-loaded 21-day framework
// Based on industry data: 8-10 touches needed, leads go cold within minutes
const INTERNET_LEAD_SEQUENCE = [
  { day: 0, time: '0 min', type: 'sms', task: "Send intro SMS: Hi [Name], this is [You] with [Agency]. I just received your request — I'd love to help. When's a good time to chat?" },
  { day: 0, time: '5 min', type: 'call', task: 'Call #1 — introduce yourself, ask about their needs, set appointment if possible' },
  { day: 0, time: '30 min', type: 'email', task: 'Send welcome email with your info, what to expect, and a link to schedule a call' },
  { day: 1, time: 'Morning', type: 'call', task: 'Call #2 — follow up if no answer yesterday. Leave voicemail referencing your SMS' },
  { day: 1, time: 'Afternoon', type: 'sms', task: "Text: Just left you a voicemail — wanted to make sure you saw my message. Happy to help whenever you're ready!" },
  { day: 2, time: 'Morning', type: 'email', task: "Send value email — 3 things most people don't know about [policy type] or a helpful tip" },
  { day: 3, time: 'Morning', type: 'call', task: 'Call #3 — try a different time of day than previous attempts' },
  { day: 4, time: 'Morning', type: 'sms', task: 'Text: Hi [Name], just checking in. Still happy to help you find the best rate. No pressure!' },
  { day: 5, time: 'Morning', type: 'email', task: 'Send comparison/quote preview email if you have enough info, or ask for details needed' },
  { day: 7, time: 'Morning', type: 'call', task: 'Call #4 — one-week mark. Hey, just wanted to circle back...' },
  { day: 7, time: 'Afternoon', type: 'sms', task: "Text: I know life gets busy. I'm here whenever you're ready to chat about your options." },
  { day: 10, time: 'Morning', type: 'email', task: 'Send "Did you find what you needed?" email — soft re-engagement' },
  { day: 14, time: 'Morning', type: 'call', task: 'Call #5 — two-week check-in. Last strong push before spacing out' },
  { day: 14, time: 'Afternoon', type: 'sms', task: "Text: Hi [Name], I haven't forgotten about you. Let me know if I can still help!" },
  { day: 21, time: 'Morning', type: 'email', task: "Final follow-up email: I don't want to bother you — if you've found coverage elsewhere, no worries! If not, I'm a text away." },
];

const STAGES = [
  { id: 'prospect', label: 'Prospect', color: 'bg-slate-500/20 border-slate-500/30 text-slate-300' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 border-blue-500/30 text-blue-300' },
  { id: 'quoted', label: 'Quoted', color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300' },
  { id: 'closing', label: 'Closing', color: 'bg-purple-500/20 border-purple-500/30 text-purple-300' },
  { id: 'won', label: 'Won', color: 'bg-green-500/20 border-green-500/30 text-green-300' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500/20 border-red-500/30 text-red-300' },
];

// Trade-specific deal type configurations
interface TradeConfig {
  dealTypes: string[];
  dealTypeLabel: string;  // e.g. "Policy Type", "Property Type", "Service Type"
  valueLabel: string;     // e.g. "Premium", "Sale Price", "Job Value"
}

const TRADE_CONFIGS: Record<string, TradeConfig> = {
  'insurance-agent': {
    dealTypes: ['Home', 'Auto', 'Life', 'Commercial', 'Motorcycle', 'Trailer', 'Boat', 'Umbrella', 'Renters', 'Condo', 'Flood', 'Bundle', 'Other'],
    dealTypeLabel: 'Policy Type',
    valueLabel: 'Premium',
  },
  'health-insurance-agent': {
    dealTypes: ['Individual', 'Family', 'Medicare', 'Medicaid', 'Group/Employer', 'Dental', 'Vision', 'Supplemental', 'Short-Term', 'Other'],
    dealTypeLabel: 'Plan Type',
    valueLabel: 'Premium',
  },
  'insurance-producer': {
    dealTypes: ['Home', 'Auto', 'Life', 'Commercial', 'Motorcycle', 'Trailer', 'Boat', 'Umbrella', 'Renters', 'Condo', 'Flood', 'Bundle', 'Other'],
    dealTypeLabel: 'Policy Type',
    valueLabel: 'Premium',
  },
  'real-estate-agent': {
    dealTypes: ['Single Family', 'Condo/Townhome', 'Multi-Family', 'Luxury', 'Land/Lot', 'Commercial', 'Investment Property', 'New Construction', 'Foreclosure', 'Other'],
    dealTypeLabel: 'Property Type',
    valueLabel: 'Sale Price',
  },
  'mortgage-lender': {
    dealTypes: ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Refinance', 'HELOC', 'Reverse Mortgage', 'Construction', 'Other'],
    dealTypeLabel: 'Loan Type',
    valueLabel: 'Loan Amount',
  },
  'roofing': {
    dealTypes: ['Shingle Replacement', 'Metal Roof', 'Flat Roof', 'Tile Roof', 'Roof Repair', 'Storm Damage', 'Inspection', 'Gutter Install', 'Skylight', 'Other'],
    dealTypeLabel: 'Job Type',
    valueLabel: 'Job Value',
  },
  'general-contractor': {
    dealTypes: ['Kitchen Remodel', 'Bathroom Remodel', 'Addition', 'Full Renovation', 'Basement Finish', 'Deck/Patio', 'Commercial Build-Out', 'New Construction', 'Repair', 'Other'],
    dealTypeLabel: 'Project Type',
    valueLabel: 'Project Value',
  },
  'hvac-technician': {
    dealTypes: ['AC Install', 'Furnace Install', 'AC Repair', 'Heating Repair', 'Maintenance Plan', 'Ductwork', 'Mini-Split', 'Thermostat', 'Air Quality', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'electrician': {
    dealTypes: ['Panel Upgrade', 'Rewiring', 'Outlet/Switch Install', 'Lighting', 'Generator Install', 'EV Charger', 'Inspection', 'Commercial', 'Emergency Repair', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'plumber': {
    dealTypes: ['Pipe Repair', 'Drain Cleaning', 'Water Heater', 'Sewer Line', 'Bathroom Remodel', 'Fixture Install', 'Gas Line', 'Emergency', 'Inspection', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'landscaper': {
    dealTypes: ['Design & Install', 'Lawn Maintenance', 'Tree Service', 'Irrigation', 'Hardscape', 'Seasonal Cleanup', 'Sod/Turf', 'Garden Bed', 'Lighting', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Contract Value',
  },
  'painter': {
    dealTypes: ['Interior Full', 'Exterior Full', 'Single Room', 'Cabinet Painting', 'Deck Stain', 'Commercial', 'Touch-Up', 'Wallpaper Removal', 'Pressure Wash & Paint', 'Other'],
    dealTypeLabel: 'Job Type',
    valueLabel: 'Job Value',
  },
  'auto-repair-shop': {
    dealTypes: ['Engine Repair', 'Brake Service', 'Transmission', 'AC/Heating', 'Electrical', 'Suspension', 'Oil/Maintenance', 'Diagnostic', 'Tire Service', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Invoice Total',
  },
  'auto-broker': {
    dealTypes: ['New Vehicle', 'Used Vehicle', 'Lease', 'Trade-In', 'Fleet Purchase', 'Luxury/Exotic', 'Commercial Vehicle', 'Financing', 'Other'],
    dealTypeLabel: 'Deal Type',
    valueLabel: 'Vehicle Price',
  },
  'junk-removal': {
    dealTypes: ['Residential Cleanout', 'Estate Cleanout', 'Construction Debris', 'Appliance Removal', 'Yard Waste', 'Commercial', 'Hoarding', 'Foreclosure', 'Other'],
    dealTypeLabel: 'Job Type',
    valueLabel: 'Job Value',
  },
  'pool-service': {
    dealTypes: ['Weekly Maintenance', 'Green Pool Cleanup', 'Equipment Repair', 'Pump/Filter Replace', 'Tile/Surface', 'Opening/Closing', 'Chemical Balance', 'Leak Repair', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'pool-builder': {
    dealTypes: ['Inground Pool', 'Above Ground Pool', 'Pool Renovation', 'Spa/Hot Tub', 'Pool Deck', 'Water Feature', 'Pool House', 'Fencing', 'Other'],
    dealTypeLabel: 'Project Type',
    valueLabel: 'Project Value',
  },
  'cosmetologist': {
    dealTypes: ['Color', 'Cut & Style', 'Balayage/Highlights', 'Extensions', 'Keratin Treatment', 'Bridal', 'Perm/Relaxer', 'Package Deal', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Service Value',
  },
  'esthetician': {
    dealTypes: ['Facial', 'Chemical Peel', 'Microneedling', 'Laser Treatment', 'Waxing Package', 'Acne Program', 'Anti-Aging Package', 'Body Treatment', 'Other'],
    dealTypeLabel: 'Treatment Type',
    valueLabel: 'Package Value',
  },
  'yoga-teacher': {
    dealTypes: ['Private Session', 'Group Class', 'Workshop', 'Retreat', 'Monthly Membership', 'Corporate', 'Teacher Training', 'Online Package', 'Other'],
    dealTypeLabel: 'Offering Type',
    valueLabel: 'Value',
  },
  'flooring-installer': {
    dealTypes: ['Hardwood', 'Laminate', 'Vinyl Plank', 'Tile', 'Carpet', 'Epoxy', 'Refinishing', 'Commercial', 'Stairs', 'Other'],
    dealTypeLabel: 'Flooring Type',
    valueLabel: 'Job Value',
  },
  'fence-company': {
    dealTypes: ['Wood Privacy', 'Chain Link', 'Vinyl', 'Aluminum', 'Iron', 'Farm/Ranch', 'Gate Install', 'Repair', 'Commercial', 'Other'],
    dealTypeLabel: 'Fence Type',
    valueLabel: 'Job Value',
  },
  'deck-patio-builder': {
    dealTypes: ['Composite Deck', 'Wood Deck', 'Paver Patio', 'Concrete Patio', 'Pergola', 'Screened Porch', 'Outdoor Kitchen', 'Repair/Resurface', 'Other'],
    dealTypeLabel: 'Project Type',
    valueLabel: 'Project Value',
  },
  'window-door-installer': {
    dealTypes: ['Window Replacement', 'Entry Door', 'Patio/Sliding Door', 'Storm Door', 'French Doors', 'Bay/Bow Window', 'Skylight', 'Commercial', 'Other'],
    dealTypeLabel: 'Product Type',
    valueLabel: 'Job Value',
  },
  'garage-door-company': {
    dealTypes: ['New Door Install', 'Opener Install', 'Spring Replacement', 'Panel Replacement', 'Full Replacement', 'Commercial Door', 'Maintenance', 'Emergency Repair', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'restoration': {
    dealTypes: ['Water Damage', 'Fire Damage', 'Mold Remediation', 'Storm Damage', 'Sewage Cleanup', 'Smoke Damage', 'Reconstruction', 'Contents Cleaning', 'Other'],
    dealTypeLabel: 'Damage Type',
    valueLabel: 'Job Value',
  },
  'pest-control': {
    dealTypes: ['General Pest', 'Termite Treatment', 'Rodent Control', 'Bed Bugs', 'Mosquito Service', 'Wildlife Removal', 'Commercial', 'Annual Plan', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Contract Value',
  },
  'pressure-washer': {
    dealTypes: ['House Wash', 'Driveway/Sidewalk', 'Deck/Fence', 'Roof Wash', 'Commercial', 'Fleet Wash', 'Gutter Brightening', 'Package Deal', 'Other'],
    dealTypeLabel: 'Job Type',
    valueLabel: 'Job Value',
  },
  'home-inspector': {
    dealTypes: ['Buyer Inspection', 'Pre-Listing', 'New Construction', 'Radon Test', 'Mold Inspection', 'Sewer Scope', 'Commercial', '4-Point', 'Wind Mitigation', 'Other'],
    dealTypeLabel: 'Inspection Type',
    valueLabel: 'Fee',
  },
  'handyman': {
    dealTypes: ['Repair', 'Assembly', 'Mounting/Install', 'Painting', 'Drywall', 'Plumbing Fix', 'Electrical Fix', 'Odd Jobs', 'Other'],
    dealTypeLabel: 'Job Type',
    valueLabel: 'Job Value',
  },
  'collision-center': {
    dealTypes: ['Collision Repair', 'Dent Repair', 'Paint Job', 'Frame Straightening', 'Bumper Repair', 'Glass Replacement', 'Insurance Claim', 'Custom Paint', 'Other'],
    dealTypeLabel: 'Repair Type',
    valueLabel: 'Estimate',
  },
  'tint-shop': {
    dealTypes: ['Automotive Tint', 'Residential Tint', 'Commercial Tint', 'Ceramic Package', 'PPF/Clear Bra', 'Windshield Tint', 'Strip & Re-Tint', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Job Value',
  },
  'wrap-shop': {
    dealTypes: ['Full Wrap', 'Partial Wrap', 'Color Change', 'Commercial Fleet', 'Chrome Delete', 'Accents/Graphics', 'Interior Wrap', 'PPF', 'Other'],
    dealTypeLabel: 'Wrap Type',
    valueLabel: 'Job Value',
  },
  'mobile-mechanic': {
    dealTypes: ['Brake Service', 'Battery/Starter', 'Oil Change', 'Diagnostic', 'AC Repair', 'Belt/Hose', 'Electrical', 'Fleet Service', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Invoice Total',
  },
  'tire-shop': {
    dealTypes: ['Full Set (4)', 'Pair (2)', 'Single Tire', 'Flat Repair', 'Alignment', 'Rotation/Balance', 'Custom Wheels', 'Commercial Tires', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Invoice Total',
  },
  'towing-company': {
    dealTypes: ['Local Tow', 'Long Distance', 'Flatbed', 'Motorcycle Tow', 'Jump Start', 'Lockout', 'Tire Change', 'Winch-Out', 'Other'],
    dealTypeLabel: 'Service Type',
    valueLabel: 'Fee',
  },
};

// Default fallback for any trade not explicitly mapped
const DEFAULT_TRADE_CONFIG: TradeConfig = {
  dealTypes: ['Service', 'Project', 'Maintenance', 'Consultation', 'Emergency', 'Contract', 'Custom', 'Other'],
  dealTypeLabel: 'Service Type',
  valueLabel: 'Value',
};

export default function SalesPage() {
  const { getToken, user } = useAuth();
  const { selectedTrade } = useTrade();
  const { addEvent, removeAllByTitle } = useCalendar();
  const { showToast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>('free');

  // Check subscription tier
  useEffect(() => {
    async function checkTier() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const sub = await client.request<{ tier: string }>('GET', '/subscription');
        setTier(sub.tier || 'free');
      } catch { /* default to free */ }
    }
    checkTier();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gate: Sales Tracker requires Soar or higher
  const hasAccess = ['soar', 'team', 'summit'].includes(tier);

  // Get trade-specific config
  const tradeConfig = useMemo(() => {
    if (!selectedTrade) return DEFAULT_TRADE_CONFIG;
    return TRADE_CONFIGS[selectedTrade.id] || DEFAULT_TRADE_CONFIG;
  }, [selectedTrade]);

  // Custom deal types: persisted per trade, starts with trade defaults
  const dealTypesKey = `hawkeye_deal_types_${selectedTrade?.id || 'default'}`;
  const [customDealTypes, setCustomDealTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem(dealTypesKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return tradeConfig.dealTypes;
  });
  const [editingDealTypes, setEditingDealTypes] = useState(false);
  const [newDealType, setNewDealType] = useState('');

  // Sync when trade changes
  useEffect(() => {
    const saved = localStorage.getItem(dealTypesKey);
    if (saved) { try { setCustomDealTypes(JSON.parse(saved)); return; } catch { /* ignore */ } }
    setCustomDealTypes(tradeConfig.dealTypes);
  }, [selectedTrade?.id, tradeConfig.dealTypes, dealTypesKey]);

  function saveDealTypes(types: string[]) {
    setCustomDealTypes(types);
    localStorage.setItem(dealTypesKey, JSON.stringify(types));
  }

  function addDealType() {
    const trimmed = newDealType.trim();
    if (!trimmed || customDealTypes.includes(trimmed)) return;
    saveDealTypes([...customDealTypes, trimmed]);
    setNewDealType('');
  }

  function removeDealType(type: string) {
    saveDealTypes(customDealTypes.filter((t) => t !== type));
  }

  function resetDealTypes() {
    saveDealTypes(tradeConfig.dealTypes);
  }

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
  const [leadSource, setLeadSource] = useState('');
  const [leadSourceNote, setLeadSourceNote] = useState('');
  const [soldBy, setSoldBy] = useState('');
  const [bundleItems, setBundleItems] = useState<{ type: string; value: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [folioFilter, setFolioFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [teamEmailsText, setTeamEmailsText] = useState('');
  const [unconvertedLeads, setUnconvertedLeads] = useState<{ id: string; authorName: string; platform: string; postContent: string; detectedAt: string }[]>([]);

  // Team members / salespeople for the "Sold By" dropdown
  const [salespeople, setSalespeople] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('hawkeye_salespeople') || '[]'); } catch { return []; }
  });
  const [newSalesperson, setNewSalesperson] = useState('');

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
        // Also fetch team emails from server
        try {
          const teResult = await client.request<{ emails: string[] }>('GET', '/sales/team-emails');
          const emails = teResult.emails || [];
          setTeamEmailsText(emails.join('\n'));
          localStorage.setItem('hawkeye_team_emails', emails.join('\n'));
        } catch {
          setTeamEmailsText(localStorage.getItem('hawkeye_team_emails') || '');
        }
        // Fetch folio config from server (cross-device sync)
        try {
          const folioResult = await client.request<{ folioStart?: string; folioEnd?: string }>('GET', '/sales/folio-config');
          if (folioResult.folioStart) { setDefaultFolioStart(folioResult.folioStart); localStorage.setItem('hawkeye_folio_start', folioResult.folioStart); }
          if (folioResult.folioEnd) { setDefaultFolioEnd(folioResult.folioEnd); localStorage.setItem('hawkeye_folio_end', folioResult.folioEnd); }
        } catch { /* use localStorage defaults */ }
        // Fetch unconverted leads for "Convert from Lead" feature
        try {
          const leadsResult = await client.request<any>('GET', '/opportunities?status=new');
          const items = leadsResult.items || leadsResult.opportunities || [];
          setUnconvertedLeads(items.slice(0, 10).map((l: any) => ({
            id: l.id, authorName: l.sourceAuthor || l.authorName || 'Unknown',
            platform: l.sourcePlatform || l.platform || 'facebook',
            postContent: (l.sourceContent || l.postContent || '').slice(0, 100),
            detectedAt: l.detectedAt || l.createdAt || '',
          })));
        } catch { /* ignore */ }
        // Fetch salespeople from server preferences
        try {
          const prefs = await client.request<any>('GET', '/profile/preferences');
          if (prefs.salespeople && prefs.salespeople.length > 0) {
            setSalespeople(prefs.salespeople);
            localStorage.setItem('hawkeye_salespeople', JSON.stringify(prefs.salespeople));
          }
        } catch { /* ignore */ }
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
        name: name.trim(), value: policyType === 'Bundle' ? bundleItems.reduce((s, i) => s + (parseFloat(i.value) || 0), 0) : (parseFloat(value) || 0), stage,
        policyType, folio: (defaultFolioStart && defaultFolioEnd) ? `${defaultFolioStart} to ${defaultFolioEnd}` : '', contactName: name.trim(), contactEmail, contactPhone, notes, leadSource, leadSourceNote, soldBy,
        bundleItems: policyType === 'Bundle' ? bundleItems.filter((i) => i.type && i.value) : undefined,
      });
      setDeals([result, ...deals]);
      localStorage.setItem(`hawkeye_first_deal_${user?.sub}`, 'true');

      // Auto-schedule internet lead follow-up sequence as calendar cues
      if (leadSource === 'internet-lead') {
        const startDate = new Date();
        for (const step of INTERNET_LEAD_SEQUENCE) {
          const eventDate = new Date(startDate);
          eventDate.setDate(eventDate.getDate() + step.day);
          const dateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
          const icon = step.type === 'call' ? '📞' : step.type === 'sms' ? '💬' : '✉️';
          addEvent({
            date: dateStr,
            title: `${icon} ${name.trim()} — ${step.task.slice(0, 60)}`,
            type: 'task',
          });
        }
      }

      resetForm();
      setShowAdd(false);
      showToast('✓ Deal saved');
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  async function handleUpdateStage(dealId: string, newStage: string) {
    try {
      const client = await buildClient();
      await client.request('PUT', `/sales/deals/${dealId}`, { stage: newStage });
      setDeals(deals.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));
      showToast('✓ Saved');

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
        // Get team emails from both localStorage and server
        let teamEmails: string[] = [];
        try {
          const teResult = await client.request<{ emails: string[] }>('GET', '/sales/team-emails');
          teamEmails = teResult.emails || [];
        } catch {
          // Fallback to localStorage
          teamEmails = (localStorage.getItem('hawkeye_team_emails') || '').split('\n').map((e: string) => e.trim()).filter(Boolean);
        }
        if (teamEmails.length > 0 && deal) {
          try {
            await client.request('POST', '/sales/notify', {
              emails: teamEmails,
              dealName: deal.name,
              dealValue: deal.value,
              policyType: deal.policyType,
              folio: deal.folio,
              soldBy: deal.soldBy || '',
            });
            showToast('🦅 Team notified!');
          } catch { /* non-fatal */ }
        }
      }
    } catch { /* ignore */ }
  }

  async function handleDelete(dealId: string) {
    try {
      const deal = deals.find((d) => d.id === dealId);
      const client = await buildClient();
      await client.request('DELETE', `/sales/deals/${dealId}`);
      setDeals(deals.filter((d) => d.id !== dealId));
      // Remove related calendar events
      if (deal) removeAllByTitle(deal.name);
    } catch { /* ignore */ }
  }

  function resetForm() {
    setName(''); setValue(''); setStage('prospect'); setPolicyType('');
    setContactName(''); setContactEmail(''); setContactPhone(''); setNotes('');
    setLeadSource(''); setLeadSourceNote(''); setSoldBy(''); setBundleItems([]);
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

  if (!hasAccess && !loading) {
    return (
      <div className="space-y-6 text-center py-12">
        <div className="text-5xl">🚀</div>
        <h2 className="text-2xl font-bold text-white">Sales Tracker</h2>
        <p className="text-slate-400 max-w-sm mx-auto">Track your entire pipeline, see where every sale comes from, manage folios, and get monthly recaps. Available on the Soar plan.</p>
        <a href="/settings" className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-black px-8 py-3 rounded-lg font-bold hover:opacity-90 transition-opacity">Upgrade to Soar</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Sales Tracker</h2>
          {selectedTrade && <p className="text-xs text-amber-400 mt-0.5">{selectedTrade.name}</p>}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-500"
        >
          {showAdd ? '−' : '+ Add Deal'}
        </button>
      </div>

      {/* Convert from Lead — shows recent leads that can be turned into deals */}
      {showAdd && unconvertedLeads.length > 0 && (
        <div className="glass-card border-blue-500/20">
          <p className="text-xs font-medium text-blue-300 mb-2">⚡ Quick convert — tap a lead to auto-fill:</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {unconvertedLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => {
                  setName(lead.authorName);
                  const platformSourceMap: Record<string, string> = { facebook: 'facebook-post', instagram: 'instagram-post', linkedin: 'linkedin-post', tiktok: 'tiktok' };
                  setLeadSource(platformSourceMap[lead.platform] || 'hawkeye-lead');
                  setLeadSourceNote(`From ${lead.platform} — "${lead.postContent.slice(0, 60)}"`);
                  // Mark lead as converted
                  buildClient().then((client) => client.request('PUT', `/opportunities/${lead.id}/status`, { status: 'converted' })).catch(() => {});
                  setUnconvertedLeads((prev) => prev.filter((l) => l.id !== lead.id));
                  showToast('✓ Lead info loaded — fill in the rest');
                }}
                className="w-full text-left p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{lead.platform === 'facebook' ? '📘' : lead.platform === 'instagram' ? '📷' : lead.platform === 'linkedin' ? '💼' : '🎵'}</span>
                  <span className="text-sm text-white font-medium">{lead.authorName}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{lead.detectedAt ? new Date(lead.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{lead.postContent}</p>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* Follow-Ups Due */}
      {(() => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const needsFollowUp = deals.filter((d) =>
          ['prospect', 'contacted', 'quoted'].includes(d.stage) &&
          d.createdAt < twoDaysAgo
        );
        if (needsFollowUp.length === 0) return null;
        return (
          <div className="glass-card border-amber-500/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-amber-300">📋 Follow-Ups Due ({needsFollowUp.length})</p>
              <a href="/" className="text-xs text-blue-400 hover:text-blue-300">View on Dashboard →</a>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {needsFollowUp.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-white/5 px-2 py-1.5 rounded">
                  <div className="min-w-0">
                    <p className="text-xs text-white truncate">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.policyType || 'No type'} · {d.stage}</p>
                  </div>
                  <span className="text-xs text-amber-400 shrink-0 ml-2">
                    {Math.floor((Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24))}d ago
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ⚡ Internet Leads Section */}
      {(() => {
        const internetLeads = deals.filter((d) => d.leadSource === 'internet-lead' && !['won', 'lost'].includes(d.stage));
        if (internetLeads.length === 0) return null;
        return (
          <div className="glass-card border-orange-500/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-orange-300">⚡ Internet Leads ({internetLeads.length})</p>
                <p className="text-xs text-slate-500">Aggressive 21-day sequence — speed to lead wins</p>
              </div>
            </div>
            <div className="space-y-2">
              {internetLeads.map((deal) => {
                const completedSteps = INTERNET_LEAD_SEQUENCE.filter((_, idx) => localStorage.getItem(`hawkeye_seq_${deal.id}_${idx}`) === 'true').length;
                const progress = Math.round((completedSteps / INTERNET_LEAD_SEQUENCE.length) * 100);
                const daysSinceCreated = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                const nextStep = INTERNET_LEAD_SEQUENCE.find((s, idx) => localStorage.getItem(`hawkeye_seq_${deal.id}_${idx}`) !== 'true' && s.day <= daysSinceCreated);
                return (
                  <div key={deal.id} className="bg-white/5 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-white">{deal.name}</p>
                        {deal.leadSourceNote && <p className="text-xs text-slate-500">via {deal.leadSourceNote}</p>}
                      </div>
                      <span className="text-xs text-slate-500">Day {daysSinceCreated}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mb-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{completedSteps}/{INTERNET_LEAD_SEQUENCE.length} touches done</span>
                      {nextStep && (
                        <span className="text-xs text-orange-400">
                          Next: {nextStep.type === 'call' ? '📞' : nextStep.type === 'sms' ? '💬' : '✉️'} {nextStep.task.slice(0, 30)}...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
              onChange={(e) => {
                setDefaultFolioStart(e.target.value);
                localStorage.setItem('hawkeye_folio_start', e.target.value);
                // Sync to server for folio recap notifications
                buildClient().then((client) => {
                  client.request('PUT', '/sales/folio-config', { folioStart: e.target.value, folioEnd: defaultFolioEnd });
                }).catch(() => {});
              }}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={defaultFolioEnd}
              onChange={(e) => {
                setDefaultFolioEnd(e.target.value);
                localStorage.setItem('hawkeye_folio_end', e.target.value);
                // Sync to server for folio recap notifications
                buildClient().then((client) => {
                  client.request('PUT', '/sales/folio-config', { folioStart: defaultFolioStart, folioEnd: e.target.value });
                }).catch(() => {});
              }}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
            />
          </div>
        )}
      </div>

      {/* Deal Types Settings */}
      <div className="glass-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">🏷️ {tradeConfig.dealTypeLabel}s</p>
            <p className="text-xs text-slate-400">{customDealTypes.length} types configured</p>
          </div>
          <button
            onClick={() => setEditingDealTypes(!editingDealTypes)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {editingDealTypes ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingDealTypes && (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newDealType}
                onChange={(e) => setNewDealType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDealType(); } }}
                placeholder={`Add new ${tradeConfig.dealTypeLabel.toLowerCase()}...`}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
              />
              <button
                onClick={addDealType}
                disabled={!newDealType.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {customDealTypes.map((type) => (
                <span key={type} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded-full text-xs text-slate-300">
                  {type}
                  <button onClick={() => removeDealType(type)} className="text-red-400 hover:text-red-300 ml-0.5">×</button>
                </span>
              ))}
            </div>
            <button
              onClick={resetDealTypes}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              ↺ Reset to {selectedTrade?.name || 'default'} defaults
            </button>
          </div>
        )}
      </div>

      {/* Add Deal Form */}
      {showAdd && (
        <div className="glass-card space-y-3 animate-scale-in">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name *" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
          <div className="flex gap-2">
            {policyType !== 'Bundle' && (
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`${tradeConfig.valueLabel} ($)`} className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            )}
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={`px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm ${policyType === 'Bundle' ? 'flex-1' : ''}`}>
              {STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost').map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <select value={policyType} onChange={(e) => { setPolicyType(e.target.value); if (e.target.value === 'Bundle' && bundleItems.length === 0) setBundleItems([{ type: '', value: '' }, { type: '', value: '' }]); }} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
            <option value="">Select {tradeConfig.dealTypeLabel.toLowerCase()}...</option>
            {customDealTypes.map((pt) => (
              <option key={pt} value={pt}>{pt}</option>
            ))}
          </select>
          {policyType === 'Bundle' && (
            <div className="space-y-2 bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <p className="text-xs text-amber-400 font-medium">📦 Bundle Breakdown</p>
              {bundleItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={item.type}
                    onChange={(e) => { const updated = [...bundleItems]; updated[idx].type = e.target.value; setBundleItems(updated); }}
                    className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="">Type...</option>
                    {customDealTypes.filter((t) => t !== 'Bundle').map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number"
                    value={item.value}
                    onChange={(e) => { const updated = [...bundleItems]; updated[idx].value = e.target.value; setBundleItems(updated); }}
                    placeholder="$"
                    className="w-24 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                  />
                  {bundleItems.length > 2 && (
                    <button onClick={() => setBundleItems(bundleItems.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-sm">×</button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setBundleItems([...bundleItems, { type: '', value: '' }])}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Add another policy to bundle
              </button>
              <p className="text-xs text-green-400 font-medium">
                Bundle Total: ${bundleItems.reduce((s, i) => s + (parseFloat(i.value) || 0), 0).toLocaleString()}
              </p>
            </div>
          )}
          {defaultFolioStart && defaultFolioEnd && (
            <p className="text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg">📅 Folio: {defaultFolioStart} to {defaultFolioEnd}</p>
          )}
          <div className="flex gap-2">
            <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
          </div>
          <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
            <option value="">Where did this lead come from?</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
            ))}
          </select>
          {leadSource && (
            <input type="text" value={leadSourceNote} onChange={(e) => setLeadSourceNote(e.target.value)} placeholder={leadSource === 'internet-lead' ? 'Lead vendor (e.g. QuoteWizard, EverQuote, Datalot, Hometown Quotes...)' : leadSource.includes('post') || leadSource.includes('ad') ? 'Link to the post or ad...' : leadSource === 'referral' ? 'Who referred them?' : leadSource.includes('call') ? 'Call notes — what triggered interest?' : 'Details about the source...'} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
          )}
          {/* Sold By */}
          <div>
            <div className="flex gap-2">
              <select value={soldBy} onChange={(e) => setSoldBy(e.target.value)} className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                <option value="">Who sold this?</option>
                {salespeople.map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const name = prompt('Add a salesperson/employee name:');
                  if (name && name.trim() && !salespeople.includes(name.trim())) {
                    const updated = [...salespeople, name.trim()];
                    setSalespeople(updated);
                    localStorage.setItem('hawkeye_salespeople', JSON.stringify(updated));
                    setSoldBy(name.trim());
                    // Sync to server
                    buildClient().then((client) => client.request('PUT', '/profile/preferences', { salespeople: updated })).catch(() => {});
                  }
                }}
                className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium"
              >
                + Add
              </button>
            </div>
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
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`${tradeConfig.valueLabel} ($)`} className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              <select value={policyType} onChange={(e) => setPolicyType(e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                <option value="">{tradeConfig.dealTypeLabel}</option>
                {customDealTypes.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
            </div>
            <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
              <option value="">Lead source...</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
              ))}
            </select>
            {leadSource && (
              <input type="text" value={leadSourceNote} onChange={(e) => setLeadSourceNote(e.target.value)} placeholder="Source details..." className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            )}
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
                      leadSource,
                      leadSourceNote,
                    });
                    setDeals(deals.map((d) => d.id === editingDeal.id ? { ...d, name: name.trim(), value: parseFloat(value) || 0, policyType, contactEmail, contactPhone, notes, leadSource, leadSourceNote } : d));
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

                  {/* Lead Source Attribution */}
                  {deal.leadSource && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-indigo-300">
                        📍 Source: {LEAD_SOURCES.find((s) => s.id === deal.leadSource)?.icon} {LEAD_SOURCES.find((s) => s.id === deal.leadSource)?.label || deal.leadSource}
                        {deal.leadSource === 'internet-lead' && deal.leadSourceNote && <span className="text-indigo-400"> via {deal.leadSourceNote}</span>}
                      </p>
                      {deal.leadSourceNote && deal.leadSource !== 'internet-lead' && (
                        <p className="text-xs text-indigo-400/70 mt-0.5">{deal.leadSourceNote}</p>
                      )}
                    </div>
                  )}

                  {/* Bundle Breakdown */}
                  {deal.policyType === 'Bundle' && deal.bundleItems && deal.bundleItems.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-amber-300 mb-1">📦 Bundle Breakdown</p>
                      {deal.bundleItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-300">{item.type}</span>
                          <span className="text-green-400">${(item.value || 0).toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-medium mt-1 pt-1 border-t border-amber-500/20">
                        <span className="text-amber-300">Total</span>
                        <span className="text-green-400">${deal.bundleItems.reduce((s, i) => s + (i.value || 0), 0).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {/* Internet Lead Follow-Up Sequence */}
                  {deal.leadSource === 'internet-lead' && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-orange-300 mb-2">⚡ Internet Lead — 21-Day Follow-Up Sequence</p>
                      <p className="text-xs text-slate-500 mb-2">8-10 touches needed. Front-loaded for speed.</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {INTERNET_LEAD_SEQUENCE.map((step, idx) => {
                          const storageKey = `hawkeye_seq_${deal.id}_${idx}`;
                          const isChecked = localStorage.getItem(storageKey) === 'true';
                          return (
                            <label key={idx} className={`flex items-start gap-2 p-1.5 rounded text-xs cursor-pointer hover:bg-white/5 ${isChecked ? 'opacity-50' : ''}`}>
                              <input
                                type="checkbox"
                                defaultChecked={isChecked}
                                onChange={(e) => { localStorage.setItem(storageKey, String(e.target.checked)); }}
                                className="mt-0.5 w-3.5 h-3.5 rounded shrink-0"
                              />
                              <div className="min-w-0">
                                <span className={`font-medium ${step.type === 'call' ? 'text-blue-300' : step.type === 'sms' ? 'text-green-300' : 'text-purple-300'}`}>
                                  {step.type === 'call' ? '📞' : step.type === 'sms' ? '💬' : '✉️'} Day {step.day} · {step.time}
                                </span>
                                <p className="text-slate-400 mt-0.5">{step.task}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
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
                        setLeadSource(deal.leadSource || '');
                        setLeadSourceNote(deal.leadSourceNote || '');
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => {
                        const snoozeDealId = deal.id === confirmDeleteId ? null : deal.id;
                        setConfirmDeleteId(null);
                        setSnoozeId(snoozeId === deal.id ? null : deal.id);
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      🦅 Re-Cue
                    </button>
                    <button
                      onClick={() => { setSnoozeId(null); setConfirmDeleteId(deal.id); }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {/* Re-Cue options */}
                  {snoozeId === deal.id && (
                    <div className="mt-2 p-3 bg-purple-950/30 border border-purple-500/30 rounded-lg">
                      <p className="text-xs text-purple-300 mb-2">🦅 Re-Cue this lead — bring it back in:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: '1 week', days: 7 },
                          { label: '2 weeks', days: 14 },
                          { label: '1 month', days: 30 },
                          { label: '3 months', days: 90 },
                          { label: '6 months', days: 180 },
                          { label: '1 year', days: 365 },
                        ].map((opt) => (
                          <button
                            key={opt.days}
                            onClick={async () => {
                              const snoozeDate = new Date(Date.now() + opt.days * 24 * 60 * 60 * 1000);
                              const dateStr = `${snoozeDate.getFullYear()}-${String(snoozeDate.getMonth() + 1).padStart(2, '0')}-${String(snoozeDate.getDate()).padStart(2, '0')}`;
                              // Add calendar cue for the re-surface date
                              addEvent({ date: dateStr, title: `🦅 Re-Cue: ${deal.name} (${opt.label})`, type: 'task' });
                              // Remove old follow-up events for this deal from calendar
                              removeAllByTitle(deal.name);
                              // Move deal to "lost" to hide from active list
                              try {
                                const client = await buildClient();
                                await client.request('PUT', `/sales/deals/${deal.id}`, { stage: 'lost', notes: `${deal.notes ? deal.notes + ' | ' : ''}Re-Cued ${opt.label} — resurfaces ${dateStr}` });
                                setDeals(deals.map((d) => d.id === deal.id ? { ...d, stage: 'lost', notes: `${d.notes ? d.notes + ' | ' : ''}Re-Cued ${opt.label} — resurfaces ${dateStr}` } : d));
                              } catch { /* ignore */ }
                              setSnoozeId(null);
                            }}
                            className="px-2.5 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded text-xs text-purple-300 hover:bg-purple-600/40"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setSnoozeId(null)} className="text-xs text-slate-500 mt-2 hover:text-slate-300">Cancel</button>
                    </div>
                  )}

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
                              removeAllByTitle(deal.name);
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
      {filtered.filter((d) => d.stage === 'won').length > 0 && (
        <div className="glass-card-strong border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Folio Total</p>
              <p className="text-xs text-slate-400">{filtered.filter((d) => d.stage === 'won').length} won {folioFilter !== 'all' ? `in ${folioFilter}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-400">${filtered.filter((d) => d.stage === 'won').reduce((sum, d) => sum + d.value, 0).toLocaleString()}</p>
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
            value={teamEmailsText}
            onChange={(e) => setTeamEmailsText(e.target.value)}
            onBlur={async (e) => {
              const val = e.target.value;
              localStorage.setItem('hawkeye_team_emails', val);
              try {
                const client = await buildClient();
                await client.request('PUT', '/sales/team-emails', { emails: val.split('\n').map((em: string) => em.trim()).filter(Boolean) });
                showToast('✓ Team emails saved');
              } catch { /* ignore */ }
            }}
            placeholder="Enter emails, one per line:&#10;team@example.com&#10;agent2@example.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-20"
          />
          <p className="text-xs text-slate-500">Emails sync to server — works on all devices.</p>
        </div>
      </details>
    </div>
  );
}
