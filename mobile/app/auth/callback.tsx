import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);
  const lastProcessedUrlRef = useRef<string | null>(null);

  const processCallback = async (url: string) => {
    try {
      // Only accept lootaura://auth/callback URLs
      if (!url || !url.startsWith('lootaura://auth/callback')) {
        setError('Invalid callback URL');
        setStatus('error');
        return;
      }

      // Avoid processing the same URL twice
      if (lastProcessedUrlRef.current === url) {
        return;
      }
      lastProcessedUrlRef.current = url;

      console.log('[AUTH_CALLBACK] Processing OAuth callback deep link:', url);

      // Parse the deep link URL
      const deepLinkUrl = new URL(url);
      
      // Convert to web callback URL: https://lootaura.com/auth/callback + query + fragment
      const webCallbackUrl = new URL('https://lootaura.com/auth/callback');
      
      // Preserve all query parameters from deep link
      deepLinkUrl.searchParams.forEach((value, key) => {
        webCallbackUrl.searchParams.set(key, value);
      });
      
      // Preserve fragment if present
      if (deepLinkUrl.hash) {
        webCallbackUrl.hash = deepLinkUrl.hash;
      }

      const finalWebUrl = webCallbackUrl.toString();
      console.log('[AUTH_CALLBACK] Converting to web URL:', finalWebUrl);

      // Navigate back to main WebView screen with the web callback URL
      router.replace({
        pathname: '/',
        params: {
          authCallbackUrl: encodeURIComponent(finalWebUrl)
        }
      });
    } catch (e) {
      console.error('[AUTH_CALLBACK] Failed to process callback:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  // Handle cold start (app opens from closed state)
  useEffect(() => {
    const handleColdStart = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          await processCallback(url);
        }
      } catch (e) {
        console.error('[AUTH_CALLBACK] Failed to get initial URL:', e);
        setError('Failed to get callback URL');
        setStatus('error');
      }
    };

    handleColdStart();
  }, []);

  // Handle warm start (app already open)
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url && url.startsWith('lootaura://auth/callback')) {
        processCallback(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleRetry = () => {
    if (lastProcessedUrlRef.current) {
      setStatus('processing');
      setError(null);
      processCallback(lastProcessedUrlRef.current);
    } else {
      // If no URL stored, try to get it again
      Linking.getInitialURL().then((url) => {
        if (url) {
          processCallback(url);
        } else {
          setError('No callback URL available');
        }
      });
    }
  };

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to process authentication</Text>
        {error && <Text style={styles.errorDetail}>{error}</Text>}
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={handleRetry}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.backButtonText}>Return to App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3A2268" />
      <Text style={styles.statusText}>Returning to LootAura…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3A2268',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#6B7280',
    fontSize: 16,
  },
});
