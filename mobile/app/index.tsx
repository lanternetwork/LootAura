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
  
  // State-driven WebView navigation (replaces injectJavaScript)
  const [currentUrl, setCurrentUrl] = useState<string>(LOOTAURA_URL);
  
  // Diagnostic HUD state (always visible)
  const [currentWebViewUrl, setCurrentWebViewUrl] = useState<string>('');
  const [lastNavAction, setLastNavAction] = useState<string>('');
  const [lastNavigateMessage, setLastNavigateMessage] = useState<string>('');
  const [lastSanitizerDecision, setLastSanitizerDecision] = useState<string>('');
  const [sanitizerRejectionBanner, setSanitizerRejectionBanner] = useState<string>('');
  const [lastNavRequest, setLastNavRequest] = useState<string>('');
  const [lastNavSource, setLastNavSource] = useState<string>('');

  // Loader management helpers
  const startLoader = (reason: string) => {
    setLastNavAction(`startLoader: ${reason}`);
    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(true);
    setError(null);
    // Hard failsafe: always clear loading after 10 seconds
    loadTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      loadTimeoutRef.current = null;
      setLastNavAction(`loader timeout cleared (10s)`);
    }, 10000);
  };

  const stopLoader = (reason: string) => {
    setLastNavAction(`stopLoader: ${reason}`);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(false);
  };

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
    
    // Only start loader if WebView is not ready (initial load) OR if this is a real document load
    // After webViewReady, SPA transitions shouldn't trigger loading state
    if (!webViewReady) {
      startLoader(`onLoadStart: ${url || 'initial'}`);
    } else {
      // After ready, only show loader for real page loads (not SPA transitions)
      // We'll rely on navState.loading to determine if this is a real load
      setLastNavAction(`onLoadStart (ready): ${url || 'unknown'}`);
    }
  };

  const handleLoadEnd = () => {
    stopLoader('onLoadEnd');
    // Mark WebView as ready after first successful load
    setWebViewReady(true);
    
    // Execute any pending navigation now that WebView is ready
    if (pendingNavigateToRef.current && webViewRef.current) {
      const pendingUrl = pendingNavigateToRef.current;
      pendingNavigateToRef.current = null;
      executeNavigation(pendingUrl, 'navigateTo param (pending)');
    }
  };

  const handleLoad = () => {
    // Additional handler for when page fully loads
    // This is a fallback in case onLoadEnd doesn't fire
    stopLoader('onLoad');
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    stopLoader('onError');
    setError('Failed to load LootAura. Please check your internet connection.');
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
    const url = navState.url || '';
    setCurrentWebViewUrl(url);
    
    // CRITICAL: If navState.loading === false, force clear loading state
    // This is the most reliable way to detect when navigation is complete
    if (navState.loading === false) {
      stopLoader('navState.loading=false');
    }
    
    // Track navigation action when URL changes
    if (url && url !== currentWebViewUrl) {
      try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        if (pathname.startsWith('/sales') || pathname === '/') {
          setLastNavAction(`SPA nav to ${pathname}`);
        }
      } catch (e) {
        // Ignore URL parse errors
      }
    }
    
    // After webViewReady, only show loader for real document loads (navState.loading === true)
    // SPA transitions (pushState) won't have navState.loading === true, so don't start loader
    if (webViewReady && navState.loading === true && !loading) {
      startLoader(`navState.loading=true: ${url}`);
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
      } else if (message.type === 'NAVIGATE') {
        // Handle navigation request from sale detail screen or header
        // Header sends 'path', legacy code might send 'url'
        const path = message.path || message.url || '/';
        setLastNavigateMessage(`NAVIGATE: ${path}`);
        
        console.log('[NATIVE] Navigating WebView to:', path);
        // Sanitize and validate URL before navigation
        const sanitizedUrl = sanitizeNavigationUrl(path);
        if (sanitizedUrl) {
          setLastSanitizerDecision(`ALLOWED: ${sanitizedUrl}`);
          setSanitizerRejectionBanner(''); // Clear any rejection banner
          executeNavigation(sanitizedUrl, 'WebView message');
        } else {
          const rejectionReason = `REJECTED: ${path}`;
          setLastSanitizerDecision(rejectionReason);
          setSanitizerRejectionBanner(rejectionReason);
          console.warn('[NATIVE] Rejected unsafe navigation URL:', path);
          // Clear banner after 5 seconds
          setTimeout(() => setSanitizerRejectionBanner(''), 5000);
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
        setLastSanitizerDecision(`REJECTED: dangerous scheme`);
        return null;
      }
      
      // Reject absolute URLs with any protocol (http://, https://, etc.)
      if (decodedUrl.includes('://')) {
        setLastSanitizerDecision(`REJECTED: absolute URL`);
        return null;
      }
      
      // Reject URLs with hostnames (security: prevent open redirects)
      if (decodedUrl.includes('@') || decodedUrl.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]/)) {
        setLastSanitizerDecision(`REJECTED: hostname detected`);
        return null;
      }
      
      // Only allow relative paths starting with /
      if (!decodedUrl.startsWith('/')) {
        setLastSanitizerDecision(`REJECTED: not relative path`);
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
        setLastSanitizerDecision(`REJECTED: path not in allowlist (${pathMatch})`);
        return null;
      }
      
      // Return sanitized relative path
      setLastSanitizerDecision(`ALLOWED: ${decodedUrl}`);
      return decodedUrl;
    } catch (e) {
      // If URL parsing/decoding fails, reject it
      setLastSanitizerDecision(`REJECTED: parse error`);
      return null;
    }
  };

  // Execute navigation using state-driven WebView source (replaces injectJavaScript)
  const executeNavigation = (relativePath: string, source: string) => {
    // Build full URL
    const fullUrl = `${LOOTAURA_URL}${relativePath}`;
    console.log('[NATIVE] Executing navigation to:', fullUrl);
    setLastNavAction(`executeNavigation -> ${relativePath}`);
    setLastNavRequest(relativePath);
    setLastNavSource(source);
    
    // Use state-driven navigation - update currentUrl to trigger WebView reload
    // This properly triggers onLoadStart/onLoadEnd lifecycle events
    setCurrentUrl(fullUrl);
    startLoader(`executeNavigation: ${relativePath} (${source})`);
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
      const rejectionReason = `navigateTo REJECTED: ${navigateTo}`;
      console.warn('[NATIVE] Rejected unsafe navigateTo URL:', navigateTo);
      setLastNavAction(rejectionReason);
      setSanitizerRejectionBanner(rejectionReason);
      // Clear banner after 5 seconds
      setTimeout(() => setSanitizerRejectionBanner(''), 5000);
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
      executeNavigation(sanitizedUrl, 'navigateTo param');
    } else {
      setLastNavAction(`navigateTo pending: ${sanitizedUrl}`);
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
        stopLoader('blocked sale detail');
        return false;
      }
      
      // Allow navigation within lootaura.com domain (exact match or subdomain)
      // This prevents bypasses like lootaura.com.evil.com
      if (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com')) {
        return true;
      }
      
      // Open external HTTP/HTTPS links in system browser
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        setLastNavAction(`blocked external link: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
        Linking.openURL(url);
        stopLoader('blocked external link');
        return false; // Prevent WebView from loading external URLs
      }
    } catch (e) {
      // If URL parsing fails, check for non-HTTP protocols
      // Allow other protocols (mailto:, tel:, etc.) to open in system apps
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
        setLastNavAction(`blocked protocol link: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
        Linking.openURL(url);
        stopLoader('blocked protocol link');
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
      {/* Diagnostic HUD - Always visible */}
      <View style={styles.diagnosticHud} pointerEvents="none">
        <Text style={styles.diagnosticText} numberOfLines={12}>
          index | loading={loading ? 'T' : 'F'} | ready={webViewReady ? 'T' : 'F'} | currentUrl={currentUrl ? (currentUrl.length > 50 ? currentUrl.substring(0, 47) + '...' : currentUrl) : 'none'} | lastNavReq={lastNavRequest || 'none'} | lastNavSrc={lastNavSource || 'none'} | navigateTo={searchParams.navigateTo ? (searchParams.navigateTo.length > 30 ? searchParams.navigateTo.substring(0, 27) + '...' : searchParams.navigateTo) : 'none'} | lastNav={lastNavAction || 'none'} | navStateUrl={currentWebViewUrl ? (currentWebViewUrl.length > 40 ? currentWebViewUrl.substring(0, 37) + '...' : currentWebViewUrl) : 'none'} | lastNavMsg={lastNavigateMessage || 'none'} | sanitizer={lastSanitizerDecision || 'none'}
        </Text>
      </View>
      
      {/* Sanitizer Rejection Banner - Visible when navigation is rejected */}
      {sanitizerRejectionBanner ? (
        <View style={styles.rejectionBanner}>
          <Text style={styles.rejectionBannerText}>{sanitizerRejectionBanner}</Text>
        </View>
      ) : null}
      
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
            source={{ uri: currentUrl }}
            key={currentUrl}
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
  // Diagnostic HUD - Always visible
  diagnosticHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999, // Android
    backgroundColor: '#000000',
    padding: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#FF0000',
  },
  diagnosticText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  // Sanitizer Rejection Banner
  rejectionBanner: {
    position: 'absolute',
    top: 80, // Below diagnostic HUD
    left: 0,
    right: 0,
    zIndex: 9998,
    elevation: 9998, // Android
    backgroundColor: '#DC2626', // red-600
    padding: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#991B1B', // red-800
  },
  rejectionBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});

