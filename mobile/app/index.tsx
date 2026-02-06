import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler, Linking, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const LOOTAURA_URL = 'https://lootaura.com/app/sales';

// Extract base origin from LOOTAURA_URL (parse once at module level)
// Fallback to hardcoded origin if parsing fails (defensive)
let LOOTAURA_ORIGIN: string;
try {
  LOOTAURA_ORIGIN = new URL(LOOTAURA_URL).origin;
} catch (e) {
  console.warn('[NATIVE] Failed to parse LOOTAURA_URL, using fallback origin:', e);
  LOOTAURA_ORIGIN = 'https://lootaura.com';
}

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
  
  // Get safe area insets - footer will handle bottom inset
  const insets = useSafeAreaInsets();
  
  // WebView URL state (used for tracking and fallback navigation)
  const [currentUrl, setCurrentUrl] = useState<string>(LOOTAURA_URL);
  
  // Diagnostic HUD state (always visible)
  const [currentWebViewUrl, setCurrentWebViewUrl] = useState<string>('');
  const [lastNavAction, setLastNavAction] = useState<string>('');
  const [lastNavigateMessage, setLastNavigateMessage] = useState<string>('');
  const [lastSanitizerDecision, setLastSanitizerDecision] = useState<string>('');
  const [sanitizerRejectionBanner, setSanitizerRejectionBanner] = useState<string>('');
  const [lastNavRequest, setLastNavRequest] = useState<string>('');
  const [lastNavSource, setLastNavSource] = useState<string>('');
  
  // Navigation and load diagnostics (HUD-visible)
  const [lastNavRequestedPath, setLastNavRequestedPath] = useState<string>('');
  const [lastNavFullUrl, setLastNavFullUrl] = useState<string>('');
  const [lastNavResolvedOrigin, setLastNavResolvedOrigin] = useState<string>('');
  const [lastNavOriginMatch, setLastNavOriginMatch] = useState<string>(''); // 'match' | 'mismatch' | 'unknown'
  const [lastNavBlockReason, setLastNavBlockReason] = useState<string>('');
  const [lastNavMethod, setLastNavMethod] = useState<string>(''); // 'explicit' | 'fallback' | 'deferred' | 'blocked'
  const [lastShouldStartRequestUrl, setLastShouldStartRequestUrl] = useState<string>('');
  const [lastShouldStartDecision, setLastShouldStartDecision] = useState<string>('');
  const [lastLoadStartUrl, setLastLoadStartUrl] = useState<string>('');
  const [lastLoadEndUrl, setLastLoadEndUrl] = useState<string>('');
  const [lastWebViewError, setLastWebViewError] = useState<string>('');
  const [lastHttpError, setLastHttpError] = useState<string>('');
  
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
    vh: number | null;
    y: number | null;
    sh: number | null;
    contentEnd: number | null;
    gapAfterContentPx: number | null;
    mobilePb: string | null;
    bodyPb: string | null;
    mainPb: string | null;
  }>({
    bottomEl: null,
    footerH: null,
    footerTop: null,
    footerBottom: null,
    pb: null,
    vh: null,
    y: null,
    sh: null,
    contentEnd: null,
    gapAfterContentPx: null,
    mobilePb: null,
    bodyPb: null,
    mainPb: null,
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

  // Handle deep links (excluding OAuth callback which is handled by Expo Router)
  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      try {
        // Ignore OAuth callback deep links - let Expo Router handle them via /auth/callback route
        if (url.startsWith('lootaura://auth/callback')) {
          console.log('[DEEP_LINK] Ignoring OAuth callback - handled by Expo Router');
          return;
        }

        // Handle other deep links here if needed in the future
        console.log('[DEEP_LINK] Unhandled deep link:', url);
      } catch (e) {
        console.error('[DEEP_LINK] Failed to handle deep link:', e);
      }
    };

    // Handle deep link when app is already open (warm start)
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle deep link when app opens from closed state (cold start)
    // Note: OAuth callback will be handled by Expo Router, so we skip it here
    Linking.getInitialURL().then((url) => {
      if (url && !url.startsWith('lootaura://auth/callback')) {
        handleDeepLink({ url });
      }
    }).catch((e) => {
      console.error('[DEEP_LINK] Failed to get initial URL:', e);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Handle auth callback URL from Expo Router (passed from /auth/callback route)
  useEffect(() => {
    if (searchParams.authCallbackUrl) {
      try {
        const decodedUrl = decodeURIComponent(searchParams.authCallbackUrl);
        
        // Security: Only accept https://lootaura.com/auth/callback URLs
        const parsedUrl = new URL(decodedUrl);
        if (parsedUrl.origin !== 'https://lootaura.com' || 
            !parsedUrl.pathname.startsWith('/auth/callback')) {
          console.error('[AUTH_CALLBACK] Invalid callback URL origin or path:', decodedUrl);
          // Clear param even on validation failure
          router.replace({ pathname: '/', params: {} });
          return;
        }

        console.log('[AUTH_CALLBACK] Loading web callback URL in WebView:', decodedUrl);
        setLastNavAction('auth-callback-from-route');
        
        // Load the web callback URL in WebView
        setCurrentUrl(decodedUrl);
        startLoader('auth-callback-from-route');
        
        // Clear the param deterministically by replacing route with empty params
        // This ensures the param is removed across all Expo Router versions
        router.replace({ pathname: '/', params: {} });
      } catch (e) {
        console.error('[AUTH_CALLBACK] Failed to process callback URL:', e);
        setLastNavAction(`auth-callback error: ${e instanceof Error ? e.message : 'unknown'}`);
        // Clear the param even on error to avoid retry loops
        router.replace({ pathname: '/', params: {} });
      }
    }
  }, [searchParams.authCallbackUrl, router]);

  const handleLoadStart = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    const url = nativeEvent?.url || '';
    
    // Update diagnostics
    setLastLoadStartUrl(url);
    
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

  const handleLoadEnd = (syntheticEvent?: any) => {
    const url = syntheticEvent?.nativeEvent?.url || currentUrl || '';
    
    // Update diagnostics
    setLastLoadEndUrl(url);
    
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
    const errorMsg = nativeEvent?.description || nativeEvent?.message || JSON.stringify(nativeEvent) || 'unknown error';
    console.warn('WebView error: ', nativeEvent);
    
    // Update diagnostics
    setLastWebViewError(errorMsg);
    
    stopLoader('onError');
    setError('Failed to load LootAura. Please check your internet connection.');
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      const statusCode = nativeEvent.statusCode || 'unknown';
      const url = nativeEvent?.url || currentUrl || 'unknown';
      const errorMsg = `HTTP ${statusCode}: ${url}`;
      
      // Update diagnostics
      setLastHttpError(errorMsg);
      
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
    
    // Route detection: Use navState.url as source of truth (more reliable than window.location.pathname)
    // Extract pathname and search from navState.url and update routeState
    if (url) {
      try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        const search = parsedUrl.search;
        
        // Match both /sales/[id] and /app/sales/[id] pathnames
        const saleDetailMatch = pathname.match(/^\/(?:app\/)?sales\/([^\/\?]+)/);
        const isSaleDetail = !!saleDetailMatch;
        const saleId = isSaleDetail ? saleDetailMatch[1] : null;
        
        // Update routeState from navState (source of truth)
        setRouteState(prev => {
          // Only update if pathname actually changed to avoid unnecessary re-renders
          if (prev.pathname !== pathname || prev.isSaleDetail !== isSaleDetail) {
            return {
              pathname: pathname,
              search: search,
              isSaleDetail: isSaleDetail,
              saleId: saleId,
              inAppFlag: prev.inAppFlag, // Keep existing value (set by injected JS)
              hasRNBridge: prev.hasRNBridge, // Keep existing value (set by injected JS)
            };
          }
          return prev;
        });
        
        // Reset favorite state when leaving sale detail
        if (!isSaleDetail) {
          setIsFavorited(false);
        }
        
        // Track navigation action when URL changes
        if (url !== currentWebViewUrl) {
          if (pathname.startsWith('/sales') || pathname.startsWith('/app/sales') || pathname === '/') {
            setLastNavAction(`SPA nav to ${pathname}`);
          }
        }
      } catch (e) {
        // Ignore URL parse errors
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[NATIVE] Failed to parse URL in handleNavigationStateChange:', e);
        }
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
          vh: message.vh !== undefined ? message.vh : null,
          y: message.y !== undefined ? message.y : null,
          sh: message.sh !== undefined ? message.sh : null,
          contentEnd: message.contentEnd !== undefined ? message.contentEnd : null,
          gapAfterContentPx: message.gapAfterContentPx !== undefined ? message.gapAfterContentPx : null,
          mobilePb: message.mobilePb || null,
          bodyPb: message.bodyPb || null,
          mainPb: message.mainPb || null,
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
      // Use canonical /sales/ path for share URLs (not /app/sales/)
      // Share links should always be canonical so they work everywhere
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
      
      // Origin-based policy: All relative paths are allowed (origin validation happens in executeNavigation)
      // Return sanitized relative path
      setLastSanitizerDecision(`ALLOWED: ${decodedUrl}`);
      return decodedUrl;
    } catch (e) {
      // If URL parsing/decoding fails, reject it
      setLastSanitizerDecision(`REJECTED: parse error`);
      return null;
    }
  };

  // Execute navigation using explicit WebView navigation (not state-driven remounting)
  const executeNavigation = (relativePath: string, source: string) => {
    // Defensive guard: ensure relativePath starts with /
    if (!relativePath.startsWith('/')) {
      console.warn('[NATIVE] Invalid relativePath (must start with /):', relativePath);
      setLastNavBlockReason('Invalid relativePath (must start with /)');
      setLastNavMethod('blocked');
      return;
    }
    
    // Use proper URL resolution (preserves query + hash automatically)
    // new URL(relativePath, base) resolves relativePath against base origin
    let fullUrl: string;
    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(relativePath, LOOTAURA_ORIGIN);
      fullUrl = resolvedUrl.href; // href includes query + hash
    } catch (e) {
      console.error('[NATIVE] Failed to resolve URL:', e);
      const errorMsg = `URL resolution failed: ${e instanceof Error ? e.message : 'unknown'}`;
      setLastWebViewError(errorMsg);
      setLastNavBlockReason(errorMsg);
      setLastNavMethod('blocked');
      // DO NOT call setCurrentUrl() - prevents blank page
      return;
    }
    
    // Origin-based policy: Validate origin matches LOOTAURA_ORIGIN
    const resolvedOrigin = resolvedUrl.origin;
    const originMatches = resolvedOrigin === LOOTAURA_ORIGIN || 
      resolvedUrl.hostname.toLowerCase().endsWith('.lootaura.com');
    
    // Update diagnostics before validation
    setLastNavRequestedPath(relativePath);
    setLastNavFullUrl(fullUrl);
    setLastNavResolvedOrigin(resolvedOrigin);
    setLastNavOriginMatch(originMatches ? 'match' : 'mismatch');
    
    // Check for dangerous schemes
    const dangerousSchemes = [
      'javascript:', 'data:', 'vbscript:', 'file:', 'about:',
      'chrome:', 'chrome-extension:', 'moz-extension:', 'ms-browser-extension:',
      'intent:', 'sms:', 'tel:', 'mailto:'
    ];
    const lowerUrl = fullUrl.toLowerCase();
    const hasDangerousScheme = dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme));
    
    // Validate origin and scheme before allowing navigation
    if (!originMatches) {
      const blockReason = `BLOCKED: wrong origin (${resolvedOrigin}, expected ${LOOTAURA_ORIGIN})`;
      console.warn('[NATIVE]', blockReason);
      setLastNavBlockReason(blockReason);
      setLastNavMethod('blocked');
      setLastNavAction(`blocked: ${blockReason}`);
      // DO NOT call setCurrentUrl() - prevents blank page
      return;
    }
    
    if (hasDangerousScheme) {
      const blockReason = `BLOCKED: dangerous scheme detected`;
      console.warn('[NATIVE]', blockReason);
      setLastNavBlockReason(blockReason);
      setLastNavMethod('blocked');
      setLastNavAction(`blocked: ${blockReason}`);
      // DO NOT call setCurrentUrl() - prevents blank page
      return;
    }
    
    // Only allow https protocol
    if (resolvedUrl.protocol !== 'https:') {
      const blockReason = `BLOCKED: non-HTTPS protocol (${resolvedUrl.protocol})`;
      console.warn('[NATIVE]', blockReason);
      setLastNavBlockReason(blockReason);
      setLastNavMethod('blocked');
      setLastNavAction(`blocked: ${blockReason}`);
      // DO NOT call setCurrentUrl() - prevents blank page
      return;
    }
    
    // Navigation is allowed - clear block reason and update state
    setLastNavBlockReason('');
    console.log('[NATIVE] Executing navigation to:', fullUrl);
    setLastNavAction(`executeNavigation -> ${relativePath}`);
    setLastNavRequest(relativePath);
    setLastNavSource(source);
    
    // Update state for tracking (only if navigation is allowed)
    setCurrentUrl(fullUrl);
    
    // Explicit navigation via WebView ref (preferred method - more reliable than remounting)
    if (webViewRef.current && webViewReady) {
      try {
        // Escape URL for safe injection (prevent XSS)
        // Order matters: escape backslashes first, then backticks (template literal delimiter), then quotes, then newlines
        const escapedUrl = fullUrl
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/`/g, '\\`')    // Escape backticks (template literal delimiter)
          .replace(/'/g, "\\'")     // Escape single quotes
          .replace(/"/g, '\\"')     // Escape double quotes
          .replace(/\n/g, '\\n')    // Escape newlines
          .replace(/\r/g, '\\r')    // Escape carriage returns
          .replace(/\u2028/g, '\\u2028') // Escape line separator
          .replace(/\u2029/g, '\\u2029'); // Escape paragraph separator
        
        // Use window.location.href for SPA navigation (Next.js will intercept)
        // If SPA navigation fails, window.location.replace provides fallback
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              var targetUrl = '${escapedUrl}';
              if (window.location.href !== targetUrl) {
                window.location.href = targetUrl;
              }
            } catch (e) {
              // Fallback: force full navigation if SPA navigation fails
              try {
                window.location.replace('${escapedUrl}');
              } catch (e2) {
                console.error('[NATIVE_NAV] Navigation failed:', e2);
              }
            }
            true; // Required for iOS
          })();
        `);
        
        setLastNavMethod('explicit');
        setLastNavAction(`explicit nav -> ${relativePath}`);
        console.log('[NATIVE] Explicit navigation injected:', fullUrl);
      } catch (e) {
        // Fallback to state-driven navigation if injection fails
        console.warn('[NATIVE] injectJavaScript failed, using fallback:', e);
        setLastNavMethod('fallback');
        setLastNavAction(`fallback nav -> ${relativePath}`);
        // State update + key remount will handle it (existing behavior)
      }
    } else {
      // WebView not ready, use state-driven as fallback
      console.warn('[NATIVE] WebView not ready, using deferred navigation');
      setLastNavMethod('deferred');
      setLastNavAction(`deferred nav -> ${relativePath}`);
      // State update + key remount will handle it when WebView is ready
    }
    
    startLoader(`executeNavigation: ${relativePath} (${source})`);
  };

  // Note: navigateTo param flow removed - no longer needed with single WebView architecture

  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    
    // Update diagnostics
    setLastShouldStartRequestUrl(url);
    
    try {
      // Parse URL to safely check origin and scheme
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Check for dangerous schemes (consistent with executeNavigation)
      const dangerousSchemes = [
        'javascript:', 'data:', 'vbscript:', 'file:', 'about:',
        'chrome:', 'chrome-extension:', 'moz-extension:', 'ms-browser-extension:',
        'intent:'
      ];
      const lowerUrl = url.toLowerCase();
      const hasDangerousScheme = dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme));
      
      if (hasDangerousScheme) {
        const decision = `BLOCKED: dangerous scheme`;
        setLastShouldStartDecision(decision);
        setLastNavAction(`blocked dangerous scheme: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
        stopLoader('blocked dangerous scheme');
        return false;
      }
      
      // Origin-based policy: Allow navigation within LOOTAURA_ORIGIN (exact match or subdomain)
      // This prevents bypasses like lootaura.com.evil.com
      const originMatches = origin === LOOTAURA_ORIGIN || hostname.endsWith('.lootaura.com');
      
      if (originMatches) {
        // Only allow https protocol
        if (parsedUrl.protocol !== 'https:') {
          const decision = `BLOCKED: non-HTTPS protocol (${parsedUrl.protocol})`;
          setLastShouldStartDecision(decision);
          setLastNavAction(`blocked non-HTTPS: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
          stopLoader('blocked non-HTTPS');
          return false;
        }
        
        const decision = `ALLOWED: origin match (${origin})`;
        setLastShouldStartDecision(decision);
        return true;
      }
      
      // Open external HTTP/HTTPS links in system browser
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        const decision = `BLOCKED: external link (${hostname}, origin: ${origin})`;
        setLastShouldStartDecision(decision);
        setLastNavAction(`blocked external link: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
        Linking.openURL(url);
        stopLoader('blocked external link');
        return false; // Prevent WebView from loading external URLs
      }
    } catch (e) {
      // If URL parsing fails, check for non-HTTP protocols
      // Allow other protocols (mailto:, tel:, etc.) to open in system apps
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
        const decision = `BLOCKED: protocol link (${url.split(':')[0]})`;
        setLastShouldStartDecision(decision);
        setLastNavAction(`blocked protocol link: ${url.length > 40 ? url.substring(0, 37) + '...' : url}`);
        Linking.openURL(url);
        stopLoader('blocked protocol link');
        return false;
      }
      
      // For relative URLs or invalid URLs, allow them (they'll be resolved by WebView)
      setLastShouldStartDecision('ALLOWED: relative/invalid URL (will resolve)');
      return true;
    }
    
    // Allow other protocols (mailto:, tel:, etc.) to open in system apps
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:')) {
      const decision = `BLOCKED: protocol link (${url.split(':')[0]})`;
      setLastShouldStartDecision(decision);
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
    setLastShouldStartDecision('ALLOWED: default (relative/data URI)');
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
          index | loading={loading ? 'T' : 'F'} | ready={webViewReady ? 'T' : 'F'} | pathname={routeState.pathname || 'none'} | isSaleDetail={routeState.isSaleDetail ? 'T' : 'F'} | saleId={routeState.saleId || 'none'} | footerVisible={routeState.isSaleDetail ? 'T' : 'F'} | isFavorited={isFavorited ? 'T' : 'F'} | bottomInset={insets.bottom} | parentBottomPadding={0} | footerBottomPadding={routeState.isSaleDetail ? insets.bottom : 0} | inAppFlag={routeState.inAppFlag === null ? '?' : (routeState.inAppFlag ? 'T' : 'F')} | hasRNBridge={routeState.hasRNBridge === null ? '?' : (routeState.hasRNBridge ? 'T' : 'F')} | currentUrl={currentUrl ? (currentUrl.length > 50 ? currentUrl.substring(0, 47) + '...' : currentUrl) : 'none'} | navStateUrl={currentWebViewUrl ? (currentWebViewUrl.length > 40 ? currentWebViewUrl.substring(0, 37) + '...' : currentWebViewUrl) : 'none'} | navReqPath={lastNavRequestedPath ? (lastNavRequestedPath.length > 30 ? lastNavRequestedPath.substring(0, 27) + '...' : lastNavRequestedPath) : 'none'} | navFullUrl={lastNavFullUrl ? (lastNavFullUrl.length > 40 ? lastNavFullUrl.substring(0, 37) + '...' : lastNavFullUrl) : 'none'} | navOrigin={lastNavResolvedOrigin ? (lastNavResolvedOrigin.length > 30 ? lastNavResolvedOrigin.substring(0, 27) + '...' : lastNavResolvedOrigin) : 'none'} | navOriginMatch={lastNavOriginMatch || 'none'} | navBlockReason={lastNavBlockReason ? (lastNavBlockReason.length > 30 ? lastNavBlockReason.substring(0, 27) + '...' : lastNavBlockReason) : 'none'} | navMethod={lastNavMethod || 'none'} | shouldStartUrl={lastShouldStartRequestUrl ? (lastShouldStartRequestUrl.length > 40 ? lastShouldStartRequestUrl.substring(0, 37) + '...' : lastShouldStartRequestUrl) : 'none'} | shouldStartDec={lastShouldStartDecision ? (lastShouldStartDecision.length > 30 ? lastShouldStartDecision.substring(0, 27) + '...' : lastShouldStartDecision) : 'none'} | loadStartUrl={lastLoadStartUrl ? (lastLoadStartUrl.length > 40 ? lastLoadStartUrl.substring(0, 37) + '...' : lastLoadStartUrl) : 'none'} | loadEndUrl={lastLoadEndUrl ? (lastLoadEndUrl.length > 40 ? lastLoadEndUrl.substring(0, 37) + '...' : lastLoadEndUrl) : 'none'} | webViewErr={lastWebViewError ? (lastWebViewError.length > 30 ? lastWebViewError.substring(0, 27) + '...' : lastWebViewError) : 'none'} | httpErr={lastHttpError ? (lastHttpError.length > 30 ? lastHttpError.substring(0, 27) + '...' : lastHttpError) : 'none'} | lastMsg={lastMessageReceived || 'none'} | bottomEl={layoutDiag.bottomEl ? (layoutDiag.bottomEl.length > 30 ? layoutDiag.bottomEl.substring(0, 27) + '...' : layoutDiag.bottomEl) : 'none'} | footerH={layoutDiag.footerH !== null ? layoutDiag.footerH.toFixed(0) : 'none'} | footerTop={layoutDiag.footerTop !== null ? layoutDiag.footerTop.toFixed(0) : 'none'} | pb={layoutDiag.pb ? (layoutDiag.pb.length > 20 ? layoutDiag.pb.substring(0, 17) + '...' : layoutDiag.pb) : 'none'} | vh={layoutDiag.vh !== null ? layoutDiag.vh.toFixed(0) : 'none'} | y={layoutDiag.y !== null ? layoutDiag.y.toFixed(0) : 'none'} | sh={layoutDiag.sh !== null ? layoutDiag.sh.toFixed(0) : 'none'} | gapAfterContent={layoutDiag.gapAfterContentPx !== null ? layoutDiag.gapAfterContentPx.toFixed(0) : 'none'} | contentEnd={layoutDiag.contentEnd !== null ? layoutDiag.contentEnd.toFixed(0) : 'none'} | mobilePb={layoutDiag.mobilePb ? (layoutDiag.mobilePb.length > 20 ? layoutDiag.mobilePb.substring(0, 17) + '...' : layoutDiag.mobilePb) : 'none'} | bodyPb={layoutDiag.bodyPb ? (layoutDiag.bodyPb.length > 20 ? layoutDiag.bodyPb.substring(0, 17) + '...' : layoutDiag.bodyPb) : 'none'} | mainPb={layoutDiag.mainPb ? (layoutDiag.mainPb.length > 20 ? layoutDiag.mainPb.substring(0, 17) + '...' : layoutDiag.mainPb) : 'none'}
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
                    
                    // Main container padding-bottom (legacy, kept for compatibility)
                    let pb = null;
                    try {
                      const mobileContainer = document.querySelector('[data-mobile-sale-detail="true"]');
                      if (mobileContainer) {
                        const computedStyle = window.getComputedStyle(mobileContainer);
                        pb = computedStyle.paddingBottom || null;
                      }
                    } catch (e) {
                      // getComputedStyle may fail
                    }
                    
                    // Content end: bottom of last element child in mobile container (document coordinates)
                    let contentEnd = null;
                    try {
                      const mobileContainer = document.querySelector('[data-mobile-sale-detail="true"]');
                      if (mobileContainer) {
                        // Find the last actual element child (skip text nodes)
                        let lastChild = mobileContainer.lastElementChild;
                        // If lastElementChild is null, try lastChild and walk back to find element
                        if (!lastChild) {
                          let node = mobileContainer.lastChild;
                          while (node && node.nodeType !== 1) { // Node.ELEMENT_NODE = 1
                            node = node.previousSibling;
                          }
                          lastChild = node;
                        }
                        if (lastChild) {
                          const rect = lastChild.getBoundingClientRect();
                          contentEnd = rect.bottom + y;
                        } else {
                          // If no children, use container bottom
                          const rect = mobileContainer.getBoundingClientRect();
                          contentEnd = rect.top + y;
                        }
                      }
                    } catch (e) {
                      // Measurement may fail
                    }
                    
                    // Gap after content: scrollHeight - contentEnd (definitive blank space metric)
                    const gapAfterContentPx = contentEnd !== null && sh !== null ? sh - contentEnd : null;
                    
                    // Mobile container padding-bottom (computed, in px) - always report value
                    let mobilePb = null;
                    try {
                      const mobileContainer = document.querySelector('[data-mobile-sale-detail="true"]');
                      if (mobileContainer) {
                        const computedStyle = window.getComputedStyle(mobileContainer);
                        const pbValue = computedStyle.paddingBottom;
                        // Always report the value, even if it's "0px" or a calc()
                        mobilePb = pbValue || '0px';
                      }
                    } catch (e) {
                      // getComputedStyle may fail
                    }
                    
                    // Body padding-bottom (computed, in px) - always report value
                    let bodyPb = null;
                    try {
                      const body = document.body;
                      if (body) {
                        const computedStyle = window.getComputedStyle(body);
                        const pbValue = computedStyle.paddingBottom;
                        // Always report the value, even if it's "0px"
                        bodyPb = pbValue || '0px';
                      }
                    } catch (e) {
                      // getComputedStyle may fail
                    }
                    
                    // Main element padding-bottom (computed, in px) - always report value if element exists
                    let mainPb = null;
                    try {
                      const main = document.querySelector('main');
                      if (main) {
                        const computedStyle = window.getComputedStyle(main);
                        const pbValue = computedStyle.paddingBottom;
                        // Always report the value, even if it's "0px"
                        mainPb = pbValue || '0px';
                      }
                    } catch (e) {
                      // getComputedStyle may fail
                    }
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'LAYOUT_DIAG',
                      bottomEl: bottomEl,
                      footerH: footerH,
                      footerTop: footerTop,
                      footerBottom: footerBottom,
                      pb: pb,
                      vh: vh,
                      y: y,
                      sh: sh,
                      contentEnd: contentEnd,
                      gapAfterContentPx: gapAfterContentPx,
                      mobilePb: mobilePb,
                      bodyPb: bodyPb,
                      mainPb: mainPb
                    }));
                  } catch (e) {
                    // Silently fail if postMessage fails
                  }
                };
                
                const reportRouteState = () => {
                  try {
                    const pathname = window.location.pathname;
                    const search = window.location.search;
                    // Match both /sales/[id] and /app/sales/[id] pathnames
                    const saleDetailMatch = pathname.match(/^\/(?:app\/)?sales\/([^\/\?]+)/);
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
                    
                    // Report layout diagnostics right after route state
                    setTimeout(reportLayoutDiagnostics, 50);
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

