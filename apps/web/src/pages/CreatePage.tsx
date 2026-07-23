import { useState, useEffect } from 'react';
import ContentCreatorPage from './ContentCreatorPage';
import CalendarPage from './CalendarPage';

export default function CreatePage() {
  const [previewContent, setPreviewContent] = useState<Record<string, string> | null>(null);

  // Listen for content changes from ContentCreatorPage via custom event
  useEffect(() => {
    function handlePreview(e: CustomEvent) {
      setPreviewContent(e.detail);
    }
    window.addEventListener('hawkeye-post-preview' as any, handlePreview as any);
    return () => window.removeEventListener('hawkeye-post-preview' as any, handlePreview as any);
  }, []);

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
      {/* Content Creator - Left/Top */}
      <div className="min-w-0">
        <ContentCreatorPage />
      </div>
      {/* Preview + Calendar - Right/Bottom */}
      <div className="min-w-0 space-y-4">
        {/* Post Preview Panel */}
        {previewContent && Object.keys(previewContent).length > 0 && (
          <div className="rounded-xl border border-white/20 p-4 bg-slate-800 backdrop-blur-sm sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">👁️ Post Preview</h3>
              <button onClick={() => setPreviewContent(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              {Object.entries(previewContent).map(([platform, content]) => (
                <div key={`preview-${platform}`} className="rounded-xl border border-slate-600 overflow-hidden bg-white">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Your Business</p>
                      <p className="text-[10px] text-slate-500">{platform.charAt(0).toUpperCase() + platform.slice(1)} · Just now</p>
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{content.slice(0, 300)}{content.length > 300 ? '...' : ''}</p>
                  </div>
                  <div className="px-3 py-2 border-t border-slate-200 flex items-center gap-4 text-slate-500 text-xs">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>↗️ Share</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <CalendarPage />
      </div>
    </div>
  );
}
