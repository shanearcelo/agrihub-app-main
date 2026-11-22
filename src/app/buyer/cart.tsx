// src/app/buyer/cart.tsx
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react-native";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { useCart } from "../../context/CartContext";

export default function CartScreen() {
  const cart = useCart();
  const items = cart?.items ?? [];
  const {
    updateQuantity,
    removeFromCart,
    clearCart,
    totalAmount = 0,
  } = cart;
  const router = useRouter();

  // Group items by sellerName
  const grouped = items.reduce((acc: Record<string, typeof items>, item) => {
    const key = item.sellerId || item.sellerName || "Agri Dept - Unit 3";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sellerCount = Object.keys(grouped).length;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Cart</Text>
          <Text style={styles.headerSub}>
            {items.length} item{items.length === 1 ? "" : "s"} from{" "}
            {sellerCount} seller{sellerCount === 1 ? "" : "s"}
          </Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity style={styles.trashBtn} onPress={clearCart}>
            <Trash2 size={18} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyCircle}>
            <ShoppingBag size={36} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your campus cart is empty</Text>
          <Text style={styles.emptySub}>
            Browse fresh harvests from student farms and add them here.
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => router.push("/buyer")}
          >
            <Text style={styles.browseText}>Browse Harvests</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }}
          >
            {Object.entries(grouped).map(([sellerId, sellerItems]) => {
              const sellerName =
                sellerItems[0]?.sellerName || "Agri Dept - Unit 3";
              return (
                <View key={sellerId} style={styles.sellerGroup}>
                  <View style={styles.groupHeader}>
                    <View style={styles.unitBadge}>
                      <Text style={styles.unitBadgeText}>
                        {sellerName[0]?.toUpperCase() || "A"}
                      </Text>
                    </View>
                    <View style={styles.sellerNameRow}>
                      <Text style={styles.sellerTitle} numberOfLines={1}>
                        {sellerName}
                      </Text>
                      <BadgeCheck size={14} color="#2563EB" />
                    </View>
                    <View style={styles.pickupPill}>
                      <Text style={styles.pickupTag}>Pick-up: At checkout</Text>
                    </View>
                  </View>

                  {sellerItems.map((item) => (
                    <View key={item.harvestId} style={styles.itemRow}>
                      <Image
                        source={{
                          uri: item.imageUrl?.startsWith("http")
                            ? item.imageUrl
                            : "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200",
                        }}
                        style={styles.thumb}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.title}</Text>
                        <Text style={styles.itemUnit}>
                          ₱{item.pricePerUnit} / {item.unit} •{" "}
                          {item.listingType === "in_ground_preorder"
                            ? "Pre-order"
                            : "Ready now"}
                        </Text>
                        <Text style={styles.itemTotal}>
                          ₱{(item.pricePerUnit * item.quantity).toFixed(2)}
                        </Text>
                      </View>

                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() =>
                            item.quantity > 1
                              ? updateQuantity(item.harvestId, item.quantity - 1)
                              : removeFromCart(item.harvestId)
                          }
                        >
                          <Text style={styles.stepTxt}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyTxt}>
                          {item.quantity} {item.unit}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.stepBtn,
                            {
                              backgroundColor: Colors.primary,
                              opacity:
                                item.quantity >= item.availableStock ? 0.45 : 1,
                            },
                          ]}
                          disabled={item.quantity >= item.availableStock}
                          onPress={() =>
                            updateQuantity(item.harvestId, item.quantity + 1)
                          }
                        >
                          <Text style={[styles.stepTxt, { color: "#FFF" }]}>
                            +
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              );
                })}

            {/* Price Breakdown Card */}
            <View style={styles.summaryCard}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLbl}>
                  Subtotal ({items.length} item{items.length === 1 ? "" : "s"})
                </Text>
                <Text style={styles.sumVal}>₱{totalAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLbl}>Platform fee</Text>
                <Text style={styles.sumVal}>₱0.00</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLbl}>Pre-order reservation</Text>
                <Text style={styles.sumVal}>₱0.00</Text>
              </View>
              <View style={[styles.sumRow, styles.totalRow]}>
                <Text style={styles.totalLbl}>Total</Text>
                <Text style={styles.totalVal}>₱{totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Checkout Bar */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => router.push("/checkout")}
            >
              <Text style={styles.checkoutText}>
                → Proceed to Checkout • ₱{totalAmount.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 52 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  emptyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginTop: 14 },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  browseBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseText: { color: "#FFF", fontWeight: "700" },
  sellerGroup: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unitBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  unitBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  sellerNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sellerTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  pickupPill: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pickupTag: { fontSize: 10, color: Colors.textMuted, fontWeight: "700" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
  },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  itemName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  itemUnit: { fontSize: 11, color: Colors.textMuted },
  itemTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 2,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepTxt: { fontSize: 15, fontWeight: "800" },
  qtyTxt: { fontSize: 12, fontWeight: "700" },
  summaryCard: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  sumLbl: { fontSize: 12, color: Colors.textMuted },
  sumVal: { fontSize: 12, fontWeight: "700", color: Colors.text },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
    paddingTop: 10,
  },
  totalLbl: { fontSize: 15, fontWeight: "800", color: Colors.text },
  totalVal: { fontSize: 17, fontWeight: "800", color: Colors.primary },
  footer: {
    padding: 14,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  checkoutBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  checkoutText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
});
