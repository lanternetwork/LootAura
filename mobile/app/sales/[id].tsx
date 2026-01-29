import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Linking, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://lootaura.com';

// Types matching the API response
type SaleItem = {
  id: string;
  sale_id: string;
  name: string;
  category?: string;
  condition?: string;
  price?: number;
  photo?: string;
  purchased: boolean;
  created_at?: string;
};

type OwnerProfile = {
  id: string;
  display_name?: string;
  username?: string;
  avatar_url?: string;
  created_at?: string;
};

type OwnerStats = {
  total_sales: number;
  avg_rating: number;
  ratings_count: number;
  last_sale_at: string | null;
};

type Sale = {
  id: string;
  title: string;
  description?: string;
  address?: string;
  city: string;
  state: string;
  zip_code?: string;
  lat?: number;
  lng?: number;
  date_start: string;
  time_start: string;
  date_end?: string;
  time_end?: string;
  price?: number;
  tags?: string[];
  cover_image_url?: string | null;
  images?: string[] | null;
  archived_at?: string | null;
  status: 'draft' | 'published' | 'archived' | 'active';
  privacy_mode: 'exact' | 'block_until_24h';
  is_featured: boolean;
  pricing_mode?: 'negotiable' | 'firm' | 'best_offer' | 'ask';
  created_at: string;
  updated_at: string;
  owner_profile: OwnerProfile | null;
  owner_stats: OwnerStats | null;
};

