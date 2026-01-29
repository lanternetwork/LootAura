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
  // DIAGNOSTIC STEP 2: Re-enable hooks only (no usage)
  // Testing if hooks themselves cause crash, even when results aren't used
  
  // Re-introduce all hooks
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const safeAreaInsets = useSafeAreaInsets();
  
  // Add useEffect (even if it does nothing)
  useEffect(() => {
    // Empty effect - just testing if useEffect causes crash
  }, []);
  
  // Keep JSX exactly the same - do not use any hook results
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }} edges={['top', 'bottom']}>
      <View />
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
