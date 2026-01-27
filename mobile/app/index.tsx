import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';

const LOOTAURA_URL = 'https://lootaura.com';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNativeNavigationRef = useRef<boolean>(false);
  const router = useRouter();

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
    
    // Check if this is a /sales/:id navigation that should be intercepted
    // This check happens deterministically based on URL, not timing
    if (url) {
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const pathname = parsedUrl.pathname;
        
        // If this is a sale detail page URL, skip loading overlay entirely
        // This prevents the race condition where onLoadStart fires before onShouldStartLoadWithRequest
        const saleDetailMatch = pathname.match(/^\/sales\/([^\/\?]+)/);
        if (saleDetailMatch && (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com'))) {
          // Don't set loading, don't start timeout - this navigation will be intercepted
          return;
        }
      } catch (e) {
        // If URL parsing fails, continue with normal loading behavior
      }
    }
    
    // Also check the flag as a fallback (for edge cases)
    if (isNativeNavigationRef.current) {
      // Clear the flag after a brief delay to allow navigation to complete
      setTimeout(() => {
        isNativeNavigationRef.current = false;
      }, 100);
      return; // Don't show loading overlay for intercepted native navigation
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

  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    
    try {
      // Parse URL to safely check hostname and path
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;
      
      // Intercept sale detail page navigation and route to native screen
      const saleDetailMatch = pathname.match(/^\/sales\/([^\/\?]+)/);
      if (saleDetailMatch && (hostname === 'lootaura.com' || hostname.endsWith('.lootaura.com'))) {
        const saleId = saleDetailMatch[1];
        // Set flag to prevent loading overlay from appearing
        // onLoadStart may fire even when we return false, so we need to skip it
        isNativeNavigationRef.current = true;
        // Navigate to native sale detail screen
        router.push(`/sales/${saleId}`);
        return false; // Prevent WebView from loading the URL
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
            injectedJavaScript={`
              (function() {
                try {
                  // a. Mark WebView context
                  if (document.body) {
                    document.body.classList.add('is-webview');
                  }
                  
                  // b. Remove footer compensation padding from mobile content wrapper
                  // Find divs with max-w-screen-sm class (mobile layout wrapper)
                  const mobileWrappers = document.querySelectorAll('.max-w-screen-sm');
                  mobileWrappers.forEach(function(wrapper) {
                    const classes = wrapper.className || '';
                    // Check if it's the mobile layout wrapper (has md:hidden or mobile-specific classes)
                    if (classes.includes('md:hidden') || classes.includes('mx-auto')) {
                      const computedStyle = window.getComputedStyle(wrapper);
                      const paddingBottom = computedStyle.paddingBottom;
                      // Remove padding if it's significant (likely the 80px footer compensation)
                      if (paddingBottom && paddingBottom !== '0px' && paddingBottom !== '0') {
                        wrapper.style.paddingBottom = '0px';
                      }
                    }
                  });
                  
                  // c. Hide the fixed bottom action bar
                  // Find all elements and check for fixed positioning at bottom
                  const allElements = document.querySelectorAll('div');
                  allElements.forEach(function(el) {
                    const computedStyle = window.getComputedStyle(el);
                    if (computedStyle.position === 'fixed') {
                      const bottom = computedStyle.bottom;
                      const zIndex = computedStyle.zIndex;
                      // Check if it's at the bottom (0px or 0) and has high z-index (z-40 = 40)
                      if ((bottom === '0px' || bottom === '0') && 
                          (zIndex === '40' || parseInt(zIndex) >= 40)) {
                        const classes = el.className || '';
                        const text = el.textContent || '';
                        // Check if it's the action bar (has backdrop-blur, contains buttons, or has action text)
                        if (classes.includes('backdrop-blur') || 
                            classes.includes('border-t') ||
                            text.includes('Navigate') || 
                            text.includes('Favorite') || 
                            text.includes('Share') ||
                            el.querySelector('button') || 
                            el.querySelector('[role="button"]') ||
                            el.querySelector('a[href*="maps"]')) {
                          el.style.display = 'none';
                        }
                      }
                    }
                  });
                } catch (e) {
                  // Silently fail - don't break page if injection fails
                }
                return true;
              })();
            `}
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

