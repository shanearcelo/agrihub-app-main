// src/app/seller/index.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Megaphone,
  MessageSquare,
  Plus,
  ShoppingBag,
  Sprout,
  Upload,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SemesterFeeCard } from "../../components/SemesterFeeCard";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { getSellerSemesterFeeSummary } from "../../lib/sellerSemesterPayments";
import { getCurrentSemester } from "../../lib/semesterFee";
import { supabase } from "../../lib/supabase";
import {
  createImageUploadPath,
  uploadPrivateImageToSupabase,
  type UploadableImageAsset,
} from "../../lib/uploadImageToSupabase";
import { verifyGcashReceiptImage } from "../../lib/verifyGcashReceipt";

const ADMIN_GCASH_NUMBER = "0993 832 9608";
const ADMIN_GCASH_NAME = "BABY SHANE ARCELO (ADSSU AgriHub)";

type FeaturedPaymentTarget = {
  id: string;
  title: string;
  featured_fee: number;
  featured_days: number | null;
};

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isScheduleExpired(availableDates: unknown): boolean {
  if (!Array.isArray(availableDates) || availableDates.length === 0)
    return false;
  const todayKey = getLocalDateKey(new Date());
  const validStrings = availableDates.filter(
    (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
  if (validStrings.length === 0) return false;
  return !validStrings.some((d) => d >= todayKey);
}

/**
 * Scans GCash receipts on mobile devices (where Web Workers / Tesseract are unavailable)
 * using OCR.space so Ref No. and Total Amount Sent are auto-verified on phones.
 */
async function scanGcashReceiptOnMobile(
  asset: UploadableImageAsset,
  expectedAmount: number,
): Promise<{
  isValid: boolean;
  needsManualReview?: boolean;
  referenceNumber?: string;
  reason?: string;
}> {
  if (!asset.base64) {
    return { isValid: true, needsManualReview: true };
  }
  const cleanBase64 = asset.base64
    .replace(/^data:image\/[^;,]+;base64,/i, "")
    .replace(/\s/g, "");
  const mimeType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const formData = new FormData();
    formData.append("apikey", "helloworld");
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("OCREngine", "2");
    formData.append("scale", "true");
    formData.append("base64Image", dataUrl);

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { isValid: true, needsManualReview: true };
    }
    const json = await response.json();
    const parsedResults = Array.isArray(json?.ParsedResults)
      ? json.ParsedResults
      : [];
    const rawText = parsedResults
      .map((item: { ParsedText?: string }) => item?.ParsedText || "")
      .join("\n");
    if (!rawText.trim()) {
      return { isValid: true, needsManualReview: true };
    }

    const upper = rawText.toUpperCase();
    const refLabelMatch = upper.match(
      /(?:REF(?:ERENCE)?\s*(?:NO\.?|NUMBER|#)?[:\s.\-]*)([0-9\s]{10,18})/,
    );
    const digitsOnlyRef = refLabelMatch?.[1]?.replace(/\s+/g, "");
    const fallbackRef = upper.match(/\b([0-9]{12,14})\b/)?.[1];
    const referenceNumber =
      digitsOnlyRef && digitsOnlyRef.length >= 10 ? digitsOnlyRef : fallbackRef;

    const hasReceiptKeywords =
      upper.includes("GCASH") ||
      upper.includes("TOTAL AMOUNT SENT") ||
      upper.includes("AMOUNT SENT") ||
      upper.includes("EXPRESS SEND") ||
      upper.includes("REF NO") ||
      Boolean(referenceNumber);

    if (!hasReceiptKeywords) {
      return {
        isValid: false,
        reason:
          "This image does not look like a GCash receipt. Please upload a screenshot showing Total Amount Sent and Ref No.",
      };
    }

    const amountRegex = new RegExp(
      `(?:₱|PHP|P\\s*)?${expectedAmount}(?:\\.00)?\\b`,
      "i",
    );
    const hasExpectedAmount = amountRegex.test(upper);

    if (referenceNumber || hasExpectedAmount) {
      return {
        isValid: true,
        needsManualReview: false,
        referenceNumber,
      };
    }
    return { isValid: true, needsManualReview: true };
  } catch {
    return { isValid: true, needsManualReview: true };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function SellerDashboardScreen() {
  const [unitName, setUnitName] = useState("Agri Dept - Unit 3");
  const [department, setDepartment] = useState("Agriculture Department");
  const [verificationStatus, setVerificationStatus] = useState<
    "pending" | "verified" | "rejected"
  >("pending");
  const [harvests, setHarvests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [semesterFeePaid, setSemesterFeePaid] = useState(0);
  const [semesterFeePaymentPending, setSemesterFeePaymentPending] =
    useState(false);
  const [semesterFeeError, setSemesterFeeError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Semester Booth Fee GCash Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentAmount, setSelectedPaymentAmount] = useState<
    15 | 20 | 30 | 50
  >(30);
  const [paymentKind, setPaymentKind] = useState<"semester" | "featured">(
    "semester",
  );
  const [featuredPaymentTarget, setFeaturedPaymentTarget] =
    useState<FeaturedPaymentTarget | null>(null);
  const [receiptImageAsset, setReceiptImageAsset] =
    useState<UploadableImageAsset | null>(null);
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [verifyingReceipt, setVerifyingReceipt] = useState(false);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [receiptNeedsManualReview, setReceiptNeedsManualReview] =
    useState(false);
  const [verifiedRefNo, setVerifiedRefNo] = useState<string | null>(null);
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(
    null,
  );
  const router = useRouter();

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const loadSellerData = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const feeSummaryPromise = getSellerSemesterFeeSummary(user.id)
        .then((summary) => ({ summary, error: null as string | null }))
        .catch((error: unknown) => ({
          summary: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load fee status.",
        }));
      const [
        { data: profile, error: profileError },
        { data: products, error: productsError },
        { data: orderRows, error: ordersError },
        { data: chatRows },
        feeResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, store_name, department, verification_status")
          .eq("id", user.id)
          .single(),
        supabase.from("products").select("*").eq("seller_id", user.id),
        supabase.from("orders").select("*").eq("seller_id", user.id),
        supabase.from("chats").select("id").eq("seller_id", user.id),
        feeSummaryPromise,
      ]);
      if (profileError) throw profileError;
      if (productsError) throw productsError;
      if (ordersError) throw ordersError;

      setUnitName(
        profile.store_name || profile.full_name || "Agri Dept - Unit 3",
      );
      setDepartment(profile.department || "Agriculture Department");
      setVerificationStatus(profile.verification_status || "pending");
      setHarvests(products || []);
      setOrders(orderRows || []);

      const chatIds = (chatRows || []).map((c: { id: string }) => c.id);
      if (chatIds.length > 0) {
        const { data: unreadRows } = await supabase
          .from("messages")
          .select("chat_id")
          .in("chat_id", chatIds)
          .neq("sender_id", user.id)
          .eq("is_read", false);
        const unreadChatCount = new Set(
          (unreadRows || []).map((r: { chat_id: string }) => r.chat_id),
        ).size;
        setUnreadMessages(unreadChatCount);
      } else {
        setUnreadMessages(0);
      }

      setSemesterFeeError(feeResult.error);
      if (feeResult.summary) {
        setSemesterFeePaid(feeResult.summary.amountPaid);
        setSemesterFeePaymentPending(feeResult.summary.pendingReview);
      }
    } catch (error) {
      console.error("Failed to load seller dashboard:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSellerData();
    }, [loadSellerData]),
  );

  // Realtime listener on notifications + fallback poll
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const interval = setInterval(() => {
      void loadSellerData();
    }, 4000);
    void (async () => {
      const user = await getCurrentUser();
      if (!user) return;
      channel = supabase
        .channel(`seller-msg-notif-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void loadSellerData();
          },
        )
        .subscribe();
    })();
    return () => {
      clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadSellerData]);

  async function handleRefreshPickupDates(productId: string, title: string) {
    setRefreshingId(productId);
    try {
      const nextDates = Array.from({ length: 7 }, (_, index) => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + index);
        return getLocalDateKey(d);
      });
      const { error } = await supabase.rpc("update_product_pickup_dates", {
        p_product_id: productId,
        p_dates: nextDates,
      });
      if (error) throw error;
      await loadSellerData();
      showMessage(
        "Pickup Dates Updated",
        `${title} is now available for pickup over the next 7 days.`,
      );
    } catch (error: unknown) {
      showMessage(
        "Update Failed",
        error instanceof Error
          ? error.message
          : "Could not refresh pickup dates.",
      );
    } finally {
      setRefreshingId(null);
    }
  }

  function handleOpenPaymentModal(amount: 20 | 30 | 50) {
    setPaymentKind("semester");
    setFeaturedPaymentTarget(null);
    setSelectedPaymentAmount(amount);
    setReceiptImageAsset(null);
    setReceiptImageUri(null);
    setReceiptVerified(false);
    setReceiptNeedsManualReview(false);
    setVerifiedRefNo(null);
    setPaymentModalError(null);
    setShowPaymentModal(true);
  }

  function handleOpenFeaturedPayment(item: FeaturedPaymentTarget) {
    setPaymentKind("featured");
    setFeaturedPaymentTarget(item);
    setSelectedPaymentAmount(Number(item.featured_fee) === 20 ? 20 : 15);
    setReceiptImageAsset(null);
    setReceiptImageUri(null);
    setReceiptVerified(false);
    setReceiptNeedsManualReview(false);
    setVerifiedRefNo(null);
    setPaymentModalError(null);
    setShowPaymentModal(true);
  }

  async function runReceiptScan(
    asset: UploadableImageAsset,
    targetAmount: number,
  ) {
    setVerifyingReceipt(true);
    setReceiptVerified(false);
    setReceiptNeedsManualReview(false);
    setVerifiedRefNo(null);
    setPaymentModalError(null);
    const result =
      typeof Worker !== "undefined"
        ? await verifyGcashReceiptImage(asset, targetAmount)
        : await scanGcashReceiptOnMobile(asset, targetAmount);
    setVerifyingReceipt(false);
    if (!result.isValid) {
      const msg =
        result.reason ||
        "Receipt is unclear or not readable. Please upload a valid GCash Express Send receipt.";
      setPaymentModalError(msg);
      showMessage("Invalid Receipt", msg);
      return;
    }
    setReceiptVerified(true);
    setReceiptNeedsManualReview(Boolean(result.needsManualReview));
    setVerifiedRefNo(result.referenceNumber || null);
  }

  async function handleSelectAmount(amount: 20 | 30 | 50) {
    setSelectedPaymentAmount(amount);
    if (receiptImageAsset) {
      await runReceiptScan(receiptImageAsset, amount);
    }
  }

  async function takeReceiptPhoto() {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPaymentModalError(
            "Camera permission is required to take a photo of your GCash receipt.",
          );
          return;
        }
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });
      if (!res.canceled && res.assets?.length > 0) {
        const asset = res.assets[0];
        setReceiptImageAsset(asset);
        setReceiptImageUri(asset.uri);
        await runReceiptScan(asset, selectedPaymentAmount);
      }
    } catch (error) {
      setVerifyingReceipt(false);
      setPaymentModalError(
        error instanceof Error
          ? error.message
          : "Could not open camera. You can still upload from your gallery.",
      );
    }
  }

  async function pickReceiptPhoto() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });
      if (!res.canceled && res.assets?.length > 0) {
        const asset = res.assets[0];
        setReceiptImageAsset(asset);
        setReceiptImageUri(asset.uri);
        await runReceiptScan(asset, selectedPaymentAmount);
      }
    } catch (error) {
      setVerifyingReceipt(false);
      setPaymentModalError(
        error instanceof Error
          ? error.message
          : "Could not select receipt image.",
      );
    }
  }

  async function handleSubmitPayment() {
    if (!receiptImageAsset) {
      setPaymentModalError(
        "Please take a photo or upload a screenshot of your GCash payment receipt.",
      );
      return;
    }
    if (paymentModalError || !receiptVerified) {
      const msg =
        paymentModalError ||
        "Invalid Receipt: Please upload a valid GCash receipt matching the required details.";
      setPaymentModalError(msg);
      showMessage("Invalid Receipt", msg);
      return;
    }
    const user = await getCurrentUser();
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    setUploadingPayment(true);
    setPaymentModalError(null);
    try {
      const currentSemester = getCurrentSemester();
      const receiptPath = await uploadPrivateImageToSupabase(
        receiptImageAsset,
        "payment-receipts",
        createImageUploadPath(user.id, receiptImageAsset.mimeType),
      );
      if (paymentKind === "featured") {
        if (!featuredPaymentTarget) {
          throw new Error("Choose an unpaid featured harvest before paying.");
        }
        const durationDays =
          featuredPaymentTarget.featured_days ||
          (selectedPaymentAmount === 20 ? 7 : 3);
        const featuredUpdate = receiptNeedsManualReview
          ? {
              is_featured: false,
              featured_status: "pending_review",
              featured_receipt_path: receiptPath,
              featured_reference_number: verifiedRefNo,
            }
          : {
              is_featured: true,
              featured_status: "active",
              featured_expires_at: new Date(
                Date.now() + durationDays * 24 * 60 * 60 * 1000,
              ).toISOString(),
              featured_receipt_path: receiptPath,
              featured_reference_number: verifiedRefNo,
            };
        const { data: updatedProduct, error: updateError } = await supabase
          .from("products")
          .update(featuredUpdate)
          .eq("id", featuredPaymentTarget.id)
          .eq("seller_id", user.id)
          .eq("featured_status", "unpaid")
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedProduct) {
          throw new Error(
            "This featured harvest is no longer awaiting payment. Refresh the dashboard and try again.",
          );
        }
      } else if (receiptNeedsManualReview) {
        const { error: rpcError } = await supabase.rpc(
          "submit_semester_payment",
          {
            p_amount: selectedPaymentAmount,
            p_semester: currentSemester,
            p_receipt_path: receiptPath,
          },
        );
        if (rpcError) throw rpcError;
      } else {
        const { error: rpcError } = await supabase.rpc(
          "auto_approve_semester_payment",
          {
            p_amount: selectedPaymentAmount,
            p_semester: currentSemester,
            p_receipt_path: receiptPath,
            p_reference_number: verifiedRefNo,
          },
        );
        if (rpcError) throw rpcError;
      }

      setShowPaymentModal(false);
      setReceiptImageUri(null);
      setReceiptImageAsset(null);
      setReceiptVerified(false);
      setReceiptNeedsManualReview(false);
      setVerifiedRefNo(null);
      await loadSellerData();

      const referenceText = verifiedRefNo
        ? ` GCash Ref No. ${verifiedRefNo} was verified.`
        : " The receipt was verified from its transfer details.";
      showMessage(
        receiptNeedsManualReview
          ? "Payment Submitted for Review"
          : paymentKind === "featured"
            ? "Featured Placement Activated"
            : "Payment Auto-Approved!",
        receiptNeedsManualReview
          ? "Your receipt photo was submitted to Campus Admin for manual verification."
          : paymentKind === "featured"
            ? `${featuredPaymentTarget?.title} is now featured for ${featuredPaymentTarget?.featured_days || (selectedPaymentAmount === 20 ? 7 : 3)} days.${referenceText}`
            : `₱${selectedPaymentAmount}.00 has been verified and approved automatically.${referenceText}`,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Invalid Receipt: Could not verify and record your receipt.";
      setPaymentModalError(msg);
      showMessage("Invalid Receipt", msg);
    } finally {
      setUploadingPayment(false);
    }
  }

  const isVerified = verificationStatus === "verified";
  const now = new Date();
  const semesterStart = new Date(
    now.getFullYear(),
    now.getMonth() >= 7 ? 7 : 0,
    1,
  ).getTime();
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const revenueOrders = orders.filter(
    (order) => order.order_status !== "cancelled",
  );
  const totalRevenue = revenueOrders
    .filter(
      (order) =>
        order.created_at &&
        new Date(order.created_at).getTime() >= semesterStart,
    )
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const thisWeekRevenue = revenueOrders
    .filter(
      (order) =>
        order.created_at && new Date(order.created_at).getTime() >= weekStart,
    )
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const preOrderCount = harvests.filter(
    (h) => h.listing_type === "in_ground_preorder",
  ).length;
  const activeListings = harvests.filter(
    (listing) =>
      listing.status === "published" &&
      Number(listing.available_stock || 0) > 0,
  );
  const unpaidFeaturedHarvests = harvests.filter(
    (listing) => listing.featured_status === "unpaid",
  ) as FeaturedPaymentTarget[];
  const pendingReviewFeaturedHarvests = harvests.filter(
    (listing) => listing.featured_status === "pending_review",
  ) as FeaturedPaymentTarget[];
  const pendingOrders = orders.filter(
    (order) => order.order_status === "pending",
  );
  const lowStockListings = activeListings.filter(
    (listing) =>
      Number(listing.available_stock || 0) > 0 &&
      Number(listing.available_stock || 0) <= 5,
  );

  function handlePostPress() {
    if (!isVerified) {
      return showMessage(
        "Verification Required",
        "Your Seller / Farm Unit account is still PENDING Admin review. You can post harvests once approved by the Campus Admin.",
      );
    }
    router.push("/seller/post-harvest");
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={styles.dashboardContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Green Revenue Header */}
        <View style={styles.header}>
          <View style={styles.unitRow}>
            <View style={styles.unitAvatar}>
              <Sprout size={18} color="#FDE68A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitName} numberOfLines={1}>
                {unitName}
              </Text>
              <Text style={styles.unitSub} numberOfLines={1}>
                {department} • Seller Dashboard
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                !isVerified && { backgroundColor: "#F59E0B" },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {isVerified ? "● VERIFIED" : "● PENDING"}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.bellBtn}
                accessibilityRole="button"
                accessibilityLabel="Open chats"
                accessibilityHint="View conversations for your orders"
                onPress={() => router.push("/seller-screens/messages")}
              >
                <MessageSquare size={17} color="#FFF" />
                {unreadMessages > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifText}>{unreadMessages}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bellBtn}
                accessibilityRole="button"
                accessibilityLabel="Open orders"
                onPress={() => router.push("/seller/orders")}
              >
                <Bell size={16} color="#FFF" />
                {pendingOrders.length > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifText}>{pendingOrders.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.revRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.revLabel}>TOTAL REVENUE THIS SEMESTER</Text>
              <Text style={styles.revAmount}>
                ₱{totalRevenue.toLocaleString()}
              </Text>
              <Text style={styles.revSub}>
                This week: ₱{thisWeekRevenue.toLocaleString()} •{" "}
                {revenueOrders.length} orders
              </Text>
            </View>
            <View style={styles.weeklyBox}>
              <Text style={styles.weeklyLabel}>THIS WEEK</Text>
              <Text style={styles.weeklyAmount}>
                ₱{thisWeekRevenue.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        <SemesterFeeCard
          amountPaid={semesterFeePaid}
          pendingReview={semesterFeePaymentPending}
          error={semesterFeeError}
          onPay={handleOpenPaymentModal}
          onPress={() =>
            handleOpenPaymentModal(semesterFeePaid >= 30 ? 20 : 30)
          }
        />

        {(semesterFeePaid < 50 ||
          unpaidFeaturedHarvests.length > 0 ||
          pendingReviewFeaturedHarvests.length > 0) && (
          <View style={styles.balanceToPayCard}>
            <Text style={styles.balanceToPayTitle}>Balance to Pay</Text>
            {semesterFeePaid < 50 && (
              <View style={styles.balanceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceItemTitle}>
                    Semester Booth Fee
                  </Text>
                  <Text style={styles.balanceItemAmount}>
                    ₱{50 - semesterFeePaid} remaining
                    {semesterFeePaymentPending
                      ? " • Receipt pending review"
                      : ""}
                  </Text>
                </View>
                {!semesterFeePaymentPending && (
                  <TouchableOpacity
                    style={styles.balancePayButton}
                    onPress={() =>
                      handleOpenPaymentModal(semesterFeePaid >= 30 ? 20 : 30)
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Pay semester booth fee balance"
                  >
                    <Text style={styles.balancePayButtonText}>Pay Balance</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {unpaidFeaturedHarvests.map((listing) => (
              <View key={listing.id} style={styles.balanceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceItemTitle} numberOfLines={1}>
                    Featured • {listing.title}
                  </Text>
                  <Text style={styles.balanceItemAmount}>
                    ₱{Number(listing.featured_fee)} unpaid
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.balancePayButton}
                  onPress={() => handleOpenFeaturedPayment(listing)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay featured placement fee for ${listing.title}`}
                >
                  <Text style={styles.balancePayButtonText}>Pay Balance</Text>
                </TouchableOpacity>
              </View>
            ))}
            {pendingReviewFeaturedHarvests.map((listing) => (
              <View key={listing.id} style={styles.balanceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceItemTitle} numberOfLines={1}>
                    Featured • {listing.title}
                  </Text>
                  <Text style={styles.balanceItemAmount}>
                    ₱{Number(listing.featured_fee)} • Pending Admin review
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!isVerified && (
          <View style={styles.pendingBanner}>
            <AlertCircle size={20} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {verificationStatus === "rejected"
                  ? "Verification Rejected"
                  : "Awaiting Admin Verification"}
              </Text>
              <Text style={styles.pendingDesc}>
                {verificationStatus === "rejected"
                  ? "Your unit registration was declined. Please update your ID in Profile."
                  : "Campus Admin is reviewing your ID. Posting harvests is locked until verified."}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActions}
        >
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push("/seller/inventory")}
          >
            <ShoppingBag size={19} color={Colors.primary} />
            <Text style={styles.quickActionTitle}>Manage Inventory</Text>
            <Text style={styles.quickActionSub}>Update stock and prices</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push("/seller-screens/sponsor")}
          >
            <Megaphone size={19} color={Colors.primary} />
            <Text style={styles.quickActionTitle}>Sponsor My Store</Text>
            <Text style={styles.quickActionSub}>Request a placement</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push("/seller/profile")}
          >
            <CreditCard size={19} color={Colors.primary} />
            <Text style={styles.quickActionTitle}>Store Settings</Text>
            <Text style={styles.quickActionSub}>
              Contact and pickup details
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.kpiGrid}>
          <TouchableOpacity
            style={styles.kpiCard}
            onPress={() => router.push("/seller/inventory")}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: "#DCFCE7" }]}>
                <ShoppingBag size={16} color={Colors.primary} />
              </View>
              <Text style={styles.kpiBadge}>Published</Text>
            </View>
            <Text style={styles.kpiVal}>{activeListings.length}</Text>
            <Text style={styles.kpiLbl}>Active Listings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiCard}
            onPress={() => router.push("/seller/orders")}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: "#DBEAFE" }]}>
                <Bell size={16} color="#2563EB" />
              </View>
              <Text style={styles.kpiBadge}>Action needed</Text>
            </View>
            <Text style={styles.kpiVal}>{pendingOrders.length}</Text>
            <Text style={styles.kpiLbl}>Pending Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiCard}
            onPress={() => router.push("/seller/inventory")}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: "#FEF3C7" }]}>
                <AlertCircle size={16} color="#B45309" />
              </View>
              <Text style={[styles.kpiBadge, styles.warningBadge]}>
                Restock
              </Text>
            </View>
            <Text style={styles.kpiVal}>{lowStockListings.length}</Text>
            <Text style={styles.kpiLbl}>Low-Stock Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiCard}
            onPress={() => router.push("/seller/inventory")}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: "#DBEAFE" }]}>
                <Clock size={16} color="#2563EB" />
              </View>
              <Text style={styles.kpiBadge}>Upcoming</Text>
            </View>
            <Text style={styles.kpiVal}>{preOrderCount}</Text>
            <Text style={styles.kpiLbl}>Pre-Order Listings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Listings</Text>
          <TouchableOpacity onPress={() => router.push("/seller/inventory")}>
            <Text style={styles.linkText}>Manage ›</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {activeListings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Sprout size={28} color={Colors.primary} />
              <Text style={styles.emptyTitle}>No Harvest Listings Yet</Text>
              <Text style={styles.emptySub}>
                {isVerified
                  ? "Tap '+ Post New Harvest' below to list your fresh crops."
                  : "Once verified by Admin, you can start posting harvests here."}
              </Text>
            </View>
          ) : (
            activeListings.slice(0, 5).map((item) => {
              const total = Number(item.total_stock || 1);
              const avail = Number(item.available_stock || 0);
              const pct = Math.min(100, Math.round((avail / total) * 100));
              const isLow = pct <= 25;
              const expiredDates = isScheduleExpired(item.available_dates);
              return (
                <View key={item.id} style={styles.harvestRow}>
                  <Image
                    source={{
                      uri: item.image_url?.startsWith("http")
                        ? item.image_url
                        : "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200",
                    }}
                    style={styles.thumb}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.hTopLine}>
                      <Text style={styles.hTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.typeBadge,
                          expiredDates && { backgroundColor: "#FEF3C7" },
                          !expiredDates &&
                            isLow && { backgroundColor: "#FEF2F2" },
                          !expiredDates &&
                            item.listing_type === "in_ground_preorder" && {
                              backgroundColor: "#DBEAFE",
                            },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeText,
                            expiredDates && { color: "#B45309" },
                            !expiredDates && isLow && { color: Colors.danger },
                            !expiredDates &&
                              item.listing_type === "in_ground_preorder" && {
                                color: "#1D4ED8",
                              },
                          ]}
                        >
                          {expiredDates
                            ? "Dates Expired"
                            : item.listing_type === "in_ground_preorder"
                              ? "Pre-Order"
                              : isLow
                                ? `${avail} left`
                                : "Selling fast"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.hMeta}>
                      ₱{item.price_per_unit}/{item.unit} • {avail}/{total}{" "}
                      {item.unit} available
                    </Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: isLow ? "#F59E0B" : Colors.primary,
                          },
                        ]}
                      />
                    </View>
                    {expiredDates && (
                      <TouchableOpacity
                        style={styles.refreshDatesBtn}
                        onPress={() =>
                          void handleRefreshPickupDates(item.id, item.title)
                        }
                        disabled={refreshingId === item.id}
                      >
                        <Calendar size={12} color={Colors.primary} />
                        <Text style={styles.refreshDatesText}>
                          {refreshingId === item.id
                            ? "Refreshing..."
                            : "Refresh Pickup Dates (+7 days)"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Floating + Post New Harvest Button */}
      <TouchableOpacity
        style={[styles.fab, !isVerified && { backgroundColor: "#6B7280" }]}
        onPress={handlePostPress}
      >
        {isVerified ? (
          <Plus size={18} color="#FFF" />
        ) : (
          <Lock size={16} color="#FFF" />
        )}
        <Text style={styles.fabText}>
          {isVerified ? "Post New Harvest" : "Verification Pending"}
        </Text>
      </TouchableOpacity>

      {/* Direct GCash Booth Fee Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!uploadingPayment) setShowPaymentModal(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {paymentKind === "featured"
                    ? "Featured Placement Fee"
                    : "Semester Booth Fee"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {paymentKind === "featured"
                    ? `${featuredPaymentTarget?.title || "Harvest"} • ${featuredPaymentTarget?.featured_days || (selectedPaymentAmount === 20 ? 7 : 3)} days`
                    : `Auto-Verified GCash Payment • ${getCurrentSemester()}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPaymentModal(false)}
                disabled={uploadingPayment}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {paymentKind === "semester" && semesterFeePaid === 0 ? (
                <View style={styles.amountToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.amountToggleBtn,
                      selectedPaymentAmount === 30 &&
                        styles.amountToggleBtnActive,
                    ]}
                    onPress={() => void handleSelectAmount(30)}
                  >
                    <Text
                      style={[
                        styles.amountToggleText,
                        selectedPaymentAmount === 30 &&
                          styles.amountToggleTextActive,
                      ]}
                    >
                      ₱30 Installment
                    </Text>
                    <Text
                      style={[
                        styles.amountToggleSub,
                        selectedPaymentAmount === 30 && { color: "#D8F3DC" },
                      ]}
                    >
                      Unlock posting
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.amountToggleBtn,
                      selectedPaymentAmount === 50 &&
                        styles.amountToggleBtnActive,
                    ]}
                    onPress={() => void handleSelectAmount(50)}
                  >
                    <Text
                      style={[
                        styles.amountToggleText,
                        selectedPaymentAmount === 50 &&
                          styles.amountToggleTextActive,
                      ]}
                    >
                      ₱50 Full Fee
                    </Text>
                    <Text
                      style={[
                        styles.amountToggleSub,
                        selectedPaymentAmount === 50 && { color: "#D8F3DC" },
                      ]}
                    >
                      Full semester
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.amountPillFixed}>
                  <Text style={styles.amountPillFixedText}>
                    Paying{" "}
                    {paymentKind === "featured"
                      ? "Featured Placement"
                      : "Remaining Balance"}
                    : ₱{selectedPaymentAmount}
                  </Text>
                </View>
              )}
              <View style={styles.adminGcashBox}>
                <View style={styles.gcashBadge}>
                  <Text style={styles.gcashG}>G</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminGcashLabel}>
                    Send Payment To (Official ADSSU GCash):
                  </Text>
                  <Text style={styles.adminGcashNumber}>
                    {ADMIN_GCASH_NUMBER}
                  </Text>
                  <Text style={styles.adminGcashName}>{ADMIN_GCASH_NAME}</Text>
                </View>
              </View>
              <Text style={styles.modalInstructionText}>
                1. Open GCash and send{" "}
                <Text style={{ fontWeight: "800", color: Colors.primary }}>
                  ₱{selectedPaymentAmount}.00
                </Text>{" "}
                to {ADMIN_GCASH_NUMBER}.{"\n"}
                2. Take a photo or screenshot of your Express Send receipt.
                {"\n"}
                3. Upload below (tap Retake or Choose File anytime to replace).
              </Text>
              {receiptImageUri ? (
                <View
                  style={[
                    styles.modalReceiptUploadBox,
                    paymentModalError && {
                      borderColor: Colors.danger,
                      backgroundColor: "#FEF2F2",
                    },
                  ]}
                >
                  <Image
                    source={{ uri: receiptImageUri }}
                    style={styles.modalReceiptPreview}
                    accessibilityLabel="Selected GCash receipt"
                  />
                  <View style={styles.receiptActionChipsRow}>
                    <TouchableOpacity
                      style={styles.changeReceiptChip}
                      onPress={takeReceiptPhoto}
                      disabled={verifyingReceipt || uploadingPayment}
                    >
                      <Camera size={13} color="#FFF" />
                      <Text style={styles.changeReceiptChipText}>Retake</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.changeReceiptChip}
                      onPress={pickReceiptPhoto}
                      disabled={verifyingReceipt || uploadingPayment}
                    >
                      <Upload size={13} color="#FFF" />
                      <Text style={styles.changeReceiptChipText}>
                        Choose File
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.receiptPickerRow}>
                  <TouchableOpacity
                    style={[
                      styles.receiptPickerBtn,
                      {
                        backgroundColor: Colors.primary,
                        borderColor: Colors.primary,
                      },
                    ]}
                    onPress={takeReceiptPhoto}
                    disabled={verifyingReceipt || uploadingPayment}
                  >
                    <Camera size={22} color="#FFF" />
                    <Text
                      style={[styles.receiptPickerBtnTitle, { color: "#FFF" }]}
                    >
                      Take Photo
                    </Text>
                    <Text
                      style={[styles.receiptPickerBtnSub, { color: "#D8F3DC" }]}
                    >
                      Use camera
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.receiptPickerBtn}
                    onPress={pickReceiptPhoto}
                    disabled={verifyingReceipt || uploadingPayment}
                  >
                    <Upload size={22} color={Colors.primary} />
                    <Text style={styles.receiptPickerBtnTitle}>
                      Choose File
                    </Text>
                    <Text style={styles.receiptPickerBtnSub}>From gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
              {verifyingReceipt && (
                <View style={styles.verifyingBanner}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.verifyingText}>
                    Verifying GCash receipt details...
                  </Text>
                </View>
              )}
              {receiptVerified && !verifyingReceipt && (
                <View style={styles.verifiedBanner}>
                  <CheckCircle2 size={16} color={Colors.primary} />
                  <Text style={styles.verifiedText}>
                    {receiptNeedsManualReview
                      ? "Receipt attached • Requires Admin review"
                      : verifiedRefNo
                        ? `Receipt Verified • Ref No. ${verifiedRefNo}`
                        : "Receipt Verified • Transfer details detected"}
                  </Text>
                </View>
              )}
              {paymentModalError && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={15} color={Colors.danger} />
                  <Text style={styles.errorBannerText}>
                    {paymentModalError}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.submitPaymentBtn,
                  (!receiptVerified ||
                    verifyingReceipt ||
                    uploadingPayment) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={() => void handleSubmitPayment()}
                disabled={
                  !receiptVerified || verifyingReceipt || uploadingPayment
                }
              >
                <Text style={styles.submitPaymentText}>
                  {uploadingPayment
                    ? "Recording Payment..."
                    : `Confirm & Submit ₱${selectedPaymentAmount} Payment`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardContent: {
    paddingBottom: 92,
  },
  balanceToPayCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  balanceToPayTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  balanceItemTitle: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  balanceItemAmount: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  balancePayButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: Colors.primary,
  },
  balancePayButtonText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Platform.OS === "web" ? 22 : 52,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unitAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  unitName: { fontSize: 16, fontWeight: "800", color: "#FFF" },
  unitSub: { fontSize: 11, color: "#D8F3DC" },
  statusBadge: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  notifText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
  },
  revRow: { flexDirection: "row", alignItems: "flex-end" },
  revLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#A7F3D0",
    letterSpacing: 0.6,
  },
  revAmount: { fontSize: 32, fontWeight: "800", color: "#FFF", marginTop: 2 },
  revSub: { fontSize: 11, color: "#D8F3DC", marginTop: 2 },
  weeklyBox: {
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  weeklyLabel: { fontSize: 9, color: "#D8F3DC", fontWeight: "800" },
  weeklyAmount: {
    fontSize: 14,
    color: "#FFF",
    fontWeight: "800",
    marginTop: 2,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  pendingTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  pendingDesc: { fontSize: 11, color: "#B45309", marginTop: 2 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  kpiCard: {
    width: "48.3%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kpiTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  kpiBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.primary,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  warningBadge: {
    color: "#B45309",
    backgroundColor: "#FEF3C7",
  },
  kpiVal: { fontSize: 20, fontWeight: "800", color: Colors.text, marginTop: 8 },
  kpiLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  quickActions: {
    paddingHorizontal: 16,
    gap: 10,
  },
  quickAction: {
    width: 148,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 8,
  },
  quickActionSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  linkText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  emptyBox: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 8 },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  harvestRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  thumb: { width: 54, height: 54, borderRadius: 12 },
  hTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hTitle: { fontSize: 14, fontWeight: "800", color: Colors.text, flex: 1 },
  typeBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  typeText: { fontSize: 10, fontWeight: "800", color: Colors.primary },
  hMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  progressTrack: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  refreshDatesBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  refreshDatesText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 4,
  },
  fabText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "90%",
  },
  modalScrollContent: {
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  modalSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  amountToggleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  amountToggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: "#F9FAFB",
  },
  amountToggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  amountToggleText: { fontSize: 13, fontWeight: "800", color: Colors.text },
  amountToggleTextActive: { color: "#FFF" },
  amountToggleSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  amountPillFixed: {
    backgroundColor: "#DCFCE7",
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  amountPillFixedText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
  adminGcashBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  gcashBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#007DFE",
    justifyContent: "center",
    alignItems: "center",
  },
  gcashG: { color: "#FFF", fontSize: 19, fontWeight: "900" },
  adminGcashLabel: { fontSize: 11, color: "#1E40AF", fontWeight: "600" },
  adminGcashNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E3A8A",
    marginTop: 1,
  },
  adminGcashName: { fontSize: 11, color: "#3B82F6", fontWeight: "700" },
  modalInstructionText: {
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
    marginBottom: 12,
  },
  modalReceiptUploadBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  modalReceiptPreview: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    resizeMode: "cover",
  },
  receiptPickerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  receiptPickerBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  receiptPickerBtnTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 4,
  },
  receiptPickerBtnSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  receiptActionChipsRow: {
    position: "absolute",
    bottom: 18,
    right: 18,
    flexDirection: "row",
    gap: 6,
  },
  changeReceiptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  changeReceiptChipText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  verifyingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  verifyingText: { fontSize: 12, color: Colors.primary, fontWeight: "700" },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  verifiedText: { fontSize: 12, color: Colors.primary, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.danger,
    fontWeight: "700",
  },
  submitPaymentBtn: {
    backgroundColor: Colors.primary,
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitPaymentText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
});
