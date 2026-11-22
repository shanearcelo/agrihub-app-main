import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Download, FileText, Share2, Sprout } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const PAGE_SIZE = 500;

type CategoryMetric = {
  name: string;
  sales: number;
  orderLines: number;
};

type AnalyticsMetrics = {
  grossSales: number;
  completedOrders: number;
  activeVerifiedSellers: number;
  topCategories: CategoryMetric[];
};

const EMPTY_METRICS: AnalyticsMetrics = {
  grossSales: 0,
  completedOrders: 0,
  activeVerifiedSellers: 0,
  topCategories: [],
};

function formatCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function fetchGrossOrders() {
  const grossOrders: { id: string; total_amount: number | string }[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, total_amount")
      .neq("order_status", "cancelled")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    grossOrders.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return grossOrders;
}

async function fetchTopCategories(orderIds: string[]) {
  const totals = new Map<string, CategoryMetric>();
  const productTotals = new Map<
    string,
    { sales: number; orderLines: number }
  >();
  const uncategorized = { sales: 0, orderLines: 0 };
  const orderBatchSize = 100;

  for (let start = 0; start < orderIds.length; start += orderBatchSize) {
    const orderBatch = orderIds.slice(start, start + orderBatchSize);

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, product_id, line_total")
        .in("order_id", orderBatch)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      const page = data || [];
      for (const item of page) {
        if (!item.product_id) {
          uncategorized.sales += Number(item.line_total || 0);
          uncategorized.orderLines += 1;
          continue;
        }

        const metric = productTotals.get(item.product_id) || {
          sales: 0,
          orderLines: 0,
        };
        metric.sales += Number(item.line_total || 0);
        metric.orderLines += 1;
        productTotals.set(item.product_id, metric);
      }

      if (page.length < PAGE_SIZE) break;
    }
  }

  const productIds = [...productTotals.keys()];
  for (let start = 0; start < productIds.length; start += orderBatchSize) {
    const productBatch = productIds.slice(start, start + orderBatchSize);
    const { data, error } = await supabase
      .from("products")
      .select("id, category")
      .in("id", productBatch);
    if (error) throw error;

    for (const product of data || []) {
      const metric = productTotals.get(product.id);
      if (!metric) continue;
      const category = product.category?.trim() || "Uncategorized";
      const categoryMetric = totals.get(category) || {
        name: category,
        sales: 0,
        orderLines: 0,
      };
      categoryMetric.sales += metric.sales;
      categoryMetric.orderLines += metric.orderLines;
      totals.set(category, categoryMetric);
    }
  }

  if (uncategorized.orderLines > 0) {
    const categoryMetric = totals.get("Uncategorized") || {
      name: "Uncategorized",
      sales: 0,
      orderLines: 0,
    };
    categoryMetric.sales += uncategorized.sales;
    categoryMetric.orderLines += uncategorized.orderLines;
    totals.set("Uncategorized", categoryMetric);
  }

  return [...totals.values()]
    .sort((left, right) => right.sales - left.sales)
    .slice(0, 5);
}

