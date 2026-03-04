import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

export function getHideSplashOnce() {
  return hideSplashOnce;
}

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

    // Failsafe timeout: force hide after 4 seconds if APP_READY never arrives
    failsafeTimeout = setTimeout(() => {
      if (!isHidden) {
        if (__DEV__) {
          console.warn('[SPLASH] Failsafe timeout: hiding splash after 4s (APP_READY never received)');
        }
        hideSplash();
      }
    }, 4000);

    return () => {
      if (failsafeTimeout) {
        clearTimeout(failsafeTimeout);
      }
      hideSplashOnce = null;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingBottom: 0 },
          // Global status bar settings - purple background with light icons
          statusBarStyle: 'light',
          statusBarColor: '#3A2268',
          statusBarTranslucent: false,
          statusBarHidden: false,
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </SafeAreaProvider>
  );
}
