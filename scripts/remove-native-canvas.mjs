// postinstall: remove the optional native `canvas` package.
//
// Why: Fabric.js (used ONLY in the browser by the Design Studio) lists `canvas` as an
// optionalDependency for Node-side rendering we never do. Its native binary has no prebuilt
// for this platform, so the install always leaves an unbuildable package behind.
//
// jsdom (used by component tests via `@vitest-environment jsdom`) does
//   require.resolve('canvas')  → succeeds because the package dir exists
//   require('canvas')          → UNGUARDED, throws on the missing native binary
// That crashed jsdom environment init, so 5 entire test files silently never ran (their
// ~47 tests were missing from the totals) and the run exited non-zero.
//
// Removing the package lets jsdom's require.resolve fail into its own "canvas not installed"
// branch, exactly as it behaved before Fabric was added. Browser behavior is unaffected:
// the Design Studio bundles Fabric's browser build, which never touches native canvas.

import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'node_modules', 'canvas');

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
  console.log('[postinstall] removed optional native canvas (unused; breaks jsdom tests)');
}
