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
        // Get the incoming URL from Android App Link
        // Try multiple sources: router params, Linking.getInitialURL(), or current URL
        let incomingUrl: string | null = null;

        // First, try to get from router params (if passed via deep link)
        if (params.url) {
          incomingUrl = Array.isArray(params.url) ? params.url[0] : params.url;
        }

        // If not in params, try Linking.getInitialURL() for cold start
        if (!incomingUrl) {
          incomingUrl = await Linking.getInitialURL();
        }

        if (!incomingUrl) {
          console.log('[NATIVE_CALLBACK] No incoming URL found, redirecting to home');
          router.replace('/');
          return;
        }

        // Strict validation: must be https://lootaura.com/auth/native-callback
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(incomingUrl);
        } catch (e) {
          console.log('[NATIVE_CALLBACK] Invalid URL format, redirecting to home');
          router.replace('/');
          return;
        }

        // Validate protocol
        if (parsedUrl.protocol !== 'https:') {
          console.log('[NATIVE_CALLBACK] Invalid protocol, redirecting to home', {
            protocol: parsedUrl.protocol,
          });
          router.replace('/');
          return;
        }

        // Validate host
        if (parsedUrl.hostname !== 'lootaura.com') {
          console.log('[NATIVE_CALLBACK] Invalid hostname, redirecting to home', {
            hostname: parsedUrl.hostname,
          });
          router.replace('/');
          return;
        }

        // Validate pathname (exact match or starts with /auth/native-callback)
        const pathname = parsedUrl.pathname;
        if (pathname !== '/auth/native-callback' && !pathname.startsWith('/auth/native-callback/')) {
          console.log('[NATIVE_CALLBACK] Invalid pathname, redirecting to home', {
            pathname: pathname,
          });
          router.replace('/');
          return;
        }

        // Convert to real web callback URL: /auth/native-callback -> /auth/callback
        // Preserve all query parameters and fragment
        const webCallbackUrl = new URL('https://lootaura.com/auth/callback');
        
        // Copy all query parameters
        parsedUrl.searchParams.forEach((value, key) => {
          webCallbackUrl.searchParams.set(key, value);
        });

        // Preserve fragment if present
        if (parsedUrl.hash) {
          webCallbackUrl.hash = parsedUrl.hash;
        }

        const finalCallbackUrl = webCallbackUrl.toString();

        console.log('[NATIVE_CALLBACK] Converting native callback to web callback', {
          origin: parsedUrl.origin,
          pathname: pathname,
          hasQueryParams: parsedUrl.searchParams.toString().length > 0,
          hasFragment: !!parsedUrl.hash,
        });

        // Hand off to WebView host with the converted URL
        const encodedUrl = encodeURIComponent(finalCallbackUrl);
        router.replace({
          pathname: '/',
          params: { authCallbackUrl: encodedUrl },
        });
      } catch (error) {
        console.error('[NATIVE_CALLBACK] Error handling callback:', error);
        // On error, redirect to home
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
