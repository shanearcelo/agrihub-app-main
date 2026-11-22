// src/app/order-success/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  MapPin,
  MessageSquare,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

type OrderReference = {
  id?: string;
  order_code: string;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOrderReferences(
  serializedOrders: string | undefined,
  orderCode: string | undefined,
): OrderReference[] {
  if (!serializedOrders) {
    return orderCode ? [{ order_code: orderCode }] : [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedOrders);
  } catch {
    throw new Error("The checkout order references are invalid.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The checkout did not return valid order references.");
  }
  const references: OrderReference[] = [];
  for (const reference of parsed) {
    if (
      !reference ||
      typeof reference !== "object" ||
      !("id" in reference) ||
      typeof reference.id !== "string" ||
      !("order_code" in reference) ||
      typeof reference.order_code !== "string"
    ) {
      throw new Error("The checkout did not return valid order references.");
    }
    references.push({
      id: reference.id,
      order_code: reference.order_code,
    });
  }
  return references;
}

const STATUS_STEPS = [
  { key: "pending", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ready", label: "Ready for Pick-up" },
  { key: "completed", label: "Completed" },
];

export default function OrderSuccessScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    orders?: string | string[];
  }>();
  const id = firstParam(params.id);
  const serializedOrders = firstParam(params.orders);
  const isCheckoutSummary = Boolean(serializedOrders);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.replace("/auth/login");
          return;
        }
        const references = parseOrderReferences(serializedOrders, id);
        if (references.length === 0) {
          throw new Error("No order reference was provided.");
        }
        const result = references.every((reference) => reference.id)
          ? await supabase
              .from("orders")
              .select("*")
              .eq("buyer_id", user.id)
              .in(
                "id",
                references.map((reference) => reference.id as string),
              )
          : await supabase
              .from("orders")
              .select("*")
              .eq("buyer_id", user.id)
              .in(
                "order_code",
                references.map((reference) => reference.order_code),
              );
        const { data, error } = result;
        if (error) throw error;
        if (!active) return;
        const ordersById = new Map(
          (data || []).map((order) => [order.id, order]),
        );
        const ordersByCode = new Map(
          (data || []).map((order) => [order.order_code, order]),
        );
        const orderedResults = references.map((reference) =>
          reference.id
            ? ordersById.get(reference.id)
            : ordersByCode.get(reference.order_code),
        );
        if (orderedResults.some((order) => !order)) {
          throw new Error("One or more orders could not be found.");
        }
        const loadedOrders = orderedResults as any[];
        setOrders(loadedOrders);
        const channelTopic = `order-status:${loadedOrders
          .map((order) => order.id)
          .join(":")}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        let configuredChannel = supabase.channel(channelTopic);
        for (const loadedOrder of loadedOrders) {
          configuredChannel = configuredChannel.on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "orders",
              filter: `id=eq.${loadedOrder.id}`,
            },
            (payload) => {
              if (active) {
                setOrders((current) =>
                  current.map((order) =>
                    order.id === payload.new.id
                      ? { ...order, ...payload.new }
                      : order,
                  ),
                );
              }
            },
          );
        }
        channel = configuredChannel;
        channel.subscribe();
      } catch (error) {
        if (channel) {
          void supabase.removeChannel(channel);
          channel = null;
        }
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Could not load this order.";
        if (Platform.OS === "web") window.alert(message);
        else Alert.alert("Order Unavailable", message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [id, router, serializedOrders]);

  const order = orders[0] || null;
  const currentStatus = String(order?.order_status || "pending").toLowerCase();
  const activeStepIdx = (() => {
    if (currentStatus === "completed") return 3;
    if (currentStatus === "ready" || currentStatus === "ready_for_pickup")
      return 2;
    if (
      currentStatus === "approved" ||
      currentStatus === "confirmed" ||
      currentStatus === "preparing"
    )
      return 1;
    return 0;
  })();

  const isCash = order?.payment_method === "cash";
  const paymentLabel = isCash
    ? "₱ Cash on Pick-up"
    : order?.payment_status === "paid"
      ? "✓ GCash Paid"
      : "GCash Receipt Under Review";

  async function openOrderChat() {
    if (!order?.id) return;
    try {
      const { data: chatId, error } = await supabase.rpc("get_or_create_chat", {
        p_order_id: order.id,
        p_product_id: null,
        p_seller_id: null,
      });
      if (error) throw error;
      router.push({
        pathname: "/chat/[orderId]",
        params: { orderId: chatId },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not open this chat.";
      if (Platform.OS === "web") window.alert(message);
      else Alert.alert("Chat Unavailable", message);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        padding: 20,
        paddingTop: 52,
        paddingBottom: 36,
        alignItems: "center",
      }}
    >
      <View style={styles.topActions}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
        >
          <ArrowLeft size={17} color={Colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.doneBtn}
          accessibilityRole="button"
          onPress={() => router.replace("/buyer")}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Success Check Circle */}
      <View style={styles.checkOuter}>
        <View style={styles.checkInner}>
          <Check size={30} color="#FFF" strokeWidth={3} />
        </View>
      </View>

      <Text style={styles.title}>Order Placed!</Text>
      <Text style={styles.sub}>
        {isCheckoutSummary
          ? loading
            ? "Your grouped orders have been placed."
            : `${orders.length} order${orders.length === 1 ? "" : "s"} placed. Open each pass for pickup.`
          : "Show this pass at the stall to claim your order."}
      </Text>

      {loading ? (
        <Text style={styles.loadingText}>Loading your orders...</Text>
      ) : isCheckoutSummary ? (
        <View style={styles.orderListCard}>
          <Text style={styles.orderListHeading}>Your orders</Text>
          {orders.map((placedOrder) => (
            <View key={placedOrder.id} style={styles.orderListItem}>
              <View style={styles.orderListInfo}>
                <Text style={styles.orderListCode}>
                  #{placedOrder.order_code}
                </Text>
                <Text style={styles.orderListMeta}>
                  {placedOrder.seller_name || "Seller"} • ₱
                  {Number(placedOrder.total_amount || 0).toFixed(2)}
                </Text>
                <Text style={styles.orderListMeta}>
                  {placedOrder.pickup_date || "Pickup date pending"}
                  {placedOrder.pickup_time
                    ? ` • ${placedOrder.pickup_time}`
                    : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.openPassBtn}
                accessibilityRole="button"
                accessibilityLabel={`Open order pass ${placedOrder.order_code}`}
                onPress={() =>
                  router.push({
                    pathname: "/order-success/[id]",
                    params: { id: placedOrder.order_code },
                  })
                }
              >
                <Text style={styles.openPassText}>Open Pass</Text>
                <ChevronRight size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : order ? (
        <>
          {/* Digital QR Ticket Card */}
          <View style={styles.ticketCard}>
            <Text style={styles.refLabel}>ORDER REFERENCE</Text>
            <Text style={styles.refCode}>#{id}</Text>

            <View style={styles.pillRow}>
              <View
                style={[
                  styles.paidPill,
                  isCash && { backgroundColor: "#FEF3C7" },
                ]}
              >
                <Text style={[styles.paidText, isCash && { color: "#B45309" }]}>
                  {paymentLabel}
                </Text>
              </View>
              <Text style={styles.timeText}>
                {order?.pickup_date ? `${order.pickup_date} • ` : ""}
                {order?.pickup_time ||
                  order?.pickup_time_window ||
                  "7:00–9:00 AM"}
              </Text>
            </View>

            <View style={styles.qrBox}>
              <QRCode
                value={String(id || "AGH-000000")}
                size={152}
                color={Colors.text}
              />
            </View>

            <Text style={styles.qrCaption}>Pick-up QR Pass</Text>
            {order?.total_amount !== undefined && (
              <Text style={styles.amountCaption}>
                Total Amount: ₱{Number(order.total_amount).toFixed(2)}
              </Text>
            )}

            <TouchableOpacity
              style={styles.stallBox}
              onPress={() => router.push("/buyer-screens/map")}
            >
              <View style={styles.pinCircle}>
                <MapPin size={15} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stallName}>
                  {order?.pickup_venue ||
                    order?.pickup_point ||
                    "Agriculture Dept Stalls"}
                </Text>
                <Text style={styles.stallSub}>
                  Near Gate 2 • {order?.seller_name || "Agri Dept - Unit 3"}
                </Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 4-Step Live Status Tracker */}
          <View style={styles.stepperRow}>
            {STATUS_STEPS.map((step, idx) => {
              const done = idx <= activeStepIdx;
              return (
                <View key={step.key} style={styles.stepItem}>
                  <View style={[styles.stepDot, done && styles.stepDotActive]}>
                    {done && <Check size={10} color="#FFF" strokeWidth={3} />}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      done && { color: Colors.primary, fontWeight: "800" },
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Bottom Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.msgBtn} onPress={openOrderChat}>
              <MessageSquare size={15} color={Colors.primary} />
              <Text style={styles.msgText}>Message Seller</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ordersBtn}
              onPress={() => router.replace("/buyer-screens/orders-history")}
            >
              <Text style={styles.ordersText}>View My Orders</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topActions: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backBtn: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backText: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  doneBtn: { alignSelf: "flex-end", padding: 8 },
  doneText: { fontSize: 14, fontWeight: "800", color: Colors.text },
  checkOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  checkInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.success,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "800", color: Colors.text, marginTop: 12 },
  sub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 18,
    textAlign: "center",
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    paddingVertical: 24,
  },
  orderListCard: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderListHeading: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  orderListItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 12,
    gap: 10,
  },
  orderListInfo: { gap: 3 },
  orderListCode: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  orderListMeta: { color: Colors.textMuted, fontSize: 12 },
  openPassBtn: {
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
  },
  openPassText: { color: Colors.primary, fontSize: 12, fontWeight: "800" },
  ticketCard: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.6,
  },
  refCode: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  paidPill: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  paidText: { fontSize: 10, fontWeight: "800", color: "#1D4ED8" },
  timeText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  qrBox: {
    padding: 14,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrCaption: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 10,
  },
  amountCaption: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
    marginTop: 2,
  },
  stallBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  pinCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  stallName: { fontSize: 13, fontWeight: "800", color: Colors.text },
  stallSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  stepperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginVertical: 18,
    paddingHorizontal: 4,
  },
  stepItem: { alignItems: "center", flex: 1 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  stepDotActive: { backgroundColor: Colors.success },
  stepLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: "center",
    fontWeight: "600",
  },
  btnRow: { flexDirection: "row", gap: 10, width: "100%" },
  msgBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgText: { fontSize: 13, fontWeight: "700", color: Colors.text },
  ordersBtn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  ordersText: { fontSize: 13, fontWeight: "800", color: "#FFF" },
});
