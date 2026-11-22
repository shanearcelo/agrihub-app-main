// src/app/seller/post-harvest.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Plus,
  RotateCcw,
  Sprout,
  Star,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { getSellerSemesterFeeSummary } from "../../lib/sellerSemesterPayments";
import { supabase } from "../../lib/supabase";
import {
  createImageUploadPath,
  uploadImageToSupabase,
  uploadPrivateImageToSupabase,
  type UploadableImageAsset,
} from "../../lib/uploadImageToSupabase";

const CATEGORIES = [
  "Fresh Vegetables",
  "Fruits",
  "Aquaculture",
  "Poultry & Eggs",
];
const UNITS = ["kg", "bundle", "pcs", "tray"];
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 5;

type PaymentMethod = "GCash" | "Cash on Pick-up";

interface SelectedCropPhoto {
  uri: string;
  asset?: UploadableImageAsset;
  existingUrl?: string;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function splitAvailabilityValues(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
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

export default function PostHarvestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string | string[] }>();
  const draftId = Array.isArray(params.draftId)
    ? params.draftId[0]
    : params.draftId;

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Fresh Vegetables");
  const [unit, setUnit] = useState("kg");
  const [listingType, setListingType] = useState<
    "immediate_stock" | "in_ground_preorder"
  >("immediate_stock");
  const [harvestDate, setHarvestDate] = useState("In 5 days");
  const [totalYield, setTotalYield] = useState("");
  const [price, setPrice] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    "Cash on Pick-up",
  ]);
  const [gcashAccountName, setGcashAccountName] = useState("");
  const [gcashMobileNumber, setGcashMobileNumber] = useState("");
  const [gcashQrUri, setGcashQrUri] = useState<string | null>(null);
  const [gcashQrAsset, setGcashQrAsset] = useState<UploadableImageAsset | null>(
    null,
  );
  const [existingGcashQrUrl, setExistingGcashQrUrl] = useState<string | null>(
    null,
  );

  const pickupDateOptions = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + index);
        return getLocalDateKey(date);
      }),
    [],
  );

  const [availableDates, setAvailableDates] = useState<string[]>([
    getLocalDateKey(new Date()),
  ]);
  const [pickupVenuesInput, setPickupVenuesInput] = useState("");
  const [pickupTimesInput, setPickupTimesInput] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredTier, setFeaturedTier] = useState<15 | 20>(15);
  const [cropPhotos, setCropPhotos] = useState<SelectedCropPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  const [verificationStatus, setVerificationStatus] = useState<
    "pending" | "verified" | "rejected"
  >("pending");
  const [semesterFeePaid, setSemesterFeePaid] = useState(0);
  const [semesterFeePending, setSemesterFeePending] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEditingDraftId(null);
    setTitle("");
    setCategory("Fresh Vegetables");
    setUnit("kg");
    setListingType("immediate_stock");
    setHarvestDate("In 5 days");
    setTotalYield("");
    setPrice("");
    setPaymentMethods(["Cash on Pick-up"]);
    setGcashAccountName("");
    setGcashMobileNumber("");
    setGcashQrUri(null);
    setGcashQrAsset(null);
    setExistingGcashQrUrl(null);
    setAvailableDates([getLocalDateKey(new Date())]);
    setPickupVenuesInput("");
    setPickupTimesInput("");
    setIsFeatured(false);
    setFeaturedTier(15);
    setCropPhotos([]);
    setFormError(null);
  }, []);

  function showMessage(msgTitle: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${msgTitle}: ${msg}`);
    } else {
      Alert.alert(msgTitle, msg);
    }
  }

  function showError(msgTitle: string, error: unknown, fallback: string) {
    const message = getErrorMessage(error, fallback);
    setFormError(message);
    showMessage(msgTitle, message);
  }

  function navigateBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/seller");
  }

  const checkSellerStatus = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Seller profile was not found.");
      setVerificationStatus(data.verification_status || "pending");
      const feeSummary = await getSellerSemesterFeeSummary(user.id);
      setSemesterFeePaid(feeSummary.amountPaid);
      setSemesterFeePending(feeSummary.pendingReview);
      setEligibilityError(null);
    } catch (error) {
      console.error("Could not load seller posting eligibility.", error);
      const message = getErrorMessage(
        error,
        "Could not check posting eligibility.",
      );
      setEligibilityError(message);
      showMessage("Eligibility Unavailable", message);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(checkSellerStatus);
  }, [checkSellerStatus]);

  // Reset form every time Post Harvest is opened fresh, or load selected draft
  useFocusEffect(
    useCallback(() => {
      if (!draftId) {
        resetForm();
        return;
      }

      let isActive = true;
      setLoadingDraft(true);
      setFormError(null);

      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!user) return;

          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", draftId)
            .eq("seller_id", user.id)
            .single();

          if (error) throw error;
          if (!isActive || !data) return;

          setEditingDraftId(data.id);
          setTitle(data.title || "");
          setCategory(
            CATEGORIES.includes(data.category)
              ? data.category
              : "Fresh Vegetables",
          );
          setUnit(UNITS.includes(data.unit) ? data.unit : "kg");
          setListingType(
            data.listing_type === "in_ground_preorder"
              ? "in_ground_preorder"
              : "immediate_stock",
          );
          setHarvestDate(
            data.expected_harvest && data.expected_harvest !== "Ready now"
              ? data.expected_harvest
              : "In 5 days",
          );
          setTotalYield(
            Number(data.total_stock) > 0 ? String(data.total_stock) : "",
          );
          setPrice(
            Number(data.price_per_unit) > 0 ? String(data.price_per_unit) : "",
          );

          const savedMethods = Array.isArray(data.payment_methods)
            ? (data.payment_methods.filter(
                (m: unknown): m is PaymentMethod =>
                  m === "GCash" || m === "Cash on Pick-up",
              ) as PaymentMethod[])
            : [];
          setPaymentMethods(
            savedMethods.length > 0 ? savedMethods : ["Cash on Pick-up"],
          );

          setGcashAccountName(data.gcash_account_name || "");
          setGcashMobileNumber(
            data.gcash_mobile_number || data.gcash_number || "",
          );
          setExistingGcashQrUrl(data.gcash_qr_url || null);
          setGcashQrUri(data.gcash_qr_url || null);
          setGcashQrAsset(null);

          const todayKey = getLocalDateKey(new Date());
          const savedDates = Array.isArray(data.available_dates)
            ? data.available_dates.filter(
                (d: unknown): d is string =>
                  typeof d === "string" &&
                  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
                  d >= todayKey,
              )
            : [];
          setAvailableDates(savedDates.length > 0 ? savedDates : [todayKey]);

          setPickupVenuesInput(
            Array.isArray(data.pickup_venues)
              ? data.pickup_venues.join(", ")
              : "",
          );
          setPickupTimesInput(
            Array.isArray(data.pickup_times)
              ? data.pickup_times.join(", ")
              : "",
          );

          const savedFee = Number(data.featured_fee || 0);
          setIsFeatured(
            data.featured_status === "unpaid" ||
              data.is_featured === true ||
              savedFee > 0,
          );
          setFeaturedTier(savedFee === 20 ? 20 : 15);

          const savedUrls: string[] =
            Array.isArray(data.image_urls) && data.image_urls.length > 0
              ? data.image_urls.filter(
                  (u: unknown): u is string =>
                    typeof u === "string" && u.trim().length > 0,
                )
              : typeof data.image_url === "string" && data.image_url.trim()
                ? [data.image_url]
                : [];

          setCropPhotos(
            savedUrls.slice(0, MAX_PHOTOS).map((url) => ({
              uri: url,
              existingUrl: url,
            })),
          );
        } catch (error) {
          if (isActive) {
            showError(
              "Could Not Load Draft",
              error,
              "Unable to open the selected draft.",
            );
          }
        } finally {
          if (isActive) setLoadingDraft(false);
        }
      })();

      return () => {
        isActive = false;
      };
    }, [draftId, resetForm]),
  );

  async function pickCropPhotos() {
    const remainingSlots = MAX_PHOTOS - cropPhotos.length;
    if (remainingSlots <= 0) {
      return showMessage(
        "Photo Limit Reached",
        `You can upload a maximum of ${MAX_PHOTOS} pictures per harvest.`,
      );
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.7,
      base64: true,
    }).catch((error: unknown) => {
      showError(
        "Image Selection Failed",
        error,
        "Could not select the harvest images.",
      );
      return null;
    });
    if (!res) return;
    if (!res.canceled && res.assets?.length > 0) {
      const incoming: SelectedCropPhoto[] = res.assets.map((asset) => ({
        uri: asset.uri,
        asset,
      }));
      setCropPhotos((prev) => {
        const combined = [...prev, ...incoming];
        if (combined.length > MAX_PHOTOS) {
          showMessage(
            "Maximum 5 Pictures",
            `Only the first ${MAX_PHOTOS} pictures were kept.`,
          );
        }
        return combined.slice(0, MAX_PHOTOS);
      });
    }
  }

  function removeCropPhoto(indexToRemove: number) {
    setCropPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  async function pickGcashQr() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    }).catch((error: unknown) => {
      showError(
        "Image Selection Failed",
        error,
        "Could not select the GCash QR image.",
      );
      return null;
    });
    if (!res) return;
    if (!res.canceled && res.assets.length > 0) {
      setGcashQrAsset(res.assets[0]);
      setGcashQrUri(res.assets[0].uri);
      setExistingGcashQrUrl(null);
    }
  }

  function showInitialFeeRequired() {
    const message = semesterFeePending
      ? "Your ₱30 semester installment receipt is awaiting Admin approval."
      : "Submit the ₱30 first semester installment and wait for Admin approval before publishing harvests.";
    const openFeeScreen = () => {
      router.push({
        pathname: "/seller-screens/subscription",
        params: semesterFeePending ? {} : { pay: "30" },
      });
    };
    if (Platform.OS === "web") {
      if (
        window.confirm(`${message}\n\nOpen the Semester Booth Fee screen now?`)
      ) {
        openFeeScreen();
      }
      return;
    }
    Alert.alert("Initial Booth Fee Required", message, [
      { text: "Not now", style: "cancel" },
      {
        text: semesterFeePending ? "View Status" : "Pay ₱30",
        onPress: openFeeScreen,
      },
    ]);
  }

  function togglePaymentMethod(method: PaymentMethod) {
    setPaymentMethods((current) =>
      current.includes(method)
        ? current.filter((value) => value !== method)
        : [...current, method],
    );
  }

  async function submitHarvest(status: "published" | "draft") {
    if (eligibilityError) {
      return showMessage(
        "Eligibility Unavailable",
        `Could not verify your seller status or semester booth fee: ${eligibilityError}`,
      );
    }
    if (verificationStatus !== "verified") {
      return showMessage(
        "Verification Required",
        "You cannot post harvests until your Seller / Farm Unit is verified by the Campus Admin.",
      );
    }
    setFormError(null);

    if (!title.trim()) {
      return showMessage(
        "Crop Title Required",
        "Please enter a Crop Title before saving or publishing.",
      );
    }

    if (status === "published") {
      if (semesterFeePaid < 30) {
        return showInitialFeeRequired();
      }
      if (cropPhotos.length < MIN_PHOTOS || cropPhotos.length > MAX_PHOTOS) {
        return showMessage(
          "Harvest Photos Required",
          `Please upload at least ${MIN_PHOTOS} picture (up to ${MAX_PHOTOS} pictures maximum) of your harvest.`,
        );
      }
      if (
        !totalYield ||
        Number(totalYield) <= 0 ||
        !price ||
        Number(price) <= 0
      ) {
        return showMessage(
          "Missing Fields",
          "Please enter valid numbers for Total Harvest Yield and Price per Unit.",
        );
      }
      if (paymentMethods.length === 0) {
        return showMessage(
          "Payment Method Required",
          "Select at least one payment method for this listing.",
        );
      }
    }

    const pickupVenues = splitAvailabilityValues(pickupVenuesInput);
    const pickupTimes = splitAvailabilityValues(pickupTimesInput);

    if (
      status === "published" &&
      (availableDates.length === 0 ||
        pickupVenues.length === 0 ||
        pickupTimes.length === 0)
    ) {
      return showMessage(
        "Pickup Availability Required",
        "Select at least one pickup date, venue, and time for this listing.",
      );
    }

    const acceptsGcash = paymentMethods.includes("GCash");
    const cleanGcashNumber = gcashMobileNumber.replace(/\D/g, "");
    if (
      status === "published" &&
      acceptsGcash &&
      (!gcashAccountName.trim() ||
        !/^09\d{9}$/.test(cleanGcashNumber) ||
        !gcashQrUri)
    ) {
      return showMessage(
        "Complete GCash Setup",
        "Enter the GCash account name, a Philippine mobile number starting with 09 (11 digits), and select the GCash QR image.",
      );
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch (error) {
      return showError("Account Error", error, "Could not read your session.");
    }
    if (!currentUser) {
      router.replace("/auth/login");
      return;
    }

    setLoading(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, store_name, department")
        .eq("id", currentUser.id)
        .single();
      if (profileError) throw profileError;

      const sellerName =
        profile.store_name || profile.full_name || "Agri Dept - Unit 3";
      const sellerDept = profile.department || "Agriculture Department";

      const gcashQrUrl = acceptsGcash
        ? gcashQrAsset
          ? await uploadPrivateImageToSupabase(
              gcashQrAsset,
              "gcash-qrs",
              createImageUploadPath(currentUser.id, gcashQrAsset.mimeType),
            )
          : existingGcashQrUrl
        : null;

      // Upload new photos and keep any existing draft URLs in order
      const uploadedImageUrls: string[] = [];
      for (const photo of cropPhotos) {
        if (photo.existingUrl) {
          uploadedImageUrls.push(photo.existingUrl);
        } else if (photo.asset) {
          const publicUrl = await uploadImageToSupabase(
            photo.asset,
            "product-images",
            createImageUploadPath(currentUser.id, photo.asset.mimeType),
          );
          uploadedImageUrls.push(publicUrl);
        }
      }

      const coverImageUrl = uploadedImageUrls[0] || null;
      const qtyNum = Number(totalYield) || 0;
      const priceNum = Number(price) || 0;
      const savedTitle = title.trim();

      const payload = {
        seller_id: currentUser.id,
        seller_name: sellerName,
        seller_department: sellerDept,
        title: savedTitle,
        description: "",
        category,
        unit,
        listing_type: listingType,
        expected_harvest:
          listingType === "in_ground_preorder" ? harvestDate : "Ready now",
        total_stock: qtyNum,
        available_stock: qtyNum,
        reserved_stock: 0,
        total_yield_kg: unit === "kg" ? qtyNum : null,
        remaining_yield_kg: unit === "kg" ? qtyNum : null,
        price_per_unit: priceNum,
        price_per_kg: unit === "kg" ? priceNum : null,
        is_featured: false,
        featured_status:
          status === "published" && isFeatured ? "unpaid" : "none",
        featured_fee: status === "published" && isFeatured ? featuredTier : 0,
        featured_days:
          status === "published" && isFeatured
            ? featuredTier === 15
              ? 3
              : 7
            : null,
        status,
        image_url: coverImageUrl,
        image_urls: uploadedImageUrls,
        payment_methods: paymentMethods,
        accepts_gcash: acceptsGcash,
        accepts_cash: paymentMethods.includes("Cash on Pick-up"),
        gcash_account_name: acceptsGcash ? gcashAccountName.trim() : null,
        gcash_number: acceptsGcash ? cleanGcashNumber : null,
        gcash_mobile_number: acceptsGcash ? cleanGcashNumber : null,
        gcash_qr_url: gcashQrUrl,
        available_dates: availableDates,
        pickup_venues: pickupVenues,
        pickup_times: pickupTimes,
      };

      if (editingDraftId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingDraftId)
          .eq("seller_id", currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }

      // Wipe all form state immediately so the next post starts completely clean
      resetForm();

      showMessage(
        status === "draft" ? "Draft Saved" : "Harvest Published!",
        status === "draft"
          ? `"${savedTitle}" was saved to My Harvests → Drafts.`
          : `"${savedTitle}" is now live on the AgriHub campus marketplace.`,
      );

      if (status === "draft") {
        router.replace({
          pathname: "/seller/inventory",
          params: { tab: "draft" },
        });
      } else {
        router.replace("/seller");
      }
    } catch (error) {
      showError("Error", error, "Failed to save harvest.");
    } finally {
      setLoading(false);
    }
  }

  const isLocked = verificationStatus !== "verified";

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 18, paddingTop: 52, paddingBottom: 42 }}
    >
      {/* Top Header */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={navigateBack}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>
            {editingDraftId ? "Edit Draft Harvest" : "Post New Harvest"}
          </Text>
          {editingDraftId ? (
            <Text style={styles.draftHeaderSub}>
              Draft mode • Changes will update this saved draft
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.resetFormBtn}
          onPress={() => {
            resetForm();
            if (editingDraftId) {
              router.replace("/seller/post-harvest");
            }
          }}
        >
          <RotateCcw size={14} color={Colors.textMuted} />
          <Text style={styles.resetFormText}>
            {editingDraftId ? "New Blank Post" : "Clear"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Draft Indicator Banner */}
      {editingDraftId ? (
        <View style={styles.draftBanner}>
          <FileText size={16} color="#B45309" />
          <Text style={styles.draftBannerText}>
            You are editing a saved{" "}
            <Text style={{ fontWeight: "800" }}>DRAFT</Text>. Tap{" "}
            <Text style={{ fontWeight: "800" }}>Save Draft</Text> to keep
            working later or{" "}
            <Text style={{ fontWeight: "800" }}>Publish Harvest</Text> to make
            it live.
          </Text>
        </View>
      ) : null}

      {loadingDraft ? (
        <View style={{ paddingVertical: 30, alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 8, fontSize: 12, color: Colors.textMuted }}>
            Loading saved draft...
          </Text>
        </View>
      ) : null}

      {/* Locked Warning if Pending Admin Approval */}
      {isLocked && (
        <View style={styles.lockBanner}>
          <AlertCircle size={18} color="#B45309" />
          <Text style={styles.lockText}>
            Your account status is{" "}
            <Text style={{ fontWeight: "800" }}>
              {verificationStatus.toUpperCase()}
            </Text>
            . Posting is disabled until approved by Campus Admin.
          </Text>
        </View>
      )}

      {eligibilityError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Eligibility check failed</Text>
          <Text style={styles.errorText}>{eligibilityError}</Text>
        </View>
      ) : null}

      {formError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Could not save harvest</Text>
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      {/* Multi-Photo Upload Area (Min 1, Max 5) */}
      <View style={styles.photoSectionHeader}>
        <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>
          Harvest Photos (Min {MIN_PHOTOS}, Max {MAX_PHOTOS})
        </Text>
        <Text
          style={[
            styles.photoCountBadge,
            cropPhotos.length >= MIN_PHOTOS && styles.photoCountBadgeValid,
          ]}
        >
          {cropPhotos.length} / {MAX_PHOTOS} photos
        </Text>
      </View>

      {cropPhotos.length === 0 ? (
        <TouchableOpacity style={styles.photoBox} onPress={pickCropPhotos}>
          <View style={styles.photoPlaceholder}>
            <View style={styles.camCircle}>
              <Camera size={22} color={Colors.primary} />
            </View>
            <Text style={styles.photoTitle}>
              Tap to upload harvest photos (1–5)
            </Text>
            <Text style={styles.photoHint}>
              Clear natural light • First photo is the Cover Photo (JPG/PNG)
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.photoGalleryContainer}>
          {/* Main Cover Photo Preview */}
          <View style={styles.coverPhotoBox}>
            <Image
              source={{ uri: cropPhotos[0].uri }}
              style={styles.photoPreview}
            />
            <View style={styles.coverBadge}>
              <Text style={styles.coverText}>
                Cover Photo (1/{cropPhotos.length})
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeMainPhotoBtn}
              onPress={() => removeCropPhoto(0)}
              accessibilityLabel="Remove cover photo"
            >
              <X size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Thumbnails Row + Add More Button */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbRow}
          >
            {cropPhotos.map((photo, index) => (
              <View
                key={`${photo.uri}-${index}`}
                style={[
                  styles.thumbWrap,
                  index === 0 && styles.thumbWrapActive,
                ]}
              >
                <Image source={{ uri: photo.uri }} style={styles.thumbImage} />
                {index === 0 && (
                  <View style={styles.thumbCoverTag}>
                    <Text style={styles.thumbCoverTagText}>Cover</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.thumbRemoveBtn}
                  onPress={() => removeCropPhoto(index)}
                  accessibilityLabel={`Remove photo ${index + 1}`}
                >
                  <X size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            {cropPhotos.length < MAX_PHOTOS && (
              <TouchableOpacity
                style={styles.addMoreThumbBtn}
                onPress={pickCropPhotos}
                accessibilityLabel="Add more photos"
              >
                <Plus size={20} color={Colors.primary} />
                <Text style={styles.addMoreThumbText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* Crop Title */}
      <Text style={styles.label}>Crop Title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Native Tomatoes (Vine-ripened)"
        value={title}
        onChangeText={setTitle}
      />

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const active = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, active && { color: "#FFF" }]}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Unit Selector */}
      <Text style={styles.label}>Unit</Text>
      <View style={styles.chipRow}>
        {UNITS.map((u) => {
          const active = unit === u;
          return (
            <TouchableOpacity
              key={u}
              style={[styles.unitChip, active && styles.chipActive]}
              onPress={() => setUnit(u)}
            >
              <Text style={[styles.chipText, active && { color: "#FFF" }]}>
                {u}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Listing Type Toggle */}
      <Text style={styles.label}>Listing Type</Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[
            styles.typeBtn,
            listingType === "immediate_stock" && styles.typeBtnActive,
          ]}
          onPress={() => setListingType("immediate_stock")}
        >
          <Zap
            size={15}
            color={listingType === "immediate_stock" ? "#FFF" : Colors.primary}
          />
          <Text
            style={[
              styles.typeBtnText,
              listingType === "immediate_stock" && { color: "#FFF" },
            ]}
          >
            Immediate Stock
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.typeBtn,
            listingType === "in_ground_preorder" && styles.typeBtnActive,
          ]}
          onPress={() => setListingType("in_ground_preorder")}
        >
          <Sprout
            size={15}
            color={
              listingType === "in_ground_preorder" ? "#FFF" : Colors.primary
            }
          />
          <Text
            style={[
              styles.typeBtnText,
              listingType === "in_ground_preorder" && { color: "#FFF" },
            ]}
          >
            In-Ground Pre-Order
          </Text>
        </TouchableOpacity>
      </View>

      {listingType === "in_ground_preorder" && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Estimated Harvest Window</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. In 5 days / Nov 22, 2026"
            value={harvestDate}
            onChangeText={setHarvestDate}
          />
        </View>
      )}

      {/* Yield & Price Row */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Total Harvest Yield ({unit})</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="60"
            value={totalYield}
            onChangeText={setTotalYield}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Price per {unit} (₱)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="45.00"
            value={price}
            onChangeText={setPrice}
          />
        </View>
      </View>

      <Text style={styles.label}>Pickup Dates (next 14 days)</Text>
      <Text style={styles.paymentHint}>
        Today is available by default. Choose every date buyers may collect this
        harvest.
      </Text>
      <View style={styles.availabilityDateGrid}>
        {pickupDateOptions.map((date, index) => {
          const selected = availableDates.includes(date);
          const dateObj = new Date(`${date}T12:00:00`);
          const label =
            index === 0
              ? "Today"
              : dateObj.toLocaleDateString(undefined, { weekday: "short" });
          return (
            <TouchableOpacity
              key={date}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={[
                styles.availabilityDate,
                selected && styles.availabilityDateActive,
              ]}
              onPress={() =>
                setAvailableDates((current) =>
                  selected
                    ? current.filter((value) => value !== date)
                    : [...current, date].sort(),
                )
              }
            >
              <Text
                style={[
                  styles.availabilityDateLabel,
                  selected && styles.availabilityDateLabelActive,
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.availabilityDateNumber,
                  selected && styles.availabilityDateLabelActive,
                ]}
              >
                {dateObj.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Pickup Venues</Text>
      <TextInput
        style={styles.input}
        placeholder="Separate options with commas"
        value={pickupVenuesInput}
        onChangeText={setPickupVenuesInput}
        maxLength={300}
      />

      <Text style={styles.label}>Pickup Time Windows</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 7:00–9:00 AM, 4:00–5:30 PM"
        value={pickupTimesInput}
        onChangeText={setPickupTimesInput}
        maxLength={300}
      />
      <Text style={styles.paymentHint}>
        Enter multiple venues or time windows separated by commas.
      </Text>

      <Text style={styles.label}>Accepted Payment Methods</Text>
      <Text style={styles.paymentHint}>
        Buyers can only select a method accepted for this listing.
      </Text>
      <View style={styles.paymentOptions}>
        {(["GCash", "Cash on Pick-up"] as PaymentMethod[]).map((method) => {
          const selected = paymentMethods.includes(method);
          return (
            <TouchableOpacity
              key={method}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={[
                styles.paymentOption,
                selected && styles.paymentOptionActive,
              ]}
              onPress={() => togglePaymentMethod(method)}
            >
              <View
                style={[styles.checkbox, selected && styles.checkboxActive]}
              >
                {selected ? <Text style={styles.checkboxCheck}>✓</Text> : null}
              </View>
              <Text style={styles.paymentOptionText}>{method}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {paymentMethods.includes("GCash") && (
        <View style={styles.gcashSetup}>
          <Text style={styles.gcashSetupTitle}>GCash Payment Details</Text>
          <Text style={styles.label}>GCash Account Name</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="words"
            placeholder="Name registered to GCash"
            value={gcashAccountName}
            onChangeText={setGcashAccountName}
          />
          <Text style={styles.label}>GCash Mobile Number</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="09XXXXXXXXX"
            value={gcashMobileNumber}
            maxLength={11}
            onChangeText={(value) =>
              setGcashMobileNumber(value.replace(/\D/g, "").slice(0, 11))
            }
          />
          <Text style={styles.paymentHint}>
            Enter 11 digits starting with 09.
          </Text>
          <TouchableOpacity
            style={styles.qrPicker}
            onPress={pickGcashQr}
            accessibilityRole="button"
          >
            {gcashQrUri ? (
              <Image source={{ uri: gcashQrUri }} style={styles.qrPreview} />
            ) : (
              <Text style={styles.qrPickerText}>Select GCash QR Code</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Featured Harvest Placement Card */}
      <View style={styles.featuredCard}>
        <View style={styles.featuredTop}>
          <View style={styles.starBox}>
            <Star size={16} color="#D97706" fill="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featTitle}>Featured Harvest Placement</Text>
            <Text style={styles.featSub}>
              Top of buyer feed for higher visibility
            </Text>
          </View>
          <Switch
            value={isFeatured}
            onValueChange={setIsFeatured}
            trackColor={{ true: Colors.primary }}
          />
        </View>
        {isFeatured && (
          <View style={styles.tierRow}>
            <TouchableOpacity
              style={[
                styles.tierBtn,
                featuredTier === 15 && styles.tierBtnActive,
              ]}
              onPress={() => setFeaturedTier(15)}
            >
              <CheckCircle2
                size={13}
                color={featuredTier === 15 ? Colors.primary : Colors.textMuted}
              />
              <Text style={styles.tierText}>₱15 • 3 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tierBtn,
                featuredTier === 20 && styles.tierBtnActive,
              ]}
              onPress={() => setFeaturedTier(20)}
            >
              <CheckCircle2
                size={13}
                color={featuredTier === 20 ? Colors.primary : Colors.textMuted}
              />
              <Text style={styles.tierText}>₱20 • 7 days + badge</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom Action Buttons */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={() => submitHarvest("draft")}
          disabled={loading || isLocked}
        >
          <Text style={styles.draftText}>
            {editingDraftId ? "Update Draft" : "Save Draft"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.publishBtn, (loading || isLocked) && { opacity: 0.6 }]}
          onPress={() => submitHarvest("published")}
          disabled={loading || isLocked}
        >
          <Text style={styles.publishText}>
            {loading
              ? "Publishing..."
              : isFeatured
                ? `Publish Harvest • ₱${featuredTier}`
                : "Publish Harvest"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  header: { fontSize: 20, fontWeight: "800", color: Colors.text },
  draftHeaderSub: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
    marginTop: 1,
  },
  resetFormBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetFormText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  draftBannerText: { flex: 1, fontSize: 12, color: "#92400E" },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  lockText: { flex: 1, fontSize: 12, color: "#92400E" },
  errorBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  errorTitle: { color: Colors.danger, fontSize: 12, fontWeight: "800" },
  errorText: { color: Colors.danger, fontSize: 12, marginTop: 4 },
  photoSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  photoCountBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  photoCountBadgeValid: {
    color: Colors.primary,
    backgroundColor: "#DCFCE7",
  },
  photoBox: {
    height: 155,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoGalleryContainer: {
    gap: 10,
  },
  coverPhotoBox: {
    height: 170,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.background,
  },
  photoPreview: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  coverText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  removeMainPhotoBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  thumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: "relative",
  },
  thumbWrapActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbCoverTag: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(27, 67, 50, 0.85)",
    paddingVertical: 1,
    alignItems: "center",
  },
  thumbCoverTagText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
  },
  thumbRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  addMoreThumbBtn: {
    width: 68,
    height: 68,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  addMoreThumbText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.primary,
  },
  photoPlaceholder: { alignItems: "center", gap: 4, paddingHorizontal: 16 },
  camCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  photoTitle: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  photoHint: { fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: Colors.background,
    fontSize: 13,
  },
  paymentHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  availabilityDateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  availabilityDate: {
    width: "13%",
    minWidth: 42,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  availabilityDateActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  availabilityDateLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  availabilityDateLabelActive: { color: "#FFF" },
  availabilityDateNumber: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
  },
  paymentOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  paymentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxCheck: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  paymentOptionText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  gcashSetup: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  gcashSetupTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  qrPicker: {
    height: 160,
    marginTop: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#F0FDF4",
  },
  qrPreview: { width: "100%", height: "100%", resizeMode: "contain" },
  qrPickerText: { color: Colors.primary, fontSize: 13, fontWeight: "800" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  typeBtnActive: { backgroundColor: Colors.primary },
  typeBtnText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  featuredCard: {
    backgroundColor: "#FFFBEB",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginTop: 18,
  },
  featuredTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  starBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  featTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  featSub: { fontSize: 11, color: "#B45309", marginTop: 1 },
  tierRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  tierBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  tierBtnActive: { borderColor: Colors.primary, backgroundColor: "#F0FDF4" },
  tierText: { fontSize: 11, fontWeight: "700", color: Colors.text },
  bottomActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  draftBtn: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  draftText: { fontSize: 13, fontWeight: "800", color: Colors.text },
  publishBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  publishText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
});
