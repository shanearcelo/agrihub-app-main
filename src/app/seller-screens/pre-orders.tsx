// src/app/seller-screens/pre-orders.tsx
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Leaf,
  Plus,
  Sparkles,
  Sprout,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

export default function InGroundPreOrdersScreen() {
  const [preorders, setPreorders] = useState<any[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!user) return;
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("seller_id", user.id)
            .eq("listing_type", "in_ground_preorder");
          if (error) throw error;
          if (active) setPreorders(data || []);
        } catch (error) {
          console.error("Could not load seller pre-orders.", error);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const totalYield = preorders.reduce(
    (s, p) => s + Number(p.total_stock || 0),
    0,
  );
  const reserved = preorders.reduce(
    (s, p) => s + (Number(p.total_stock || 0) - Number(p.available_stock || 0)),
    0,
  );

  const overallRatio =
    totalYield > 0 ? Math.round((reserved / totalYield) * 100) : 0;
  const wasteRisk =
    totalYield === 0
      ? "Low"
      : overallRatio >= 65
        ? "Low"
        : overallRatio >= 35
          ? "Medium"
          : "High";
  const wasteColor =
    wasteRisk === "Low"
      ? Colors.success
      : wasteRisk === "Medium"
        ? "#D97706"
        : Colors.danger;

  // Find crop with lowest reservation rate for Zero-waste insight
  const lowestCrop = [...preorders].sort((a, b) => {
    const pctA =
      a.total_stock > 0
        ? (a.total_stock - a.available_stock) / a.total_stock
        : 1;
    const pctB =
      b.total_stock > 0
        ? (b.total_stock - b.available_stock) / b.total_stock
        : 1;
    return pctA - pctB;
  })[0];

  const lowestPct =
    lowestCrop && lowestCrop.total_stock > 0
      ? Math.round(
          ((lowestCrop.total_stock - lowestCrop.available_stock) /
            lowestCrop.total_stock) *
            100,
        )
      : 21;

  return (
    <View style={styles.container}>
      {/* Green Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/seller");
          }}
        >
          <ArrowLeft size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>In-Ground Pre-Orders</Text>
          <Text style={styles.headerSub}>
            Demand tracker • {preorders.length} crops growing
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addIconBtn}
          onPress={() => router.push("/seller/post-harvest")}
        >
          <Plus size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        {/* 3-Column Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.sumItem}>
            <Text style={styles.sumLbl}>Reserved</Text>
            <Text style={styles.sumVal}>{reserved} kg</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.sumItem}>
            <Text style={styles.sumLbl}>Est. Yield</Text>
            <Text style={styles.sumVal}>{totalYield} kg</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.sumItem}>
            <Text style={styles.sumLbl}>Waste Risk</Text>
            <Text style={[styles.sumVal, { color: wasteColor }]}>
              {wasteRisk}
            </Text>
          </View>
        </View>

        {/* Crop Cards */}
        {preorders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Sprout size={30} color={Colors.primary} />
            <Text style={styles.emptyTitle}>No In-Ground Pre-Orders Yet</Text>
            <Text style={styles.emptySub}>
              Post a crop under &quot;In-Ground Pre-Order&quot; so students &amp; faculty can
              reserve harvests before harvest day.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push("/seller/post-harvest")}
            >
              <Text style={styles.emptyBtnText}>+ Create Pre-Order Crop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          preorders.map((crop) => {
            const total = Number(crop.total_stock || 0);
            const avail = Number(crop.available_stock || 0);
            const resQty = Math.max(0, total - avail);
            const pct = total > 0 ? Math.round((resQty / total) * 100) : 0;
            const barColor =
              pct >= 70 ? Colors.primary : pct >= 40 ? "#F59E0B" : "#EF4444";

            return (
              <View key={crop.id} style={styles.cropCard}>
                <View style={styles.cropTop}>
                  <Image
                    source={{
                      uri: crop.image_url?.startsWith("http")
                        ? crop.image_url
                        : "https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=200",
                    }}
                    style={styles.cropThumb}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cropTitle}>{crop.title}</Text>
                    <Text style={styles.cropPlot}>
                      {crop.seller_department || "Campus Farm Plot"} • ₱
                      {crop.price_per_unit}/{crop.unit}
                    </Text>
                  </View>
                  <View style={styles.daysBadge}>
                    <Calendar size={11} color="#1D4ED8" />
                    <Text style={styles.daysText}>
                      {crop.expected_harvest || "In 5 days"}
                    </Text>
                  </View>
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.resLabel}>Buyer reservations</Text>
                  <Text style={[styles.pctText, { color: barColor }]}>
                    {pct}% of est. yield
                  </Text>
                </View>

                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${pct}%`, backgroundColor: barColor },
                    ]}
                  />
                </View>

                <View style={styles.footerRow}>
                  <Text style={styles.cropMeta}>
                    {resQty} {crop.unit} reserved ({avail} {crop.unit} open)
                  </Text>
                  <Text style={styles.estText}>
                    Est: {total} {crop.unit} total
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* Zero-Waste Insight Card */}
        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <View style={styles.insightIcon}>
              <Sparkles size={16} color="#FDE68A" />
            </View>
            <Text style={styles.insightTitle}>Zero-waste insight</Text>
          </View>
          <Text style={styles.insightBody}>
            {lowestCrop
              ? `${lowestCrop.title} demand is ${lowestPct}%. Feature it for ₱15 or lower the price slightly before harvest to prevent surplus waste.`
              : "Feature upcoming harvests for ₱15 to boost early student reservations and eliminate post-harvest spoilage."}
          </Text>
          <TouchableOpacity
            style={styles.promoteBtn}
            onPress={() => router.push("/seller/post-harvest")}
          >
            <Leaf size={13} color={Colors.primary} />
            <Text style={styles.promoteText}>Promote now →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.primary,
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#FFF", fontSize: 19, fontWeight: "800" },
  headerSub: { color: "#D8F3DC", fontSize: 11, marginTop: 1 },
  addIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  sumItem: { flex: 1, alignItems: "center" },
  divider: { width: 1, height: 28, backgroundColor: Colors.border },
  sumLbl: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  sumVal: { fontSize: 18, fontWeight: "800", color: Colors.text, marginTop: 2 },

  cropCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  cropTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  cropThumb: { width: 42, height: 42, borderRadius: 10 },
  cropTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  cropPlot: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  daysBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daysText: { fontSize: 10, fontWeight: "800", color: "#1D4ED8" },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  resLabel: { fontSize: 11, fontWeight: "700", color: Colors.text },
  pctText: { fontSize: 11, fontWeight: "800" },
  barBg: {
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  barFill: { height: "100%", borderRadius: 4 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cropMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  estText: { fontSize: 11, fontWeight: "700", color: Colors.text },

  insightCard: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 16,
    marginTop: 6,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  insightIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  insightTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  insightBody: { color: "#ECFDF5", fontSize: 12, lineHeight: 17 },
  promoteBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 12,
  },
  promoteText: { color: Colors.primary, fontSize: 12, fontWeight: "800" },

  emptyBox: {
    backgroundColor: "#FFF",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
  },
  emptyBtnText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
});
