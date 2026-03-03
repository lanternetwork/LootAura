import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// Initialize Sentry only in production builds
// EXPO_PUBLIC_SENTRY_DSN is injected at build time via EAS env vars
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (!__DEV__ && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enableInExpoDevelopment: false,
    environment: 'production',
    // Privacy: Do not send PII
    sendDefaultPii: false,
    // Release tagging: com.lootaura.app@version+versionCode
    release: `com.lootaura.app@${Constants.expoConfig?.version || 'unknown'}+${Constants.expoConfig?.android?.versionCode || 'unknown'}`,
    // Performance monitoring
    tracesSampleRate: 0.1,
  });
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
        {/* Sale detail route disabled - now handled in main WebView with native footer overlay */}
        {/* <Stack.Screen 
          name="sales/[id]"
          options={{
            // Route-specific status bar options for sale detail
            statusBarStyle: 'light',
            statusBarColor: '#3A2268',
            statusBarTranslucent: false,
            statusBarHidden: false,
          }}
        /> */}
      </Stack>
    </SafeAreaProvider>
  );
}

