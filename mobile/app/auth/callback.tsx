import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { validateAuthCallbackUrl } from '../utils/authCallbackValidator';

/**
 * OAuth callback route handler for Universal Links/App Links.
 * 
 * This route handles app-open via Universal/App Link (cold start).
 * It validates the callback URL and hands off to the WebView host.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the incoming URL from the Universal/App Link
        // This works for both cold start (app opened via link) and direct navigation
        const initialUrl = await Linking.getInitialURL();
        const url = initialUrl || null;

        // Validate the callback URL
        const validation = validateAuthCallbackUrl(url);

        if (!validation.isValid) {
          // Invalid URL - redirect to home
          console.log('[AUTH_CALLBACK] Invalid callback URL, redirecting to home');
          router.replace('/');
          return;
        }

        // Valid callback URL - hand off to WebView host
        // Encode the URL to pass it safely as a router param
        if (url) {
          const encodedUrl = encodeURIComponent(url);
          console.log('[AUTH_CALLBACK] Valid callback URL, handing off to WebView host', {
            origin: validation.origin,
            pathname: validation.pathname,
            hasCodeParam: validation.hasCodeParam,
          });

          router.replace({
            pathname: '/',
            params: { authCallbackUrl: encodedUrl },
          });
        } else {
          // No URL found - redirect to home
          router.replace('/');
        }
      } catch (error) {
        console.error('[AUTH_CALLBACK] Error handling callback:', error);
        // On error, redirect to home
        router.replace('/');
      }
    };

    handleCallback();
  }, [router]);

  // Minimal loading UI while handing off
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3A2268" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});
