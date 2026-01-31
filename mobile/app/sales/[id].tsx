import { useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share, Animated, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://lootaura.com';
const LOOTAURA_URL = 'https://lootaura.com';
const NAV_DEBUG_ENABLED = process.env.EXPO_PUBLIC_NAV_DEBUG === '1';

// Navigation event types
type NavEventType = 'shouldStart' | 'navState' | 'loadStart' | 'loadEnd' | 'httpError' | 'error';

interface NavEvent {
  timestamp: string;
  eventType: NavEventType;
  url: string; // Full URL stored
  urlDisplay: string; // Truncated for display
  decision?: string;
  destination?: string;
  destinationDisplay?: string; // Truncated for display
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // Debug HUD state
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [currentWebViewUrl, setCurrentWebViewUrl] = useState<string>('');
  const navEventsRef = useRef<NavEvent[]>([]);
  const [navEvents, setNavEvents] = useState<NavEvent[]>([]);

  // Normalize id parameter: handle string | string[] | undefined
  // Expo Router can return arrays for route params, so we normalize to string | null
  const saleId = Array.isArray(id) ? (id[0] || null) : (id || null);

  // WebView URL with nativeFooter parameter (keeps web header visible, hides web footer)
  const webViewUrl = saleId ? `${LOOTAURA_URL}/sales/${saleId}?nativeFooter=1` : null;

  // Status bar is handled by Stack.Screen options in _layout.tsx

  // Debug: Log navigation event to ring buffer
  const logNavEvent = (eventType: NavEventType, url: string, decision?: string, destination?: string) => {
    if (!NAV_DEBUG_ENABLED) return;
    
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    
    const event: NavEvent = {
      timestamp,
      eventType,
      url, // Store full URL
      urlDisplay: url.length > 60 ? url.substring(0, 57) + '...' : url, // Truncated for display
      decision,
      destination, // Store full destination
      destinationDisplay: destination ? (destination.length > 60 ? destination.substring(0, 57) + '...' : destination) : undefined,
    };
    
    // Ring buffer: keep last 30 events
    navEventsRef.current = [event, ...navEventsRef.current].slice(0, 30);
    setNavEvents([...navEventsRef.current]);
  };

  // Debug: Generate log text
  const generateLogText = () => {
    const logText = navEventsRef.current.map(e => {
      let line = `[${e.timestamp}] ${e.eventType.toUpperCase()}: ${e.url}`;
      if (e.decision) line += ` | Decision: ${e.decision}`;
      if (e.destination) line += ` | Destination: ${e.destination}`;
      return line;
    }).join('\n');
    
    return `=== Navigation Debug Log ===
Screen: sales/[id]
SaleId: ${saleId}
WebViewUrl: ${webViewUrl}
Current WebView URL: ${currentWebViewUrl}
Loading: ${loading}
Error: ${error || 'none'}

=== Events (newest first) ===
${logText}`;
  };

  // Debug: Copy events (using Share as clipboard alternative)
  const copyEventsToClipboard = async () => {
    const fullLog = generateLogText();
    try {
      await Share.share({
        message: fullLog,
        title: 'Navigation Debug Log (Copy this text)',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share debug log');
    }
  };

  // Debug: Share events
  const shareEvents = async () => {
    const fullLog = generateLogText();
    try {
      await Share.share({
        message: fullLog,
        title: 'Navigation Debug Log',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share debug log');
    }
  };

  // Debug: Clear events
  const clearEvents = () => {
    navEventsRef.current = [];
    setNavEvents([]);
  };

  // Handle WebView load events
  const handleLoadStart = (syntheticEvent?: any) => {
    const url = syntheticEvent?.nativeEvent?.url || webViewUrl || '';
    logNavEvent('loadStart', url);
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = (syntheticEvent?: any) => {
    const url = syntheticEvent?.nativeEvent?.url || currentWebViewUrl || '';
    logNavEvent('loadEnd', url);
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
    const url = syntheticEvent?.nativeEvent?.url || currentWebViewUrl || '';
    const errorInfo = syntheticEvent?.nativeEvent?.description || 'Unknown error';
    logNavEvent('error', url, `Error: ${errorInfo}`);
    setLoading(false);
    setError('Failed to load sale details');
    console.error('WebView error:', syntheticEvent.nativeEvent);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { statusCode } = syntheticEvent.nativeEvent;
    const url = syntheticEvent?.nativeEvent?.url || currentWebViewUrl || '';
    logNavEvent('httpError', url, `HTTP ${statusCode}`);
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
          logNavEvent('shouldStart', url, 'BLOCK: external', 'Opened in system browser');
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
          logNavEvent('shouldStart', url, 'ALLOW: same-sale');
          return true;
        }
      }
      
      // Navigation away from sale detail - send URL to main shell and return to main shell
      // Clear loading state before navigation (same as onLoadEnd)
      setLoading(false);
      
      // Send message to main shell with the blocked URL (path + query)
      // Pass the URL as a query parameter that the index screen can read
      const blockedUrl = `${pathname}${parsedUrl.search}`;
      const navigateToUrl = `/?navigateTo=${encodeURIComponent(blockedUrl)}`;
      logNavEvent('shouldStart', url, 'BLOCK: exit-to-index', navigateToUrl);
      router.replace(navigateToUrl);
      return false; // Block navigation in WebView
    } catch (e) {
      // If URL parsing fails, allow navigation (defensive)
      logNavEvent('shouldStart', url, 'ALLOW: parse-fail');
      return true;
    }
  };

  // Handle navigation state changes
  const handleNavigationStateChange = (navState: any) => {
    const url = navState.url || '';
    setCurrentWebViewUrl(url);
    logNavEvent('navState', url);
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
      {/* Debug HUD */}
      {NAV_DEBUG_ENABLED && (
        <View style={styles.debugHud}>
          <TouchableOpacity
            style={styles.debugToggle}
            onPress={() => setDebugExpanded(!debugExpanded)}
          >
            <Text style={styles.debugToggleText}>Debug {debugExpanded ? '▼' : '▶'}</Text>
          </TouchableOpacity>
          
          {debugExpanded && (
            <View style={styles.debugContent}>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>Screen:</Text>
                  <Text style={styles.debugValue}>sales/[id]</Text>
                </View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>SaleId:</Text>
                  <Text style={styles.debugValue}>{saleId || 'none'}</Text>
                </View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>WebViewUrl:</Text>
                  <Text style={styles.debugValue} numberOfLines={2}>{webViewUrl || 'none'}</Text>
                </View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>Current WebView URL:</Text>
                  <Text style={styles.debugValue} numberOfLines={2}>{currentWebViewUrl || 'none'}</Text>
                </View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>Loading:</Text>
                  <Text style={styles.debugValue}>{loading ? 'true' : 'false'}</Text>
                </View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>Error:</Text>
                  <Text style={styles.debugValue}>{error || 'none'}</Text>
                </View>
                
                <View style={styles.debugDivider} />
                <Text style={styles.debugEventsTitle}>Events (newest first, max 30):</Text>
                
                {navEvents.length === 0 ? (
                  <Text style={styles.debugNoEvents}>No events yet</Text>
                ) : (
                  navEvents.map((event, index) => (
                    <View key={index} style={styles.debugEvent}>
                      <Text style={styles.debugEventTime}>{event.timestamp}</Text>
                      <Text style={styles.debugEventType}>{event.eventType.toUpperCase()}</Text>
                      <Text style={styles.debugEventUrl} numberOfLines={1}>{event.urlDisplay}</Text>
                      {event.decision && (
                        <Text style={styles.debugEventDecision}>Decision: {event.decision}</Text>
                      )}
                      {event.destinationDisplay && (
                        <Text style={styles.debugEventDestination} numberOfLines={1}>
                          Destination: {event.destinationDisplay}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
              
              <View style={styles.debugActions}>
                <TouchableOpacity style={styles.debugButton} onPress={copyEventsToClipboard}>
                  <Text style={styles.debugButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.debugButton} onPress={shareEvents}>
                  <Text style={styles.debugButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.debugButton} onPress={clearEvents}>
                  <Text style={styles.debugButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
      
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
});
