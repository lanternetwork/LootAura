/**
 * Single source of truth for EXPO_PUBLIC_NATIVE_HUD diagnostics flag.
 * Used by index (Diagnostics Console) and sales/[id] (Diagnostic HUD) so they cannot drift.
 *
 * Enabled only for: '1' or 'true' (case-insensitive).
 * Disabled for: '0', 'false' (case-insensitive), empty string, undefined, and all other values.
 *
 * EXPO_PUBLIC_* is inlined at bundle time — set in .env or eas.json and restart Metro or rebuild.
 *
 * Regression: parsing contract above; add a Jest (or similar) test in __tests__ when test deps are in lockfile.
 */
export function isDiagnosticsEnabled(): boolean {
  const raw =
    typeof process.env.EXPO_PUBLIC_NATIVE_HUD === 'string'
      ? process.env.EXPO_PUBLIC_NATIVE_HUD.trim()
      : process.env.EXPO_PUBLIC_NATIVE_HUD;
  if (raw === '1') return true;
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return false;
}
