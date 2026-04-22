import { useState, useEffect } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import { tradeContent } from '../data/tradeData';
import { createPost } from '../../lib/ayrshare';
import { Send, Loader2, CheckCircle } from 'lucide-react';

interface AdaptScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

interface PlatformCardProps {
  icon: string;
  name: string;
  text: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (newText: string) => void;
  onCopy: () => void;
}

function PlatformCard({ icon, name, text, isEditing, onEdit, onSave, onCancel, onChange, onCopy }: PlatformCardProps) {
  return (
    <HECard>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-lg font-semibold text-[#0F172A]">{name}</h3>
      </div>

      {isEditing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-3 rounded-lg border-2 border-[#1D4ED8] bg-white text-base text-[#0F172A] focus:outline-none resize-none min-h-[120px]"
            rows={5}
          />
          <div className="text-xs text-[#64748B] mt-1">
            {text.length} characters
          </div>
          <div className="flex gap-2 mt-3">
            <HEButton variant="primary" onClick={onSave}>
              💾 Save Changes
            </HEButton>
            <HEButton variant="secondary" onClick={onCancel}>
              Cancel
            </HEButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-base text-[#64748B] mb-3 whitespace-pre-wrap">{text}</p>
          <div className="flex gap-2">
            <HEButton variant="secondary" onClick={onEdit}>
              ✏️ Edit
            </HEButton>
            <HEButton variant="secondary" onClick={onCopy}>
              📋 Copy
            </HEButton>
          </div>
        </>
      )}
    </HECard>
  );
}

export function AdaptScreen({ tradeId, onNavigate }: AdaptScreenProps) {
  const content = tradeContent[tradeId];
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [editedPosts, setEditedPosts] = useState<Record<string, string>>({});
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [tempEditText, setTempEditText] = useState('');

  // Load selected platforms from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('selectedPlatforms');
    if (saved) {
      setSelectedPlatforms(JSON.parse(saved));
    } else {
      // Default to all platforms if nothing selected
      setSelectedPlatforms(content.samplePosts.map(p => p.platform.toLowerCase()));
    }
  }, []);

  // Initialize edited posts with default content or load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('editedPosts');
    if (saved) {
      setEditedPosts(JSON.parse(saved));
    } else {
      const initialPosts: Record<string, string> = {};
      content.samplePosts.forEach(post => {
        initialPosts[post.platform.toLowerCase()] = post.content;
      });
      setEditedPosts(initialPosts);
    }
  }, [content.samplePosts]);

  // Save edited posts to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(editedPosts).length > 0) {
      localStorage.setItem('editedPosts', JSON.stringify(editedPosts));
    }
  }, [editedPosts]);

  // Filter posts to only show selected platforms
  const filteredPosts = content.samplePosts.filter(post =>
    selectedPlatforms.includes(post.platform.toLowerCase())
  );

  const handleEdit = (platform: string, currentText: string) => {
    setEditingPlatform(platform);
    setTempEditText(currentText);
  };

  const handleSave = (platform: string) => {
    setEditedPosts({
      ...editedPosts,
      [platform]: tempEditText,
    });
    setEditingPlatform(null);
    setTempEditText('');
  };

  const handleCancel = () => {
    setEditingPlatform(null);
    setTempEditText('');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('✅ Copied to clipboard!');
  };

  const getPostContent = (platform: string): string => {
    return editedPosts[platform] || content.samplePosts.find(p => p.platform.toLowerCase() === platform)?.content || '';
  };

  const resetToDefaults = () => {
    if (confirm('Reset all posts to default AI-generated content?')) {
      const initialPosts: Record<string, string> = {};
      content.samplePosts.forEach(post => {
        initialPosts[post.platform.toLowerCase()] = post.content;
      });
      setEditedPosts(initialPosts);
      localStorage.setItem('editedPosts', JSON.stringify(initialPosts));
      alert('✅ All posts reset to defaults!');
    }
  };

  const handlePostNow = async () => {
    try {
      setPosting(true);

      // Use the edited content for the first selected platform
      // (In a real app, you'd post platform-specific content to each platform)
      const firstPlatform = selectedPlatforms[0];
      const postContent = getPostContent(firstPlatform);

      // Post to ONLY selected platforms with visibility settings
      const result = await createPost({
        post: postContent,
        platforms: selectedPlatforms,
        facebookOptions: {
          published: true, // Ensure Facebook posts are published immediately
        },
        instagramOptions: {
          posted: true, // Ensure Instagram posts go to feed
        },
      });

      setPosted(true);
      setPosting(false);

      // Check for partial success
      const errors = result.errors || [];
      if (errors.length > 0) {
        const notLinkedPlatforms = errors
          .filter((e: any) => e.code === 156)
          .map((e: any) => e.platform);

        const duplicatePlatforms = errors
          .filter((e: any) => e.code === 137)
          .map((e: any) => e.platform);

        let message = '⚠️ Partial Success:\n\n';

        if (duplicatePlatforms.length > 0) {
          message += `❌ Duplicate content on: ${duplicatePlatforms.join(', ')}\n(You posted similar content recently)\n\n`;
        }

        if (notLinkedPlatforms.length > 0) {
          message += `❌ Not connected: ${notLinkedPlatforms.join(', ')}\n\nConnect these platforms at:\nhttps://app.ayrshare.com`;
        }

        alert(message);
      } else {
        alert(`✅ Posted successfully to selected platforms!\n\n${selectedPlatforms.join(', ')}`);
      }
    } catch (error) {
      setPosting(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Parse specific errors
      let userFriendlyMessage = '❌ Error posting:\n\n';

      if (errorMessage.includes('code":156')) {
        userFriendlyMessage += '🔗 Platforms not connected:\n\nGo to https://app.ayrshare.com\nClick "Social Accounts"\nConnect your platforms\n\n';
      }

      if (errorMessage.includes('code":137')) {
        userFriendlyMessage += '⚠️ Duplicate content detected:\n\nYou posted this content recently.\nSocial networks block duplicate posts.\nTry posting different content.\n\n';
      }

      userFriendlyMessage += 'Full error in console (F12)';

      alert(userFriendlyMessage);
      console.error('Post error:', error);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">Review Platform Versions</h1>
        <button
          onClick={resetToDefaults}
          className="text-sm text-[#64748B] hover:text-[#1D4ED8] hover:underline"
          disabled={editingPlatform !== null}
        >
          🔄 Reset to Defaults
        </button>
      </div>
      <p className="text-sm text-[#64748B] -mt-2">
        {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''} selected • Click "Edit" to customize each post
      </p>

      {filteredPosts.length > 0 ? (
        filteredPosts.map((post, idx) => {
          const platformLower = post.platform.toLowerCase();
          const isEditing = editingPlatform === platformLower;
          const displayText = isEditing ? tempEditText : getPostContent(platformLower);

          return (
            <PlatformCard
              key={idx}
              icon={post.platformIcon}
              name={post.platform}
              text={displayText}
              isEditing={isEditing}
              onEdit={() => handleEdit(platformLower, getPostContent(platformLower))}
              onSave={() => handleSave(platformLower)}
              onCancel={handleCancel}
              onChange={setTempEditText}
              onCopy={() => handleCopy(getPostContent(platformLower))}
            />
          );
        })
      ) : (
        <HECard className="bg-[#FEF3C7] border-2 border-[#F59E0B]">
          <p className="text-[#0F172A] text-center">
            No platforms selected. Go back to Create and select at least one platform.
          </p>
        </HECard>
      )}

      {posted && (
        <HECard className="bg-[#F0FDF4] border-2 border-[#22C55E]">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[#22C55E]" />
            <span className="text-[#22C55E] font-semibold">Posted successfully to all platforms!</span>
          </div>
        </HECard>
      )}

      {editingPlatform && (
        <HECard className="bg-[#FEF3C7] border-2 border-[#F59E0B]">
          <p className="text-sm text-[#0F172A]">
            ✏️ <strong>Editing mode:</strong> Save or cancel your changes before posting.
          </p>
        </HECard>
      )}

      <HEButton
        variant="primary"
        onClick={handlePostNow}
        disabled={posting || posted || editingPlatform !== null}
        className="flex items-center justify-center gap-2"
      >
        {posting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Posting...
          </>
        ) : posted ? (
          <>
            <CheckCircle className="w-4 h-4" />
            Posted!
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            📤 Post Now to Selected Platforms
          </>
        )}
      </HEButton>

      <HEButton
        variant="secondary"
        onClick={() => onNavigate('calendar')}
        disabled={editingPlatform !== null}
      >
        Or Schedule for Later →
      </HEButton>
    </div>
  );
}
