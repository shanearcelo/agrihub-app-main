// src/app/admin/monetization.tsx
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  Coffee,
  ChevronDown,
  Eye,
  Pencil,
  Plus,
  Sprout,
  Store,
  Tag,
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { getCurrentSemester } from "../../lib/semesterFee";
import { supabase } from "../../lib/supabase";
import { getImageUrl } from "../../lib/uploadImageToSupabase";

interface SponsorAd {
  id: string;
  title: string;
  subtitle: string;
  duration_days: number;
  amount: number;
  status: "pending" | "approved" | "rejected";
  seller_id: string | null;
  banner_color?: string;
}

type VerifiedSeller = {
  id: string;
  full_name: string;
  store_name: string | null;
  department: string | null;
  semester_fee_paid: number;
  pending_payment: {
    id: string;
    amount: number;
    semester: string;
    created_at: string;
    receipt_url: string | null;
  } | null;
};

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

function showMessage(title: string, msg: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}: ${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function getFeaturedExpiration(durationDays: number): string {
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

export default function MonetizationScreen() {
  const [harvests, setHarvests] = useState<any[]>([]);
  const [featuredReviews, setFeaturedReviews] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<SponsorAd[]>([]);
  const [verifiedSellers, setVerifiedSellers] = useState<VerifiedSeller[]>([]);
  const [verifiedSellersLoaded, setVerifiedSellersLoaded] = useState(false);
  const [previewAd, setPreviewAd] = useState<SponsorAd | null>(null);
  const [selectedFeeSeller, setSelectedFeeSeller] =
    useState<VerifiedSeller | null>(null);
  const [feeActionBusy, setFeeActionBusy] = useState(false);
  const [featuredReviewBusyId, setFeaturedReviewBusyId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<SponsorAd | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellerPickerOpen, setSellerPickerOpen] = useState(false);

  // New sponsor form states
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newDays, setNewDays] = useState("7");
  const [newAmount, setNewAmount] = useState("210");

  const router = useRouter();

  const loadMonetizationData = useCallback(async () => {
    try {
      const currentSemester = getCurrentSemester();
      const [productsResult, sellersResult, feePaymentsResult, sponsorsResult] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select(
            "id, full_name, store_name, department",
          )
          .eq("role", "seller")
          .eq("verification_status", "verified")
          .eq("is_verified", true)
          .order("full_name"),
        supabase
          .from("seller_semester_payments")
          .select("id, seller_id, semester, amount, receipt_path, status, created_at")
          .eq("semester", currentSemester)
          .order("created_at", { ascending: false }),
        supabase.from("sponsors").select("*").order("created_at", { ascending: false }),
      ]);
      if (productsResult.error) throw productsResult.error;
      if (sellersResult.error) throw sellersResult.error;
      if (feePaymentsResult.error) throw feePaymentsResult.error;
      if (sponsorsResult.error) throw sponsorsResult.error;
      const productRows = productsResult.data || [];
      setHarvests(productRows);
      setFeaturedReviews(
        await Promise.all(
          productRows
            .filter((product) => product.featured_status === "pending_review")
            .map(async (product) => ({
              ...product,
              receipt_url: product.featured_receipt_path
                ? await getImageUrl(
                    "payment-receipts",
                    product.featured_receipt_path,
                  )
                : null,
            })),
        ),
      );
      const feePayments = feePaymentsResult.data || [];
      const sellerRows = await Promise.all(
        (sellersResult.data || []).map(async (seller) => {
          const sellerPayments = feePayments.filter(
            (payment) => payment.seller_id === seller.id,
          );
          const pending = sellerPayments.find(
            (payment) => payment.status === "pending",
          );
          return {
            ...seller,
            semester_fee_paid: Math.min(
              50,
              sellerPayments
                .filter((payment) => payment.status === "approved")
                .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
            ),
            pending_payment: pending
              ? {
                  id: pending.id,
                  amount: Number(pending.amount),
                  semester: pending.semester,
                  created_at: pending.created_at,
                  receipt_url: await getImageUrl(
                    "payment-receipts",
                    pending.receipt_path,
                  ),
                }
              : null,
          };
        }),
      );
      setVerifiedSellers(sellerRows);
      setVerifiedSellersLoaded(true);
      setSponsors((sponsorsResult.data || []) as SponsorAd[]);
      setActionError(null);
    } catch (error) {
      console.error("Failed to load monetization data:", error);
      const message = getErrorMessage(
        error,
        "Could not load monetization data.",
      );
      setActionError(message);
      showMessage("Data Unavailable", message);
    }
  }, []);

  async function reviewBoothPayment(approved: boolean) {
    const payment = selectedFeeSeller?.pending_payment;
    if (!payment) return;

    setFeeActionBusy(true);
    try {
      const { error } = await supabase.rpc("review_semester_payment", {
        p_payment_id: payment.id,
        p_approved: approved,
        p_rejection_reason: approved
          ? null
          : "Receipt was rejected by the administrator.",
      });
      if (error) throw error;
      await loadMonetizationData();
      setSelectedFeeSeller(null);
      showMessage(
        approved ? "Payment Approved" : "Payment Rejected",
        approved
          ? "The seller's approved booth fee has been updated."
          : "The submitted receipt was rejected.",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Could not update payment.");
      setActionError(message);
      showMessage("Payment Review Failed", message);
    } finally {
      setFeeActionBusy(false);
    }
  }

  async function handleReviewFeaturedPayment(item: any, approved: boolean) {
    setFeaturedReviewBusyId(item.id);
    try {
      const durationDays =
        Number(item.featured_days) ||
        (Number(item.featured_fee) === 20 ? 7 : 3);
      const update = approved
        ? {
            is_featured: true,
            featured_status: "active",
            featured_expires_at: getFeaturedExpiration(durationDays),
          }
        : {
            is_featured: false,
            featured_status: "unpaid",
            featured_expires_at: null,
          };
      const { data, error } = await supabase
        .from("products")
        .update(update)
        .eq("id", item.id)
        .eq("featured_status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This featured payment is no longer awaiting review.");
      }
      await loadMonetizationData();
      showMessage(
        approved ? "Featured Payment Approved" : "Featured Payment Rejected",
        approved
          ? `${item.title} is now featured for ${durationDays} days.`
          : `${item.title} remains unpaid and can be submitted again.`,
      );
    } catch (error) {
      const message = getErrorMessage(error, "Could not review featured payment.");
      setActionError(message);
      showMessage("Featured Payment Review Failed", message);
    } finally {
      setFeaturedReviewBusyId(null);
    }
  }

  async function recordManualBoothFee(targetAmount: 30 | 50) {
    if (!selectedFeeSeller) return;
    setFeeActionBusy(true);
    try {
      const { error } = await supabase.rpc("record_semester_fee_payment", {
        p_seller_id: selectedFeeSeller.id,
        p_target_amount: targetAmount,
        p_semester: getCurrentSemester(),
      });
      if (error) throw error;
      await loadMonetizationData();
      setSelectedFeeSeller(null);
      showMessage(
        "Booth Fee Recorded",
        `The seller's semester fee is now recorded as ₱${targetAmount} paid.`,
      );
    } catch (error) {
      const message = getErrorMessage(error, "Could not record payment.");
      setActionError(message);
      showMessage("Could Not Record Fee", message);
    } finally {
      setFeeActionBusy(false);
    }
  }

  function confirmManualRecord(targetAmount: 30 | 50) {
    const message = `Record this seller as having paid ₱${targetAmount} for the current semester?`;
    const record = () => void recordManualBoothFee(targetAmount);
    if (Platform.OS === "web") {
      if (window.confirm(message)) record();
      return;
    }
    Alert.alert("Record Booth Fee", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Record", onPress: record },
    ]);
  }

  useFocusEffect(
    useCallback(() => {
      void loadMonetizationData();
    }, [loadMonetizationData]),
  );

  function getSellerLabel(sellerId: string | null) {
    if (!sellerId) return "No linked seller";
    const seller = verifiedSellers.find((item) => item.id === sellerId);
    if (!seller) return "Previously linked seller (not verified)";
    return seller.store_name?.trim() || seller.full_name || "Verified seller";
  }

  function resetSponsorForm() {
    setNewTitle("");
    setNewSubtitle("");
    setNewDays("7");
    setNewAmount("210");
    setSelectedSellerId(null);
    setSellerPickerOpen(false);
    setEditingSponsor(null);
    setAddModalOpen(false);
  }

  function openNewSponsorForm() {
    resetSponsorForm();
    setAddModalOpen(true);
  }

  function openEditSponsorForm(sponsor: SponsorAd) {
    setEditingSponsor(sponsor);
    setNewTitle(sponsor.title);
    setNewSubtitle(sponsor.subtitle);
    setNewDays(String(sponsor.duration_days));
    setNewAmount(String(sponsor.amount));
    setSelectedSellerId(sponsor.seller_id || null);
    setSellerPickerOpen(false);
    setAddModalOpen(true);
  }

  async function toggleFeatured(id: string, currentVal: boolean) {
    const nextVal = !currentVal;
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_featured: nextVal })
        .eq("id", id);
      if (error) throw error;
      setHarvests((prev) =>
        prev.map((h) => (h.id === id ? { ...h, is_featured: nextVal } : h)),
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not update featured status.",
      );
      setActionError(message);
      showMessage("Error", message);
    }
  }

  async function updateSponsorStatus(
    id: string,
    status: "approved" | "rejected",
  ) {
    try {
      const { error } = await supabase
        .from("sponsors")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      setSponsors((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s)),
      );
      showMessage(
        "Updated",
        `Sponsor banner ${status === "approved" ? "approved & live" : "rejected"}.`,
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to update sponsor banner.",
      );
      setActionError(message);
      showMessage("Error", message);
    }
  }

  async function handleSaveSponsor() {
    if (!newTitle.trim() || !newSubtitle.trim()) {
      return showMessage("Missing Fields", "Enter sponsor name and promo.");
    }
    try {
      const payload = {
        title: newTitle.trim(),
        subtitle: newSubtitle.trim(),
        duration_days: Number(newDays) || 7,
        amount: Number(newAmount) || 210,
        status: editingSponsor?.status || "pending",
        banner_color: editingSponsor?.banner_color || "#065F46",
        seller_id: selectedSellerId,
      };
      if (editingSponsor) {
        const { data, error } = await supabase
          .from("sponsors")
          .update(payload)
          .eq("id", editingSponsor.id)
          .select("*")
          .single();
        if (error) throw error;
        setSponsors((prev) =>
          prev.map((sponsor) =>
            sponsor.id === editingSponsor.id ? (data as SponsorAd) : sponsor,
          ),
        );
        resetSponsorForm();
        showMessage("Updated", "Sponsor banner changes have been saved.");
      } else {
        const { data, error } = await supabase
          .from("sponsors")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        setSponsors((prev) => [data as SponsorAd, ...prev]);
        resetSponsorForm();
        showMessage("Added", "New sponsor banner added to review queue.");
      }
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to add sponsor banner.",
      );
      setActionError(message);
      showMessage("Error", message);
    }
  }

  const featuredCount = harvests.filter((h) => h.is_featured).length;
  const pendingFeaturedReviews = featuredReviews.length;
  const boothRevenue = verifiedSellers.reduce(
    (sum, seller) => sum + Number(seller.semester_fee_paid || 0),
    0,
  );
  const featuredRevenue = featuredCount * 20;
  const sponsorRevenue = sponsors
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const pendingSponsor = sponsors.find((s) => s.status === "pending");
  const activeSponsors = sponsors.filter((s) => s.status !== "pending");

  return (
    <View style={styles.container}>
      {/* Top Header */}
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
          <Text style={styles.header}>Monetization & Ads</Text>
          <Text style={styles.subHeader}>
            Booths • Featured (₱20) • Sponsors (₱30/day)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openNewSponsorForm}
        >
          <Plus size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
      >
        {actionError ? (
          <View style={styles.actionError} accessibilityRole="alert">
            <Text style={styles.actionErrorTitle}>Action failed</Text>
            <Text style={styles.actionErrorText}>{actionError}</Text>
          </View>
        ) : null}

        {/* 3-Column Revenue Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.sumBox}>
            <Text style={styles.sumLabel}>Booths (₱50/sem)</Text>
            <Text style={[styles.sumVal, { color: Colors.primary }]}>
              ₱{boothRevenue.toLocaleString()}
            </Text>
          </View>
          <View style={styles.sumBox}>
            <Text style={styles.sumLabel}>Featured (₱20)</Text>
            <Text style={[styles.sumVal, { color: "#D97706" }]}>
              ₱{featuredRevenue.toLocaleString()}
            </Text>
          </View>
          <View style={styles.sumBox}>
            <Text style={styles.sumLabel}>Sponsor Ads</Text>
            <Text style={[styles.sumVal, { color: "#059669" }]}>
              ₱{sponsorRevenue.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Sponsor Banner Queue */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Sponsor Banner Queue</Text>
            <View style={styles.pendingPill}>
              <Text style={styles.pendingPillText}>
                {sponsors.filter((s) => s.status === "pending").length} Pending
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={openNewSponsorForm}>
            <Text style={styles.manageLink}>+ New Ad</Text>
          </TouchableOpacity>
        </View>

        {pendingSponsor && (
          <View style={styles.queueCard}>
            <View
              style={[
                styles.bannerPreview,
                { backgroundColor: pendingSponsor.banner_color || "#78350F" },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sponsoredTag}>SPONSORED PREVIEW</Text>
                <Text style={styles.bannerTitle}>{pendingSponsor.title}</Text>
                <Text style={styles.bannerSub}>{pendingSponsor.subtitle}</Text>
              </View>
              <View style={styles.bannerIcon}>
                <Coffee size={22} color="#78350F" />
              </View>
            </View>

            <View style={styles.queueMetaRow}>
              <Text style={styles.queueMeta}>
                {getSellerLabel(pendingSponsor.seller_id)} •{" "}
                {pendingSponsor.duration_days} days
              </Text>
              <Text style={styles.queuePrice}>₱{pendingSponsor.amount}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() =>
                  updateSponsorStatus(pendingSponsor.id, "rejected")
                }
              >
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.previewBtn}
                onPress={() => setPreviewAd(pendingSponsor)}
              >
                <Eye size={13} color={Colors.text} />
                <Text style={styles.previewText}>Preview</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.previewBtn}
                onPress={() => openEditSponsorForm(pendingSponsor)}
                accessibilityRole="button"
                accessibilityLabel={`Edit sponsor banner ${pendingSponsor.title}`}
              >
                <Pencil size={13} color={Colors.text} />
                <Text style={styles.previewText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() =>
                  updateSponsorStatus(pendingSponsor.id, "approved")
                }
              >
                <Text style={styles.approveText}>✓ Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active / Reviewed Sponsor List */}
        {activeSponsors.map((ad) => (
          <View key={ad.id} style={styles.sponsorRowCard}>
            <View
              style={[
                styles.sponsorAvatar,
                { backgroundColor: ad.banner_color || Colors.primary },
              ]}
            >
              <Tag size={16} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sponsorName}>{ad.title}</Text>
              <Text style={styles.sponsorSub}>
                {ad.subtitle} • {ad.duration_days} days
              </Text>
              <Text style={styles.sponsorSeller}>
                {getSellerLabel(ad.seller_id)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.sponsorPrice}>₱{ad.amount}</Text>
              <Text
                style={[
                  styles.sponsorStatus,
                  {
                    color:
                      ad.status === "approved" ? Colors.success : Colors.danger,
                  },
                ]}
              >
                {ad.status.toUpperCase()}
              </Text>
              <TouchableOpacity
                style={styles.editSponsorBtn}
                onPress={() => openEditSponsorForm(ad)}
                accessibilityRole="button"
                accessibilityLabel={`Edit sponsor banner ${ad.title}`}
              >
                <Pencil size={12} color={Colors.primary} />
                <Text style={styles.editSponsorText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Featured Payment Review</Text>
          <Text style={styles.activeBadge}>
            {pendingFeaturedReviews} pending
          </Text>
        </View>
        {featuredReviews.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No featured payment receipts are awaiting review.
            </Text>
          </View>
        ) : (
          <View style={styles.logCard}>
            {featuredReviews.map((item, index) => (
              <View
                key={item.id}
                style={[
                  { paddingVertical: 12 },
                  index !== featuredReviews.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.border,
                  },
                ]}
              >
                <Text style={styles.cropTitle}>{item.title}</Text>
                <Text style={styles.feeModalMeta}>
                  ₱{Number(item.featured_fee)} • {Number(item.featured_days)} days
                  {item.featured_reference_number
                    ? ` • Ref ${item.featured_reference_number}`
                    : ""}
                </Text>
                {item.receipt_url ? (
                  <Image
                    source={{ uri: item.receipt_url }}
                    style={styles.feeReceipt}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.emptyText}>
                    Receipt image is unavailable.
                  </Text>
                )}
                <View style={styles.feeModalActions}>
                  <TouchableOpacity
                    style={[
                      styles.feeRejectButton,
                      featuredReviewBusyId && styles.feeDisabled,
                    ]}
                    disabled={!!featuredReviewBusyId}
                    onPress={() => void handleReviewFeaturedPayment(item, false)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reject featured payment for ${item.title}`}
                  >
                    <X size={14} color={Colors.danger} />
                    <Text style={styles.feeRejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.feeApproveButton,
                      featuredReviewBusyId && styles.feeDisabled,
                    ]}
                    disabled={!!featuredReviewBusyId}
                    onPress={() => void handleReviewFeaturedPayment(item, true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve featured payment for ${item.title}`}
                  >
                    <Check size={14} color="#FFF" />
                    <Text style={styles.feeApproveText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Active Featured Listings */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Active Featured Listings</Text>
          <Text style={styles.activeBadge}>{featuredCount} active</Text>
        </View>

        {harvests.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No harvest listings posted yet. Sellers can post harvests once
              verified.
            </Text>
          </View>
        ) : (
          <View style={styles.featuredGrid}>
            {harvests.map((item) => (
              <View key={item.id} style={styles.featuredCard}>
                <View style={styles.featuredTop}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.cropThumb}
                    />
                  ) : (
                    <View style={styles.cropFallback}>
                      <Sprout size={18} color={Colors.primary} />
                    </View>
                  )}
                  <View style={styles.priceTag}>
                    <Text style={styles.priceTagText}>
                      ₱{item.price_per_unit}/{item.unit}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cropTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cropSeller} numberOfLines={1}>
                  {item.seller_name || "Campus Agri Unit"}
                </Text>

                <View style={styles.toggleRow}>
                  <Text style={styles.pinLabel}>
                    {item.is_featured ? "Pinned (₱20)" : "Standard"}
                  </Text>
                  <Switch
                    value={!!item.is_featured}
                    onValueChange={() =>
                      toggleFeatured(item.id, !!item.is_featured)
                    }
                    trackColor={{ true: Colors.primary }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Booth Payment Log */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Booth Payment Log (₱50/sem)</Text>
          <Text style={styles.manageLink}>
            ₱{boothRevenue.toLocaleString()} Collected
          </Text>
        </View>

        <View style={styles.logCard}>
          {verifiedSellers.length === 0 ? (
            <Text style={styles.emptyText}>
              No verified seller units recorded yet.
            </Text>
          ) : (
            verifiedSellers.map((seller, idx) => (
              <TouchableOpacity
                key={seller.id}
                style={[
                  styles.logRow,
                  idx === verifiedSellers.length - 1 && {
                    borderBottomWidth: 0,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Inspect booth fee for ${seller.store_name?.trim() || seller.full_name}`}
                onPress={() => setSelectedFeeSeller(seller)}
              >
                <View style={styles.logLeft}>
                  <Store size={14} color={Colors.primary} />
                  <View>
                    <Text style={styles.logName}>
                      {seller.store_name?.trim() || seller.full_name}
                    </Text>
                    <Text style={styles.logDept}>{seller.department}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.logStatus}>
                    {seller.pending_payment
                      ? "PENDING REVIEW"
                      : seller.semester_fee_paid > 0
                        ? "APPROVED"
                        : "UNPAID"}
                  </Text>
                  <Text style={styles.logAmount}>
                    ₱{Number(seller.semester_fee_paid || 0)} / ₱50
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedFeeSeller}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedFeeSeller(null)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.feeModalCard}
            contentContainerStyle={styles.feeModalContent}
          >
            <Text style={styles.modalTitle}>Semester Booth Fee</Text>
            {actionError ? (
              <View style={styles.actionError} accessibilityRole="alert">
                <Text style={styles.actionErrorTitle}>Action failed</Text>
                <Text style={styles.actionErrorText}>{actionError}</Text>
              </View>
            ) : null}
            {selectedFeeSeller ? (
              <>
                <Text style={styles.feeModalName}>
                  {selectedFeeSeller.store_name?.trim() ||
                    selectedFeeSeller.full_name}
                </Text>
                <Text style={styles.feeModalMeta}>
                  {selectedFeeSeller.department || "Seller"} •{" "}
                  {getCurrentSemester()}
                </Text>
                <Text style={styles.feeModalAmount}>
                  ₱{selectedFeeSeller.semester_fee_paid} / ₱50 paid
                </Text>

                {selectedFeeSeller.pending_payment ? (
                  <>
                    <Text style={styles.feeModalMeta}>
                      Pending ₱{selectedFeeSeller.pending_payment.amount} receipt
                      {" • "}
                      {new Date(
                        selectedFeeSeller.pending_payment.created_at,
                      ).toLocaleString()}
                    </Text>
                    {selectedFeeSeller.pending_payment.receipt_url ? (
                      <Image
                        source={{
                          uri: selectedFeeSeller.pending_payment.receipt_url,
                        }}
                        style={styles.feeReceipt}
                        resizeMode="contain"
                        accessibilityLabel="Seller booth fee receipt"
                      />
                    ) : (
                      <Text style={styles.feeModalError}>
                        Receipt image is missing.
                      </Text>
                    )}
                    <View style={styles.feeModalActions}>
                      <TouchableOpacity
                        style={styles.feeRejectButton}
                        disabled={feeActionBusy}
                        onPress={() => {
                          const reject = () => void reviewBoothPayment(false);
                          if (Platform.OS === "web") {
                            if (
                              window.confirm(
                                "Reject this seller installment receipt?",
                              )
                            ) {
                              reject();
                            }
                          } else {
                            Alert.alert(
                              "Reject Payment",
                              "Reject this seller installment receipt?",
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Reject",
                                  style: "destructive",
                                  onPress: reject,
                                },
                              ],
                            );
                          }
                        }}
                      >
                        <X size={15} color={Colors.danger} />
                        <Text style={styles.feeRejectText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.feeApproveButton,
                          feeActionBusy && styles.feeDisabled,
                        ]}
                        disabled={feeActionBusy}
                        onPress={() => void reviewBoothPayment(true)}
                      >
                        <Check size={15} color="#FFF" />
                        <Text style={styles.feeApproveText}>
                          {feeActionBusy ? "Saving..." : "Approve"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={styles.feeModalMeta}>
                    No installment receipt is awaiting review.
                  </Text>
                )}

                {!selectedFeeSeller.pending_payment &&
                selectedFeeSeller.semester_fee_paid < 50 ? (
                  <View style={styles.manualRecordGroup}>
                    <Text style={styles.manualRecordTitle}>
                      Manual payment record
                    </Text>
                    {selectedFeeSeller.semester_fee_paid === 0 ? (
                      <TouchableOpacity
                        style={styles.feeApproveButton}
                        disabled={feeActionBusy}
                        onPress={() => confirmManualRecord(30)}
                      >
                        <Text style={styles.feeApproveText}>
                          Record ₱30 Initial Payment
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.feeApproveButton}
                      disabled={feeActionBusy}
                      onPress={() => confirmManualRecord(50)}
                    >
                      <Text style={styles.feeApproveText}>
                        Mark ₱50 Fully Paid
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              disabled={feeActionBusy}
              onPress={() => setSelectedFeeSeller(null)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Banner Preview Modal */}
      <Modal
        visible={!!previewAd}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAd(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Buyer Home Feed Preview</Text>
            {previewAd && (
              <View
                style={[
                  styles.bannerPreview,
                  {
                    backgroundColor: previewAd.banner_color || "#D97706",
                    marginVertical: 14,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sponsoredTag}>SPONSORED</Text>
                  <Text style={styles.bannerTitle}>{previewAd.title}</Text>
                  <Text style={styles.bannerSub}>{previewAd.subtitle}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setPreviewAd(null)}
            >
              <Text style={styles.modalCloseText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Sponsor Modal */}
      <Modal
        visible={addModalOpen}
        transparent
        animationType="slide"
        onRequestClose={resetSponsorForm}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.sponsorModalCard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              style={styles.sponsorModalScroll}
              contentContainerStyle={styles.sponsorModalContent}
              keyboardShouldPersistTaps="handled"
            >
            <Text style={styles.modalTitle}>
              {editingSponsor ? "Edit Sponsor Banner" : "New Campus Sponsor Banner"}
            </Text>
            {actionError ? (
              <View style={styles.actionError} accessibilityRole="alert">
                <Text style={styles.actionErrorTitle}>Action failed</Text>
                <Text style={styles.actionErrorText}>{actionError}</Text>
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Business / Unit Name"
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Promo tagline (e.g. 15% student discount)"
              value={newSubtitle}
              onChangeText={setNewSubtitle}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sponsorFieldLabel}>Duration (Days)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="7"
                  keyboardType="numeric"
                  value={newDays}
                  onChangeText={setNewDays}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sponsorFieldLabel}>Total Fee (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="210"
                  keyboardType="numeric"
                  value={newAmount}
                  onChangeText={setNewAmount}
                />
              </View>
            </View>
            <Text style={styles.sellerPickerLabel}>
              Link to a verified seller
            </Text>
            <TouchableOpacity
              style={styles.sellerPicker}
              onPress={() => setSellerPickerOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Select verified seller for sponsor banner"
              accessibilityState={{ expanded: sellerPickerOpen }}
            >
              <Text
                style={[
                  styles.sellerPickerText,
                  !selectedSellerId && styles.sellerPickerPlaceholder,
                ]}
              >
                {selectedSellerId
                  ? getSellerLabel(selectedSellerId)
                  : "No linked seller"}
              </Text>
              <ChevronDown size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            {sellerPickerOpen && (
              <ScrollView
                style={styles.sellerOptions}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <TouchableOpacity
                  style={styles.sellerOption}
                  onPress={() => {
                    setSelectedSellerId(null);
                    setSellerPickerOpen(false);
                  }}
                >
                  <Text style={styles.sellerOptionName}>No linked seller</Text>
                </TouchableOpacity>
                {verifiedSellers.map((seller) => (
                  <TouchableOpacity
                    key={seller.id}
                    style={styles.sellerOption}
                    onPress={() => {
                      setSelectedSellerId(seller.id);
                      setSellerPickerOpen(false);
                    }}
                  >
                    <Text style={styles.sellerOptionName}>
                      {seller.store_name?.trim() || seller.full_name}
                    </Text>
                    {!!seller.store_name && (
                      <Text style={styles.sellerOptionSub}>
                        {seller.full_name}
                        {seller.department ? ` • ${seller.department}` : ""}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
                {!verifiedSellersLoaded ? (
                  <Text style={styles.sellerOptionEmpty}>
                    Loading verified sellers...
                  </Text>
                ) : verifiedSellers.length === 0 ? (
                  <Text style={styles.sellerOptionEmpty}>
                    No approved verified sellers are available.
                  </Text>
                ) : null}
              </ScrollView>
            )}
            </ScrollView>
            <View style={styles.sponsorModalActions}>
              <TouchableOpacity
                style={[styles.rejectBtn, { flex: 1 }]}
                onPress={resetSponsorForm}
              >
                <Text style={styles.rejectText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveBtn, { flex: 1 }]}
                onPress={handleSaveSponsor}
              >
                <Text style={styles.approveText}>
                  {editingSponsor ? "Update Banner" : "Save Banner"}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  sumBox: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sumLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted },
  sumVal: { fontSize: 17, fontWeight: "800", marginTop: 4 },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  pendingPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingPillText: { fontSize: 10, fontWeight: "800", color: "#B45309" },
  manageLink: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  activeBadge: { fontSize: 11, fontWeight: "700", color: Colors.textMuted },

  queueCard: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  bannerPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  sponsoredTag: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FDE68A",
    letterSpacing: 0.6,
  },
  bannerTitle: { fontSize: 15, fontWeight: "800", color: "#FFF", marginTop: 2 },
  bannerSub: { fontSize: 11, color: "#FEF3C7", marginTop: 2 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  queueMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  queueMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  queuePrice: { fontSize: 13, fontWeight: "800", color: "#D97706" },
  actionRow: { flexDirection: "row", gap: 8 },
  rejectBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: "center",
  },
  rejectText: { fontSize: 12, fontWeight: "700", color: Colors.danger },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  approveBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  approveText: { fontSize: 12, fontWeight: "700", color: "#FFF" },

  sponsorRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  sponsorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sponsorName: { fontSize: 13, fontWeight: "800", color: Colors.text },
  sponsorSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  sponsorSeller: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: "600",
    marginTop: 3,
  },
  sponsorPrice: { fontSize: 13, fontWeight: "800", color: Colors.text },
  sponsorStatus: { fontSize: 9, fontWeight: "800", marginTop: 2 },
  editSponsorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  editSponsorText: { color: Colors.primary, fontSize: 10, fontWeight: "700" },

  featuredGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  featuredCard: {
    width: "48.3%",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featuredTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cropThumb: { width: 38, height: 38, borderRadius: 10 },
  cropFallback: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  priceTag: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priceTagText: { fontSize: 10, fontWeight: "800", color: "#B45309" },
  cropTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  cropSeller: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pinLabel: { fontSize: 10, fontWeight: "700", color: Colors.primary },

  logCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logName: { fontSize: 12, fontWeight: "800", color: Colors.text },
  logDept: { fontSize: 10, color: Colors.textMuted },
  logStatus: { fontSize: 9, fontWeight: "800", color: Colors.success },
  logAmount: { fontSize: 12, fontWeight: "800", color: Colors.text },
  actionError: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  actionErrorTitle: { color: Colors.danger, fontSize: 12, fontWeight: "800" },
  actionErrorText: { color: Colors.danger, fontSize: 12, marginTop: 4 },
  feeModalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#FFF",
    borderRadius: 18,
  },
  feeModalContent: { padding: 18 },
  feeModalName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 10,
  },
  feeModalMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  feeModalAmount: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 8,
  },
  feeReceipt: {
    width: "100%",
    height: 240,
    marginTop: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  feeModalError: { color: Colors.danger, fontSize: 12, marginTop: 10 },
  feeModalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  feeRejectButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 11,
  },
  feeRejectText: { color: Colors.danger, fontSize: 12, fontWeight: "800" },
  feeApproveButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    borderRadius: 11,
    backgroundColor: Colors.primary,
  },
  feeApproveText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  feeDisabled: { opacity: 0.6 },
  manualRecordGroup: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  manualRecordTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },

  emptyBox: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 18,
  },
  sponsorModalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    alignSelf: "center",
    backgroundColor: "#FFF",
    borderRadius: 18,
    overflow: "hidden",
  },
  sponsorModalScroll: { flexShrink: 1, maxHeight: "85%" },
  sponsorModalContent: { padding: 18, paddingBottom: 8 },
  sponsorModalActions: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: "#FFF",
  },
  sponsorFieldLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  modalCloseBtn: {
    backgroundColor: Colors.primary,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 11,
    backgroundColor: Colors.background,
    marginTop: 10,
    fontSize: 13,
  },
  sellerPickerLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
  },
  sellerPicker: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sellerPickerText: { flex: 1, color: Colors.text, fontSize: 13 },
  sellerPickerPlaceholder: { color: Colors.textMuted },
  sellerOptions: {
    maxHeight: 170,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    marginTop: 5,
  },
  sellerOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sellerOptionName: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  sellerOptionSub: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  sellerOptionEmpty: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    padding: 12,
  },
});
