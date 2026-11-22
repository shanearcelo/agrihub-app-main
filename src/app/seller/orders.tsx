// src/app/seller/orders.tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  MessageSquare,
  QrCode,
  Square,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import OrderDetailsModal from "../../components/OrderDetailsModal";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";
import { getImageUrl } from "../../lib/uploadImageToSupabase";

type OrderTab =
  | "all"
  | "pending"
  | "preparing"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

function getOrderStatusLabel(status: string) {
  if (status === "pending") return "PENDING";
  if (status === "approved" || status === "confirmed") return "PREPARING";
  if (status === "ready_for_pickup") return "READY FOR PICKUP";
  if (status === "completed") return "COMPLETED";
  if (status === "cancelled") return "CANCELLED";
  return status.replace(/_/g, " ").toUpperCase();
}

function showMessage(title: string, msg: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}: ${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

export default function SellerOrdersScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [tab, setTab] = useState<OrderTab>("pending");
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [scanPaused, setScanPaused] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<any | null>(null);
  const openedOrderParam = useRef<string | null>(null);
  const permissionRequested = useRef(false);
  const scannerPaused = useRef(false);
  const verificationInProgress = useRef(false);
  const router = useRouter();

  const loadOrders = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = await Promise.all(
        (data || []).map(async (order) => {
          const receipts = Array.isArray(order.payment_receipts)
            ? await Promise.all(
                order.payment_receipts.map(async (receipt: any) => ({
                  ...receipt,
                  receipt_image_url:
                    (await getImageUrl(
                      "payment-receipts",
                      receipt.receipt_image_url,
                    )) || "",
                })),
              )
            : [];
          return {
            ...order,
            receipt_image_url:
              (await getImageUrl(
                "payment-receipts",
                order.gcash_receipt_url,
              )) || null,
            payment_receipts: receipts,
          };
        }),
      );
      setOrders(list);
      setSelectedIds([]);
      setDetailsOrder((current: any | null) =>
        current
          ? (list.find((order) => order.id === current.id) ?? current)
          : null,
      );
      if (orderId && openedOrderParam.current !== orderId) {
        const target = list.find((order) => order.id === orderId);
        if (target) {
          openedOrderParam.current = orderId;
          setDetailsOrder(target);
          if (target.order_status === "completed") setTab("completed");
          else if (target.order_status === "cancelled") setTab("cancelled");
          else if (["approved", "confirmed"].includes(target.order_status)) {
            setTab("preparing");
          } else if (target.order_status === "ready_for_pickup") {
            setTab("ready_for_pickup");
          } else setTab("pending");
        }
      }
    } catch (error) {
      console.error("Failed to load seller orders:", error);
      showMessage(
        "Orders Unavailable",
        error instanceof Error ? error.message : "Could not load your orders.",
      );
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders]),
  );

  useEffect(() => {
    if (
      !scanOpen ||
      !cameraPermission ||
      cameraPermission.granted ||
      !cameraPermission.canAskAgain ||
      permissionRequested.current
    ) {
      return;
    }

    permissionRequested.current = true;
    requestCameraPermission().catch((error: unknown) => {
      console.error(
        "Failed to request pickup scanner camera permission:",
        error,
      );
      setCameraError(
        error instanceof Error
          ? error.message
          : "Could not request camera permission.",
      );
    });
  }, [cameraPermission, requestCameraPermission, scanOpen]);

  function openScanner() {
    permissionRequested.current = false;
    scannerPaused.current = false;
    setCameraError(null);
    setScanFeedback(null);
    setScanPaused(false);
    setScanOpen(true);
  }

  function closeScanner() {
    setScanOpen(false);
    scannerPaused.current = false;
    setScanPaused(false);
    setScanFeedback(null);
    setQrInput("");
  }

  async function retryCameraPermission() {
    permissionRequested.current = true;
    setCameraError(null);
    try {
      await requestCameraPermission();
    } catch (error) {
      console.error(
        "Failed to request pickup scanner camera permission:",
        error,
      );
      setCameraError(
        error instanceof Error
          ? error.message
          : "Could not request camera permission.",
      );
    }
  }

  async function verifyOrderCode(orderCode = qrInput, scannedByCamera = false) {
    const fail = (message: string) => {
      if (scannedByCamera) setScanFeedback(message);
      else showMessage("Unable to Verify Order", message);
    };
    if (verificationInProgress.current) return;
    const clean = orderCode.trim().replace("#", "").toUpperCase();
    if (!clean) {
      fail("Enter the order reference from the buyer's QR pass.");
      return;
    }
    const match = orders.find((o) => o.order_code?.toUpperCase() === clean);
    if (!match) {
      fail("No order from your seller account matches that QR reference.");
      return;
    }
    if (match.order_status !== "ready_for_pickup") {
      fail("This order is not marked ready for pickup yet.");
      return;
    }
    if (match.payment_method === "gcash" && match.payment_status !== "paid") {
      fail(
        "The GCash receipt must be approved before pickup can be completed.",
      );
      return;
    }

    verificationInProgress.current = true;
    setIsVerifying(true);
    try {
      await updateOrderStatus(match.id, "completed");
      showMessage(
        "Verified & Completed!",
        `Order #${match.order_code} has been handed over.`,
      );
      closeScanner();
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : "Could not complete the order.",
      );
    } finally {
      verificationInProgress.current = false;
      setIsVerifying(false);
    }
  }

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scannerPaused.current) return;
    scannerPaused.current = true;
    setScanPaused(true);
    setScanFeedback(null);
    setQrInput(data);
    void verifyOrderCode(data, true);
  }

  async function updateOrderStatus(
    orderId: string,
    nextStatus: "approved" | "ready_for_pickup" | "completed",
  ) {
    const { error } = await supabase.rpc("set_order_status", {
      p_order_id: orderId,
      p_status: nextStatus,
    });
    if (error) throw error;
    await loadOrders();
  }

  function handleStatusUpdate(
    orderId: string,
    nextStatus: "approved" | "ready_for_pickup" | "completed",
  ) {
    void updateOrderStatus(orderId, nextStatus).catch((error: unknown) => {
      console.error("Could not update order status.", error);
      showMessage(
        "Order Update Failed",
        error instanceof Error ? error.message : "Could not update this order.",
      );
    });
  }

  async function reviewGcashPayment(order: any, approved: boolean) {
    if (reviewingOrderId) return;
    setReviewingOrderId(order.id);
    try {
      const { error } = await supabase.rpc("review_order_payment", {
        p_order_id: order.id,
        p_approved: approved,
        p_rejection_reason: approved
          ? null
          : "Payment receipt was rejected by the seller.",
      });
      if (error) throw error;
      setDetailsOrder(null);
      await loadOrders();
      showMessage(
        approved ? "Payment Approved" : "Payment Rejected",
        approved
          ? "The order is paid and ready for you to prepare."
          : "The order was cancelled and its reserved stock was released.",
      );
    } catch (error) {
      showMessage(
        "Payment Review Failed",
        error instanceof Error
          ? error.message
          : "Could not review this receipt.",
      );
    } finally {
      setReviewingOrderId(null);
    }
  }

  function confirmGcashReview(order: any, approved: boolean) {
    if (approved) {
      void reviewGcashPayment(order, true);
      return;
    }
    const message = `Reject the GCash receipt for order #${order.order_code}? The order will be cancelled and its reserved stock released.`;
    const reject = () => void reviewGcashPayment(order, false);
    if (Platform.OS === "web") {
      if (window.confirm(message)) reject();
      return;
    }
    Alert.alert("Reject GCash Payment", message, [
      { text: "Keep Pending", style: "cancel" },
      { text: "Reject Payment", style: "destructive", onPress: reject },
    ]);
  }

  const pendingOrders = orders.filter((o) => o.order_status === "pending");
  const preparingOrders = orders.filter((o) =>
    ["approved", "confirmed"].includes(o.order_status),
  );
  const readyOrders = orders.filter(
    (o) => o.order_status === "ready_for_pickup",
  );
  const completedOrders = orders.filter((o) => o.order_status === "completed");
  const cancelledOrders = orders.filter((o) => o.order_status === "cancelled");

  const filteredByTab: Record<OrderTab, any[]> = {
    all: orders,
    pending: pendingOrders,
    preparing: preparingOrders,
    ready_for_pickup: readyOrders,
    completed: completedOrders,
    cancelled: cancelledOrders,
  };
  const filtered = filteredByTab[tab];

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((o) => o.id));
    }
  }

  async function handleBulkNotify() {
    const targets =
      selectedIds.length > 0 ? selectedIds : filtered.map((o) => o.id);
    if (targets.length === 0) {
      return showMessage(
        "No Orders",
        "No active orders in this tab to notify.",
      );
    }
    if (
      tab === "pending" &&
      targets.some((id) => {
        const order = orders.find((entry) => entry.id === id);
        return (
          order?.payment_method === "gcash" && order.payment_status !== "paid"
        );
      })
    ) {
      return showMessage(
        "Payment Review Required",
        "Review the buyer's GCash receipt before marking this order ready.",
      );
    }

    try {
      for (const id of targets) {
        if (tab === "pending") {
          const { error } = await supabase.rpc("set_order_status", {
            p_order_id: id,
            p_status: "approved",
          });
          if (error) throw error;
        }
      }
      showMessage(
        "Orders Updated",
        `Preparation started for ${targets.length} ${targets.length === 1 ? "order" : "orders"}. Buyers were notified.`,
      );
      await loadOrders();
    } catch (error) {
      showMessage(
        "Error",
        error instanceof Error ? error.message : "Could not notify buyers.",
      );
    }
  }

  async function openOrderChat(orderId: string) {
    try {
      const { data: chatId, error } = await supabase.rpc("get_or_create_chat", {
        p_order_id: orderId,
        p_product_id: null,
        p_seller_id: null,
      });
      if (error) throw error;
      router.push({
        pathname: "/chat/[orderId]",
        params: { orderId: chatId },
      });
    } catch (error) {
      showMessage(
        "Chat Unavailable",
        error instanceof Error ? error.message : "Could not open this chat.",
      );
    }
  }

  function getInitials(name?: string) {
    if (!name) return "CB";
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  const tabs: { key: OrderTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: orders.length },
    {
      key: "pending",
      label: "Pending / GCash",
      count: pendingOrders.length,
    },
    { key: "preparing", label: "Preparing", count: preparingOrders.length },
    {
      key: "ready_for_pickup",
      label: "Ready for Pickup",
      count: readyOrders.length,
    },
    { key: "completed", label: "Completed", count: completedOrders.length },
    { key: "cancelled", label: "Cancelled", count: cancelledOrders.length },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        {/* Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.header}>Orders</Text>
            <Text style={styles.subHeader}>
              {orders.length} {orders.length === 1 ? "order" : "total orders"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.qrHeaderBtn}
            onPress={openScanner}
            accessibilityRole="button"
            accessibilityLabel="Scan buyer QR pass"
          >
            <QrCode size={18} color={Colors.primary} />
            <Text style={styles.qrHeaderBtnText}>Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* Compact Filter Pills */}
        <View style={styles.tabWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {tabs.map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => {
                    setTab(key);
                    setSelectedIds([]);
                  }}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.tabCountBadge,
                      active && styles.tabCountBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountText,
                        active && styles.tabCountTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Scan Buyer QR Pass Banner */}
        <TouchableOpacity style={styles.scanBanner} onPress={openScanner}>
          <View style={styles.qrIconWrap}>
            <QrCode size={20} color="#FDE68A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan Buyer QR Pass</Text>
            <Text style={styles.scanSub}>
              Verify &amp; complete orders at the stall
            </Text>
          </View>
          <View style={styles.scanPill}>
            <Text style={styles.scanPillText}>Verify</Text>
          </View>
        </TouchableOpacity>

        {/* Orders List */}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 96,
            gap: 10,
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Orders in This Tab</Text>
              <Text style={styles.emptySub}>
                Orders placed by students &amp; faculty will appear here in real
                time.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            const paymentStatus = item.payment_status || "unpaid";
            const needsGcashReview =
              item.payment_method === "gcash" &&
              paymentStatus === "pending_verification";
            const preparing =
              item.order_status === "approved" ||
              item.order_status === "confirmed";
            const isReady = item.order_status === "ready_for_pickup";
            const canSelect = item.order_status === "pending";
            const paymentStatusLabel = paymentStatus
              .replace(/_/g, " ")
              .toUpperCase();
            const pickupDate = item.pickup_date
              ? new Date(`${item.pickup_date}T12:00:00`).toLocaleDateString()
              : "Date pending";
            const itemSummary = Array.isArray(item.items)
              ? item.items
                  .map((i: any) => `${i.quantity} ${i.unit || ""} ${i.title}`)
                  .join(", ")
              : item.crop_title || `Order #${item.order_code || "AGH"}`;

            return (
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  {tab === "pending" && canSelect && (
                    <TouchableOpacity
                      onPress={() => toggleSelect(item.id)}
                      style={{ marginRight: 4 }}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} color={Colors.primary} />
                      ) : (
                        <Square size={18} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  )}

                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {getInitials(item.buyer_name)}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.buyerName}>
                      {item.buyer_name || "Campus Buyer"}
                    </Text>
                    <Text style={styles.buyerMeta}>
                      #{item.order_code || item.id.slice(0, 6).toUpperCase()} •{" "}
                      {item.pickup_point || "Main Gate Stall"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusTag,
                      item.order_status === "completed" && {
                        backgroundColor: "#DCFCE7",
                      },
                      item.order_status === "cancelled" && {
                        backgroundColor: "#FEE2E2",
                      },
                      preparing && {
                        backgroundColor: "#DBEAFE",
                      },
                      isReady && {
                        backgroundColor: "#E0E7FF",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        item.order_status === "completed" && {
                          color: Colors.success,
                        },
                        item.order_status === "cancelled" && {
                          color: Colors.danger,
                        },
                        preparing && {
                          color: "#1D4ED8",
                        },
                        isReady && {
                          color: "#4338CA",
                        },
                      ]}
                    >
                      {getOrderStatusLabel(item.order_status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemSummary} numberOfLines={2}>
                      {itemSummary}
                    </Text>
                    <Text style={styles.pickupWindow} numberOfLines={2}>
                      {item.pickup_venue ||
                        item.pickup_point ||
                        "Pickup location pending"}
                      {" · "}
                      {pickupDate}
                      {" · "}
                      {item.pickup_time_window ||
                        item.pickup_time ||
                        "Time pending"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amount}>
                      ₱{Number(item.total_amount || 0).toFixed(2)}
                    </Text>
                    <Text
                      style={[
                        styles.payBadge,
                        paymentStatus !== "paid" && styles.unpaidBadge,
                      ]}
                    >
                      {item.payment_method === "cash"
                        ? "Cash on Pick-up"
                        : "GCash"}{" "}
                      • {paymentStatusLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.paymentDetailsBtn}
                    onPress={() => setDetailsOrder(item)}
                  >
                    <Text style={styles.paymentDetailsText}>
                      Payment Details
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => openOrderChat(item.id)}
                  >
                    <MessageSquare size={14} color={Colors.primary} />
                    <Text style={styles.chatText}>Chat</Text>
                  </TouchableOpacity>

                  {item.order_status === "pending" && !needsGcashReview ? (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() => handleStatusUpdate(item.id, "approved")}
                    >
                      <Bell size={14} color="#FFF" />
                      <Text style={styles.completeText}>Start Preparing</Text>
                    </TouchableOpacity>
                  ) : item.order_status === "pending" && needsGcashReview ? (
                    <TouchableOpacity
                      style={styles.reviewReceiptBtn}
                      onPress={() => setDetailsOrder(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Review GCash receipt for order ${item.order_code}`}
                    >
                      <Text style={styles.reviewReceiptText}>Review GCash</Text>
                    </TouchableOpacity>
                  ) : null}

                  {preparing ? (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() =>
                        handleStatusUpdate(item.id, "ready_for_pickup")
                      }
                    >
                      <CheckCircle2 size={14} color="#FFF" />
                      <Text style={styles.completeText}>Mark Ready</Text>
                    </TouchableOpacity>
                  ) : null}

                  {isReady ? (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() => handleStatusUpdate(item.id, "completed")}
                    >
                      <CheckCircle2 size={14} color="#FFF" />
                      <Text style={styles.completeText}>Mark Claimed</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      </View>

      {/* Bottom Bulk Notify Bar */}
      {tab === "pending" && filtered.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={toggleSelectAll}
          >
            {selectedIds.length === filtered.length ? (
              <CheckSquare size={18} color={Colors.primary} />
            ) : (
              <Square size={18} color={Colors.textMuted} />
            )}
            <Text style={styles.selectAllText}>
              Select all ({selectedIds.length || filtered.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notifyBtn} onPress={handleBulkNotify}>
            <Bell size={14} color="#FFF" />
            <Text style={styles.notifyText}>Start Preparing</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* QR Code Verification Modal */}
      <Modal visible={scanOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Scan Buyer QR Pass</Text>
                <Text style={styles.modalSub}>
                  Scan the pass or enter its order reference below.
                </Text>
                <View style={styles.cameraFrame}>
                  {scanOpen && cameraPermission?.granted && !cameraError ? (
                    <CameraView
                      style={styles.cameraPreview}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={
                        scanPaused ? undefined : handleBarcodeScanned
                      }
                      onMountError={({ message }) => setCameraError(message)}
                    />
                  ) : (
                    <View style={styles.cameraFallback}>
                      <QrCode size={28} color={Colors.primary} />
                      <Text style={styles.cameraFallbackText}>
                        {cameraError
                          ? `Camera unavailable: ${cameraError}`
                          : !cameraPermission
                            ? "Checking camera permission..."
                            : cameraPermission.canAskAgain
                              ? "Allow camera access to scan the buyer's pass."
                              : "Camera access is disabled. Enter the order code below."}
                      </Text>
                      {cameraPermission &&
                        !cameraPermission.granted &&
                        cameraPermission.canAskAgain && (
                          <TouchableOpacity
                            style={styles.permissionBtn}
                            onPress={retryCameraPermission}
                          >
                            <Text style={styles.permissionBtnText}>
                              Enable Camera
                            </Text>
                          </TouchableOpacity>
                        )}
                    </View>
                  )}
                </View>
                {scanFeedback && (
                  <View style={styles.scanFeedbackBox}>
                    <Text style={styles.scanFeedbackText}>{scanFeedback}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        scannerPaused.current = false;
                        setScanPaused(false);
                        setScanFeedback(null);
                      }}
                      style={styles.scanAgainBtn}
                    >
                      <Text style={styles.scanAgainText}>Scan Again</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={styles.manualCodeLabel}>Order code fallback</Text>
                <TextInput
                  style={styles.qrInput}
                  placeholder="e.g. AGH-240913"
                  autoCapitalize="characters"
                  value={qrInput}
                  onChangeText={setQrInput}
                  editable={!isVerifying}
                  accessibilityLabel="Buyer order reference code"
                />
                <TouchableOpacity
                  style={[
                    styles.verifyBtn,
                    isVerifying && styles.verifyBtnDisabled,
                  ]}
                  onPress={() => void verifyOrderCode()}
                  disabled={isVerifying}
                >
                  <Text style={styles.verifyText}>
                    {isVerifying ? "Completing Order..." : "Confirm Handover"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={closeScanner}
                  style={{ marginTop: 12 }}
                  disabled={isVerifying}
                >
                  <Text
                    style={{ textAlign: "center", color: Colors.textMuted }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OrderDetailsModal
        visible={detailsOrder !== null}
        order={detailsOrder}
        onClose={() => setDetailsOrder(null)}
        reviewInProgress={reviewingOrderId === detailsOrder?.id}
        onApprovePayment={() => {
          if (detailsOrder) confirmGcashReview(detailsOrder, true);
        }}
        onRejectPayment={() => {
          if (detailsOrder) confirmGcashReview(detailsOrder, false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Platform.OS === "android" ? 48 : 36,
  },
  innerContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  header: { fontSize: 22, fontWeight: "800", color: Colors.text },
  subHeader: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  qrHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    justifyContent: "center",
  },
  qrHeaderBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
  },

  tabWrapper: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: Colors.background,
  },
  tabCountBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
  },
  tabCountTextActive: {
    color: "#FFF",
  },

  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 14,
  },
  qrIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  scanSub: { color: "#D8F3DC", fontSize: 11, marginTop: 1 },
  scanPill: {
    backgroundColor: "#FDE68A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  scanPillText: { fontSize: 11, fontWeight: "800", color: "#78350F" },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },

  card: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  buyerName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  buyerMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  statusTag: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagText: { fontSize: 10, fontWeight: "800", color: "#B45309" },

  itemBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  itemSummary: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },
  pickupWindow: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  amount: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.primary,
  },
  payBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.success,
    marginTop: 2,
  },
  unpaidBadge: {
    color: "#B45309",
  },

  btnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  paymentDetailsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  paymentDetailsText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  chatText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  completeBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  completeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFF",
  },
  reviewReceiptBtn: {
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#D97706",
  },
  reviewReceiptText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFF",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },
  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  notifyText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFF",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  cameraFrame: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111827",
    marginBottom: 12,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
    backgroundColor: "#F9FAFB",
  },
  cameraFallbackText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },
  scanFeedbackBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 12,
    gap: 8,
  },
  scanFeedbackText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: "600",
  },
  scanAgainBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  scanAgainText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.danger,
  },
  manualCodeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  qrInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  verifyBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  verifyBtnDisabled: {
    opacity: 0.55,
  },
  verifyText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
