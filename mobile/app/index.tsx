import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';

const LOOTAURA_URL = 'https://lootaura.com';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ navigateTo?: string }>();

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior (exit app)
    });

    return () => backHandler.remove();
  }, [canGoBack]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  const handleLoadStart = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    const url = nativeEvent?.url;
    
    // Defensive guard: Block /sales/:id from ever triggering loading state
    // This prevents race conditions where onLoadStart fires before onShouldStartLoadWithRequest
    if (url) {
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const pathname = parsedUrl.pathname;
        
        // If this is a sale detail page URL, immediately return without setting loading state
        // The WebView must NEVER load sale detail pages - they are always native
        const saleDetailMatch = pathname.match(/^\/sales\/([^\/\?]+)/);
        if (saleDetailMatch && (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com'))) {
          // Do not set loading, do not start timeout - this navigation is blocked
          return;
        }
      } catch (e) {
        // If URL parsing fails, continue with normal loading behavior
      }
    }
    
    setLoading(true);
    setError(null);
    
    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    
    // Set a timeout to hide loading after 30 seconds if page doesn't load
    // This prevents the loading state from getting stuck
    loadTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 30000);
  };

  const handleLoadEnd = () => {
    // Clear timeout since page loaded successfully
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(false);
  };

  const handleLoad = () => {
    // Additional handler for when page fully loads
    // This is a fallback in case onLoadEnd doesn't fire
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(false);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    
    // Clear timeout on error
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    
    setError('Failed to load LootAura. Please check your internet connection.');
    setLoading(false);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      // Clear timeout on HTTP error
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      
      setError(`Unable to connect to LootAura (${nativeEvent.statusCode}). Please try again later.`);
      setLoading(false);
    }
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      console.log('[NATIVE] Received message from WebView:', message);
      
      if (message.type === 'OPEN_SALE' && message.saleId) {
        console.log('[NATIVE] Opening native sale detail screen for sale:', message.saleId);
        try {
          router.push(`/sales/${message.saleId}`);
        } catch (error) {
          console.error('[NATIVE] Failed to navigate to native sale detail screen:', error);
        }
      } else if (message.type === 'NAVIGATE' && message.url) {
        // Handle navigation request from sale detail screen
        console.log('[NATIVE] Navigating WebView to:', message.url);
        const fullUrl = message.url.startsWith('http') 
          ? message.url 
          : `${LOOTAURA_URL}${message.url}`;
        if (webViewRef.current) {
          // Escape backslashes first, then single quotes for safe injection
          const escapedUrl = fullUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          webViewRef.current.injectJavaScript(`
            (function() {
              window.location.href = '${escapedUrl}';
            })();
            true; // Required for iOS
          `);
        }
      }
    } catch (error) {
      console.warn('[NATIVE] Failed to parse message from WebView:', error);
    }
  };

  // Handle navigateTo query param from sale detail screen
  useEffect(() => {
    if (searchParams.navigateTo && webViewRef.current) {
      const navigateUrl = decodeURIComponent(searchParams.navigateTo);
      const fullUrl = navigateUrl.startsWith('http') 
        ? navigateUrl 
        : `${LOOTAURA_URL}${navigateUrl}`;
      
      console.log('[NATIVE] Navigating WebView from sale detail to:', fullUrl);
      
      // Navigate the WebView to the requested URL using injectJavaScript
      // This works because the WebView has a window object
      // Escape backslashes first, then single quotes for safe injection
      const escapedUrl = fullUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      webViewRef.current.injectJavaScript(`
        (function() {
          window.location.href = '${escapedUrl}';
        })();
        true; // Required for iOS
      `);
      
      // Note: We don't clear the query param here to avoid navigation loops
      // The query param will remain but won't cause re-navigation since we only
      // navigate when the param changes and webViewRef is available
    }
  }, [searchParams.navigateTo]);

  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    
    try {
      // Parse URL to safely check hostname and path
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;
      
      // HARD BLOCK: Sale detail pages are ALWAYS native - WebView NEVER navigates to /sales/:id
      // This check must happen FIRST, before any other navigation logic
      // No fallbacks, no exceptions - sale detail pages are native-only via postMessage
      const saleDetailMatch = pathname.match(/^\/sales\/([^\/\?]+)/);
      if (saleDetailMatch && (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com'))) {
        // Unconditionally block WebView from loading this URL
        // Navigation should happen via postMessage, not URL navigation
        console.warn('[NATIVE] Blocked WebView navigation to sale detail page. Use postMessage instead.');
        return false;
      }
      
      // Allow navigation within lootaura.com domain (exact match or subdomain)
      // This prevents bypasses like lootaura.com.evil.com
      if (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com')) {
        return true;
      }
      
      // Open external HTTP/HTTPS links in system browser
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        Linking.openURL(url);
        return false; // Prevent WebView from loading external URLs
      }
    } catch (e) {
      // If URL parsing fails, check for non-HTTP protocols
      // Allow other protocols (mailto:, tel:, etc.) to open in system apps
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
        Linking.openURL(url);
        return false;
      }
      
      // For relative URLs or invalid URLs, allow them (they'll be resolved by WebView)
      return true;
    }
    
    // Allow other protocols (mailto:, tel:, etc.) to open in system apps
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
      Linking.openURL(url);
      return false;
    }
    
    // Default: allow navigation (for relative URLs, data URIs, etc.)
    return true;
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Can't connect to LootAura right now</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            source={{ uri: LOOTAURA_URL }}
            style={styles.webview}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onLoad={handleLoad}
            onError={handleError}
            onHttpError={handleHttpError}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onMessage={handleMessage}
            startInLoadingState={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            // Allow third-party cookies for authentication
            thirdPartyCookiesEnabled={true}
            // Enable mixed content for development (if needed)
            mixedContentMode="always"
          />
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3A2268" />
              <Text style={styles.loadingText}>Loading LootAura...</Text>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3A2268',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#3A2268',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3A2268',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