type SaleDetailResponse = {
  sale: Sale;
  items: SaleItem[];
};

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const safeAreaInsets = useSafeAreaInsets();

  // Normalize id parameter: handle string | string[] | undefined
  // Expo Router can return arrays for route params, so we normalize to string | null
  const saleId = Array.isArray(id) ? (id[0] || null) : (id || null);

  useEffect(() => {
    if (!saleId) {
      setError('Sale ID is required');
      setLoading(false);
      return;
    }

    fetchSaleData(saleId);
  }, [saleId]);

  const formatDate = (dateStr: string, timeStr?: string) => {
    try {
      const date = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(timeStr ? { hour: 'numeric', minute: '2-digit' } : {}),
      });
    } catch {
      return dateStr;
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return null;
    return `$${price.toFixed(2)}`;
  };

  // Safely get safe area insets - provide safe defaults
  const insets = {
    top: safeAreaInsets?.top ?? 0,
    bottom: safeAreaInsets?.bottom ?? 0,
    left: safeAreaInsets?.left ?? 0,
    right: safeAreaInsets?.right ?? 0,
  };

  const [isFavorited, setIsFavorited] = useState(false);

  const handleOpenMaps = () => {
    if (!sale?.lat || !sale?.lng) return;

    const address = sale.address
      ? `${sale.address}, ${sale.city}, ${sale.state}`
      : `${sale.city}, ${sale.state}`;

    // Open in default maps app
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(err => console.error('Error opening maps:', err));
  };

  const handleShare = async () => {
    try {
      const shareUrl = `${API_URL}/sales/${sale?.id}`;
      const shareText = sale?.city && sale?.state
        ? `${sale.city}, ${sale.state}`
        : undefined;

      await Share.share({
        message: shareText ? `${shareText} — ${sale?.title || 'Yard Sale'}\n${shareUrl}` : `${sale?.title || 'Yard Sale'}\n${shareUrl}`,
        url: shareUrl,
        title: sale?.title || 'Yard Sale',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleFavoriteToggle = () => {
    // TODO: Implement favorite API call
    setIsFavorited(!isFavorited);
  };

  const fetchSaleData = async (saleId: string) => {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/sales/${saleId}`, {
        signal: controller.signal,
      });
      
      // Clear timeout once we have a response (success or error)
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError('Sale not found');
        } else {
          setError('Failed to load sale details');
        }
        return;
      }

      // Validate response has content before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setLoading(false);
        setError('Invalid response format from server');
        return;
      }

      // Parse JSON with explicit error handling
      let data: SaleDetailResponse;
      try {
        const text = await response.text();
        if (!text || text.trim().length === 0) {
          setLoading(false);
          setError('Empty response from server');
          return;
        }
        data = JSON.parse(text);
      } catch (parseError) {
        setLoading(false);
        console.error('Error parsing JSON:', parseError);
        setError('Invalid data format received');
        return;
      }

      // Validate response structure before setting state
      if (!data || typeof data !== 'object') {
        setLoading(false);
        setError('Invalid response structure');
        return;
      }

      if (!data.sale) {
        setLoading(false);
        setError('Sale data missing from response');
        return;
      }

      // All validations passed - set data
      setSale(data.sale);
      setItems(data.items || []);
      setLoading(false);
    } catch (err: any) {
      // Clear timeout if still pending
      clearTimeout(timeoutId);
      
      // Ensure loading is always set to false
      setLoading(false);
      
      // Handle specific error types
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your internet connection and try again.');
      } else if (err.message?.includes('Network request failed') || err.message?.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection.');
      } else {
        console.error('Error fetching sale:', err);
        setError('Failed to load sale details. Please try again.');
      }
    }
  };

  // Loading state - render visible loading UI
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3A2268" />
          <Text style={styles.loadingText}>Loading sale details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success state - Full UI with items and footer
  if (sale) {
    // Content bottom padding: 80px (spacing above footer)
    // SafeAreaView handles bottom safe area inset automatically
    const contentBottomPadding = 80;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.mainContainer}>
          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: contentBottomPadding }
            ]}
            showsVerticalScrollIndicator={true}
          >
            {/* Header with back button */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </View>

            {/* Cover Image */}
            {sale.cover_image_url && (
              <Image
                source={{ uri: sale.cover_image_url }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            )}

            {/* Title */}
            <View style={styles.content}>
              <Text style={styles.title}>{sale.title}</Text>

              {/* Date/Time */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>When</Text>
                <Text style={styles.sectionText}>
                  {formatDate(sale.date_start, sale.time_start)}
                  {sale.date_end && sale.time_end && (
                    <> - {formatDate(sale.date_end, sale.time_end)}</>
                  )}
                </Text>
              </View>

              {/* Location */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Location</Text>
                {sale.address && (
                  <Text style={styles.sectionText}>{sale.address}</Text>
                )}
                <Text style={styles.sectionText}>
                  {sale.city}, {sale.state} {sale.zip_code || ''}
                </Text>
              </View>

              {/* Description */}
              {sale.description && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.sectionText}>{sale.description}</Text>
                </View>
              )}

              {/* Price */}
              {sale.price && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Price</Text>
                  <Text style={styles.sectionText}>{formatPrice(sale.price)}</Text>
                </View>
              )}

              {/* Tags/Categories */}
              {sale.tags && sale.tags.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Categories</Text>
                  <View style={styles.tagsContainer}>
                    {sale.tags.map((tag, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Items */}
              {items && items.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Items ({items.length})</Text>
                  {items.map((item) => (
                    <View key={item.id} style={styles.itemCard}>
                      {item.photo && (
                        <Image
                          source={{ uri: item.photo }}
                          style={styles.itemImage}
                          resizeMode="cover"
                        />
                      )}
                      <View style={styles.itemContent}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.category && (
                          <Text style={styles.itemCategory}>{item.category}</Text>
                        )}
                        {item.price && (
                          <Text style={styles.itemPrice}>{formatPrice(item.price)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Seller Info */}
              {sale.owner_profile && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Seller</Text>
                  <Text style={styles.sectionText}>
                    {sale.owner_profile.display_name || sale.owner_profile.username || 'Unknown'}
                  </Text>
                  {sale.owner_stats && sale.owner_stats.ratings_count > 0 && (
                    <Text style={styles.sellerStats}>
                      {sale.owner_stats.avg_rating.toFixed(1)} ⭐ ({sale.owner_stats.ratings_count} reviews)
                    </Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Fixed Footer - Sibling to ScrollView */}
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
  }

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
  loadingContainer: {
    flex: 1,
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
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  nativeMarker: {
    height: 40,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nativeMarkerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,        // pt-4 from web
    paddingHorizontal: 16,  // px-4 from web
    maxWidth: 640,          // max-w-screen-sm from web
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: '#3A2268',
    fontWeight: '600',
  },
  coverImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    color: '#4B5563',
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A2268',
  },
  sellerStats: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  // Fixed Footer Styles (matches web contract)
  footer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',  // bg-white/95
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',  // border-gray-200
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
