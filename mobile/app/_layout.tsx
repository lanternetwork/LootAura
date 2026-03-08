import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import Constants from 'expo-constants';

// Guarded Sentry init: production only, when EXPO_PUBLIC_SENTRY_DSN is set.
{
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!__DEV__ && sentryDsn) {
    try {
      const Sentry = require('@sentry/react-native');
      const version = Constants.expoConfig?.version ?? 'unknown';
      const versionCode = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? 'unknown';
      const release = `com.lootaura.app@${version}+${versionCode}`;
      Sentry.init({
        dsn: sentryDsn,
        enableInExpoDevelopment: false,
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        environment: 'production',
        release,
      });
    } catch (err) {
      console.warn('[Sentry] Failed to initialize Sentry React Native', err);
    }
  }
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Global function to hide splash (called from index.tsx on APP_READY)
let hideSplashOnce: (() => void) | null = null;

/** Optional report callback for splash failsafe; set by index.tsx when diagnostics enabled. */
let splashFailsafeReport: ((messageType: string, payload: string) => void) | null = null;

export function getHideSplashOnce() {
  return hideSplashOnce;
}

/** Register callback to record SPLASH_FAILSAFE in diagnostics console when the failsafe timeout fires. Gated by index (only set when EXPO_PUBLIC_NATIVE_HUD enabled). */
export function setSplashFailsafeReport(callback: ((messageType: string, payload: string) => void) | null) {
  splashFailsafeReport = callback;
}

// Invariant: root Stack content background must match splash so the first native layer revealed after
// splash dismissal is purple (splash → root content → SafeAreaView → launch overlay → WebView).
// Do not remove contentStyle.backgroundColor or the handoff will flash window/default background.
const ROOT_CONTENT_BACKGROUND = '#3A2268';

export default function RootLayout() {
  useEffect(() => {
    let failsafeTimeout: NodeJS.Timeout | null = null;
    let isHidden = false;

    const hideSplash = async () => {
      if (isHidden) return; // Prevent redundant calls if already hidden

      try {
        await SplashScreen.hideAsync();
        isHidden = true;
        // Clear failsafe timeout if hideAsync succeeds
        if (failsafeTimeout) {
          clearTimeout(failsafeTimeout);
          failsafeTimeout = null;
        }
      } catch (error) {
        // Log error in development
        if (__DEV__) {
          console.error('[SPLASH] Failed to hide splash screen:', error);
        }
        // Don't set isHidden = true on error, allow failsafe to retry
      }
    };

    // Expose hideSplashOnce function for index.tsx to call on APP_READY
    hideSplashOnce = () => {
      hideSplash();
    };

    // Failsafe: catastrophic backstop only. Normal launches hide via APP_READY or native loading=false + delay in index.
    const FAILSAFE_MS = 8000;
    failsafeTimeout = setTimeout(() => {
      if (!isHidden) {
        if (splashFailsafeReport) {
          splashFailsafeReport(
            'SPLASH_FAILSAFE',
            JSON.stringify({
              timestamp: Date.now(),
              message: `Splash hidden by ${FAILSAFE_MS / 1000}s failsafe (APP_READY and native load path never completed)`,
            })
          );
        }
        if (__DEV__) {
          console.warn(`[SPLASH] Failsafe timeout: hiding splash after ${FAILSAFE_MS / 1000}s (APP_READY and native load path never completed)`);
        }
        hideSplash();
      }
    }, FAILSAFE_MS);

    return () => {
      if (failsafeTimeout) {
        clearTimeout(failsafeTimeout);
      }
      hideSplashOnce = null;
      splashFailsafeReport = null;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={ROOT_CONTENT_BACKGROUND} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingBottom: 0, backgroundColor: ROOT_CONTENT_BACKGROUND },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </SafeAreaProvider>
  );
}
