import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://lootaura.com';
const LOOTAURA_URL = 'https://lootaura.com';

// Types removed - using WebView to load web sale detail page

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const safeAreaInsets = useSafeAreaInsets();

  // Normalize id parameter: handle string | string[] | undefined
  // Expo Router can return arrays for route params, so we normalize to string | null
  const saleId = Array.isArray(id) ? (id[0] || null) : (id || null);

  // WebView URL with embed parameter
  const webViewUrl = saleId ? `${LOOTAURA_URL}/sales/${saleId}?embed=1` : null;

  // Explicitly restore Android system status bar on screen focus
  // This ensures status bar is visible regardless of prior WebView behavior
  // Uses react-native StatusBar imperative API to reset Android window flags
  useFocusEffect(() => {
    // Imperatively reset status bar state to ensure visibility
    // This overrides any fullscreen/immersive flags set by WebView
    StatusBar.setHidden(false);
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor('#3A2268', true); // Purple to match header
  });

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

  // Safely get safe area insets - provide safe defaults
  const insets = {
    top: safeAreaInsets?.top ?? 0,
    bottom: safeAreaInsets?.bottom ?? 0,
    left: safeAreaInsets?.left ?? 0,
    right: safeAreaInsets?.right ?? 0,
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

  // Handle header button actions
  const handleMapClick = () => {
    router.replace('/');
  };

  const handleHeartClick = () => {
    router.replace('/');
  };

  const handlePlusClick = () => {
    router.replace('/');
  };

  const handleSignInClick = () => {
    router.replace('/');
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
        {/* Native Header - Purple background matching web */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerContent}>
            {/* Logo and app name */}
            <TouchableOpacity onPress={handleMapClick} style={styles.logoContainer}>
              <Text style={styles.logoIcon}>📍</Text>
              <Text style={styles.logoText}>Loot Aura</Text>
            </TouchableOpacity>

            {/* Right side buttons */}
            <View style={styles.headerButtons}>
              <TouchableOpacity onPress={handleMapClick} style={styles.headerButton}>
                <Text style={styles.headerButtonIcon}>📍</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleHeartClick} style={styles.headerButton}>
                <Text style={styles.headerButtonIcon}>❤️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePlusClick} style={styles.headerButton}>
                <Text style={styles.headerButtonIcon}>➕</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSignInClick} style={styles.signInButton}>
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* WebView Content */}
        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={styles.webview}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            onHttpError={handleHttpError}
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

        {/* Fixed Footer - Sibling to WebView */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            {/* Navigate Button (Primary) */}
            <TouchableOpacity
              style={styles.navigateButton}
              onPress={handleOpenMaps}
            >
              <Text style={styles.navigateButtonIcon}>🗺️</Text>
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
              <Text style={[
                styles.saveButtonIcon,
                isFavorited ? styles.saveButtonIconActive : styles.saveButtonIconInactive
              ]}>
                {isFavorited ? '❤️' : '🤍'}
              </Text>
            </TouchableOpacity>

            {/* Share Button (Secondary) */}
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
    backgroundColor: '#3A2268', // Purple to match header
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  // Native Header Styles (matching web)
  header: {
    backgroundColor: '#3A2268',
    paddingBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 48,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    fontSize: 20,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIcon: {
    fontSize: 18,
  },
  signInButton: {
    backgroundColor: '#F4B63A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  // Fixed Footer Styles (matches web contract)
  footer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',  // bg-white/95
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',  // border-gray-200
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3, // Android shadow
  },
  footerContent: {
    flexDirection: 'row',
    paddingHorizontal: 16,  // px-4 from web
    paddingTop: 12,         // pt-3 from web
    maxWidth: 640,          // max-w-screen-sm from web
    alignSelf: 'center',
    width: '100%',
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
    marginRight: 12,             // gap-3 from web (12px gap)
  },
  navigateButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',  // font-medium
  },
  saveButton: {
    width: 48,   // w-12
    height: 48,  // h-12
    minHeight: 44,  // min-h-[44px]
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,  // rounded-lg
    marginRight: 12,  // gap-3 from web (12px gap)
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
    width: 48,   // w-12
    height: 48,  // h-12
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
