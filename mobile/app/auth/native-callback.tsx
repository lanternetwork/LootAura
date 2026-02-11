import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';

/**
 * Android App Link capture screen for OAuth native callback.
 * 
 * This route handles app-open via Android App Link (cold start).
 * It captures /auth/native-callback URLs and converts them to /auth/callback
 * for handoff to the WebView host, preserving PKCE verifier storage.
 */
export default function NativeCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Deterministic URL retrieval: prioritize Linking.getInitialURL() for cold start
        // This is the most reliable source for Android App Links
        let incomingUrl: string | null = null;

        // Primary source: Linking.getInitialURL() for cold start App Link capture
        incomingUrl = await Linking.getInitialURL();

        // Secondary fallback: Expo Router params (if present)
        if (!incomingUrl && params.url) {
          incomingUrl = Array.isArray(params.url) ? params.url[0] : params.url;
        }

        // If both missing, route to / immediately
        if (!incomingUrl) {
          console.log('[NATIVE_CALLBACK] No incoming URL found, redirecting to home');
          router.replace('/');
          return;
        }

        // Strict validation + conversion in one try/catch block
        let parsedUrl: URL;
        let webCallbackUrl: URL;
        
        try {
          // Parse incoming URL
          parsedUrl = new URL(incomingUrl);

          // Validate protocol (must be https)
          if (parsedUrl.protocol !== 'https:') {
            console.log('[NATIVE_CALLBACK] Invalid protocol, redirecting to home');
            router.replace('/');
            return;
          }

          // Validate host (must be lootaura.com)
          if (parsedUrl.hostname !== 'lootaura.com') {
            console.log('[NATIVE_CALLBACK] Invalid host, redirecting to home');
            router.replace('/');
            return;
          }

          // Validate pathname (exact match: /auth/native-callback, tolerate trailing slash)
          const pathname = parsedUrl.pathname;
          const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
          if (normalizedPath !== '/auth/native-callback') {
            console.log('[NATIVE_CALLBACK] Invalid path, redirecting to home');
            router.replace('/');
            return;
          }

          // Build the web callback URL: /auth/native-callback -> /auth/callback
          // Preserve all query parameters and fragment
          webCallbackUrl = new URL('https://lootaura.com/auth/callback');
          
          // Copy all query parameters (preserve OAuth code, state, redirectTo, etc.)
          parsedUrl.searchParams.forEach((value, key) => {
            webCallbackUrl.searchParams.set(key, value);
          });

          // Preserve fragment if present
          if (parsedUrl.hash) {
            webCallbackUrl.hash = parsedUrl.hash;
          }
        } catch (e) {
          // URL parsing or validation failed
          console.log('[NATIVE_CALLBACK] Invalid URL format, redirecting to home');
          router.replace('/');
          return;
        }

        const finalCallbackUrl = webCallbackUrl.toString();

        // Log only safe information (no query params or sensitive data)
        console.log('[NATIVE_CALLBACK] Converting native callback to web callback', {
          host: parsedUrl.hostname,
          path: '/auth/native-callback',
          hasQueryParams: parsedUrl.searchParams.toString().length > 0,
          hasFragment: !!parsedUrl.hash,
        });

        // Safe handoff: encodeURIComponent must be inside try/catch
        let encodedUrl: string;
        try {
          encodedUrl = encodeURIComponent(finalCallbackUrl);
        } catch (e) {
          // Encoding failed - route to home
          console.log('[NATIVE_CALLBACK] URL encoding failed, redirecting to home');
          router.replace('/');
          return;
        }

        // Hand off to WebView host with the converted URL
        router.replace({
          pathname: '/',
          params: { authCallbackUrl: encodedUrl },
        });
      } catch (error) {
        // Top-level error handler - fail closed to home
        console.log('[NATIVE_CALLBACK] Error handling callback, redirecting to home');
        router.replace('/');
      }
    };

    handleCallback();
  }, [router, params]);

  // Minimal loading UI while converting and handing off
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
