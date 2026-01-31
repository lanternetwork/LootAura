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
  const [webViewReady, setWebViewReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ navigateTo?: string }>();
  const pendingNavigateToRef = useRef<string | null>(null);
  const lastHandledNavigateToRef = useRef<string | null>(null);

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
    
    // Set a timeout to hide loading after 15 seconds if page doesn't load
    // This prevents the loading state from getting stuck (reduced from 30s for better UX)
    loadTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 15000);
  };

  const handleLoadEnd = () => {
    // Clear timeout since page loaded successfully
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(false);
    // Mark WebView as ready after first successful load
    setWebViewReady(true);
    
    // Execute any pending navigation now that WebView is ready
    if (pendingNavigateToRef.current && webViewRef.current) {
      const pendingUrl = pendingNavigateToRef.current;
      pendingNavigateToRef.current = null;
      executeNavigation(pendingUrl);
    }
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
    
    // Guard against SPA transitions: if URL changed but no load event fired,
    // clear loading state after a short delay
    // This handles hash-based navigation and history.pushState() changes
    if (loading && navState.url) {
      // If we're in loading state but URL changed, it might be an SPA transition
      // Give it 500ms, then clear loading if still stuck
      setTimeout(() => {
        if (loading) {
          // Only clear if we're still loading and no actual page load occurred
          // This is a failsafe for SPA transitions
          setLoading(false);
          if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
          }
        }
      }, 500);
    }
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
        // Sanitize and validate URL before navigation
        const sanitizedUrl = sanitizeNavigationUrl(message.url);
        if (sanitizedUrl) {
          executeNavigation(sanitizedUrl);
        } else {
          console.warn('[NATIVE] Rejected unsafe navigation URL:', message.url);
        }
      }
    } catch (error) {
      console.warn('[NATIVE] Failed to parse message from WebView:', error);
    }
  };

  // Security: Sanitize navigation URLs to prevent injection attacks
  const sanitizeNavigationUrl = (url: string): string | null => {
    try {
      // Decode URL if needed
      const decodedUrl = decodeURIComponent(url);
      
      // Reject dangerous URL schemes (comprehensive list)
      const dangerousSchemes = [
        'javascript:',
        'data:',
        'vbscript:',
        'file:',
        'about:',
        'chrome:',
        'chrome-extension:',
        'moz-extension:',
        'ms-browser-extension:',
      ];
      
      const lowerUrl = decodedUrl.toLowerCase();
      if (dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme))) {
        return null;
      }
      
      // Reject absolute URLs with any protocol (http://, https://, etc.)
      if (decodedUrl.includes('://')) {
        return null;
      }
      
      // Reject URLs with hostnames (security: prevent open redirects)
      if (decodedUrl.includes('@') || decodedUrl.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]/)) {
        return null;
      }
      
      // Only allow relative paths starting with /
      if (!decodedUrl.startsWith('/')) {
        return null;
      }
      
      // Allowlist: only allow specific safe paths
      const allowedPaths = ['/auth', '/favorites', '/sell', '/sales', '/', '/u'];
      const pathMatch = decodedUrl.split('?')[0].split('#')[0]; // Get path without query/hash
      
      // Check if path starts with any allowed path
      const isAllowed = allowedPaths.some(allowed => {
        if (allowed === '/') {
          return pathMatch === '/';
        }
        return pathMatch.startsWith(allowed + '/') || pathMatch === allowed;
      });
      
      if (!isAllowed) {
        return null;
      }
      
      // Return sanitized relative path
      return decodedUrl;
    } catch (e) {
      // If URL parsing/decoding fails, reject it
      return null;
    }
  };

  // Execute navigation with proper loading lifecycle management
  const executeNavigation = (relativePath: string) => {
    if (!webViewRef.current) {
      return;
    }
    
    // Build full URL
    const fullUrl = `${LOOTAURA_URL}${relativePath}`;
    console.log('[NATIVE] Executing navigation to:', fullUrl);
    
    // Set loading state BEFORE injection (injectJavaScript may not trigger onLoadStart reliably)
    setLoading(true);
    setError(null);
    
    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    
    // Start timeout fallback (10-15s for better UX)
    loadTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      loadTimeoutRef.current = null;
    }, 12000); // 12 seconds
    
    // Escape backslashes first, then single quotes for safe injection
    const escapedUrl = fullUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webViewRef.current.injectJavaScript(`
      (function() {
        window.location.href = '${escapedUrl}';
      })();
      true; // Required for iOS
    `);
  };

  // Handle navigateTo query param from sale detail screen
  useEffect(() => {
    const navigateTo = searchParams.navigateTo;
    
    // Skip if no navigateTo param
    if (!navigateTo) {
      return;
    }
    
    // Skip if we already handled this exact value (prevent retrigger)
    if (navigateTo === lastHandledNavigateToRef.current) {
      return;
    }
    
    // Sanitize and validate URL
    const sanitizedUrl = sanitizeNavigationUrl(navigateTo);
    if (!sanitizedUrl) {
      console.warn('[NATIVE] Rejected unsafe navigateTo URL:', navigateTo);
      // Clear the navigateTo param to prevent retrigger
      router.replace('/');
      return;
    }
    
    // Mark as handled immediately to prevent retrigger
    lastHandledNavigateToRef.current = navigateTo;
    
    // Clear navigateTo param immediately (one-shot)
    router.replace('/');
    
    // If WebView is ready, execute immediately
    if (webViewReady && webViewRef.current) {
      executeNavigation(sanitizedUrl);
    } else {
      // Store as pending navigation - will execute after WebView is ready
      pendingNavigateToRef.current = sanitizedUrl;
    }
  }, [searchParams.navigateTo, webViewReady, router]);

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
        // Clear loading state since we're blocking (onLoadStart may have fired)
        setLoading(false);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
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
        // Clear loading state since we're blocking (onLoadStart may have fired)
        setLoading(false);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        return false; // Prevent WebView from loading external URLs
      }
    } catch (e) {
      // If URL parsing fails, check for non-HTTP protocols
      // Allow other protocols (mailto:, tel:, etc.) to open in system apps
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
        Linking.openURL(url);
        // Clear loading state since we're blocking (onLoadStart may have fired)
        setLoading(false);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        return false;
      }
      
      // For relative URLs or invalid URLs, allow them (they'll be resolved by WebView)
      return true;
    }
    
    // Allow other protocols (mailto:, tel:, etc.) to open in system apps
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
      Linking.openURL(url);
      // Clear loading state since we're blocking (onLoadStart may have fired)
      setLoading(false);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
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

