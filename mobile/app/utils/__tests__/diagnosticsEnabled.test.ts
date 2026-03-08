/**
 * Regression test: diagnostics flag parsing (shared by index and sales/[id])
 * and invariant that disabled values do not enable the HUD.
 */
import { isDiagnosticsEnabled } from '../diagnosticsEnabled';

const ENV_KEY = 'EXPO_PUBLIC_NATIVE_HUD';

function setEnv(value: string | undefined) {
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
}

describe('isDiagnosticsEnabled', () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    setEnv(original);
  });

  it('returns true for "1"', () => {
    setEnv('1');
    expect(isDiagnosticsEnabled()).toBe(true);
  });

  it('returns true for "true" (case-insensitive)', () => {
    setEnv('true');
    expect(isDiagnosticsEnabled()).toBe(true);
    setEnv('TRUE');
    expect(isDiagnosticsEnabled()).toBe(true);
    setEnv('True');
    expect(isDiagnosticsEnabled()).toBe(true);
  });

  it('returns false for "0"', () => {
    setEnv('0');
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('returns false for "false" (case-insensitive)', () => {
    setEnv('false');
    expect(isDiagnosticsEnabled()).toBe(false);
    setEnv('FALSE');
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('returns false for undefined', () => {
    setEnv(undefined);
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('returns false for empty string', () => {
    setEnv('');
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('returns false for "off" and other values', () => {
    setEnv('off');
    expect(isDiagnosticsEnabled()).toBe(false);
    setEnv('disabled');
    expect(isDiagnosticsEnabled()).toBe(false);
    setEnv('anything');
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('trims whitespace and then evaluates', () => {
    setEnv('  true  ');
    expect(isDiagnosticsEnabled()).toBe(true);
    setEnv('  false  ');
    expect(isDiagnosticsEnabled()).toBe(false);
  });
});
