// src/app/seller/profile.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import {
    AlertCircle,
    Building2,
    Camera,
    LogOut,
    Mail,
    MapPin,
    Pencil,
    Phone,
    ShieldCheck,
    Upload,
    X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
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
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { SemesterFeeCard } from "../../components/SemesterFeeCard";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { CAMPUS_PICKUP_SPOTS } from "../../lib/buyerPreferences";
import {
    getSellerSemesterFeeSummary,
    type SemesterFeeSummary,
} from "../../lib/sellerSemesterPayments";
import { getCurrentSemester } from "../../lib/semesterFee";
import { supabase } from "../../lib/supabase";
import {
    createImageUploadPath,
    uploadImageToSupabase,
    uploadPrivateImageToSupabase,
    type UploadableImageAsset,
} from "../../lib/uploadImageToSupabase";

const ADMIN_GCASH_NUMBER = "09171234567";
const ADMIN_GCASH_NAME = "ADSSU TBI Admin";

function isMissingColumnError(error: { code?: string }) {
  return error.code === "42703" || error.code === "PGRST204";
}

function formatProfileUpdateError(error: unknown): string {
  if (!error) return "Could not save your store settings.";
  if (error instanceof Error) {
    const rec = error as any;
    const parts: string[] = [error.message];
    if (rec.code) parts.push(`Code: ${rec.code}`);
    if (rec.details) parts.push(`Details: ${rec.details}`);
    if (rec.hint) parts.push(`Hint: ${rec.hint}`);
    return parts.join(" — ");
  }
  if (typeof error === "object") {
    const rec = error as Record<string, unknown>;
    const parts: string[] = [];
    if (rec.message) parts.push(String(rec.message));
    if (rec.code) parts.push(`Code: ${rec.code}`);
    if (rec.details) parts.push(`Details: ${rec.details}`);
    if (rec.hint) parts.push(`Hint: ${rec.hint}`);
    if (parts.length > 0) return parts.join(" — ");
  }
  return String(error) || "Could not save your store settings.";
}

