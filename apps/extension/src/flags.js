/**
 * HawkEye-Cue — launch-safe feature flags (shared by popup + content scripts).
 *
 * TAKE_FLIGHT_ENABLED gates the "Take Flight" AUTOMATION (auto-scroll the Facebook feed +
 * auto-save matched leads hands-free). It is OFF by default for production until we
 * explicitly approve enabling it.
 *
 * IMPORTANT: this flag ONLY gates the automation. Manual lead detection (the hawk overlay),
 * manual lead saving, keyword scanning, and the separate Flock Flight Mode posting panel are
 * NOT affected and remain fully available.
 *
 * The feature and its code are intentionally preserved. To re-enable after approval, flip
 * TAKE_FLIGHT_ENABLED to true and reload/repackage the extension.
 */
(function () {
  var flags = { TAKE_FLIGHT_ENABLED: false };
  // Expose on whatever global exists (service worker, content script, or popup window).
  var g = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window : this;
  g.HawkEyeFlags = flags;
})();
