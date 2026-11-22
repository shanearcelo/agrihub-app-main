// src/app/buyer-screens/orders-history.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  MessageSquare,
  QrCode,
  RefreshCw,
  Search,
  Sprout,
  Star,
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";
import {
  createImageUploadPath,
  uploadImageToSupabase,
  type UploadableImageAsset,
} from "../../lib/uploadImageToSupabase";

const REVIEW_TAGS = [
  "Fresh & clean",
  "Fair price",
  "On-time pick-up",
  "Friendly seller",
  "Well packed",
];

const RATING_LABELS: Record<number, string> = {
  5: "Very Fresh!",
  4: "Fresh & Good!",
  3: "Satisfactory",
  2: "Needs Improvement",
  1: "Not Fresh",
};

function formatReceiptDate(value: unknown): string {
  if (!value) return "Not specified";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPickupDate(value: unknown): string {
  if (!value) return "Not specified";
  const str = String(value);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(str)
    ? new Date(`${str}T12:00:00`)
    : new Date(str);
  if (Number.isNaN(parsed.getTime())) return str;
  return parsed.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OrdersHistoryScreen() {
  const [filter, setFilter] = useState<
    "all" | "active" | "completed" | "cancelled"
  >("all");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [reviewOrder, setReviewOrder] = useState<any>(null);
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "Fresh & clean",
    "On-time pick-up",
  ]);
  const [comment, setComment] = useState("");
  const [attachedPhotos, setAttachedPhotos] = useState<UploadableImageAsset[]>(
    [],
  );
  const [submittingReview, setSubmittingReview] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(
    null,
  );
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      const loadOrders = async (buyerId: string) => {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("buyer_id", buyerId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (active) setOrders(data || []);
      };

      void (async () => {
        try {
          const currentUser = await getCurrentUser();
          if (!active) return;
          if (!currentUser) {
            router.replace("/auth/login");
            return;
          }
          await loadOrders(currentUser.id);
          if (!active) return;
          channel = supabase
            .channel(`buyer-orders:${currentUser.id}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "orders",
                filter: `buyer_id=eq.${currentUser.id}`,
              },
              () => {
                void loadOrders(currentUser.id).catch((error: unknown) =>
                  console.error("Could not refresh buyer orders.", error),
                );
              },
            )
            .subscribe();
        } catch (error) {
          console.error("Could not load buyer orders.", error);
          showMessage(
            "Orders Unavailable",
            error instanceof Error
              ? error.message
              : "Could not load your orders.",
          );
        }
      })();

      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [router]),
  );

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  async function cancelOrder(item: any) {
    setCancellingOrderId(item.id);
    try {
      const { error } = await supabase.rpc("set_order_status", {
        p_order_id: item.id,
        p_status: "cancelled",
      });
      if (error) throw error;
      setOrders((current) =>
        current.map((order) =>
          order.id === item.id
            ? { ...order, order_status: "cancelled", status: "cancelled" }
            : order,
        ),
      );
      showMessage(
        "Order Cancelled",
        `Order #${item.order_code} was cancelled.`,
      );
    } catch (error) {
      showMessage(
        "Cancellation Failed",
        error instanceof Error ? error.message : "Could not cancel this order.",
      );
    } finally {
      setCancellingOrderId(null);
    }
  }

  function confirmCancelOrder(item: any) {
    const confirm = () => {
      void cancelOrder(item);
    };
    const message = `Cancel order #${item.order_code}? Its reserved stock will be released.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) confirm();
      return;
    }
    Alert.alert("Cancel Order", message, [
      { text: "Keep Order", style: "cancel" },
      { text: "Cancel Order", style: "destructive", onPress: confirm },
    ]);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function pickReviewPhoto() {
    if (attachedPhotos.length >= 3) {
      return showMessage("Limit Reached", "Maximum of 3 photos allowed.");
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.35,
      base64: true,
    }).catch((error: unknown) => {
      showMessage(
        "Image Selection Failed",
        error instanceof Error
          ? error.message
          : "Could not select the review photo.",
      );
      return null;
    });
    if (!res) return;
    if (!res.canceled && res.assets?.length > 0) {
      setAttachedPhotos((prev) => [...prev, res.assets[0]]);
    }
  }

  async function submitReview() {
    if (!reviewOrder) return;

    setSubmittingReview(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }
      const photoUrls = await Promise.all(
        attachedPhotos.map(async (photo, index) => {
          const filePath = createImageUploadPath(
            currentUser.id,
            photo.mimeType,
            `${reviewOrder.id}-${index}`,
          );
          return uploadImageToSupabase(photo, "review-photos", filePath);
        }),
      );
      const { error: reviewError } = await supabase.from("reviews").insert({
        order_id: reviewOrder.id,
        order_code: reviewOrder.order_code || "",
        buyer_id: currentUser.id,
        seller_id: reviewOrder.seller_id || "",
        seller_name: reviewOrder.seller_name || "Agri Unit",
        rating,
        tags: selectedTags,
        comment: comment.trim(),
        photos: photoUrls,
      });
      if (reviewError) throw reviewError;

      const { error: orderError } = await supabase
        .from("orders")
        .update({ reviewed: true, buyer_rating: rating })
        .eq("id", reviewOrder.id);
      if (orderError) throw orderError;

      showMessage("Thank You!", "Your harvest review has been submitted.");
      setReviewOrder(null);
      setComment("");
      setAttachedPhotos([]);
    } catch (error: unknown) {
      showMessage(
        "Submission Failed",
        error instanceof Error
          ? error.message
          : "Could not submit your review.",
      );
    } finally {
      setSubmittingReview(false);
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

  const filtered = orders.filter((o) => {
    const st = String(o.status || "pending").toLowerCase();
    if (filter === "active" && (st === "completed" || st === "cancelled"))
      return false;
    if (filter === "completed" && st !== "completed") return false;
    if (filter === "cancelled" && st !== "cancelled") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const firstCrop = (o.items?.[0]?.crop_name || "").toLowerCase();
      const code = (o.order_code || "").toLowerCase();
      const seller = (o.seller_name || "").toLowerCase();
      return firstCrop.includes(q) || code.includes(q) || seller.includes(q);
    }
    return true;
  });

  const receiptItems = Array.isArray(receiptOrder?.items)
    ? receiptOrder.items
    : [];
  const receiptStatusLower = String(
    receiptOrder?.status || receiptOrder?.order_status || "completed",
  ).toLowerCase();
  const isReceiptPaid =
    receiptOrder?.payment_status === "paid" ||
    receiptStatusLower === "completed";
  const receiptMethodLabel =
    String(receiptOrder?.payment_method || "").toLowerCase() === "cash"
      ? "Cash on Pick-up"
      : "GCash";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.push("/buyer");
            }}
          >
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.header}>My Orders</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowSearch(!showSearch)}
          >
            <Search size={19} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search crop, stall, or #AGH code..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {/* 4 Filter Pills (All, Active, Completed, Cancelled) */}
        <View style={styles.tabRow}>
          {(["all", "active", "completed", "cancelled"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, filter === t && styles.tabActive]}
              onPress={() => setFilter(t)}
            >
              <Text style={[styles.tabText, filter === t && { color: "#FFF" }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 34 }}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Sprout size={34} color={Colors.primary} />
              <Text style={styles.emptyTitle}>No orders found</Text>
              <Text style={styles.emptySub}>
                Your active pre-orders and completed campus pick-ups appear
                here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const st = String(item.status || "confirmed").toLowerCase();
            const isCompleted = st === "completed";
            const isCancelled = st === "cancelled";
            const isPreOrder = item.order_type === "pre_order";
            const firstItem = item.items?.[0];
            const extraCount =
              Array.isArray(item.items) && item.items.length > 1
                ? ` +${item.items.length - 1}`
                : firstItem?.quantity
                  ? ` • ${firstItem.quantity} ${firstItem.unit || "kg"}`
                  : "";

            const badgeLabel = isCompleted
              ? "COMPLETED"
              : isCancelled
                ? "CANCELLED"
                : isPreOrder
                  ? "PRE-ORDER • GROWING"
                  : st === "ready" || st === "ready_for_pickup"
                    ? "READY FOR PICK-UP"
                    : "CONFIRMED";

            return (
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  {firstItem?.image_url ? (
                    <Image
                      source={{ uri: firstItem.image_url }}
                      style={styles.thumbImg}
                    />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <Sprout size={22} color={Colors.primary} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {firstItem?.crop_name || "Fresh Harvest"}
                        {extraCount}
                      </Text>
                      <Text style={styles.amount}>
                        ₱{Number(item.total_amount || 0).toFixed(2)}
                      </Text>
                    </View>

                    <Text style={styles.seller}>
                      {item.seller_name || "Agri Dept - Unit 3"} •{" "}
                      {item.pickup_point || "Gate 2"}
                    </Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.orderCode}>#{item.order_code}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          isCompleted && { backgroundColor: "#DCFCE7" },
                          isCancelled && { backgroundColor: "#FEE2E2" },
                          isPreOrder &&
                            !isCompleted && { backgroundColor: "#DBEAFE" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isCompleted && { color: "#15803D" },
                            isCancelled && { color: "#DC2626" },
                            isPreOrder && !isCompleted && { color: "#1D4ED8" },
                          ]}
                        >
                          {badgeLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Bottom Action Buttons */}
                <View style={styles.btnRow}>
                  {!isCompleted ? (
                    <>
                      <TouchableOpacity
                        style={styles.outlineBtn}
                        onPress={() => openOrderChat(item.id)}
                      >
                        <MessageSquare size={14} color={Colors.text} />
                        <Text style={styles.outlineText}>Message Seller</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.fillBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/order-success/[id]",
                            params: { id: item.order_code },
                          })
                        }
                      >
                        <QrCode size={14} color="#FFF" />
                        <Text style={styles.fillText}>Show QR Pass</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.outlineBtn}
                        onPress={() => setReceiptOrder(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`View receipt for order ${item.order_code}`}
                      >
                        <FileText size={14} color={Colors.primary} />
                        <Text
                          style={[
                            styles.outlineText,
                            { color: Colors.primary },
                          ]}
                        >
                          View Receipt
                        </Text>
                      </TouchableOpacity>

                      {item.reviewed ? (
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          onPress={() => router.push("/buyer")}
                        >
                          <RefreshCw size={14} color={Colors.primary} />
                          <Text style={styles.reorderText}>Re-order</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.rateBtn}
                          onPress={() => {
                            setReviewOrder(item);
                            setRating(5);
                            setComment("");
                            setAttachedPhotos([]);
                          }}
                        >
                          <Star size={14} color="#B45309" fill="#F59E0B" />
                          <Text style={styles.rateText}>Rate & Review</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

                {item.order_status === "pending" && (
                  <TouchableOpacity
                    style={[
                      styles.cancelOrderBtn,
                      cancellingOrderId === item.id &&
                        styles.cancelOrderDisabled,
                    ]}
                    disabled={cancellingOrderId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel order ${item.order_code}`}
                    onPress={() => confirmCancelOrder(item)}
                  >
                    <X size={14} color={Colors.danger} />
                    <Text style={styles.cancelOrderText}>
                      {cancellingOrderId === item.id
                        ? "Cancelling..."
                        : "Cancel Order"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />

        {/* Digital Order Receipt Modal */}
        <Modal
          visible={!!receiptOrder}
          transparent
          animationType="fade"
          onRequestClose={() => setReceiptOrder(null)}
        >
          <View style={styles.receiptModalBg}>
            <View style={styles.receiptModalCard}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {/* Receipt Header */}
                <View style={styles.receiptTopBar}>
                  <View style={styles.receiptBrandRow}>
                    <View style={styles.receiptBrandIcon}>
                      <Sprout size={16} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.receiptBrand}>ADSSU AGRIHUB</Text>
                      <Text style={styles.receiptDocLabel}>
                        Official Digital Receipt
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.closeModalBtn}
                    onPress={() => setReceiptOrder(null)}
                    accessibilityLabel="Close receipt"
                  >
                    <X size={18} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Paid Status Banner */}
                <View
                  style={[
                    styles.paidBanner,
                    !isReceiptPaid && styles.unpaidBanner,
                  ]}
                >
                  <CheckCircle2
                    size={20}
                    color={isReceiptPaid ? "#15803D" : "#B45309"}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.paidBannerTitle,
                        !isReceiptPaid && { color: "#92400E" },
                      ]}
                    >
                      {isReceiptPaid ? "PAID" : "PENDING PAYMENT"}
                    </Text>
                    <Text
                      style={[
                        styles.paidBannerSub,
                        !isReceiptPaid && { color: "#B45309" },
                      ]}
                    >
                      {isReceiptPaid
                        ? `Settled via ${receiptMethodLabel} • Order Completed`
                        : `${receiptMethodLabel} • Pay upon campus pick-up`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.paidPill,
                      !isReceiptPaid && { backgroundColor: "#FDE68A" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paidPillText,
                        !isReceiptPaid && { color: "#92400E" },
                      ]}
                    >
                      {isReceiptPaid ? "VERIFIED" : "DUE"}
                    </Text>
                  </View>
                </View>

                {/* Order Code & Timestamp */}
                <View style={styles.receiptCodeBox}>
                  <Text style={styles.receiptCodeLabel}>ORDER REFERENCE</Text>
                  <Text style={styles.receiptCodeValue}>
                    #{receiptOrder?.order_code || receiptOrder?.id}
                  </Text>
                  <Text style={styles.receiptDateText}>
                    {formatReceiptDate(receiptOrder?.created_at)}
                  </Text>
                </View>

                {/* Order & Pickup Details */}
                <View style={styles.receiptDetailsBox}>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Seller / Unit</Text>
                    <Text style={styles.receiptDetailValue}>
                      {receiptOrder?.seller_name || "AgriHub Seller"}
                    </Text>
                  </View>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Buyer</Text>
                    <Text style={styles.receiptDetailValue}>
                      {receiptOrder?.buyer_name || "Campus Buyer"}
                    </Text>
                  </View>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>
                      Payment Method
                    </Text>
                    <Text style={styles.receiptDetailValue}>
                      {receiptMethodLabel}
                    </Text>
                  </View>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Pick-up Date</Text>
                    <Text style={styles.receiptDetailValue}>
                      {formatPickupDate(receiptOrder?.pickup_date)}
                      {receiptOrder?.pickup_time
                        ? ` • ${receiptOrder.pickup_time}`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Pick-up Venue</Text>
                    <Text style={styles.receiptDetailValue}>
                      {receiptOrder?.pickup_venue ||
                        receiptOrder?.pickup_point ||
                        "Campus Pick-up"}
                    </Text>
                  </View>
                </View>

                <View style={styles.dashedDivider} />

                {/* Itemized Produce List */}
                <Text style={styles.receiptSectionTitle}>ITEMS PURCHASED</Text>
                {receiptItems.length === 0 ? (
                  <Text style={styles.receiptDetailLabel}>
                    Order item details unavailable
                  </Text>
                ) : (
                  receiptItems.map((orderItem: any, idx: number) => {
                    const cropTitle =
                      orderItem.crop_name || orderItem.title || "Fresh Harvest";
                    const qty = Number(orderItem.quantity || 0);
                    const unit = orderItem.unit || "kg";
                    const unitPrice = Number(
                      orderItem.price_per_unit ?? orderItem.pricePerUnit ?? 0,
                    );
                    const lineTotal = qty * unitPrice;

                    return (
                      <View
                        key={`${cropTitle}-${idx}`}
                        style={styles.receiptItemRow}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.receiptItemName}>
                            {cropTitle}
                          </Text>
                          <Text style={styles.receiptItemMeta}>
                            {qty} {unit} × ₱{unitPrice.toFixed(2)}
                          </Text>
                        </View>
                        <Text style={styles.receiptItemAmount}>
                          ₱{lineTotal.toFixed(2)}
                        </Text>
                      </View>
                    );
                  })
                )}

                <View style={styles.dashedDivider} />

                {/* Total Paid */}
                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>
                    {isReceiptPaid ? "Total Paid" : "Total Amount"}
                  </Text>
                  <Text style={styles.receiptTotalValue}>
                    ₱{Number(receiptOrder?.total_amount || 0).toFixed(2)}
                  </Text>
                </View>

                <Text style={styles.receiptFooterNote}>
                  Thank you for supporting local ADSSU campus growers.
                </Text>

                <TouchableOpacity
                  style={styles.closeReceiptBtn}
                  onPress={() => setReceiptOrder(null)}
                >
                  <Text style={styles.closeReceiptBtnText}>Close Receipt</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Rating & Review Modal */}
        <Modal visible={!!reviewOrder} transparent animationType="slide">
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
                  <View style={styles.modalHeader}>
                    <View style={{ width: 28 }} />
                    <Text style={styles.modalTitle}>Rate your harvest</Text>
                    <TouchableOpacity
                      style={styles.closeModalBtn}
                      onPress={() => setReviewOrder(null)}
                    >
                      <X size={18} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalSub}>
                    How fresh was your produce from{" "}
                    {reviewOrder?.seller_name || "Agri Unit"}?
                  </Text>

                  {/* Selected Harvest Mini Banner */}
                  {reviewOrder && (
                    <View style={styles.reviewItemBanner}>
                      <View style={styles.bannerThumb}>
                        <Sprout size={18} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bannerTitle}>
                          {reviewOrder.items?.[0]?.crop_name || "Fresh Harvest"}
                        </Text>
                        <Text style={styles.bannerMeta}>
                          Order #{reviewOrder.order_code} • Picked up
                        </Text>
                      </View>
                      <View style={styles.completedTag}>
                        <Text style={styles.completedTagText}>Completed</Text>
                      </View>
                    </View>
                  )}

                  {/* 5 Interactive Stars */}
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <TouchableOpacity key={s} onPress={() => setRating(s)}>
                        <Star
                          size={34}
                          color="#F59E0B"
                          fill={s <= rating ? "#F59E0B" : "transparent"}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.ratingLabel}>
                    {RATING_LABELS[rating] || "Very Fresh!"}
                  </Text>

                  {/* Quick Feedback Tag Chips */}
                  <View style={styles.tagsWrap}>
                    {REVIEW_TAGS.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[
                            styles.tagChip,
                            active && styles.tagChipActive,
                          ]}
                          onPress={() => toggleTag(tag)}
                        >
                          <Text
                            style={[
                              styles.tagChipText,
                              active && {
                                color: Colors.primary,
                                fontWeight: "800",
                              },
                            ]}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Written Review Input */}
                  <Text style={styles.inputLbl}>Your review</Text>
                  <TextInput
                    style={styles.reviewInput}
                    placeholder="Super presko! Nilinis ra agad at tamang-tama ang timbang. Will order again next week."
                    multiline
                    maxLength={250}
                    value={comment}
                    onChangeText={setComment}
                  />
                  <Text style={styles.charCount}>{comment.length}/250</Text>

                  {/* Attach Photo Bar */}
                  <TouchableOpacity
                    style={styles.attachRow}
                    onPress={pickReviewPhoto}
                  >
                    <Camera size={16} color={Colors.primary} />
                    <Text style={styles.attachText}>
                      Attach photo ({attachedPhotos.length}/3)
                    </Text>
                  </TouchableOpacity>

                  {attachedPhotos.length > 0 && (
                    <View style={styles.photoPreviewRow}>
                      {attachedPhotos.map((photo, i) => (
                        <Image
                          key={i}
                          source={{ uri: photo.uri }}
                          style={styles.reviewPhotoThumb}
                        />
                      ))}
                    </View>
                  )}

                  {/* Submit Feedback Button */}
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      submittingReview && { opacity: 0.7 },
                    ]}
                    onPress={submitReview}
                    disabled={submittingReview}
                  >
                    <Text style={styles.submitText}>
                      {submittingReview ? "Submitting..." : "✓ Submit Feedback"}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 52 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { fontSize: 19, fontWeight: "800", color: Colors.text },
  searchWrap: { paddingHorizontal: 16, marginBottom: 10 },
  searchInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
  },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 4,
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: "700", color: Colors.text },

  emptyCard: {
    backgroundColor: "#FFF",
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    marginTop: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", marginTop: 10 },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },

  card: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTopRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  thumbImg: { width: 54, height: 54, borderRadius: 12 },
  thumbFallback: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
  },
  amount: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
  },
  seller: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  orderCode: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  statusBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  outlineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  outlineText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  fillBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  fillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFF",
  },
  reorderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  reorderText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
  },
  rateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  rateText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B45309",
  },
  cancelOrderBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  cancelOrderDisabled: {
    opacity: 0.6,
  },
  cancelOrderText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.danger,
  },

  /* View Receipt Modal Styles */
  receiptModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  receiptModalCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  receiptTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  receiptBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  receiptBrandIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  receiptBrand: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1,
  },
  receiptDocLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
  },
  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  unpaidBanner: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  paidBannerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#15803D",
    letterSpacing: 0.5,
  },
  paidBannerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
    marginTop: 1,
  },
  paidPill: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paidPillText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  receiptCodeBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  receiptCodeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  receiptCodeValue: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 2,
  },
  receiptDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  receiptDetailsBox: {
    gap: 8,
  },
  receiptDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  receiptDetailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  receiptDetailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  dashedDivider: {
    borderBottomWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.border,
    marginVertical: 14,
  },
  receiptSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    gap: 10,
  },
  receiptItemName: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
  },
  receiptItemMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  receiptItemAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
  },
  receiptTotalValue: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.primary,
  },
  receiptFooterNote: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 14,
  },
  closeReceiptBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  closeReceiptBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
  },

  /* Rating & Review Modal Styles */
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
  },
  closeModalBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 14,
  },
  reviewItemBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  bannerThumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
  },
  bannerMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  completedTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#15803D",
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 6,
  },
  ratingLabel: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    color: "#B45309",
    marginBottom: 14,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tagChipActive: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text,
  },
  inputLbl: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: Colors.background,
    fontSize: 13,
    minHeight: 84,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 10,
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    marginBottom: 12,
  },
  attachText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  photoPreviewRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  reviewPhotoThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
