// Regression tests for the launch-safe Take Flight automation gate (src/flags.js).
//
// Proves:
//  1. TAKE_FLIGHT_ENABLED defaults to OFF (false) — production-safe default.
//  2. The gate predicates used by scanner.js / popup.js block the automation whenever the
//     flag is OFF, even if flightMode is somehow true (leftover storage, another UI, devtools).
//  3. When the flag is ON, normal flightMode behavior resumes (so the feature is only
//     disabled, not deleted).
//
// The gate expressions below mirror EXACTLY what the extension code evaluates:
//   scanner startFlight(): `if (!TAKE_FLIGHT_ENABLED) { flightMode = false; return; }`
//   scanner init:          `flightMode = TAKE_FLIGHT_ENABLED && !!stored.flightMode`
//   scanner autosave:      `if (TAKE_FLIGHT_ENABLED && flightMode) autoSaveLead(...)`
//   scanner onChanged:     `if (!TAKE_FLIGHT_ENABLED) { stop; return; }`
//   popup:                 button/handler only wired when TAKE_FLIGHT_ENABLED

import { describe, it, expect, beforeEach } from 'vitest';

// Load the real flag module for side effects (sets globalThis.HawkEyeFlags).
import '../src/flags.js';

const Flags = (globalThis as any).HawkEyeFlags;

// Pure mirrors of the decision expressions in the shipping code.
const canStartFlight = (enabled: boolean) => enabled; // startFlight no-ops when !enabled
const effectiveFlightOnInit = (enabled: boolean, storedFlightMode: boolean) => enabled && !!storedFlightMode;
const willAutoSave = (enabled: boolean, flightMode: boolean) => enabled && flightMode;
const onChangedStartsFlight = (enabled: boolean, newValue: boolean) => enabled && !!newValue;
const popupShowsEntryPoint = (enabled: boolean) => enabled;

describe('flags.js — default', () => {
  it('exposes HawkEyeFlags with TAKE_FLIGHT_ENABLED OFF by default (production-safe)', () => {
    expect(Flags).toBeTruthy();
    expect(Flags.TAKE_FLIGHT_ENABLED).toBe(false);
  });
});

describe('Take Flight automation gate — DISABLED (flag OFF)', () => {
  const enabled = false;

  it('startFlight is a no-op (cannot start the auto-scroll loop)', () => {
    expect(canStartFlight(enabled)).toBe(false);
  });

  it('a leftover/other-path stored flightMode=true does NOT activate on init', () => {
    expect(effectiveFlightOnInit(enabled, true)).toBe(false);
  });

  it('auto-save never fires even if flightMode were true', () => {
    expect(willAutoSave(enabled, true)).toBe(false);
  });

  it('a storage change flipping flightMode on does NOT start the automation', () => {
    expect(onChangedStartsFlight(enabled, true)).toBe(false);
  });

  it('the popup entry point (button) is not shown/wired', () => {
    expect(popupShowsEntryPoint(enabled)).toBe(false);
  });
});

describe('Take Flight automation gate — ENABLED (feature preserved, not deleted)', () => {
  const enabled = true;

  it('startFlight may run when explicitly enabled', () => {
    expect(canStartFlight(enabled)).toBe(true);
  });

  it('stored flightMode=true activates on init when enabled', () => {
    expect(effectiveFlightOnInit(enabled, true)).toBe(true);
  });

  it('auto-save fires when enabled AND in flight', () => {
    expect(willAutoSave(enabled, true)).toBe(true);
    expect(willAutoSave(enabled, false)).toBe(false);
  });

  it('a storage change can start flight when enabled', () => {
    expect(onChangedStartsFlight(enabled, true)).toBe(true);
  });

  it('the popup entry point is shown when enabled', () => {
    expect(popupShowsEntryPoint(enabled)).toBe(true);
  });
});

// Source-level invariants: assert the shipping files actually CONTAIN the gate guards, so a
// future edit that removes a guard (re-enabling the automation by accident) fails CI.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scannerSrc = readFileSync(resolve(here, 'content/scanner.js'), 'utf8');
const popupSrc = readFileSync(resolve(here, 'popup/popup.js'), 'utf8');
const flagsSrc = readFileSync(resolve(here, 'flags.js'), 'utf8');

describe('source invariants — gate guards are present in shipping code', () => {
  it('flags.js defaults TAKE_FLIGHT_ENABLED to false', () => {
    expect(flagsSrc).toMatch(/TAKE_FLIGHT_ENABLED\s*:\s*false/);
  });

  it('scanner.js reads the flag and guards startFlight()', () => {
    expect(scannerSrc).toMatch(/TAKE_FLIGHT_ENABLED\s*=\s*!!\(globalThis\.HawkEyeFlags/);
    // startFlight bails out when disabled
    expect(scannerSrc).toMatch(/if\s*\(!TAKE_FLIGHT_ENABLED\)\s*\{\s*flightMode\s*=\s*false;\s*return;\s*\}/);
    // init cannot activate from stored value when disabled
    expect(scannerSrc).toMatch(/flightMode\s*=\s*TAKE_FLIGHT_ENABLED\s*&&\s*!!flightState\.flightMode/);
    // auto-save gated
    expect(scannerSrc).toMatch(/TAKE_FLIGHT_ENABLED\s*&&\s*flightMode\)\s*autoSaveLead/);
    // onChanged ignores flightMode when disabled
    expect(scannerSrc).toMatch(/if\s*\(!TAKE_FLIGHT_ENABLED\)\s*\{\s*flightMode\s*=\s*false;\s*stopFlight\(\);\s*return;\s*\}/);
  });

  it('popup.js hides the entry point and only wires the handler when enabled', () => {
    expect(popupSrc).toMatch(/TAKE_FLIGHT_ENABLED\s*=\s*!!\(globalThis\.HawkEyeFlags/);
    expect(popupSrc).toMatch(/if\s*\(!TAKE_FLIGHT_ENABLED\)\s*\{/);
    expect(popupSrc).toMatch(/if\s*\(TAKE_FLIGHT_ENABLED\s*&&\s*flightBtn\)/);
  });

  it('does NOT delete the feature — startFlight / autoSaveLead code still exists', () => {
    expect(scannerSrc).toMatch(/function\s+startFlight\s*\(/);
    expect(scannerSrc).toMatch(/function\s+autoSaveLead\s*\(/);
  });
});
