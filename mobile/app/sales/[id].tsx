import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://lootaura.com';
const LOOTAURA_URL = 'https://lootaura.com';


export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const exitingRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  
  // Diagnostic HUD state (always visible)
  const [currentWebViewUrl, setCurrentWebViewUrl] = useState<string>('');
  const [lastRequestedUrl, setLastRequestedUrl] = useState<string>('');
  const [lastDecision, setLastDecision] = useState<string>('');

  // Normalize id parameter: handle string | string[] | undefined
  // Expo Router can return arrays for route params, so we normalize to string | null
  const saleId = Array.isArray(id) ? (id[0] || null) : (id || null);

  // WebView URL with nativeFooter parameter (keeps web header visible, hides web footer)
  const webViewUrl = saleId ? `${LOOTAURA_URL}/sales/${saleId}?nativeFooter=1` : null;

  // Reset exit tracking when saleId changes (new sale loaded)
  useEffect(() => {
    exitingRef.current = false;
    isInitialLoadRef.current = true;
  }, [saleId]);

  // Status bar is handled by Stack.Screen options in _layout.tsx



  // Handle WebView load events
  const handleLoadStart = () => {
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    // Fade out loading overlay before hiding
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setLoading(false);
      // Reset opacity for next load
      fadeAnim.setValue(1);
    });
  };

  const handleError = (syntheticEvent: any) => {
    setLoading(false);
    setError('Failed to load sale details');
    console.error('WebView error:', syntheticEvent.nativeEvent);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { statusCode } = syntheticEvent.nativeEvent;
    setLoading(false);
    if (statusCode === 404) {
      setError('Sale not found');
    } else {
      setError('Failed to load sale details');
    }
  };


  // Handle footer actions
  const handleOpenMaps = () => {
    // Extract address from WebView via postMessage or use saleId to construct URL
    // For now, we'll let the web page handle this via postMessage
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'navigate' }));
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = saleId ? `${API_URL}/sales/${saleId}` : API_URL;
      await Share.share({
        message: `Check out this yard sale!\n${shareUrl}`,
        url: shareUrl,
        title: 'Yard Sale',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleFavoriteToggle = () => {
    // Send message to WebView to toggle favorite
    // Do not optimistically update state - wait for web response
    // Web will handle auth gating and send back favoriteState
    if (webViewRef.current) {
      const message = { type: 'toggleFavorite' };
      if (__DEV__) {
        console.log('[NATIVE] Sending toggleFavorite message to WebView:', message);
      }
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  };

  // Helper function to exit to main shell with destination URL
  const exitToMainShell = (destinationPath: string, destinationSearch: string, reason: string) => {
    // Prevent duplicate exits
    if (exitingRef.current) {
      if (__DEV__) {
        console.log('[NATIVE] Already exiting, ignoring duplicate exit request:', reason);
      }
      return;
    }
    
    exitingRef.current = true;
    setLoading(false);
    
    const blockedUrl = `${destinationPath}${destinationSearch}`;
    const navigateToUrl = `/?navigateTo=${encodeURIComponent(blockedUrl)}`;
    setLastDecision(`${reason} -> ${navigateToUrl}`);
    
    if (__DEV__) {
      console.log('[NATIVE] Exiting to main shell:', { blockedUrl, navigateToUrl, reason });
    }
    
    router.replace(navigateToUrl);
  };

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (__DEV__) {
        console.log('[NATIVE] Received message from WebView:', message);
      }
      
      if (message && message.type === 'favoriteState') {
        // Update favorite state from web response
        const newFavorited = message.isFavorited ?? false;
        if (__DEV__) {
          console.log('[NATIVE] Updating favorite state from web:', { isFavorited: newFavorited });
        }
        setIsFavorited(newFavorited);
      } else if (message && message.type === 'NAVIGATE') {
        // Handle navigation request from web header
        const path = message.path || '/';
        if (__DEV__) {
          console.log('[NATIVE] Received NAVIGATE message from web:', { path });
        }
        // Clear loading state
        setLoading(false);
        // Navigate to main shell with the destination path
        const navigateToUrl = `/?navigateTo=${encodeURIComponent(path)}`;
        router.replace(navigateToUrl);
      } else if (message && message.type === 'ROUTE_CHANGE') {
        // Handle route change from injected JavaScript (SPA navigation detection)
        const { pathname, search, url } = message;
        
        if (__DEV__) {
          console.log('[NATIVE] Received ROUTE_CHANGE message:', { pathname, search, url });
        }
        
        // Skip exit logic on initial load (first route change is the sale page itself)
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          if (__DEV__) {
            console.log('[NATIVE] Ignoring ROUTE_CHANGE on initial load');
          }
          return;
        }
        
        // Prevent loops - if we're already exiting, don't process again
        if (exitingRef.current) {
          return;
        }
        
        try {
          // Parse URL to check hostname (safety check)
          const parsedUrl = new URL(url);
          const hostname = parsedUrl.hostname.toLowerCase();
          
          // Only handle same-origin navigation
          if (hostname !== 'lootaura.com' && !hostname.endsWith('.lootaura.com')) {
            if (__DEV__) {
              console.log('[NATIVE] Ignoring ROUTE_CHANGE for external URL:', hostname);
            }
            return; // External URL - ignore
          }
          
          // Check if still on the same sale (allow query param changes)
          const isSaleDetailPath = pathname.match(/^\/sales\/([^\/\?]+)/);
          if (isSaleDetailPath) {
            const matchedSaleId = isSaleDetailPath[1];
            if (matchedSaleId === saleId) {
              // Same sale, query might have changed - stay on screen
              if (__DEV__) {
                console.log('[NATIVE] ROUTE_CHANGE: Same sale, staying on screen');
              }
              return;
            }
            // Different sale ID - exit to index
            if (__DEV__) {
              console.log('[NATIVE] ROUTE_CHANGE: Different sale ID, exiting');
            }
          }
          
          // Navigation away from sale detail - exit to index with destination URL
          exitToMainShell(pathname, search || '', 'ROUTE_CHANGE');
        } catch (e) {
          // URL parsing failed - ignore (defensive)
          if (__DEV__) {
            console.warn('[NATIVE] Failed to parse URL in ROUTE_CHANGE handler:', e);
          }
        }
      }
    } catch (error) {
      // Ignore invalid messages
      if (__DEV__) {
        console.warn('[NATIVE] Failed to parse message from WebView:', error);
      }
    }
  };

  // Handle navigation interception - block navigation away from /sales/* paths
  // When header buttons are clicked, they should return to main shell with the destination URL
  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    setLastRequestedUrl(url);
    
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;
      
      // Only allow navigation within lootaura.com domain
      if (hostname !== 'lootaura.com' && !hostname.endsWith('.lootaura.com')) {
        // External links - open in system browser
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
          // Clear loading state before opening external link
          setLoading(false);
          const decision = 'BLOCK: external';
          const destination = 'Opened in system browser';
          setLastDecision(`${decision} -> ${destination}`);
          Linking.openURL(url);
        }
        return false; // Block external navigation in WebView
      }
      
      // Block navigation away from /sales/* paths
      // If user tries to navigate to a different path (e.g., /sales, /favorites, /sell/new),
      // block it and return to main shell with the destination URL
      const isSaleDetailPath = pathname.match(/^\/sales\/([^\/\?]+)/);
      if (isSaleDetailPath) {
        // Check if it's the same sale ID (allow query param changes)
        const matchedSaleId = isSaleDetailPath[1];
        if (matchedSaleId === saleId) {
          // Same sale detail page - allow navigation (e.g., query param changes)
          const decision = 'ALLOW: same-sale';
          setLastDecision(decision);
          return true;
        }
      }
      
      // Navigation away from sale detail - send URL to main shell and return to main shell
      // Use helper function to ensure consistent exit behavior
      exitToMainShell(pathname, parsedUrl.search, 'BLOCK: exit-to-index');
      return false; // Block navigation in WebView
    } catch (e) {
      // If URL parsing fails, allow navigation (defensive)
      const decision = 'ALLOW: parse-fail';
      setLastDecision(decision);
      return true;
    }
  };

  // Handle navigation state changes
  // This detects SPA navigation (pushState/replaceState) that onShouldStartLoadWithRequest misses
  const handleNavigationStateChange = (navState: any) => {
    const url = navState.url || '';
    setCurrentWebViewUrl(url);
    
    // Skip exit logic on initial load (first navigation is the sale page itself)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    // Prevent loops - if we're already exiting, don't process again
    if (exitingRef.current) {
      return;
    }
    
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;
      
      // Only handle same-origin navigation
      // External URLs are handled by onShouldStartLoadWithRequest
      if (hostname !== 'lootaura.com' && !hostname.endsWith('.lootaura.com')) {
        return; // External URL - ignore (onShouldStartLoadWithRequest handles it)
      }
      
      // Check if still on the same sale (allow query param changes)
      const isSaleDetailPath = pathname.match(/^\/sales\/([^\/\?]+)/);
      if (isSaleDetailPath) {
        const matchedSaleId = isSaleDetailPath[1];
        if (matchedSaleId === saleId) {
          // Same sale, query might have changed - stay on screen
          return;
        }
        // Different sale ID - exit to index
        // Note: Main shell blocks /sales/:id URLs, so we just exit to index
        // The web will handle opening the new sale via postMessage if needed
      }
      
      // Navigation away from sale detail - exit to index with destination URL
      // Use helper function to ensure consistent exit behavior
      exitToMainShell(pathname, parsedUrl.search, 'NAV_STATE: exit-to-index');
    } catch (e) {
      // URL parsing failed - ignore (defensive)
      if (__DEV__) {
        console.warn('[NATIVE] Failed to parse URL in handleNavigationStateChange:', e);
      }
    }
  };

  if (!saleId || !webViewUrl) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Invalid sale ID</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Diagnostic HUD - Always visible */}
      <View style={styles.diagnosticHud} pointerEvents="none">
        <Text style={styles.diagnosticText} numberOfLines={6}>
          sales/[id] | saleId={saleId || 'none'} | loading={loading ? 'T' : 'F'} | lastReq={lastRequestedUrl ? (lastRequestedUrl.length > 40 ? lastRequestedUrl.substring(0, 37) + '...' : lastRequestedUrl) : 'none'} | decision={lastDecision || 'none'} | webViewUrl={currentWebViewUrl ? (currentWebViewUrl.length > 40 ? currentWebViewUrl.substring(0, 37) + '...' : currentWebViewUrl) : 'none'}
        </Text>
      </View>
      
      <View style={styles.mainContainer}>
        {/* WebView Content - Full height, web header is rendered inside WebView */}
        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={styles.webview}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            onHttpError={handleHttpError}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            injectedJavaScript={`
              (function() {
                if (!window.ReactNativeWebView) return;
                
                const reportRouteChange = () => {
                  try {
                    const pathname = window.location.pathname;
                    const search = window.location.search;
                    const fullUrl = window.location.href;
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'ROUTE_CHANGE',
                      pathname: pathname,
                      search: search,
                      url: fullUrl
                    }));
                  } catch (e) {
                    // Silently fail if postMessage fails
                  }
                };
                
                // Report initial route after a short delay to ensure Next.js router is initialized
                setTimeout(reportRouteChange, 100);
                
                // Intercept history API to detect SPA navigation
                const originalPushState = history.pushState;
                const originalReplaceState = history.replaceState;
                
                history.pushState = function(...args) {
                  originalPushState.apply(history, args);
                  // Use setTimeout to ensure URL is updated before reporting
                  setTimeout(reportRouteChange, 0);
                };
                
                history.replaceState = function(...args) {
                  originalReplaceState.apply(history, args);
                  // Use setTimeout to ensure URL is updated before reporting
                  setTimeout(reportRouteChange, 0);
                };
                
                // Listen for browser back/forward navigation
                window.addEventListener('popstate', () => {
                  setTimeout(reportRouteChange, 0);
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
            thirdPartyCookiesEnabled={true}
            mixedContentMode="always"
          />
          {loading && (
            <Animated.View style={[styles.loadingContainer, { opacity: fadeAnim }]}>
              <ActivityIndicator size="large" color="#3A2268" />
              <Text style={styles.loadingText}>Loading sale details...</Text>
            </Animated.View>
          )}
        </View>

        {/* Fixed Footer - Matching web sticky action bar */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            {/* Navigate Button (Primary) - flex-1, purple-600 */}
            <TouchableOpacity
              style={styles.navigateButton}
              onPress={handleOpenMaps}
            >
              <Feather name="map-pin" size={20} color="#FFFFFF" style={styles.navigateButtonIcon} />
              <Text style={styles.navigateButtonText}>Navigate</Text>
            </TouchableOpacity>

            {/* Save Button (Secondary) - w-12 h-12, rounded-lg */}
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

            {/* Share Button (Secondary) - w-12 h-12, purple tint */}
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
            >
              <Feather name="share-2" size={20} color="#3A2268" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );

  // Error state
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Unable to load sale</Text>
        <Text style={styles.errorMessage}>{error || 'Sale not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3A2268',  // Purple background shows behind status bar area
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  // WebView Container
  webViewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 16,
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
  // Fixed Footer Styles (matches web sticky action bar exactly)
  footer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',  // bg-white/95
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',  // border-gray-200
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,  // px-4 from web
    paddingTop: 12,         // pt-3 from web
    paddingBottom: 12,      // pb-[calc(env(safe-area-inset-bottom,0px)+12px)] - SafeAreaView handles bottom inset
    maxWidth: 640,          // max-w-screen-sm from web
    alignSelf: 'center',
    width: '100%',
    gap: 12,                // gap-3 = 12px
  },
  navigateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9333EA',  // bg-purple-600
    paddingHorizontal: 16,      // px-4
    paddingVertical: 12,         // py-3
    borderRadius: 8,             // rounded-lg
    minHeight: 44,               // min-h-[44px]
  },
  navigateButtonIcon: {
    marginRight: 8,
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',  // font-medium
  },
  saveButton: {
    width: 48,   // w-12 = 48px
    height: 48,  // h-12 = 48px
    minHeight: 44,  // min-h-[44px]
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,  // rounded-lg
  },
  saveButtonActive: {
    backgroundColor: '#FEE2E2',  // bg-red-100
  },
  saveButtonInactive: {
    backgroundColor: '#F3F4F6',  // bg-gray-100
  },
  shareButton: {
    width: 48,   // w-12 = 48px
    height: 48,  // h-12 = 48px
    minHeight: 44,  // min-h-[44px]
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',  // bg-[rgba(147,51,234,0.15)]
    borderRadius: 8,  // rounded-lg
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
});
