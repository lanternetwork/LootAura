import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  useEffect(() => {
    if (!id) {
      setError('Sale ID is required');
      setLoading(false);
      return;
    }

    fetchSaleData(id);
  }, [id]);

  const fetchSaleData = async (saleId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/sales/${saleId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Sale not found');
        } else {
          setError('Failed to load sale details');
        }
        setLoading(false);
        return;
      }

      const data: SaleDetailResponse = await response.json();
      setSale(data.sale);
      setItems(data.items || []);
    } catch (err) {
      console.error('Error fetching sale:', err);
      setError('Failed to load sale details. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleOpenMaps = () => {
    if (!sale?.lat || !sale?.lng) return;
    
    const address = sale.address 
      ? `${sale.address}, ${sale.city}, ${sale.state}`
      : `${sale.city}, ${sale.state}`;
    
    // Open in default maps app
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(err => console.error('Error opening maps:', err));
  };

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

  if (error || !sale) {
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
            {(sale.lat && sale.lng) && (
              <TouchableOpacity onPress={handleOpenMaps} style={styles.mapsButton}>
                <Text style={styles.mapsButtonText}>Open in Maps</Text>
              </TouchableOpacity>
            )}
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
          {items.length > 0 && (
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
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
  mapsButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#3A2268',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  mapsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
});
