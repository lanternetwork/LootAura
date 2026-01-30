import { useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://lootaura.com';
const LOOTAURA_URL = 'https://lootaura.com';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // Normalize id parameter: handle string | string[] | undefined
  // Expo Router can return arrays for route params, so we normalize to string | null
  const saleId = Array.isArray(id) ? (id[0] || null) : (id || null);

  // WebView URL with nativeFooter parameter (keeps web header visible, hides web footer)
  const webViewUrl = saleId ? `${LOOTAURA_URL}/sales/${saleId}?nativeFooter=1` : null;

  // Status bar is handled by Stack.Screen options in _layout.tsx

  // Handle WebView load events
  const handleLoadStart = () => {
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    setLoading(false);
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
    setIsFavorited(!isFavorited);
    // Send message to WebView to toggle favorite
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'toggleFavorite' }));
    }
  };

  // Handle navigation interception - block navigation away from /sales/* paths
  // When header buttons are clicked, they should return to main shell
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
          Linking.openURL(url);
        }
        return false; // Block external navigation in WebView
      }
      
      // Block navigation away from /sales/* paths
      // If user tries to navigate to a different path (e.g., /sales, /favorites, /sell/new),
      // block it and return to main shell
      const isSaleDetailPath = pathname.match(/^\/sales\/([^\/\?]+)/);
      if (isSaleDetailPath) {
        // Check if it's the same sale ID (allow query param changes)
        const matchedSaleId = isSaleDetailPath[1];
        if (matchedSaleId === saleId) {
          // Same sale detail page - allow navigation (e.g., query param changes)
          return true;
        }
      }
      
      // Navigation away from sale detail - return to main shell
      router.replace('/');
      return false; // Block navigation in WebView
    } catch (e) {
      // If URL parsing fails, allow navigation (defensive)
      return true;
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
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3A2268" />
              <Text style={styles.loadingText}>Loading sale details...</Text>
            </View>
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
              <Text style={styles.navigateButtonIcon}>🗺️</Text>
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
              <Text style={[
                styles.saveButtonIcon,
                isFavorited ? styles.saveButtonIconActive : styles.saveButtonIconInactive
              ]}>
                {isFavorited ? '❤️' : '🤍'}
              </Text>
            </TouchableOpacity>

            {/* Share Button (Secondary) - w-12 h-12, purple tint */}
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
            >
              <Text style={styles.shareButtonIcon}>📤</Text>
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 20,
    marginRight: 8,
    color: '#FFFFFF',
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
  saveButtonIcon: {
    fontSize: 20,
  },
  saveButtonIconActive: {
    color: '#B91C1C',  // text-red-700
  },
  saveButtonIconInactive: {
    color: '#374151',  // text-gray-700
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
  shareButtonIcon: {
    fontSize: 20,
    color: '#3A2268',  // text-[#3A2268]
  },
});
