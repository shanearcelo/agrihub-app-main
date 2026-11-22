// src/app/harvest/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Heart,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Star,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ScrollViewInstance,
} from "react-native";
import { Colors } from "../../constants/theme";
import { useCart } from "../../context/CartContext";
import { getCurrentUser } from "../../lib/authHelpers";
import { getProductImageUrls } from "../../lib/productImages";
import { supabase } from "../../lib/supabase";

export default function HarvestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [harvest, setHarvest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const galleryRef = useRef<ScrollViewInstance>(null);

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadHarvest() {
      if (!id) return;
      setLoading(true);
      try {
        const [{ data: product, error }, currentUser] = await Promise.all([
          supabase.from("products").select("*").eq("id", id).single(),
          getCurrentUser(),
        ]);
        if (error) throw error;
        if (!active) return;
        setHarvest(product);
        setQuantity(1);
        setGalleryIndex(0);

        if (currentUser && product) {
          const { data: fav } = await supabase
            .from("buyer_favorites")
            .select("id")
            .eq("buyer_id", currentUser.id)
            .eq("product_id", product.id)
            .maybeSingle();
          if (active) setIsFavorite(Boolean(fav));
        }
      } catch (err) {
        console.error("Failed to load harvest details:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadHarvest();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleToggleFavorite() {
    if (!harvest) return;
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      if (isFavorite) {
        await supabase
          .from("buyer_favorites")
          .delete()
          .eq("buyer_id", user.id)
          .eq("product_id", harvest.id);
        setIsFavorite(false);
      } else {
        await supabase
          .from("buyer_favorites")
          .insert({ buyer_id: user.id, product_id: harvest.id });
        setIsFavorite(true);
      }
    } catch (err) {
      console.error("Favorite toggle failed:", err);
    }
  }

  function handleAddToCart() {
    if (!harvest) return;
    const maxStock = Number(harvest.available_stock || 0);
    if (maxStock <= 0) {
      return showMessage("Out of Stock", "This harvest is currently sold out.");
    }
    addToCart({
      harvestId: harvest.id,
      title: harvest.title,
      pricePerUnit: Number(harvest.price_per_unit || 0),
      unit: harvest.unit || "kg",
      quantity,
      availableStock: maxStock,
      sellerId: harvest.seller_id,
      sellerName: harvest.seller_name || "Campus Agri Unit",
      imageUrl: harvest.image_url,
    });
    showMessage(
      "Added to Cart",
      `${quantity} ${harvest.unit} of ${harvest.title} added to your cart.`,
    );
  }

  function handleOrderNow() {
    if (!harvest) return;
    const maxStock = Number(harvest.available_stock || 0);
    if (maxStock <= 0) {
      return showMessage("Out of Stock", "This harvest is currently sold out.");
    }
    router.push({
      pathname: "/checkout",
      params: {
        directId: harvest.id,
        directTitle: harvest.title,
        directPrice: String(harvest.price_per_unit || 0),
        directUnit: harvest.unit || "kg",
        directQty: String(quantity),
        directSellerId: harvest.seller_id,
        directSellerName: harvest.seller_name || "Campus Agri Unit",
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!harvest) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyText}>Harvest listing not found.</Text>
        <TouchableOpacity
          style={styles.backFallbackBtn}
          onPress={() => router.replace("/buyer")}
        >
          <Text style={styles.backFallbackText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxStock = Math.max(0, Number(harvest.available_stock || 0));
  const venues: string[] = Array.isArray(harvest.pickup_venues)
    ? harvest.pickup_venues
    : [];
  const times: string[] = Array.isArray(harvest.pickup_times)
    ? harvest.pickup_times
    : [];
  const savedImageUrls = getProductImageUrls(harvest);
  const imageUrls =
    savedImageUrls.length > 0
      ? savedImageUrls
      : [
          "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=800",
        ];

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/buyer");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => void handleToggleFavorite()}
        >
          <Heart
            size={20}
            color={isFavorite ? "#EF4444" : Colors.text}
            fill={isFavorite ? "#EF4444" : "transparent"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.galleryWrap}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.galleryScroll}
            onLayout={(event) =>
              setGalleryWidth(event.nativeEvent.layout.width)
            }
            onMomentumScrollEnd={(event) => {
              if (galleryWidth > 0) {
                setGalleryIndex(
                  Math.min(
                    imageUrls.length - 1,
                    Math.round(
                      event.nativeEvent.contentOffset.x / galleryWidth,
                    ),
                  ),
                );
              }
            }}
          >
            {imageUrls.map((uri, index) => (
              <Image
                key={`${uri}-${index}`}
                source={{ uri }}
                style={[
                  styles.heroImg,
                  { width: galleryWidth || "100%" },
                ]}
                accessibilityLabel={`${harvest.title} photo ${index + 1}`}
              />
            ))}
          </ScrollView>
          {imageUrls.length > 1 && (
            <>
              <View style={styles.galleryCounter}>
                <Text style={styles.galleryCounterText}>
                  {galleryIndex + 1} / {imageUrls.length}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailRow}
              >
                {imageUrls.map((uri, index) => (
                  <TouchableOpacity
                    key={`${uri}-thumbnail-${index}`}
                    onPress={() => {
                      setGalleryIndex(index);
                      galleryRef.current?.scrollTo({
                        x: galleryWidth * index,
                        animated: true,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`View photo ${index + 1}`}
                    style={[
                      styles.thumbnailButton,
                      index === galleryIndex && styles.thumbnailButtonActive,
                    ]}
                  >
                    <Image source={{ uri }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        <View style={styles.bodyCard}>
          <View style={styles.badgeRow}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>
                {harvest.category || "Fresh Harvest"}
              </Text>
            </View>
            <View style={styles.stockPill}>
              <Text style={styles.stockText}>
                {maxStock} {harvest.unit} available
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{harvest.title}</Text>
          <Text style={styles.price}>
            ₱{Number(harvest.price_per_unit).toFixed(2)}{" "}
            <Text style={styles.unit}>/ {harvest.unit}</Text>
          </Text>

          <View style={styles.sellerRow}>
            <View style={styles.sellerIcon}>
              <Sprout size={16} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>
                {harvest.seller_name || "Campus Agri Unit"}
              </Text>
              <Text style={styles.sellerSub}>Verified ADSSU Grower</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Star size={12} color={Colors.accent} fill={Colors.accent} />
              <Text style={styles.ratingVal}>4.8</Text>
            </View>
          </View>

          {harvest.description ? (
            <View style={styles.infoBlock}>
              <Text style={styles.blockTitle}>About this Harvest</Text>
              <Text style={styles.descText}>{harvest.description}</Text>
            </View>
          ) : null}

          {venues.length > 0 && (
            <View style={styles.infoBlock}>
              <View style={styles.iconRow}>
                <MapPin size={14} color={Colors.primary} />
                <Text style={styles.blockTitle}>Pick-up Venues</Text>
              </View>
              <Text style={styles.descText}>{venues.join(" • ")}</Text>
            </View>
          )}

          {times.length > 0 && (
            <View style={styles.infoBlock}>
              <View style={styles.iconRow}>
                <Calendar size={14} color={Colors.primary} />
                <Text style={styles.blockTitle}>Pick-up Windows</Text>
              </View>
              <Text style={styles.descText}>{times.join(" • ")}</Text>
            </View>
          )}

          {/* Quantity Selector */}
          <View style={styles.qtyRow}>
            <Text style={styles.blockTitle}>Quantity ({harvest.unit})</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                <Minus size={16} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.qtyVal}>{quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                disabled={quantity >= maxStock}
              >
                <Plus size={16} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={handleAddToCart}
            disabled={maxStock <= 0}
          >
            <ShoppingCart size={18} color={Colors.primary} />
            <Text style={styles.cartBtnText}>Add to Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orderBtn, maxStock <= 0 && { opacity: 0.5 }]}
            onPress={handleOrderNow}
            disabled={maxStock <= 0}
          >
            <ShoppingBag size={18} color="#FFF" />
            <Text style={styles.orderBtnText}>
              Order Now • ₱
              {(Number(harvest.price_per_unit || 0) * quantity).toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.background,
  },
  emptyText: { fontSize: 15, fontWeight: "700", color: Colors.textMuted },
  backFallbackBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backFallbackText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  heroImg: {
    height: 240,
    backgroundColor: "#E5E7EB",
  },
  galleryWrap: { width: "100%" },
  galleryScroll: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
  },
  galleryCounter: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(17, 24, 39, 0.75)",
  },
  galleryCounterText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  thumbnailRow: { gap: 8, paddingTop: 9, paddingBottom: 2 },
  thumbnailButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  thumbnailButtonActive: { borderColor: Colors.primary },
  thumbnailImage: { width: 52, height: 52, backgroundColor: "#E5E7EB" },
  bodyCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: { fontSize: 11, fontWeight: "800", color: Colors.primary },
  stockPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockText: { fontSize: 11, fontWeight: "800", color: "#B45309" },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text },
  price: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 4,
  },
  unit: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sellerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  sellerName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  sellerSub: { fontSize: 11, color: Colors.textMuted },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingVal: { fontSize: 12, fontWeight: "800", color: Colors.text },
  infoBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  blockTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  descText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 19,
  },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  qtyVal: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    minWidth: 24,
    textAlign: "center",
  },
  footer: {
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
  },
  footerInner: {
    flexDirection: "row",
    gap: 10,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  cartBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  cartBtnText: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  orderBtn: {
    flex: 1.4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  orderBtnText: { fontSize: 14, fontWeight: "800", color: "#FFF" },
});
