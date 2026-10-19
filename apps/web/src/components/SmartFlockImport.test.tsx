// Regression tests for the Smart Flock Import clipboard-paste UX addition.
//
// The vitest environment is 'node' (see vitest.config.ts), so like the other web
// component tests we render initial markup with react-dom/server and assert the
// paste-related behavior via component source. This keeps tests dependency-light and
// does NOT touch the existing AI extraction pipeline.

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { sub: 'user-test', email: 'sam@example.com' }, getToken: async () => 'token' }),
}));
vi.mock('../contexts/CalendarContext', () => ({
  useCalendar: () => ({ addEvent: async () => {}, events: [] }),
}));
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: () => {} }),
}));

import SmartFlockImport from './SmartFlockImport';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './SmartFlockImport.tsx'), 'utf8');

function renderInitial() {
  return renderToStaticMarkup(createElement(SmartFlockImport, { onClose: () => {} }));
}

describe('SmartFlockImport — paste UX (initial render)', () => {
  it('shows clear paste instructions immediately', () => {
    const html = renderInitial();
    expect(html).toContain('Paste screenshots here (Ctrl + V)');
    expect(html).toContain('Windows + Shift + S');
  });

  it('preserves the file-upload option (mobile / preference fallback)', () => {
    const html = renderInitial();
    expect(html.toLowerCase()).toContain('choose files');
    expect(html).toContain('type="file"');
  });

  it('keeps the Analyze button disabled with no images', () => {
    const html = renderInitial();
    // disabled attribute rendered when files.length === 0
    expect(html).toMatch(/Analyze/);
    expect(html).toContain('disabled');
  });
});

describe('SmartFlockImport — paste/validation logic (source)', () => {
  it('registers a window paste listener and removes it on cleanup', () => {
    expect(source).toContain("window.addEventListener('paste'");
    expect(source).toContain("window.removeEventListener('paste'");
  });

  it('ignores pastes targeting text inputs so other fields are unaffected', () => {
    expect(source).toContain("tag === 'INPUT'");
    expect(source).toContain("tag === 'TEXTAREA'");
    expect(source).toContain('isContentEditable');
  });

  it('shares one intake path for files and paste, enforcing the 8-image cap', () => {
    expect(source).toContain('const MAX_IMAGES = 8');
    expect(source).toContain('next.length >= MAX_IMAGES');
  });

  it('validates type and size and dedupes', () => {
    expect(source).toContain('ACCEPTED_TYPES.includes(type)');
    expect(source).toContain('MAX_FILE_BYTES');
    expect(source).toContain('seen.has(key)'); // dedupe
  });

  it('shows thumbnail previews with a remove control', () => {
    expect(source).toContain('URL.createObjectURL');
    expect(source).toContain('URL.revokeObjectURL'); // no leaks
    expect(source).toContain('removeFile');
  });

  it('does NOT auto-analyze or auto-save on paste (explicit Analyze required)', () => {
    // addFiles only mutates the files list; analyze() is only called from the button.
    expect(source).not.toContain('addFiles(imgs); analyze');
    expect(source).toContain('onClick={analyze}');
  });

  it('disables save when no groups are validated/approved', () => {
    expect(source).toContain('disabled={rows.length === 0 || approvedCount === 0 || saving}');
  });

  it('reuses the existing import pipeline (no new endpoint)', () => {
    expect(source).toContain('client.importFlockGroups');
  });
});
