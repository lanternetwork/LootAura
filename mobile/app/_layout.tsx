import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    let fallbackTimeout: NodeJS.Timeout | null = null;
    let isHidden = false;

    const hideSplash = async () => {
      if (isHidden) return; // Prevent redundant calls if already hidden
      
      try {
        await SplashScreen.hideAsync();
        isHidden = true;
        // Clear fallback timeout if hideAsync succeeds
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
      } catch (error) {
        // Log error in development
        if (__DEV__) {
          console.error('[SPLASH] Failed to hide splash screen:', error);
        }
        // Don't set isHidden = true on error, allow fallback to retry
      }
    };

    // Attempt to hide splash immediately
    hideSplash();

    // Fallback timeout: force hide after 2 seconds if initial attempt fails or hangs
    fallbackTimeout = setTimeout(() => {
      if (!isHidden) {
        hideSplash();
      }
    }, 2000);

    return () => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#3A2268" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingBottom: 0 },
        }}
      >
        <Stack.Screen 
          name="index"
          options={{
            statusBarStyle: 'light',
            statusBarColor: '#3A2268',
            statusBarTranslucent: false,
            statusBarHidden: false,
          }}
        />
        <Stack.Screen 
          name="sales/[id]"
          options={{
            statusBarStyle: 'light',
            statusBarColor: '#3A2268',
            statusBarTranslucent: false,
            statusBarHidden: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

