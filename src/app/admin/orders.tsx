import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, MapPin, Search, ShoppingBag } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type OrderStatus =
  | "pending"
  | "approved"
  | "confirmed"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

type OrderRecord = {
  id: string;
  order_code: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  seller_name: string;
  total_amount: number;
  pickup_date: string | null;
  pickup_venue: string | null;
  pickup_point: string | null;
  order_status: OrderStatus;
  created_at: string;
};

const FILTERS = ["All", "pending", "confirmed", "ready", "completed", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

function confirmCancel(message: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) action();
  } else {
    Alert.alert("Cancel order", message, [
      { text: "Keep order", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: action },
    ]);
  }
}

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      let data: {
        id: string;
        order_code: string;
        buyer_id: string;
        seller_id: string;
        buyer_name: string;
        seller_name: string;
        total_amount: number;
        pickup_date: string | null;
        pickup_venue: string | null;
        pickup_point: string | null;
        order_status: OrderStatus;
        created_at: string;
      }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase
          .from("orders")
          .select(
            "id, order_code, buyer_id, seller_id, buyer_name, seller_name, total_amount, pickup_date, pickup_venue, pickup_point, order_status, created_at",
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        data = data.concat(page || []);
        if ((page || []).length < 1000) break;
      }
      const ids = [
        ...new Set(data.flatMap((order) => [order.buyer_id, order.seller_id])),
      ];
      const { data: profiles, error: profileError } = ids.length
        ? await supabase.from("profiles").select("id, full_name, store_name").in("id", ids)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      setOrders(
        data.map((order) => ({
          ...order,
          buyer_name:
            profileMap.get(order.buyer_id)?.full_name || order.buyer_name || "Buyer",
          seller_name:
            profileMap.get(order.seller_id)?.store_name ||
            profileMap.get(order.seller_id)?.full_name ||
            order.seller_name ||
            "Seller",
        })) as OrderRecord[],
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load orders.",
      );
      console.error("Could not load admin orders.", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders]),
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus =
        filter === "All" ||
        order.order_status === filter ||
        (filter === "confirmed" && order.order_status === "approved") ||
        (filter === "ready" && order.order_status === "ready_for_pickup");
      return (
        matchesStatus &&
        (!query ||
          order.order_code.toLowerCase().includes(query) ||
          order.buyer_name.toLowerCase().includes(query) ||
          order.seller_name.toLowerCase().includes(query))
      );
    });
  }, [filter, orders, search]);

  async function cancelOrder(order: OrderRecord) {
    setBusyId(order.id);
    setErrorMessage("");
    try {
      const { error } = await supabase.rpc("admin_cancel_order", {
        p_order_id: order.id,
      });
      if (error) throw error;
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id ? { ...item, order_status: "cancelled" } : item,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not cancel this order.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.push("/admin")}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Order Oversight</Text>
          <Text style={styles.subtitle}>Campus orders and dispute resolution</Text>
        </View>
      </View>
      <View style={styles.search}>
        <Search size={16} color={Colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search order, buyer, or seller"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filter, filter === item && styles.filterActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item === "All" ? item : item.replaceAll("_", " ")}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.muted}>No orders found.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.orderIcon}>
                <ShoppingBag size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderCode}>Order {item.order_code}</Text>
                <Text style={styles.meta}>{item.buyer_name} → {item.seller_name}</Text>
              </View>
              <Text style={styles.status}>              {(
                item.order_status === "approved"
                  ? "confirmed"
                  : item.order_status === "ready_for_pickup"
                    ? "ready"
                    : item.order_status
              ).replace(/_/g, " ").toUpperCase()}</Text>
            </View>
            <Text style={styles.amount}>₱{Number(item.total_amount || 0).toLocaleString()}</Text>
            <View style={styles.pickup}>
              <MapPin size={14} color={Colors.textMuted} />
              <Text style={styles.meta}>
                {item.pickup_date || "No pickup date"} · {item.pickup_venue || item.pickup_point || "No pickup location"}
              </Text>
            </View>
            <Text style={styles.date}>Placed {new Date(item.created_at).toLocaleString()}</Text>
            {item.order_status !== "cancelled" && item.order_status !== "completed" ? (
              <TouchableOpacity
                style={styles.cancelButton}
                disabled={busyId === item.id}
                onPress={() =>
                  confirmCancel(
                    `Cancel order ${item.order_code}? Reserved stock will be restored.`,
                    () => void cancelOrder(item),
                  )
                }
              >
                <Text style={styles.cancelText}>
                  {busyId === item.id ? "Updating..." : "Cancel / Resolve Dispute"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11 },
  search: { height: 44, marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 12 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filter: { paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#FFF", borderColor: Colors.border, borderWidth: 1, borderRadius: 20 },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 11, color: Colors.text, fontWeight: "700", textTransform: "capitalize" },
  filterTextActive: { color: "#FFF" },
  list: { padding: 16, paddingTop: 0, paddingBottom: 96, gap: 10 },
  card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  orderIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" },
  orderCode: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  meta: { color: Colors.textMuted, fontSize: 10, flexShrink: 1 },
  status: { color: Colors.primary, fontSize: 9, fontWeight: "800" },
  amount: { color: Colors.text, fontSize: 18, fontWeight: "800", marginTop: 10 },
  pickup: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  date: { color: Colors.textMuted, fontSize: 10, marginTop: 5 },
  cancelButton: { backgroundColor: "#FEF2F2", borderRadius: 9, alignItems: "center", paddingVertical: 10, marginTop: 12 },
  cancelText: { color: Colors.danger, fontWeight: "800", fontSize: 11 },
  empty: { padding: 32, alignItems: "center" },
  muted: { color: Colors.textMuted, fontSize: 11 },
  error: { marginHorizontal: 16, color: Colors.danger, fontSize: 12 },
});
