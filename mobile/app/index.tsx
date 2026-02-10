import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler, Linking, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { validateAuthCallbackUrl } from './utils/authCallbackValidator';

const LOOTAURA_URL = 'https://lootaura.com';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [webViewReady, setWebViewReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ navigateTo?: string; authCallbackUrl?: string }>();
  const pendingNavigateToRef = useRef<string | null>(null);
  const lastHandledNavigateToRef = useRef<string | null>(null);
  
  // Dedupe refs for OAuth callback handling
  const lastAuthCallbackUrlRef = useRef<string | null>(null);
  const lastAuthCallbackAtRef = useRef<number | null>(null);
  
  // Get safe area insets - footer will handle bottom inset
  const insets = useSafeAreaInsets();
  
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
  
  // Route state from web (for footer overlay)
  const [routeState, setRouteState] = useState<{
    pathname: string;
    search: string;
    isSaleDetail: boolean;
    saleId: string | null;
    inAppFlag: boolean | null;
    hasRNBridge: boolean | null;
  }>({
    pathname: '/',
    search: '',
    isSaleDetail: false,
    saleId: null,
    inAppFlag: null,
    hasRNBridge: null,
  });
  
  // Footer state
  const [isFavorited, setIsFavorited] = useState(false);
  const [lastMessageReceived, setLastMessageReceived] = useState<string>('');
  
  // Layout diagnostics state
  const [layoutDiag, setLayoutDiag] = useState<{
    bottomEl: string | null;
    footerH: number | null;
    footerTop: number | null;
    footerBottom: number | null;
    pb: string | null;
    pbSelectorUsed: string | null;
    pbElDesc: string | null;
    pbMobileWrapper: string | null;
    pbOther: string | null;
    vh: number | null;
    y: number | null;
    sh: number | null;
    hasMobileContainer: boolean | null;
    hasEndEl: boolean | null;
    contentEnd: number | null;
    gapAfterContentPx: number | null;
    gapBelowViewportPx: number | null;
  }>({
    bottomEl: null,
    footerH: null,
    footerTop: null,
    footerBottom: null,
    pb: null,
    pbSelectorUsed: null,
    pbElDesc: null,
    pbMobileWrapper: null,
    pbOther: null,
    vh: null,
    y: null,
    sh: null,
    hasMobileContainer: null,
    hasEndEl: null,
    contentEnd: null,
    gapAfterContentPx: null,
    gapBelowViewportPx: null,
  });

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

  // Handle OAuth callback: Cold start handoff (via router params from auth/callback.tsx)
  useEffect(() => {
    const authCallbackUrl = searchParams.authCallbackUrl;
    if (!authCallbackUrl) {
      return;
    }

    try {
      // Decode the URL
      const decodedUrl = decodeURIComponent(authCallbackUrl);
      
      // Validate the callback URL
      const validation = validateAuthCallbackUrl(decodedUrl);
      
      if (!validation.isValid) {
        console.log('[OAUTH] Invalid callback URL from router params, ignoring', {
          origin: validation.origin,
          pathname: validation.pathname,
        });
        // Clear the param to prevent re-processing
        router.setParams({ authCallbackUrl: undefined });
        return;
      }

      // Dedupe check: same URL within 5 seconds
      const now = Date.now();
      if (
        lastAuthCallbackUrlRef.current === decodedUrl &&
        lastAuthCallbackAtRef.current !== null &&
        now - lastAuthCallbackAtRef.current < 5000
      ) {
        console.log('[OAUTH] Duplicate callback URL within 5s, ignoring');
        router.setParams({ authCallbackUrl: undefined });
        return;
      }

      // Check if WebView is already at this URL
      if (currentUrl === decodedUrl) {
        console.log('[OAUTH] WebView already at callback URL, ignoring');
        router.setParams({ authCallbackUrl: undefined });
        return;
      }

      // Valid callback - navigate WebView
      console.log('[OAUTH] Cold start: navigating WebView to callback URL', {
        origin: validation.origin,
        pathname: validation.pathname,
        hasCodeParam: validation.hasCodeParam,
      });

      setCurrentUrl(decodedUrl);
      startLoader('OAuth callback (cold start)');
      
      // Update dedupe refs
      lastAuthCallbackUrlRef.current = decodedUrl;
      lastAuthCallbackAtRef.current = now;
      
      // Clear the param to prevent re-processing
      router.setParams({ authCallbackUrl: undefined });
    } catch (error) {
      console.error('[OAUTH] Error handling cold start callback:', error);
      router.setParams({ authCallbackUrl: undefined });
    }
  }, [searchParams.authCallbackUrl, currentUrl, router]);

  // Handle OAuth callback: Warm start (Linking events when app is already running)
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) {
        return;
      }

      // Validate the callback URL
      const validation = validateAuthCallbackUrl(url);
      
      if (!validation.isValid) {
        // Not an OAuth callback URL - ignore
        return;
      }

      // Dedupe check: same URL within 5 seconds
      const now = Date.now();
      if (
        lastAuthCallbackUrlRef.current === url &&
        lastAuthCallbackAtRef.current !== null &&
        now - lastAuthCallbackAtRef.current < 5000
      ) {
        console.log('[OAUTH] Duplicate callback URL within 5s (warm start), ignoring');
        return;
      }

      // Check if WebView is already at this URL
      if (currentUrl === url) {
        console.log('[OAUTH] WebView already at callback URL (warm start), ignoring');
        return;
      }

      // Valid callback - navigate WebView
      console.log('[OAUTH] Warm start: navigating WebView to callback URL', {
        origin: validation.origin,
        pathname: validation.pathname,
        hasCodeParam: validation.hasCodeParam,
      });

      setCurrentUrl(url);
      startLoader('OAuth callback (warm start)');
      
      // Update dedupe refs
      lastAuthCallbackUrlRef.current = url;
      lastAuthCallbackAtRef.current = now;
    };

    // Handle cold start direct opens (if app opens directly to main screen via link)
    Linking.getInitialURL().then((url) => {
      // Only handle if it's a callback URL (not already handled by auth/callback.tsx)
      if (url && url.includes('/auth/callback')) {
        handleUrl(url);
      }
    });

    // Handle warm start (app already running)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [currentUrl]);

  const handleLoadStart = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    const url = nativeEvent?.url;
    
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
      const messageStr = JSON.stringify(message);
      setLastMessageReceived(messageStr.length > 100 ? messageStr.substring(0, 97) + '...' : messageStr);
      
      console.log('[NATIVE] Received message from WebView:', message);
      
      if (message.type === 'ROUTE_STATE') {
        // Route state update from web
        const { pathname, search, isSaleDetail, saleId, inAppFlag, hasRNBridge } = message;
        setRouteState({
          pathname: pathname || '/',
          search: search || '',
          isSaleDetail: isSaleDetail === true,
          saleId: saleId || null,
          inAppFlag: inAppFlag === true,
          hasRNBridge: hasRNBridge === true,
        });
        // Reset favorite state when leaving sale detail
        if (!isSaleDetail) {
          setIsFavorited(false);
        }
      } else if (message.type === 'favoriteState') {
        // Favorite state update from web
        setIsFavorited(message.isFavorited === true);
      } else if (message.type === 'LAYOUT_DIAG') {
        // Layout diagnostics from web
        setLayoutDiag({
          bottomEl: message.bottomEl || null,
          footerH: message.footerH !== undefined ? message.footerH : null,
          footerTop: message.footerTop !== undefined ? message.footerTop : null,
          footerBottom: message.footerBottom !== undefined ? message.footerBottom : null,
          pb: message.pb || null,
          pbSelectorUsed: message.pbSelectorUsed || null,
          pbElDesc: message.pbElDesc || null,
          pbMobileWrapper: message.pbMobileWrapper || null,
          pbOther: message.pbOther || null,
          vh: message.vh !== undefined ? message.vh : null,
          y: message.y !== undefined ? message.y : null,
          sh: message.sh !== undefined ? message.sh : null,
          hasMobileContainer: message.hasMobileContainer !== undefined ? message.hasMobileContainer : null,
          hasEndEl: message.hasEndEl !== undefined ? message.hasEndEl : null,
          contentEnd: message.contentEnd !== undefined ? message.contentEnd : null,
          gapAfterContentPx: message.gapAfterContentPx !== undefined ? message.gapAfterContentPx : null,
          gapBelowViewportPx: message.gapBelowViewportPx !== undefined ? message.gapBelowViewportPx : null,
        });
      } else if (message.type === 'NAVIGATE') {
        // Handle navigation request from header
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
  
  // Footer actions
  const handleFavoriteToggle = () => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'toggleFavorite' }));
    }
  };
  
  const handleShare = async () => {
    try {
      const shareUrl = routeState.saleId 
        ? `https://lootaura.com/sales/${routeState.saleId}` 
        : currentWebViewUrl || 'https://lootaura.com';
      await Share.share({
        message: `Check out this yard sale!\n${shareUrl}`,
        url: shareUrl,
        title: 'Yard Sale',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };
  
  const handleNavigate = () => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'navigate' }));
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

  // Note: navigateTo param flow removed - no longer needed with single WebView architecture

  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    
    try {
      // Parse URL to safely check hostname and path
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      
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
    <SafeAreaView style={styles.container} edges={['top']}>
          {/* Diagnostic HUD - Always visible */}
      <View style={styles.diagnosticHud} pointerEvents="none">
          <Text style={styles.diagnosticText} numberOfLines={20}>
            index | loading={loading ? 'T' : 'F'} | ready={webViewReady ? 'T' : 'F'} | pathname={routeState.pathname || 'none'} | isSaleDetail={routeState.isSaleDetail ? 'T' : 'F'} | saleId={routeState.saleId || 'none'} | footerVisible={routeState.isSaleDetail ? 'T' : 'F'} | isFavorited={isFavorited ? 'T' : 'F'} | bottomInset={insets.bottom} | parentBottomPadding={0} | footerBottomPadding={routeState.isSaleDetail ? insets.bottom : 0} | inAppFlag={routeState.inAppFlag === null ? '?' : (routeState.inAppFlag ? 'T' : 'F')} | hasRNBridge={routeState.hasRNBridge === null ? '?' : (routeState.hasRNBridge ? 'T' : 'F')} | currentUrl={currentUrl ? (currentUrl.length > 50 ? currentUrl.substring(0, 47) + '...' : currentUrl) : 'none'} | navStateUrl={currentWebViewUrl ? (currentWebViewUrl.length > 40 ? currentWebViewUrl.substring(0, 37) + '...' : currentWebViewUrl) : 'none'} | lastMsg={lastMessageReceived || 'none'} | bottomEl={layoutDiag.bottomEl ? (layoutDiag.bottomEl.length > 30 ? layoutDiag.bottomEl.substring(0, 27) + '...' : layoutDiag.bottomEl) : 'none'} | footerH={layoutDiag.footerH !== null ? layoutDiag.footerH.toFixed(0) : 'none'} | footerTop={layoutDiag.footerTop !== null ? layoutDiag.footerTop.toFixed(0) : 'none'} | pb={layoutDiag.pb ? (layoutDiag.pb.length > 20 ? layoutDiag.pb.substring(0, 17) + '...' : layoutDiag.pb) : 'none'} | pbSel={layoutDiag.pbSelectorUsed || 'none'} | pbMobile={layoutDiag.pbMobileWrapper ? (layoutDiag.pbMobileWrapper.length > 20 ? layoutDiag.pbMobileWrapper.substring(0, 17) + '...' : layoutDiag.pbMobileWrapper) : 'none'} | pbOther={layoutDiag.pbOther ? (layoutDiag.pbOther.length > 20 ? layoutDiag.pbOther.substring(0, 17) + '...' : layoutDiag.pbOther) : 'none'} | vh={layoutDiag.vh !== null ? layoutDiag.vh.toFixed(0) : 'none'} | y={layoutDiag.y !== null ? layoutDiag.y.toFixed(0) : 'none'} | sh={layoutDiag.sh !== null ? layoutDiag.sh.toFixed(0) : 'none'} | hasMobile={layoutDiag.hasMobileContainer !== null ? (layoutDiag.hasMobileContainer ? 'T' : 'F') : '?'} | hasEndEl={layoutDiag.hasEndEl !== null ? (layoutDiag.hasEndEl ? 'T' : 'F') : '?'} | contentEnd={layoutDiag.contentEnd !== null ? layoutDiag.contentEnd.toFixed(0) : 'none'} | gapAfter={layoutDiag.gapAfterContentPx !== null ? layoutDiag.gapAfterContentPx.toFixed(0) : 'none'} | gapBelow={layoutDiag.gapBelowViewportPx !== null ? layoutDiag.gapBelowViewportPx.toFixed(0) : 'none'}
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
            style={[
              styles.webview,
              routeState.isSaleDetail && styles.webviewWithFooter
            ]}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onLoad={handleLoad}
            onError={handleError}
            onHttpError={handleHttpError}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onMessage={handleMessage}
            injectedJavaScriptBeforeContentLoaded={`
              // Set deterministic flag before page scripts run
              // This ensures the flag is available immediately for web-side runtime checks
              window.__LOOTAURA_IN_APP = true;
              true; // Required for iOS
            `}
            injectedJavaScript={`
              (function() {
                if (!window.ReactNativeWebView) return;
                
                const reportLayoutDiagnostics = () => {
                  try {
                    const vh = window.innerHeight;
                    const y = window.scrollY;
                    const sh = document.documentElement.scrollHeight;
                    const viewportBottom = y + vh;
                    
                    // Select anchored elements using stable data attributes
                    let mobileContainer = null;
                    let endEl = null;
                    let hasMobileContainer = false;
                    let hasEndEl = false;
                    
                    try {
                      mobileContainer = document.querySelector('[data-mobile-sale-detail="true"]');
                      hasMobileContainer = mobileContainer !== null;
                    } catch (e) {
                      // querySelector may fail
                    }
                    
                    try {
                      // Find the unconditional end anchor using exact selector
                      endEl = document.querySelector('[data-sale-detail-content-end="true"]');
                      hasEndEl = endEl !== null;
                    } catch (e) {
                      // querySelector may fail
                    }
                    
                    // Compute deterministic gap metrics only when hasEndEl=true
                    let contentEnd = null;
                    let gapAfterContentPx = null;
                    let gapBelowViewportPx = null;
                    
                    if (hasEndEl && endEl) {
                      try {
                        const rect = endEl.getBoundingClientRect();
                        contentEnd = rect.bottom + y;
                        gapAfterContentPx = Math.max(0, sh - contentEnd);
                      } catch (e) {
                        // getBoundingClientRect may fail
                      }
                    }
                    
                    try {
                      gapBelowViewportPx = Math.max(0, sh - viewportBottom);
                    } catch (e) {
                      // Calculation may fail
                    }
                    
                    // Bottom hit-test element (element at x = 50% width, y = viewportHeight - small offset)
                    let bottomEl = null;
                    try {
                      const hitX = window.innerWidth / 2;
                      const hitY = vh - 10; // Small offset from bottom
                      const elementAtPoint = document.elementFromPoint(hitX, hitY);
                      if (elementAtPoint) {
                        const tag = elementAtPoint.tagName.toLowerCase();
                        const id = elementAtPoint.id || '';
                        const className = elementAtPoint.className || '';
                        const classNamePreview = typeof className === 'string' ? className.substring(0, 80) : '';
                        bottomEl = tag + (id ? '#' + id : '') + (classNamePreview ? '.' + classNamePreview : '');
                      }
                    } catch (e) {
                      // elementFromPoint may fail in some contexts
                    }
                    
                    // Footer presence + bounds
                    let footerH = null;
                    let footerTop = null;
                    let footerBottom = null;
                    try {
                      const footer = document.querySelector('footer') || document.querySelector('footer[role="contentinfo"]');
                      if (footer) {
                        const rect = footer.getBoundingClientRect();
                        footerH = rect.height;
                        footerTop = rect.top;
                        footerBottom = rect.bottom;
                      }
                    } catch (e) {
                      // getBoundingClientRect may fail
                    }
                    
                    // Main container padding-bottom with selector tracking
                    let pb = null;
                    let pbSelectorUsed = null;
                    let pbElDesc = null;
                    let pbMobileWrapper = null;
                    let pbOther = null;
                    
                    try {
                      if (mobileContainer) {
                        const computedStyle = window.getComputedStyle(mobileContainer);
                        pb = computedStyle.paddingBottom || null;
                        pbSelectorUsed = '[data-mobile-sale-detail="true"]';
                        // Build element descriptor: tag#id.class1.class2
                        const tag = mobileContainer.tagName.toLowerCase();
                        const id = mobileContainer.id || '';
                        const classList = mobileContainer.classList ? Array.from(mobileContainer.classList).slice(0, 2).join('.') : '';
                        pbElDesc = tag + (id ? '#' + id : '') + (classList ? '.' + classList : '');
                        pbMobileWrapper = pb;
                      }
                    } catch (e) {
                      // getComputedStyle may fail
                    }
                    
                    // Check for other wrapper (max-w-7xl or similar desktop wrapper) that might contribute padding on mobile
                    try {
                      const desktopWrapper = document.querySelector('.max-w-7xl');
                      if (desktopWrapper) {
                        const computedStyle = window.getComputedStyle(desktopWrapper);
                        pbOther = computedStyle.paddingBottom || null;
                      }
                    } catch (e) {
                      // querySelector/getComputedStyle may fail
                    }
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'LAYOUT_DIAG',
                      bottomEl: bottomEl,
                      footerH: footerH,
                      footerTop: footerTop,
                      footerBottom: footerBottom,
                      pb: pb,
                      pbSelectorUsed: pbSelectorUsed,
                      pbElDesc: pbElDesc,
                      pbMobileWrapper: pbMobileWrapper,
                      pbOther: pbOther,
                      vh: vh,
                      y: y,
                      sh: sh,
                      hasMobileContainer: hasMobileContainer,
                      hasEndEl: hasEndEl,
                      contentEnd: contentEnd,
                      gapAfterContentPx: gapAfterContentPx,
                      gapBelowViewportPx: gapBelowViewportPx
                    }));
                  } catch (e) {
                    // Silently fail if postMessage fails
                  }
                };
                
                const reportRouteState = () => {
                  try {
                    const pathname = window.location.pathname;
                    const search = window.location.search;
                    const saleDetailMatch = pathname.match(/^\\/sales\\/([^\\/\\?]+)/);
                    const isSaleDetail = !!saleDetailMatch;
                    const saleId = isSaleDetail ? saleDetailMatch[1] : null;
                    
                    // Diagnostic: Check if in-app flag is set
                    const inAppFlag = window.__LOOTAURA_IN_APP === true;
                    
                    // Diagnostic: Check if React Native WebView bridge exists
                    const hasRNBridge = typeof window.ReactNativeWebView !== 'undefined' && window.ReactNativeWebView !== null;
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'ROUTE_STATE',
                      pathname: pathname,
                      search: search,
                      isSaleDetail: isSaleDetail,
                      saleId: saleId,
                      inAppFlag: inAppFlag,
                      hasRNBridge: hasRNBridge
                    }));
                    
                    // Report layout diagnostics after route state with delay to allow DOM to settle
                    setTimeout(reportLayoutDiagnostics, 50);
                    // Also report after a longer delay to catch late-rendering content
                    setTimeout(reportLayoutDiagnostics, 350);
                  } catch (e) {
                    // Silently fail if postMessage fails
                  }
                };
                
                // Report initial route after a short delay to ensure Next.js router is initialized
                setTimeout(reportRouteState, 100);
                
                // Intercept history API to detect SPA navigation
                const originalPushState = history.pushState;
                const originalReplaceState = history.replaceState;
                
                history.pushState = function(...args) {
                  originalPushState.apply(history, args);
                  setTimeout(reportRouteState, 0);
                };
                
                history.replaceState = function(...args) {
                  originalReplaceState.apply(history, args);
                  setTimeout(reportRouteState, 0);
                };
                
                // Listen for browser back/forward navigation
                window.addEventListener('popstate', () => {
                  setTimeout(reportRouteState, 0);
                });
                
                // Also trigger diagnostics on scroll to catch bottom measurements
                let scrollTimeout = null;
                window.addEventListener('scroll', () => {
                  if (scrollTimeout) clearTimeout(scrollTimeout);
                  scrollTimeout = setTimeout(reportLayoutDiagnostics, 100);
                }, { passive: true });
              })();
              true; // Required for iOS
            `}
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
          
          {/* Native Footer Overlay - Show when on sale detail page AND page has loaded */}
          {routeState.isSaleDetail && !loading && (
            <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
              <View style={styles.footerContent}>
                {/* Navigate Button (Primary) */}
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={handleNavigate}
                >
                  <Feather name="map-pin" size={20} color="#FFFFFF" style={styles.navigateButtonIcon} />
                  <Text style={styles.navigateButtonText}>Navigate</Text>
                </TouchableOpacity>

                {/* Save Button (Secondary) */}
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    isFavorited ? styles.saveButtonActive : styles.saveButtonInactive
                  ]}
                  onPress={handleFavoriteToggle}
                >
                  <MaterialCommunityIcons 
                    name={isFavorited ? "heart" : "heart-outline"} 
                    size={20} 
                    color={isFavorited ? '#B91C1C' : '#374151'}
                  />
                </TouchableOpacity>

                {/* Share Button (Secondary) */}
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={handleShare}
                >
                  <Feather name="share-2" size={20} color="#3A2268" />
                </TouchableOpacity>
              </View>
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
  webviewWithFooter: {
    paddingBottom: 80, // Space for native footer overlay
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
  // Native Footer Overlay Styles
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF', // Solid white background to cover area behind footer
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    zIndex: 1000,
    elevation: 1000, // Android
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
    gap: 12,
  },
  navigateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9333EA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  navigateButtonIcon: {
    marginRight: 8,
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    width: 48,
    height: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  saveButtonActive: {
    backgroundColor: '#FEE2E2',
  },
  saveButtonInactive: {
    backgroundColor: '#F3F4F6',
  },
  shareButton: {
    width: 48,
    height: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderRadius: 8,
  },
});

