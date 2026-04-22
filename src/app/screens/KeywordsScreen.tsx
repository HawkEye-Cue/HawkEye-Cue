import { useState, useEffect } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import { Plus, Trash2, Download, Upload, AlertCircle } from 'lucide-react';
import { tradeContent, trades } from '../data/tradeData';

interface KeywordsScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

export function KeywordsScreen({ tradeId, onNavigate }: KeywordsScreenProps) {
  const content = tradeContent[tradeId];
  const currentTrade = trades.find(t => t.id === tradeId);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load keywords from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`keywords_${tradeId}`);
    if (saved) {
      setKeywords(JSON.parse(saved));
    } else {
      // Set default keywords based on trade
      const defaults = getDefaultKeywords();
      setKeywords(defaults);
      localStorage.setItem(`keywords_${tradeId}`, JSON.stringify(defaults));
    }
  }, [tradeId]);

  // Save keywords whenever they change
  useEffect(() => {
    if (keywords.length >= 0) {
      localStorage.setItem(`keywords_${tradeId}`, JSON.stringify(keywords));

      // Auto-sync to extension when keywords change
      autoSyncToExtension();
    }
  }, [keywords, tradeId]);

  // Broadcast keywords to extension via window message
  const autoSyncToExtension = async () => {
    try {
      // Post message that extension content script can listen for
      window.postMessage({
        type: 'HAWKEYE_KEYWORDS_UPDATE',
        keywords: keywords,
        tradeId: tradeId,
        monitoringActive: true
      }, '*');
    } catch (error) {
      console.log('Could not broadcast to extension');
    }
  };

  const getDefaultKeywords = (): string[] => {
    const tradeKeywords: Record<string, string[]> = {
      'roofer': ['need a roofer', 'roof repair', 'roof leak', 'new roof', 'roofing quote', 'storm damage'],
      'contractor': ['need contractor', 'renovation', 'remodel', 'home improvement', 'handyman'],
      'insurance': ['need insurance', 'insurance quote', 'coverage', 'policy', 'life insurance'],
      'realtor': ['selling my house', 'buying a house', 'realtor recommendation', 'house for sale'],
      'junk-removal': ['junk removal', 'hauling', 'cleanout', 'estate sale', 'moving'],
      'lender': ['mortgage', 'home loan', 'refinance', 'first time buyer', 'pre-approval'],
      'hvac': ['hvac', 'air conditioning', 'heating', 'furnace', 'ac repair', 'ductwork'],
      'electrician': ['electrician', 'electrical', 'wiring', 'panel upgrade', 'outlet'],
      'plumber': ['plumber', 'plumbing', 'leak', 'water heater', 'drain', 'pipe'],
      'landscaper': ['landscaping', 'lawn care', 'yard work', 'tree removal', 'mulch'],
      'pool-service': ['pool', 'pool service', 'green pool', 'pool leak', 'pool maintenance'],
      'auto-shop': ['car repair', 'mechanic', 'check engine', 'oil change', 'brake'],
      'auto-broker': ['buying a car', 'car dealer', 'trade in', 'vehicle', 'auto'],
      'cosmetologist': ['hairstylist', 'hair color', 'haircut', 'salon', 'balayage'],
      'esthetician': ['facial', 'skincare', 'waxing', 'esthetician', 'spa'],
    };

    return tradeKeywords[tradeId] || ['recommendation', 'need help', 'looking for'];
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim().toLowerCase())) {
      setKeywords([...keywords, newKeyword.trim().toLowerCase()]);
      setNewKeyword('');
      setShowAddKeyword(false);
    }
  };

  const handleDeleteKeyword = (keyword: string) => {
    if (confirm(`Delete keyword "${keyword}"?`)) {
      setKeywords(keywords.filter(k => k !== keyword));
    }
  };

  const syncToExtension = async () => {
    setSyncing(true);

    // Create sync data
    const syncData = {
      keywords: keywords,
      tradeId: tradeId,
      monitoringActive: true
    };

    // Try to broadcast via window message first
    try {
      window.postMessage({
        type: 'HAWKEYE_KEYWORDS_UPDATE',
        ...syncData
      }, '*');

      setSyncing(false);
      alert(
        '✅ Keywords ready for extension!\n\n' +
        `Trade: ${currentTrade?.name}\n` +
        `Keywords (${keywords.length}):\n` +
        keywords.map(k => `• ${k}`).join('\n') +
        '\n\nThe extension will automatically detect these keywords when you browse Facebook.'
      );
    } catch (error) {
      setSyncing(false);
      alert(
        '✅ Keywords saved!\n\n' +
        `Current keywords for ${currentTrade?.name}:\n` +
        keywords.join(', ')
      );
    }
  };

  const resetToDefaults = () => {
    if (confirm('Reset all keywords to defaults for your trade?')) {
      const defaults = getDefaultKeywords();
      setKeywords(defaults);
      alert('✅ Keywords reset to defaults!');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Keyword Tracking</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Monitor Facebook groups for these keywords and capture leads automatically
        </p>
      </div>

      <HECard className="bg-gradient-to-r from-[#F0F9FF] to-[#F0FDF4] border-2 border-[#1D4ED8]/20">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl text-2xl"
            style={{ backgroundColor: currentTrade?.bgColor }}
          >
            {currentTrade?.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[#0F172A]">
              {currentTrade?.name} Keywords
            </h3>
            <p className="text-sm text-[#64748B]">
              These keywords are specific to your {currentTrade?.name.toLowerCase()} business
            </p>
          </div>
        </div>
      </HECard>

      <HECard className="bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white border-none">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold mb-2">Sync to Extension</h3>
            <p className="text-sm opacity-90 mb-3">
              Copy these keywords and paste them in the Chrome Extension popup.
            </p>
            <div className="bg-white/10 rounded-lg p-2 mb-3 text-xs font-mono break-all">
              {keywords.join(', ')}
            </div>
            <button
              onClick={() => {
                try {
                  navigator.clipboard.writeText(keywords.join(', ')).then(() => {
                    alert('✅ Keywords copied to clipboard!\n\nNow:\n1. Click the extension icon\n2. Click "Import Keywords from App"\n3. Paste keywords\n4. Enter trade: ' + tradeId);
                  }).catch(() => {
                    alert('📋 Copy these keywords:\n\n' + keywords.join(', ') + '\n\nThen:\n1. Click extension icon\n2. Click "Import Keywords"\n3. Paste\n4. Enter trade: ' + tradeId);
                  });
                } catch (error) {
                  alert('📋 Copy these keywords:\n\n' + keywords.join(', ') + '\n\nThen:\n1. Click extension icon\n2. Click "Import Keywords"\n3. Paste\n4. Enter trade: ' + tradeId);
                }
              }}
              className="px-4 py-2 bg-white text-[#3B82F6] rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              📋 Copy Keywords
            </button>
          </div>
        </div>
      </HECard>

      <div className="grid grid-cols-2 gap-3">
        <HEButton variant="primary" onClick={syncToExtension} disabled={syncing}>
          <Upload className="w-4 h-4 mr-2" />
          {syncing ? 'Syncing...' : 'Sync to Extension'}
        </HEButton>
        <HEButton variant="secondary" onClick={resetToDefaults}>
          🔄 Reset Defaults
        </HEButton>
      </div>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">
            Keywords ({keywords.length})
          </h2>
          <button
            onClick={() => setShowAddKeyword(!showAddKeyword)}
            className="text-[#1D4ED8] text-sm font-medium flex items-center gap-1 hover:underline"
          >
            <Plus className="w-4 h-4" />
            Add Keyword
          </button>
        </div>

        {showAddKeyword && (
          <div className="mb-3 p-3 bg-[#F0F9FF] rounded-lg border border-[#1D4ED8]/20">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="e.g., need a roofer"
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] mb-2"
              onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
            />
            <div className="flex gap-2">
              <HEButton variant="primary" onClick={handleAddKeyword}>
                Add
              </HEButton>
              <HEButton
                variant="secondary"
                onClick={() => {
                  setShowAddKeyword(false);
                  setNewKeyword('');
                }}
              >
                Cancel
              </HEButton>
            </div>
          </div>
        )}

        {keywords.length === 0 ? (
          <p className="text-sm text-[#64748B] italic">
            No keywords yet. Add keywords to start tracking!
          </p>
        ) : (
          <div className="space-y-2">
            {keywords.map((keyword, idx) => (
              <div
                key={idx}
                className="group flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] hover:border-[#1D4ED8] transition-colors"
              >
                <span className="text-sm text-[#0F172A]">"{keyword}"</span>
                <button
                  onClick={() => handleDeleteKeyword(keyword)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#64748B] hover:text-[#EF4444] rounded transition-opacity"
                  title="Delete keyword"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </HECard>

      <HECard className="bg-[#F0FDF4] border-2 border-[#22C55E]">
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">💡 Tips for Keywords</h3>
        <ul className="text-sm text-[#64748B] space-y-1">
          <li>• Use phrases people actually type (e.g., "need a roofer")</li>
          <li>• Include common misspellings if relevant</li>
          <li>• Add location-specific terms (e.g., "Denver roofer")</li>
          <li>• Track urgency words (e.g., "emergency", "asap")</li>
          <li>• Monitor competitor names to see what people say</li>
        </ul>
      </HECard>

      <HECard>
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">📊 How It Works</h3>
        <ol className="text-sm text-[#64748B] space-y-2">
          <li>1. Set keywords for your trade (done ✓)</li>
          <li>2. Install the Chrome Extension</li>
          <li>3. Keywords auto-sync when you add/edit them</li>
          <li>4. Browse Facebook groups normally</li>
          <li>5. Extension highlights matching posts in real-time</li>
          <li>6. Leads automatically saved to Opportunities</li>
          <li>7. Get notifications when keywords are found</li>
        </ol>
      </HECard>

      <HECard className="bg-[#FEF3C7] border-2 border-[#F59E0B]">
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">🔄 Multiple Trades</h3>
        <p className="text-sm text-[#64748B] mb-2">
          Each trade has its own keywords! When you switch industries:
        </p>
        <ul className="text-sm text-[#64748B] space-y-1">
          <li>• Keywords automatically update for that trade</li>
          <li>• Extension monitors the new keywords</li>
          <li>• Previous trade keywords are saved</li>
          <li>• Switch back anytime to restore them</li>
        </ul>
      </HECard>
    </div>
  );
}
