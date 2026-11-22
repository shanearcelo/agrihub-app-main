import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Heart, ShoppingCart } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { useCart } from "../../context/CartContext";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

type FavoriteProduct = {
  id: string;
  seller_id: string;
  title: string;
  unit: string;
  price_per_unit: number;
  image_url: string | null;
  available_stock: number;
  seller_name: string;
  listing_type: string;
};

export default function BuyerFavoritesScreen() {
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const router = useRouter();
  const { addToCart } = useCart();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setErrorMessage("");

      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!user) {
            router.replace("/auth/login");
            return;
          }

          const { data: favorites, error: favoriteError } = await supabase
            .from("buyer_favorites")
            .select("product_id")
            .eq("buyer_id", user.id)
            .order("created_at", { ascending: false });
          if (favoriteError) throw favoriteError;

          const productIds = (favorites || []).map(
            (favorite) => favorite.product_id,
          );
          if (productIds.length === 0) {
            if (active) setProducts([]);
            return;
          }

          const { data, error } = await supabase
            .from("products")
            .select(
              "id, seller_id, title, unit, price_per_unit, image_url, available_stock, seller_name, listing_type",
            )
            .in("id", productIds);
          if (error) throw error;

          const productsById = new Map(
            ((data || []) as FavoriteProduct[]).map((product) => [
              product.id,
              product,
            ]),
          );
          if (active) {
            setProducts(
              productIds
                .map((productId) => productsById.get(productId))
                .filter(
                  (product): product is FavoriteProduct =>
                    product !== undefined,
                ),
            );
          }
        } catch (error) {
          console.error("Could not load buyer favorites.", error);
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Could not load your favorites.",
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      })();

      return () => {
        active = false;
      };
    }, [router]),
  );

  async function removeFavorite(productId: string) {
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { error } = await supabase
        .from("buyer_favorites")
        .delete()
        .eq("buyer_id", user.id)
        .eq("product_id", productId);
      if (error) throw error;
      setProducts((current) =>
        current.filter((product) => product.id !== productId),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not remove favorite.",
      );
    }
  }

  function addProductToCart(product: FavoriteProduct) {
    const stock = Number(product.available_stock);
    if (!Number.isFinite(stock) || stock <= 0) {
      setCartMessage("");
      setErrorMessage("This harvest is currently unavailable.");
      return;
    }
    try {
      addToCart({
        harvestId: product.id,
        title: product.title,
        pricePerUnit: Number(product.price_per_unit),
        unit: product.unit,
        quantity: 1,
        availableStock: stock,
        sellerId: product.seller_id,
        sellerName: product.seller_name || "Campus Seller",
        imageUrl: product.image_url || undefined,
        listingType: product.listing_type,
      });
      setErrorMessage("");
      setAddedProductId(product.id);
      setCartMessage(`${product.title} was added to your cart.`);
    } catch (error) {
      console.error("Could not add favorite to cart.", error);
      setCartMessage("");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not add this harvest to your cart.",
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={21} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Favorites</Text>
          <Text style={styles.subtitle}>Harvests you have saved</Text>
        </View>
        <Heart size={20} color={Colors.danger} fill={Colors.danger} />
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      {cartMessage ? (
        <Text style={styles.success} accessibilityRole="status">
          {cartMessage}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <Heart size={32} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyText}>
            Tap the heart on a harvest to save it here.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            accessibilityRole="button"
            onPress={() => router.push("/buyer/search")}
          >
            <Text style={styles.browseText}>Browse harvests</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {products.map((product) => {
            const stock = Number(product.available_stock);
            const outOfStock = !Number.isFinite(stock) || stock <= 0;
            return (
              <View key={product.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.product}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${product.title}`}
                  onPress={() =>
                    router.push({
                      pathname: "/harvest/[id]",
                      params: { id: product.id },
                    })
                  }
                >
                  <Image
                    source={{
                      uri:
                        product.image_url ||
                        "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400",
                    }}
                    style={styles.image}
                  />
                  <View style={styles.productDetails}>
                    <Text style={styles.productTitle} numberOfLines={1}>
                      {product.title}
                    </Text>
                    <Text style={styles.seller} numberOfLines={1}>
                      {product.seller_name || "Campus Seller"}
                    </Text>
                    <Text style={styles.price}>
                      ₱{Number(product.price_per_unit).toFixed(2)} /{" "}
                      {product.unit}
                    </Text>
                    <Text style={styles.stock}>
                      {outOfStock
                        ? "Currently unavailable"
                        : `${product.available_stock} ${product.unit} available`}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.addButton, outOfStock && styles.disabled]}
                    accessibilityRole="button"
                    disabled={outOfStock}
                    onPress={() => addProductToCart(product)}
                  >
                    <ShoppingCart size={15} color="#FFF" />
                    <Text style={styles.addButtonText}>
                      {addedProductId === product.id
                        ? "Added to Cart"
                        : "Add to Cart"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${product.title} from favorites`}
                    onPress={() => void removeFavorite(product.id)}
                  >
                    <Heart
                      size={15}
                      color={Colors.danger}
                      fill={Colors.danger}
                    />
                    <Text style={styles.removeText}>Unfavorite</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 50 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  error: {
    color: Colors.danger,
    backgroundColor: "#FEE2E2",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
  },
  success: {
    color: "#166534",
    backgroundColor: "#DCFCE7",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
  },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 5,
  },
  browseButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    marginTop: 18,
  },
  browseText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  card: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  product: { flexDirection: "row", alignItems: "center", gap: 12 },
  image: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  productDetails: { flex: 1 },
  productTitle: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  seller: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  price: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  stock: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  addButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addButtonText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  removeButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  removeText: { color: Colors.danger, fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
