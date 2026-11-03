/**
 * BrandKitEditor — standalone panel for managing the user's Brand Kit.
 *
 * Embeds in SettingsPage (or anywhere) as a collapsible glass-card section.
 * Reads / writes via the brandKit localStorage helpers. Logo is stored as
 * a data URL so it works in the sandbox without S3.
 */

import { useState, useRef } from 'react';
import { type BrandKit, saveBrandKit, readFileAsDataUrl, BRAND_KIT_DEFAULTS } from '../lib/brandKit';

interface BrandKitEditorProps {
  brandKit: BrandKit;
  sub: string | undefined;
  onChange: (updated: BrandKit) => void;
}

export default function BrandKitEditor({ brandKit, sub, onChange }: BrandKitEditorProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof BrandKit, value: string | null) => {
    onChange({ ...brandKit, [field]: value });
  };

  const handleLogoUpload = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    onChange({ ...brandKit, logoDataUrl: dataUrl });
  };

  const handleSave = () => {
    setSaving(true);
    saveBrandKit(sub, brandKit);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => onChange({ ...BRAND_KIT_DEFAULTS });

  return (
    <div className="glass-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">🏷 Brand Kit</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Auto-fills your designs with your company details and logo.
          </p>
        </div>
        <span className="text-2xl">🦅</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Company Name"
          value={brandKit.companyName}
          placeholder="Acme Roofing Co."
          onChange={(v) => update('companyName', v)}
        />
        <Field
          label="Phone Number"
          value={brandKit.phone}
          placeholder="(555) 000-0000"
          onChange={(v) => update('phone', v)}
        />
        <Field
          label="Website"
          value={brandKit.website}
          placeholder="www.example.com"
          onChange={(v) => update('website', v)}
        />
        <Field
          label="Tagline / Slogan"
          value={brandKit.tagline}
          placeholder="Fast · Fair · Reliable"
          onChange={(v) => update('tagline', v)}
        />
      </div>

      {/* Brand Colors */}
      <div className="flex flex-wrap gap-4">
        <ColorField
          label="Primary Color"
          value={brandKit.primaryColor}
          onChange={(v) => update('primaryColor', v)}
        />
        <ColorField
          label="Accent Color"
          value={brandKit.accentColor}
          onChange={(v) => update('accentColor', v)}
        />
      </div>

      {/* Logo */}
      <div>
        <p className="text-xs font-medium text-slate-300 mb-2">Logo</p>
        <div className="flex items-center gap-3">
          {brandKit.logoDataUrl ? (
            <div className="relative">
              <img
                src={brandKit.logoDataUrl}
                alt="Brand logo"
                className="w-20 h-20 object-contain rounded-lg bg-white/5 border border-white/10 p-1"
              />
              <button
                onClick={() => update('logoDataUrl', null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-500"
                aria-label="Remove logo"
              >
                ×
              </button>
            </div>
          ) : (
            <div
              onClick={() => logoRef.current?.click()}
              className="w-20 h-20 rounded-lg bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/40 hover:bg-white/10 transition-colors"
            >
              <span className="text-2xl">🖼️</span>
              <span className="text-[10px] text-slate-500 mt-1">Upload</span>
            </div>
          )}
          <div>
            <button
              onClick={() => logoRef.current?.click()}
              className="block text-xs text-amber-400 hover:text-amber-300"
            >
              {brandKit.logoDataUrl ? '⬆ Replace logo' : '⬆ Upload logo (PNG/SVG)'}
            </button>
            <p className="text-[10px] text-slate-500 mt-1">
              PNG or SVG, transparent background recommended.
            </p>
          </div>
        </div>
        <input
          ref={logoRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
        />
      </div>

      {/* Save / Reset */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Brand Kit'}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 bg-white/5 border border-white/10 text-slate-400 text-sm rounded-lg hover:bg-white/10 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// Shared sub-components
function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none transition-colors"
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-lg border border-white/10 cursor-pointer overflow-hidden shrink-0"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full opacity-0 cursor-pointer"
          title={`Choose ${label}`}
        />
      </div>
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-[10px] text-slate-500 font-mono">{value}</p>
      </div>
    </div>
  );
}
