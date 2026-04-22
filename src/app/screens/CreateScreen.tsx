import { useState, useRef, useEffect } from 'react';
import { HEButton, HECard, HEInput, TagPill } from '../components/DesignSystem';
import { Upload, X, Image as ImageIcon, Video, Sparkles, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { tradeContent, trades } from '../data/tradeData';

interface CreateScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  preview: string;
}

export function CreateScreen({ tradeId, onNavigate }: CreateScreenProps) {
  const content = tradeContent[tradeId];
  const currentTrade = trades.find(t => t.id === tradeId);

  const [postText, setPostText] = useState('');
  const [selectedTone, setSelectedTone] = useState('Professional');
  const [selectedType, setSelectedType] = useState('Educational');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [aiUsageCount, setAiUsageCount] = useState(7);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiLimit = 10;

  const tones = ['Professional', 'Casual', 'Educational', 'Urgent'];

  // Get default post types for each trade
  const getDefaultPostTypes = () => {
    const types: Record<string, string[]> = {
      'roofer': ['Storm Prep', 'Inspection', 'Testimonial', 'Before/After'],
      'contractor': ['Project Update', 'Renovation Tip', 'Before/After', 'Testimonial'],
      'insurance': ['Rate Update', 'Coverage Tip', 'Life Insurance', 'Auto Insurance'],
      'realtor': ['New Listing', 'Market Update', 'Buyer Tips', 'Just Sold'],
      'junk-removal': ['Before/After', 'Eco Tips', 'Same Day Service', 'Cleanout'],
      'lender': ['Rate Update', 'Pre-Approval', 'First-Time Buyer', 'Refinancing'],
      'hvac': ['Seasonal Maintenance', 'Energy Savings', 'Emergency Service', 'New Install'],
      'electrician': ['Safety Tips', 'Panel Upgrade', 'Smart Home', 'Emergency'],
      'plumber': ['Leak Detection', 'Water Heater', 'Emergency Service', 'Maintenance'],
      'landscaper': ['Seasonal Tips', 'Before/After', 'Design Ideas', 'Lawn Care'],
      'pool-service': ['Opening/Closing', 'Water Chemistry', 'Green Pool Fix', 'Weekly Service'],
      'auto-shop': ['Maintenance Tips', 'Check Engine', 'Seasonal Service', 'Safety'],
      'auto-broker': ['Inventory', 'Pricing Tips', 'Trade-In Value', 'Financing'],
      'cosmetologist': ['Color Trends', 'Transformation', 'Hair Care Tips', 'Styling'],
      'esthetician': ['Skincare Routine', 'Treatment Results', 'Seasonal Tips', 'Self-Care'],
    };

    return types[tradeId] || ['Educational', 'Promotional', 'Testimonial', 'Tips'];
  };

  // Load custom post types from localStorage or use defaults
  const [postTypes, setPostTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem(`postTypes_${tradeId}`);
    if (saved) {
      return JSON.parse(saved);
    }
    return getDefaultPostTypes();
  });

  // Save post types to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`postTypes_${tradeId}`, JSON.stringify(postTypes));
  }, [postTypes, tradeId]);

  // Set default selected type
  useEffect(() => {
    if (postTypes.length > 0 && !postTypes.includes(selectedType)) {
      setSelectedType(postTypes[0]);
    }
  }, [postTypes]);

  // Initialize selected platforms - all selected by default
  useEffect(() => {
    if (selectedPlatforms.length === 0) {
      setSelectedPlatforms(content.samplePosts.map(p => p.platform.toLowerCase()));
    }
  }, [content.samplePosts]);

  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      // Must have at least one platform selected
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform));
      } else {
        alert('You must select at least one platform!');
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  const handleAddType = () => {
    if (newTypeName.trim()) {
      setPostTypes([...postTypes, newTypeName.trim()]);
      setNewTypeName('');
      setShowAddType(false);
    }
  };

  const handleDeleteType = (typeToDelete: string) => {
    if (postTypes.length <= 1) {
      alert('You must have at least one post type!');
      return;
    }
    if (confirm(`Delete "${typeToDelete}" post type?`)) {
      setPostTypes(postTypes.filter(t => t !== typeToDelete));
      if (selectedType === typeToDelete) {
        setSelectedType(postTypes.filter(t => t !== typeToDelete)[0]);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newFile: UploadedFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          type: file.type.startsWith('video') ? 'video' : 'image',
          preview: reader.result as string,
        };
        setUploadedFiles((prev) => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (id: string) => {
    setUploadedFiles(uploadedFiles.filter((file) => file.id !== id));
  };

  const handleAdaptClick = () => {
    if (aiUsageCount >= aiLimit) {
      setShowUpgradePrompt(true);
    } else {
      // Save selected platforms to localStorage for AdaptScreen
      localStorage.setItem('selectedPlatforms', JSON.stringify(selectedPlatforms));
      setAiUsageCount(aiUsageCount + 1);
      onNavigate('adapt');
    }
  };

  const useSuggestion = () => {
    setPostText(content.dailyCue.postIdea);
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      {showUpgradePrompt && (
        <UpgradePrompt
          feature="Unlimited AI Rewrites"
          requiredPlan="Growth"
          onUpgrade={() => {
            setShowUpgradePrompt(false);
            onNavigate('pricing');
          }}
          onClose={() => setShowUpgradePrompt(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-xl text-2xl"
          style={{ backgroundColor: currentTrade?.bgColor }}
        >
          {currentTrade?.icon}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#0F172A]">Create Post</h1>
          <div className="text-xs text-[#64748B]">
            AI Usage: <strong className={aiUsageCount >= aiLimit ? 'text-[#EF4444]' : 'text-[#1D4ED8]'}>{aiUsageCount}/{aiLimit}</strong>
          </div>
        </div>
      </div>

      <HECard className="bg-gradient-to-r from-[#F0F9FF] to-[#F0FDF4] border border-[#1D4ED8]/20">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">💡 Today's Suggestion</h3>
            <p className="text-sm text-[#64748B] mb-2">{content.dailyCue.postIdea}</p>
            <button
              onClick={useSuggestion}
              className="text-xs text-[#1D4ED8] font-medium hover:underline"
            >
              Use this idea →
            </button>
          </div>
        </div>
      </HECard>

      <HEInput
        multiline
        placeholder="Write your post here..."
        value={postText}
        onChange={setPostText}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      <HEButton
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-4 h-4 mr-2" />
        + Add Photo / Video
      </HEButton>

      {uploadedFiles.length > 0 && (
        <HECard>
          <h3 className="text-sm font-semibold text-[#0F172A] mb-3">Uploaded Media</h3>
          <div className="grid grid-cols-2 gap-2">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-[#F1F5F9] flex items-center justify-center">
                  {file.type === 'image' ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Video className="w-8 h-8 text-[#64748B]" />
                      <span className="text-xs text-[#64748B] px-2 text-center truncate w-full">
                        {file.name}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-1 right-1 p-1 bg-[#EF4444] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        </HECard>
      )}

      <HECard>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-3">Tone</h2>
        <div className="flex gap-2 flex-wrap">
          {tones.map((tone) => (
            <TagPill
              key={tone}
              active={selectedTone === tone}
              onClick={() => setSelectedTone(tone)}
            >
              {tone}
            </TagPill>
          ))}
        </div>
      </HECard>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Post Type</h2>
          <button
            onClick={() => setShowAddType(!showAddType)}
            className="text-[#1D4ED8] text-sm font-medium flex items-center gap-1 hover:underline"
          >
            <Plus className="w-4 h-4" />
            Add Type
          </button>
        </div>

        {showAddType && (
          <div className="mb-3 p-3 bg-[#F0F9FF] rounded-lg border border-[#1D4ED8]/20">
            <label className="block text-sm font-medium text-[#0F172A] mb-2">
              New Post Type Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g., Limited Offer"
                className="flex-1 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                onKeyPress={(e) => e.key === 'Enter' && handleAddType()}
              />
              <HEButton variant="primary" onClick={handleAddType}>
                Add
              </HEButton>
              <button
                onClick={() => {
                  setShowAddType(false);
                  setNewTypeName('');
                }}
                className="px-3 py-2 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {postTypes.map((type) => (
            <div key={type} className="relative group">
              <TagPill
                active={selectedType === type}
                onClick={() => setSelectedType(type)}
              >
                {type}
              </TagPill>
              <button
                onClick={() => handleDeleteType(type)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-[#EF4444] rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title={`Delete "${type}"`}
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
        {selectedType && (
          <p className="text-xs text-[#64748B] mt-3">
            💡 Tip: {selectedType} posts work great for {currentTrade?.name.toLowerCase()} businesses
          </p>
        )}
      </HECard>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Select Platforms</h2>
          <span className="text-xs text-[#64748B]">
            {selectedPlatforms.length} selected
          </span>
        </div>
        <div className="space-y-2">
          {content.samplePosts.map((post, idx) => {
            const platformLower = post.platform.toLowerCase();
            const isSelected = selectedPlatforms.includes(platformLower);

            return (
              <button
                key={idx}
                onClick={() => togglePlatform(platformLower)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-[#1D4ED8] bg-[#F0F9FF]'
                    : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? 'border-[#1D4ED8] bg-[#1D4ED8]'
                    : 'border-[#94A3B8] bg-white'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xl">{post.platformIcon}</span>
                <span className={`text-base font-medium flex-1 text-left ${
                  isSelected ? 'text-[#1D4ED8]' : 'text-[#0F172A]'
                }`}>
                  {post.platform}
                </span>
                {isSelected && (
                  <span className="text-xs text-[#1D4ED8] font-medium">✓ Selected</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[#64748B] mt-3">
          💡 Your post will be optimized for each selected platform automatically
        </p>
      </HECard>

      <HEButton
        variant="primary"
        onClick={handleAdaptClick}
        className="relative"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        🤖 Adapt for Platforms
        {aiUsageCount >= aiLimit && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#EF4444] text-white text-xs rounded-full flex items-center justify-center">
            !
          </span>
        )}
      </HEButton>
    </div>
  );
}