export default function SellerProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pickupSpot, setPickupSpot] = useState<string>(CAMPUS_PICKUP_SPOTS[0]);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [schemaWarning, setSchemaWarning] = useState(false);
  const [semesterFee, setSemesterFee] = useState<SemesterFeeSummary>({
    amountPaid: 0,
    pendingReview: false,
  });
  const [semesterFeeError, setSemesterFeeError] = useState<string | null>(null);

  // Direct Semester Booth Fee GCash Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentAmount, setSelectedPaymentAmount] = useState<
    20 | 30 | 50
  >(30);
  const [receiptImageAsset, setReceiptImageAsset] =
    useState<UploadableImageAsset | null>(null);
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(
    null,
  );
  const router = useRouter();

  function showMessage(title: string, message: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  const loadProfile = useCallback(async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    const feeSummaryResult = getSellerSemesterFeeSummary(currentUser.id)
      .then((summary) => ({ summary, error: null as string | null }))
      .catch((error: unknown) => ({
        summary: null,
        error:
          error instanceof Error ? error.message : "Could not load fee status.",
      }));
    const [{ data, error }, feeResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, store_name, avatar_url, institutional_email, department, phone_number, preferred_pickup_spot, verification_status, course, course_year, id_number, school_id_number",
        )
        .eq("id", currentUser.id)
        .maybeSingle(),
      feeSummaryResult,
    ]);
    let profileData: Record<string, any> | null = data;
    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const { data: fallbackProfile, error: fallbackError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, department, avatar_url, phone_number, course, course_year, id_number",
        )
        .eq("id", currentUser.id)
        .maybeSingle();
      if (fallbackError) throw fallbackError;
      profileData = fallbackProfile;
      setSchemaWarning(true);
    }
    if (profileData) {
      setProfile(profileData);
      setStoreName(profileData.store_name || "");
      setPhoneNumber(profileData.phone_number || "");
      setPickupSpot(
        CAMPUS_PICKUP_SPOTS.find(
          (spot) => spot === profileData?.preferred_pickup_spot,
        ) || CAMPUS_PICKUP_SPOTS[0],
      );
    }
    setSemesterFeeError(feeResult.error);
    if (feeResult.summary) setSemesterFee(feeResult.summary);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile().catch((error: unknown) =>
        console.error("Could not load seller profile.", error),
      );
    }, [loadProfile]),
  );

  async function handleUploadAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    }).catch((error: unknown) => {
      showMessage(
        "Photo Selection Failed",
        error instanceof Error ? error.message : "Could not open your photos.",
      );
      return null;
    });
    if (!res || res.canceled || !profile) return;

    setUploading(true);
    try {
      const asset = res.assets[0];
      const url = await uploadImageToSupabase(
        asset,
        "avatars",
        createImageUploadPath(profile.id, asset.mimeType),
      );
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, avatar_url: url });
      showMessage("Updated", "Profile picture saved.");
    } catch (error: unknown) {
      showMessage(
        "Upload Failed",
        error instanceof Error
          ? error.message
          : "Could not save your profile picture.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveStoreSettings() {
    setSettingsError("");
    setSettingsMessage("");
    setSavingSettings(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          store_name: storeName.trim() || null,
          phone_number: phoneNumber.trim() || null,
          preferred_pickup_spot: pickupSpot,
        })
        .eq("id", user.id);
      if (error) throw error;
      setProfile((current: any) =>
        current
          ? {
              ...current,
              store_name: storeName.trim() || null,
              phone_number: phoneNumber.trim() || null,
              preferred_pickup_spot: pickupSpot,
            }
          : current,
      );
      setSettingsMessage("Store settings saved.");
    } catch (error) {
      console.error("Could not save seller settings.", error);
      setSettingsError(formatProfileUpdateError(error));
    } finally {
      setSavingSettings(false);
    }
  }

  function handleOpenPaymentModal(amount: 20 | 30 | 50) {
    setSelectedPaymentAmount(amount);
    setReceiptImageAsset(null);
    setReceiptImageUri(null);
    setPaymentModalError(null);
    setShowPaymentModal(true);
  }

  async function pickReceiptPhoto() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!res.canceled && res.assets?.length > 0) {
        setReceiptImageAsset(res.assets[0]);
        setReceiptImageUri(res.assets[0].uri);
        setPaymentModalError(null);
      }
    } catch (error) {
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
        "Please upload a screenshot of your GCash payment receipt.",
      );
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
      const { error: rpcError } = await supabase.rpc(
        "submit_semester_payment",
        {
          p_amount: selectedPaymentAmount,
          p_semester: currentSemester,
          p_receipt_path: receiptPath,
        },
      );
      if (rpcError) throw rpcError;
      setShowPaymentModal(false);
      setReceiptImageUri(null);
      setReceiptImageAsset(null);
      await loadProfile();
      showMessage(
        "Payment Submitted",
        "Your installment receipt is awaiting Admin verification. The ₱30 posting gate unlocks after approval.",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not upload receipt. Please try again.";
      setPaymentModalError(msg);
    } finally {
      setUploadingPayment(false);
    }
  }

  async function performLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showMessage("Sign Out Failed", error.message);
      return;
    }
    router.replace("/auth/login");
  }

  function handleLogout() {
    const message = "Are you sure you want to Log Out?";

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        void performLogout();
      }
    } else {
      Alert.alert("Confirm Logout", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Log Out",
          style: "destructive",
          onPress: () => void performLogout(),
        },
      ]);
    }
  }

  const initials = (profile?.full_name || "SU").slice(0, 2).toUpperCase();

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.pageTitle}>Seller Unit Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            accessibilityRole="button"
            accessibilityLabel="Edit seller profile"
            onPress={() => router.push("/profile/edit")}
          >
            <Pencil size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handleUploadAvatar}
          disabled={uploading}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatarImg}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            <Camera size={14} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.tapHint}>
          {uploading ? "Uploading..." : "Tap photo to change profile picture"}
        </Text>

        <Text style={styles.name}>
          {storeName || profile?.full_name || "Agri Dept Unit"}
        </Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>STUDENT SELLER / DEPT UNIT</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>STORE SETTINGS</Text>
      {schemaWarning ? (
        <Text style={styles.schemaWarning} accessibilityRole="alert">
          Seller settings columns are missing. Apply{" "}
          20261118000000_seller_portal_settings.sql in Supabase, then reload.
        </Text>
      ) : null}
      <View style={styles.settingsCard}>
        <Text style={styles.inputLabel}>Store / Unit Name</Text>
        <TextInput
          value={storeName}
          onChangeText={setStoreName}
          style={styles.input}
          maxLength={120}
          placeholder="Your store or unit name"
          accessibilityLabel="Store or unit name"
        />
        <Text style={styles.inputLabel}>Contact Number</Text>
        <TextInput
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          style={styles.input}
          keyboardType="phone-pad"
          maxLength={24}
          placeholder="Contact number"
          accessibilityLabel="Contact number"
        />
        <View style={styles.pickupHeading}>
          <MapPin size={16} color={Colors.primary} />
          <Text style={styles.inputLabel}>Default Campus Pickup Location</Text>
        </View>
        <View style={styles.pickupOptions}>
          {CAMPUS_PICKUP_SPOTS.map((spot) => (
            <TouchableOpacity
              key={spot}
              onPress={() => setPickupSpot(spot)}
              style={[
                styles.pickupOption,
                pickupSpot === spot && styles.pickupOptionSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: pickupSpot === spot }}
            >
              <Text
                style={[
                  styles.pickupOptionText,
                  pickupSpot === spot && styles.pickupOptionTextSelected,
                ]}
              >
                {spot}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {settingsError ? (
          <Text style={styles.settingsError} accessibilityRole="alert">
            {settingsError}
          </Text>
        ) : null}
        {settingsMessage ? (
          <Text style={styles.settingsSuccess} accessibilityRole="alert">
            {settingsMessage}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.saveSettingsButton,
            savingSettings && { opacity: 0.6 },
          ]}
          onPress={() => void saveStoreSettings()}
          disabled={savingSettings}
          accessibilityRole="button"
        >
          <Text style={styles.saveSettingsText}>
            {savingSettings ? "Saving…" : "Save Store Settings"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>UNIT DETAILS</Text>
      <View style={styles.card}>
        <View style={styles.detailRow}>
          <Mail size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Institutional Email</Text>
            <Text style={styles.detailVal}>
              {profile?.institutional_email || "—"}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Building2 size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Department / Farm Plot</Text>
            <Text style={styles.detailVal}>
              {profile?.department || "Agriculture Department"}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <ShieldCheck size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Program</Text>
            <Text style={styles.detailVal}>
              {profile?.course || profile?.course_year || "—"}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <ShieldCheck size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>School ID Number</Text>
            <Text style={styles.detailVal}>
              {profile?.school_id_number || profile?.id_number || "—"}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Phone size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Contact Number</Text>
            <Text style={styles.detailVal}>{profile?.phone_number || "—"}</Text>
          </View>
        </View>
        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <ShieldCheck size={18} color={Colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Verification Status</Text>
            <Text style={[styles.detailVal, { color: Colors.success }]}>
              {(profile?.verification_status || "pending").toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <SemesterFeeCard
        amountPaid={semesterFee.amountPaid}
        pendingReview={semesterFee.pendingReview}
        error={semesterFeeError}
        onPay={handleOpenPaymentModal}
        onPress={() =>
          handleOpenPaymentModal(semesterFee.amountPaid >= 30 ? 20 : 30)
        }
      />

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <LogOut size={18} color={Colors.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
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
                <Text style={styles.modalTitle}>Semester Booth Fee</Text>
                <Text style={styles.modalSubtitle}>
                  GCash Payment • {getCurrentSemester()}
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
              {/* Amount Selection Toggle */}
              {semesterFee.amountPaid === 0 ? (
                <View style={styles.amountToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.amountToggleBtn,
                      selectedPaymentAmount === 30 &&
                        styles.amountToggleBtnActive,
                    ]}
                    onPress={() => setSelectedPaymentAmount(30)}
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
                    onPress={() => setSelectedPaymentAmount(50)}
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
                    Paying Remaining Balance: ₱{selectedPaymentAmount}
                  </Text>
                </View>
              )}

              {/* Admin GCash Details */}
              <View style={styles.adminGcashBox}>
                <View style={styles.gcashBadge}>
                  <Text style={styles.gcashG}>G</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminGcashLabel}>
                    Send Payment To (Campus Admin GCash):
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
                  ₱{selectedPaymentAmount}
                </Text>{" "}
                to the admin number above.{"\n"}
                2. Take a screenshot of your payment receipt.{"\n"}
                3. Upload the screenshot below.
              </Text>

              {/* Receipt Upload Box */}
              <TouchableOpacity
                style={styles.modalReceiptUploadBox}
                onPress={pickReceiptPhoto}
                disabled={uploadingPayment}
              >
                {receiptImageUri ? (
                  <Image
                    source={{ uri: receiptImageUri }}
                    style={styles.modalReceiptPreview}
                    accessibilityLabel="Selected GCash receipt screenshot"
                  />
                ) : (
                  <View style={styles.modalReceiptPlaceholder}>
                    <Upload size={24} color={Colors.primary} />
                    <Text style={styles.modalReceiptUploadText}>
                      Tap to upload GCash receipt screenshot
                    </Text>
                    <Text style={styles.modalReceiptSubText}>
                      JPEG, PNG, or WebP image
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {paymentModalError ? (
                <View style={styles.modalErrorBanner}>
                  <AlertCircle size={16} color={Colors.danger} />
                  <Text style={styles.modalErrorText}>{paymentModalError}</Text>
                </View>
              ) : null}

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowPaymentModal(false)}
                  disabled={uploadingPayment}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSubmitBtn,
                    (!receiptImageUri || uploadingPayment) && { opacity: 0.5 },
                  ]}
                  onPress={handleSubmitPayment}
                  disabled={!receiptImageUri || uploadingPayment}
                >
                  {uploadingPayment ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.modalSubmitText}>
                      Submit ₱{selectedPaymentAmount} Payment
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    paddingBottom: 36,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 54,
    paddingBottom: 26,
    alignItems: "center",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  pageTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  headerTitleRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    position: "absolute",
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: { position: "relative" },
  avatarImg: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: "#FFF",
  },
  avatarFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 28, fontWeight: "800", color: "#111827" },
  camBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  tapHint: { color: "#D8F3DC", fontSize: 11, marginTop: 6 },
  name: { color: "#FFF", fontSize: 20, fontWeight: "800", marginTop: 8 },
  rolePill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  rolePillText: { color: "#FDE68A", fontSize: 11, fontWeight: "800" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
    gap: 8,
  },
  inputLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
  input: {
    width: "100%",
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: Colors.text,
    backgroundColor: "#FFF",
    fontSize: 13,
  },
  pickupHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
  },
  pickupOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickupOption: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pickupOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  pickupOptionText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  pickupOptionTextSelected: { color: "#FFF" },
  settingsError: {
    color: Colors.danger,
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 10,
    fontSize: 11,
    marginTop: 8,
  },
  schemaWarning: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 11,
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 16,
  },
  settingsSuccess: { color: Colors.success, fontSize: 11, marginTop: 8 },
  saveSettingsButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Colors.primary,
    marginTop: 10,
  },
  saveSettingsText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLbl: { fontSize: 11, color: Colors.textMuted },
  detailVal: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    margin: 16,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 32,
  },
  logoutText: { color: Colors.danger, fontWeight: "700", fontSize: 15 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  modalSubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollContent: {
    padding: 18,
    gap: 14,
  },
  amountToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  amountToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  amountToggleBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  amountToggleText: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
  },
  amountToggleTextActive: {
    color: "#FFF",
  },
  amountToggleSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  amountPillFixed: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  amountPillFixedText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400E",
    textAlign: "center",
  },
  adminGcashBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 12,
  },
  gcashBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007DFE",
    justifyContent: "center",
    alignItems: "center",
  },
  gcashG: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 20,
  },
  adminGcashLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1E40AF",
  },
  adminGcashNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E3A8A",
    marginTop: 1,
  },
  adminGcashName: {
    fontSize: 11,
    color: "#3B82F6",
    fontWeight: "600",
  },
  modalInstructionText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  modalReceiptUploadBox: {
    minHeight: 140,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  modalReceiptPlaceholder: {
    alignItems: "center",
    gap: 6,
    padding: 16,
  },
  modalReceiptUploadText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    textAlign: "center",
  },
  modalReceiptSubText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  modalReceiptPreview: {
    width: "100%",
    height: 180,
    resizeMode: "contain",
    backgroundColor: "#000",
  },
  modalErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 10,
  },
  modalErrorText: {
    flex: 1,
    fontSize: 11,
    color: Colors.danger,
    fontWeight: "600",
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFF",
  },
});
