// src/app/seller-screens/subscription.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Receipt,
  Store,
  Upload,
} from "lucide-react-native";
import { useCallback, useState } from "react";
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
} from "react-native";
import { ReceiptCameraModal } from "../../components/ReceiptCameraModal";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import {
  getCurrentSemester,
  getSemesterPaymentStatus,
} from "../../lib/semesterFee";
import { supabase } from "../../lib/supabase";
import {
  createImageUploadPath,
  getImageUrl,
  uploadPrivateImageToSupabase,
  type UploadableImageAsset,
} from "../../lib/uploadImageToSupabase";
import { verifyGcashReceiptImage } from "../../lib/verifyGcashReceipt";

const ADMIN_GCASH_NUMBER = "0993 832 9608";
const ADMIN_GCASH_NAME = "BABY SHANE ARCELO (ADSSU AgriHub)";

type SubscriptionStatus = "unpaid" | "partial" | "paid";

interface ReceiptEntry {
  id: string;
  amount: number;
  receipt_url: string;
  reference_number?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  rejection_reason?: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function withTimeout<T>(
  request: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(request).then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function DigitalBoothScreen() {
  const { paymentId: paymentIdParam, pay: payParam } = useLocalSearchParams<{
    paymentId?: string | string[];
    pay?: string | string[];
  }>();
  const paymentId = Array.isArray(paymentIdParam)
    ? paymentIdParam[0]
    : paymentIdParam;
  const pay = Array.isArray(payParam) ? payParam[0] : payParam;
  const requestedAmount = pay === "20" ? 20 : pay === "30" ? 30 : null;

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus>("unpaid");
  const [amountPaid, setAmountPaid] = useState(0);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [semester, setSemester] = useState(getCurrentSemester());
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiptValidationError, setReceiptValidationError] = useState<
    string | null
  >(null);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [receiptNeedsManualReview, setReceiptNeedsManualReview] =
    useState(false);
  const [verifiedRefNo, setVerifiedRefNo] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<30 | 20 | null>(
    requestedAmount,
  );
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [receiptImageAsset, setReceiptImageAsset] =
    useState<UploadableImageAsset | null>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState(
    requestedAmount !== null,
  );
  const [showCameraModal, setShowCameraModal] = useState(false);

  const router = useRouter();

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const showError = useCallback(
    (title: string, error: unknown, fallback: string) => {
      const message = getErrorMessage(error, fallback);
      setErrorMessage(message);
      if (Platform.OS === "web") {
        window.alert(`${title}: ${message}`);
      } else {
        Alert.alert(title, message);
      }
    },
    [],
  );

  const loadSubscriptionData = useCallback(async () => {
    setErrorMessage(null);
    try {
      const user = await getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const currentSemester = getCurrentSemester();
      const { data: payments, error: paymentError } = await supabase
        .from("seller_semester_payments")
        .select(
          "id, amount, receipt_path, reference_number, status, created_at, rejection_reason",
        )
        .eq("seller_id", user.id)
        .eq("semester", currentSemester)
        .order("created_at", { ascending: false });
      if (paymentError) throw paymentError;
      setSemester(currentSemester);

      const paid = Math.min(
        50,
        (payments || [])
          .filter((payment) => payment.status === "approved")
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      );
      setAmountPaid(paid);
      setSubscriptionStatus(getSemesterPaymentStatus(paid));

      const receiptEntries = await Promise.all(
        (payments || []).map(async (payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          receipt_url:
            (await getImageUrl("payment-receipts", payment.receipt_path)) || "",
          reference_number: payment.reference_number,
          status: payment.status,
          created_at: payment.created_at,
          rejection_reason: payment.rejection_reason,
        })),
      );
      setReceipts(receiptEntries);
      setErrorMessage(null);
    } catch (error) {
      console.error("Failed to load semester fee:", error);
      setErrorMessage(
        getErrorMessage(error, "Could not load fee status. Please retry."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSubscriptionData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await withTimeout(
        loadSubscriptionData(),
        15_000,
        "Loading fee status timed out. Check your connection and retry.",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Could not load fee status. Please retry."),
      );
    } finally {
      setLoading(false);
    }
  }, [loadSubscriptionData]);

  useFocusEffect(
    useCallback(() => {
      if (requestedAmount !== null) {
        setSelectedAmount(requestedAmount);
        setShowPaymentFlow(true);
      }
      void refreshSubscriptionData();
    }, [refreshSubscriptionData, requestedAmount]),
  );

  async function runReceiptScan(
    asset: UploadableImageAsset,
    targetAmount: 30 | 20,
  ) {
    setVerifying(true);
    setReceiptVerified(false);
    setReceiptNeedsManualReview(false);
    setVerifiedRefNo(null);
    setReceiptValidationError(null);
    setErrorMessage(null);

    const result = await verifyGcashReceiptImage(asset, targetAmount);
    setVerifying(false);

    if (!result.isValid) {
      const msg =
        result.reason ||
        "Receipt is unclear or not readable. Please upload a valid GCash receipt.";
      setReceiptValidationError(msg);
      showMessage("Invalid Receipt", msg);
      return;
    }

    setReceiptVerified(true);
    setReceiptNeedsManualReview(Boolean(result.needsManualReview));
    setVerifiedRefNo(result.referenceNumber || null);
  }

  async function handleCameraCaptured(asset: UploadableImageAsset) {
    if (!selectedAmount) return;
    setReceiptImageAsset(asset);
    setReceiptImageUri(asset.uri);
    await runReceiptScan(asset, selectedAmount);
  }

  async function pickReceiptPhoto() {
    if (!selectedAmount) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });
      if (!res.canceled && res.assets?.length > 0) {
        const asset = res.assets[0];
        setReceiptImageAsset(asset);
        setReceiptImageUri(asset.uri);
        await runReceiptScan(asset, selectedAmount);
      }
    } catch (error) {
      setVerifying(false);
      setReceiptValidationError(
        error instanceof Error
          ? error.message
          : "Could not select the receipt image.",
      );
    }
  }

  async function handleSubmitPayment() {
    if (!receiptImageAsset || !selectedAmount) {
      return showMessage(
        "Missing Receipt",
        "Please take a photo or upload a screenshot of your GCash payment receipt.",
      );
    }

    if (receiptValidationError || !receiptVerified) {
      return showMessage(
        "Invalid Receipt",
        receiptValidationError ||
          "Please upload a valid GCash Express Send receipt matching the required details.",
      );
    }

    let user;
    try {
      user = await getCurrentUser();
    } catch (error) {
      return showError("Account Error", error, "Could not read your session.");
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const receiptPath = await uploadPrivateImageToSupabase(
        receiptImageAsset,
        "payment-receipts",
        createImageUploadPath(user.id, receiptImageAsset.mimeType),
      );

      const { error } = receiptNeedsManualReview
        ? await supabase.rpc("submit_semester_payment", {
            p_amount: selectedAmount,
            p_semester: semester,
            p_receipt_path: receiptPath,
          })
        : await supabase.rpc("auto_approve_semester_payment", {
            p_amount: selectedAmount,
            p_semester: semester,
            p_receipt_path: receiptPath,
            p_reference_number: verifiedRefNo,
          });
      if (error) throw error;

      setReceiptImageUri(null);
      setReceiptImageAsset(null);
      setSelectedAmount(null);
      setReceiptVerified(false);
      setReceiptNeedsManualReview(false);
      setVerifiedRefNo(null);
      setReceiptValidationError(null);
      setShowPaymentFlow(false);
      await refreshSubscriptionData();

      showMessage(
        receiptNeedsManualReview
          ? "Payment Submitted for Review"
          : "Payment Auto-Approved!",
        receiptNeedsManualReview
          ? "Your receipt photo was submitted to Campus Admin for manual verification."
          : verifiedRefNo
            ? `GCash Ref No. ${verifiedRefNo} (₱${selectedAmount}.00) has been verified and approved automatically!`
            : `The ₱${selectedAmount}.00 receipt has been verified and approved automatically.`,
      );
    } catch (e: unknown) {
      showError(
        "Invalid Receipt",
        e,
        "Could not verify and record your receipt.",
      );
    } finally {
      setUploading(false);
    }
  }

  function startPayment(amount: 30 | 20) {
    setSelectedAmount(amount);
    setReceiptImageUri(null);
    setReceiptImageAsset(null);
    setReceiptValidationError(null);
    setReceiptVerified(false);
    setVerifiedRefNo(null);
    setShowPaymentFlow(true);
  }

  const focusedPayment = receipts.find((receipt) => receipt.id === paymentId);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", padding: 24 },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading semester fee details…</Text>
        <TouchableOpacity
          style={styles.loadingBackButton}
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/seller");
          }}
        >
          <Text style={styles.loadingBackText}>Back to Seller Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/seller");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>Digital Booth</Text>
          <Text style={styles.subHeader}>
            Auto-verified GCash booth fee payment
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
      >
        {errorMessage ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorTitle}>Could not load fee status</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              accessibilityRole="button"
              onPress={() => void refreshSubscriptionData()}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {paymentId ? (
          <View style={styles.focusedPayment}>
            <Text style={styles.focusedPaymentTitle}>
              {focusedPayment ? "Payment record" : "Payment record unavailable"}
            </Text>
            {focusedPayment ? (
              <>
                <Text style={styles.focusedPaymentText}>
                  ₱{focusedPayment.amount} • AUTO-APPROVED
                </Text>
                {focusedPayment.reference_number ? (
                  <Text style={styles.focusedPaymentText}>
                    Ref No. {focusedPayment.reference_number}
                  </Text>
                ) : null}
                <Text style={styles.focusedPaymentText}>
                  Paid {new Date(focusedPayment.created_at).toLocaleString()}
                </Text>
                {focusedPayment.receipt_url ? (
                  <Image
                    source={{ uri: focusedPayment.receipt_url }}
                    style={styles.focusedPaymentImage}
                    accessibilityLabel="Receipt for the selected semester payment"
                  />
                ) : null}
              </>
            ) : (
              <Text style={styles.focusedPaymentText}>
                This installment may belong to another semester or was removed.
              </Text>
            )}
          </View>
        ) : null}

        <View
          style={[
            styles.statusBanner,
            subscriptionStatus === "paid" && styles.statusPaid,
            subscriptionStatus === "partial" && styles.statusPartial,
            subscriptionStatus === "unpaid" && styles.statusUnpaid,
          ]}
        >
          <View style={styles.statusTopRow}>
            <View
              style={[
                styles.statusPill,
                subscriptionStatus === "paid" && { backgroundColor: "#BBF7D0" },
                subscriptionStatus === "partial" && {
                  backgroundColor: "#FDE68A",
                },
                subscriptionStatus === "unpaid" && {
                  backgroundColor: "#FECACA",
                },
              ]}
            >
              {subscriptionStatus === "paid" ? (
                <CheckCircle2 size={12} color="#14532D" />
              ) : (
                <Clock size={12} color="#92400E" />
              )}
              <Text
                style={[
                  styles.statusPillText,
                  subscriptionStatus === "unpaid" && { color: "#991B1B" },
                ]}
              >
                {subscriptionStatus === "paid"
                  ? "FULLY PAID"
                  : subscriptionStatus === "partial"
                    ? `PARTIAL — ₱${50 - amountPaid} REMAINING`
                    : "UNPAID"}
              </Text>
            </View>
            <Store size={20} color="rgba(255,255,255,0.5)" />
          </View>

          <Text style={styles.bannerTitle}>Semester Booth Fee</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceVal}>₱{amountPaid}</Text>
            <Text style={styles.priceUnit}>/ ₱50 paid</Text>
          </View>
          <Text style={styles.termText}>{semester}</Text>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Payment progress</Text>
            <Text style={styles.progressPct}>
              {Math.round((amountPaid / 50) * 100)}%
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, (amountPaid / 50) * 100)}%` },
              ]}
            />
          </View>
        </View>

        {showPaymentFlow &&
        selectedAmount !== null &&
        !errorMessage &&
        ((selectedAmount === 30 && amountPaid < 30) ||
          (selectedAmount === 20 && amountPaid >= 30 && amountPaid < 50)) ? (
          <View style={styles.paymentFlowCard}>
            <Text style={styles.paymentFlowTitle}>
              Pay ₱{selectedAmount}.00 via GCash
            </Text>

            <View style={styles.adminGcashBox}>
              <View style={styles.gcashBadge}>
                <Text style={styles.gcashG}>G</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminGcashLabel}>
                  Send exact amount to:
                </Text>
                <Text style={styles.adminGcashNumber}>
                  {ADMIN_GCASH_NUMBER}
                </Text>
                <Text style={styles.adminGcashName}>{ADMIN_GCASH_NAME}</Text>
              </View>
            </View>

            <Text style={styles.instructionText}>
              1. Open GCash and send ₱{selectedAmount}.00 to{" "}
              {ADMIN_GCASH_NUMBER}
              {"\n"}2. Take a photo or screenshot of your Express Send receipt
              {"\n"}3. Submit below — the system validates your receipt
              automatically
            </Text>

            {receiptImageUri ? (
              <View
                style={[
                  styles.receiptUploadBox,
                  receiptValidationError && {
                    borderColor: Colors.danger,
                    backgroundColor: "#FEF2F2",
                  },
                ]}
              >
                <Image
                  source={{ uri: receiptImageUri }}
                  style={styles.receiptPreview}
                />
                <View style={styles.receiptActionChipsRow}>
                  <TouchableOpacity
                    style={styles.changeReceiptChip}
                    onPress={() => setShowCameraModal(true)}
                    disabled={verifying || uploading}
                  >
                    <Camera size={13} color="#FFF" />
                    <Text style={styles.changeReceiptChipText}>Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.changeReceiptChip}
                    onPress={pickReceiptPhoto}
                    disabled={verifying || uploading}
                  >
                    <Upload size={13} color="#FFF" />
                    <Text style={styles.changeReceiptChipText}>
                      Choose File
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.uploadOptionsRow}>
                <TouchableOpacity
                  style={styles.uploadOptionCard}
                  onPress={() => setShowCameraModal(true)}
                  disabled={verifying || uploading}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Camera size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.uploadOptionTitle}>Take Photo</Text>
                  <Text style={styles.uploadOptionSub}>Use camera</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.uploadOptionCard}
                  onPress={pickReceiptPhoto}
                  disabled={verifying || uploading}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Upload size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.uploadOptionTitle}>Upload Receipt</Text>
                  <Text style={styles.uploadOptionSub}>From gallery</Text>
                </TouchableOpacity>
              </View>
            )}

            {verifying ? (
              <View style={styles.scanningBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.scanningText}>
                  Scanning and verifying receipt automatically...
                </Text>
              </View>
            ) : receiptValidationError ? (
              <View style={styles.invalidReceiptBox}>
                <AlertCircle size={18} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.invalidReceiptTitle}>
                    Invalid Receipt
                  </Text>
                  <Text style={styles.invalidReceiptText}>
                    {receiptValidationError}
                  </Text>
                </View>
              </View>
            ) : receiptVerified ? (
              <View style={styles.validReceiptBox}>
                <CheckCircle2 size={18} color={Colors.success} />
                <Text style={styles.validReceiptText}>
                  {receiptNeedsManualReview
                    ? "Receipt attached • Requires Admin review"
                    : verifiedRefNo
                      ? `Valid GCash Receipt • Ref No. ${verifiedRefNo}`
                      : "Valid GCash Receipt • Transfer details detected"}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowPaymentFlow(false);
                  setReceiptImageUri(null);
                  setReceiptImageAsset(null);
                  setReceiptValidationError(null);
                  setReceiptVerified(false);
                  setReceiptNeedsManualReview(false);
                  setVerifiedRefNo(null);
                  setSelectedAmount(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitPayBtn,
                  (!receiptVerified || verifying || uploading) && {
                    opacity: 0.45,
                  },
                ]}
                onPress={handleSubmitPayment}
                disabled={!receiptVerified || verifying || uploading}
              >
                <Text style={styles.submitPayText}>
                  {uploading
                    ? "Completing..."
                    : `Confirm ₱${selectedAmount} Payment`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : errorMessage ? null : (
          <>
            {subscriptionStatus === "unpaid" && (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => startPayment(30)}
              >
                <Text style={styles.payBtnText}>Pay ₱30 Initial Booth Fee</Text>
                <Text style={styles.payBtnSub}>
                  Auto-approved instantly upon valid GCash receipt upload
                </Text>
              </TouchableOpacity>
            )}

            {subscriptionStatus === "partial" && (
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: "#D97706" }]}
                onPress={() => startPayment(amountPaid >= 30 ? 20 : 30)}
              >
                <Text style={styles.payBtnText}>
                  {amountPaid >= 30
                    ? "Pay Remaining ₱20"
                    : "Pay ₱30 Installment"}
                </Text>
                <Text style={styles.payBtnSub}>
                  {amountPaid >= 30
                    ? "Complete your ₱50 semester fee"
                    : "Reach the ₱30 posting requirement"}
                </Text>
              </TouchableOpacity>
            )}

            {subscriptionStatus === "paid" && (
              <View style={styles.paidBanner}>
                <CheckCircle2 size={20} color={Colors.success} />
                <Text style={styles.paidBannerText}>
                  You&apos;re all set! Your booth fee is fully paid for{" "}
                  {semester}.
                </Text>
              </View>
            )}
          </>
        )}

        {receipts.length > 0 && (
          <>
            <View style={styles.historyHeader}>
              <Receipt size={16} color={Colors.text} />
              <Text style={styles.sectionTitle}>Payment History</Text>
            </View>
            <View style={styles.historyCard}>
              {receipts.map((r) => (
                <View key={r.id} style={styles.historyRow}>
                  <View style={styles.histIcon}>
                    <CheckCircle2 size={15} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histTitle}>
                      {r.amount === 30
                        ? "Initial Payment"
                        : r.amount === 50
                          ? "Full Semester Payment"
                          : "Remaining Payment"}{" "}
                      — ₱{r.amount}
                    </Text>
                    <Text style={styles.histDate}>
                      AUTO-APPROVED
                      {r.reference_number ? ` • Ref ${r.reference_number}` : ""}
                      {" • "}
                      {new Date(r.created_at).toLocaleDateString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            How Instant Booth Verification Works
          </Text>
          <Text style={styles.infoText}>
            - The semester booth fee is ₱50 (₱30 initial + ₱20 remaining).{"\n"}
            - Send payment via GCash Express Send to {ADMIN_GCASH_NUMBER}.{"\n"}
            - Take a photo or upload a screenshot of your receipt.{"\n"}-
            Invalid or already-used receipts are rejected automatically; valid
            receipts unlock your booth immediately.
          </Text>
        </View>
      </ScrollView>

      <ReceiptCameraModal
        visible={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(asset) => void handleCameraCaptured(asset)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Platform.OS === "android" ? 48 : 52,
    minHeight: "100%",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
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
  statusBanner: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
  },
  focusedPayment: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  focusedPaymentTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  focusedPaymentText: {
    color: Colors.text,
    fontSize: 12,
    marginTop: 4,
  },
  errorBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  loadingBackButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  loadingBackText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  retryButtonText: { color: Colors.danger, fontSize: 12, fontWeight: "800" },
  errorTitle: { color: Colors.danger, fontSize: 12, fontWeight: "800" },
  errorText: { color: Colors.danger, fontSize: 12, marginTop: 4 },
  focusedPaymentImage: {
    width: "100%",
    height: 190,
    marginTop: 10,
    borderRadius: 10,
    resizeMode: "contain",
    backgroundColor: "#FFF",
  },
  statusPaid: { backgroundColor: Colors.primary },
  statusPartial: { backgroundColor: "#D97706" },
  statusUnpaid: { backgroundColor: "#991B1B" },
  statusTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: { fontSize: 10, fontWeight: "800", color: "#14532D" },
  bannerTitle: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.85,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  priceVal: { color: "#FFF", fontSize: 34, fontWeight: "800" },
  priceUnit: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
  },
  termText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 4,
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  progressLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "600",
  },
  progressPct: { color: "#FDE68A", fontSize: 10, fontWeight: "800" },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FDE68A",
    borderRadius: 3,
  },
  paymentFlowCard: {
    backgroundColor: "#FFF",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  paymentFlowTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 14,
  },
  adminGcashBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  gcashBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  gcashG: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  adminGcashLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },
  adminGcashNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 1,
  },
  adminGcashName: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  instructionText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  uploadOptionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  uploadOptionCard: {
    flex: 1,
    paddingVertical: 22,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadOptionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
  uploadOptionSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  receiptUploadBox: {
    height: 180,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  receiptPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  receiptActionChipsRow: {
    position: "absolute",
    bottom: 8,
    flexDirection: "row",
    gap: 8,
    alignSelf: "center",
  },
  changeReceiptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(17,24,39,0.78)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  changeReceiptChipText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  scanningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
  },
  scanningText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  invalidReceiptBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  invalidReceiptTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.danger,
  },
  invalidReceiptText: {
    fontSize: 12,
    color: "#991B1B",
    marginTop: 2,
  },
  validReceiptBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
  },
  validReceiptText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#15803D",
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelText: { fontWeight: "700", color: Colors.text, fontSize: 13 },
  submitPayBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  submitPayText: { fontWeight: "800", color: "#FFF", fontSize: 13 },
  payBtn: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  payBtnText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  payBtnSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 3,
    fontWeight: "600",
  },
  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#DCFCE7",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  paidBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#14532D",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  historyCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  histIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  histTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  histDate: { fontSize: 11, color: Colors.textMuted },
  infoCard: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 20,
  },
});