export default function AdminAnalyticsScreen() {
  const [metrics, setMetrics] = useState<AnalyticsMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const router = useRouter();

  const loadAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [completedCountResult, sellersResult, grossOrders] =
        await Promise.all([
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("order_status", "completed"),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "seller")
            .eq("verification_status", "verified"),
          fetchGrossOrders(),
        ]);
      if (completedCountResult.error) throw completedCountResult.error;
      if (sellersResult.error) throw sellersResult.error;

      const topCategories = await fetchTopCategories(
        grossOrders.map((order) => order.id),
      );
      setMetrics({
        grossSales: grossOrders.reduce(
          (sum, order) => sum + Number(order.total_amount || 0),
          0,
        ),
        completedOrders: completedCountResult.count || 0,
        activeVerifiedSellers: sellersResult.count || 0,
        topCategories,
      });
      setHasLoaded(true);
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load admin analytics:", error);
      setLoadError(
        error instanceof Error ? error.message : "Could not load analytics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAnalytics();
    }, [loadAnalytics]),
  );

  function getReportSummary() {
    const categorySummary = metrics.topCategories.length
      ? metrics.topCategories
          .map((category) => `${category.name}: ${formatCurrency(category.sales)}`)
          .join("\n")
      : "No completed item sales";
    return [
      "AgriHub Marketplace Analytics",
      `Gross revenue: ${formatCurrency(metrics.grossSales)}`,
      `Completed orders: ${metrics.completedOrders}`,
      `Active verified sellers: ${metrics.activeVerifiedSellers}`,
      "Top categories:",
      categorySummary,
    ].join("\n");
  }

  async function handleExport(format: "PDF" | "CSV") {
    if (Platform.OS === "web") {
      if (format === "CSV") {
        const csvRows = [
          "Metric,Value",
          `Total Gross Revenue (PHP),${metrics.grossSales}`,
          `Completed Orders,${metrics.completedOrders}`,
          `Active Verified Sellers,${metrics.activeVerifiedSellers}`,
          "",
          "Category,Gross Item Sales (PHP),Order Lines",
          ...metrics.topCategories.map(
            (category) =>
              `"${category.name.replace(/"/g, '""')}",${category.sales},${category.orderLines}`,
          ),
        ];
        const blob = new Blob([csvRows.join("\n")], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "AgriHub_Marketplace_Analytics.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        window.print();
      }
      return;
    }

    Alert.alert(`${format} Export Ready`, getReportSummary());
  }

  async function handleShare() {
    try {
      await Share.share({ message: getReportSummary() });
    } catch (error) {
      console.error("Failed to share analytics:", error);
      setLoadError(
        error instanceof Error ? error.message : "Could not share analytics.",
      );
    }
  }

  const maxCategorySales = Math.max(
    1,
    ...metrics.topCategories.map((category) => category.sales),
  );

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/admin");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>Analytics & Reports</Text>
          <Text style={styles.subHeader}>Live marketplace performance</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadAnalytics(true)}
            tintColor={Colors.primary}
          />
        }
      >
        {loading && !hasLoaded ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading live analytics...</Text>
          </View>
        ) : !hasLoaded ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {loadError || "Analytics could not be loaded."}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void loadAnalytics()}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {loadError && (
              <Text style={styles.refreshError}>
                Refresh failed: {loadError}
              </Text>
            )}

            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, styles.metricWide]}>
                <Text style={styles.metricLabel}>Total Gross Revenue</Text>
                <Text style={styles.salesValue}>
                  {formatCurrency(metrics.grossSales)}
                </Text>
                <Text style={styles.metricNote}>
                  All non-cancelled campus orders
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Completed Orders</Text>
                <Text style={styles.metricValue}>
                  {metrics.completedOrders.toLocaleString()}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Active Verified Sellers</Text>
                <Text style={styles.metricValue}>
                  {metrics.activeVerifiedSellers.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Sprout size={17} color={Colors.primary} />
                  <Text style={styles.cardTitle}>
                    Top-Selling Categories
                  </Text>
                </View>
                <Text style={styles.cardNote}>Items in non-cancelled orders</Text>
              </View>
              {metrics.topCategories.length === 0 ? (
                <Text style={styles.emptyText}>
                  No completed item sales yet.
                </Text>
              ) : (
                metrics.topCategories.map((category) => (
                  <View key={category.name} style={styles.categoryRow}>
                    <View style={styles.categoryMeta}>
                      <Text style={styles.categoryName} numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text style={styles.categorySales}>
                        {formatCurrency(category.sales)} ·{" "}
                        {category.orderLines} order lines
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.max(
                              3,
                              (category.sales / maxCategorySales) * 100,
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Export Live Report</Text>
                <FileText size={16} color={Colors.primary} />
              </View>
              <View style={styles.exportRow}>
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={() => void handleExport("PDF")}
                >
                  <FileText size={15} color={Colors.text} />
                  <Text style={styles.exportText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={() => void handleExport("CSV")}
                >
                  <Download size={15} color={Colors.text} />
                  <Text style={styles.exportText}>CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={() => void handleShare()}
                >
                  <Share2 size={15} color="#FFF" />
                  <Text style={styles.shareText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 52 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
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
  header: { fontSize: 20, fontWeight: "800", color: Colors.text },
  subHeader: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 36, flexGrow: 1 },
  loadingBox: {
    flex: 1,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: Colors.textMuted, fontSize: 13 },
  errorBox: {
    backgroundColor: "#FFF",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  refreshError: {
    color: Colors.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricWide: { flexBasis: "100%" },
  metricLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "700" },
  metricValue: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 7,
  },
  salesValue: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 7,
  },
  metricNote: { color: Colors.textMuted, fontSize: 10, marginTop: 4 },
  card: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  cardTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  cardNote: { color: Colors.textMuted, fontSize: 10 },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
  categoryRow: { marginBottom: 12 },
  categoryMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 5,
  },
  categoryName: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: "700" },
  categorySales: { color: Colors.textMuted, fontSize: 10 },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.background,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: Colors.primary },
  exportRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  exportText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  shareText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
});
