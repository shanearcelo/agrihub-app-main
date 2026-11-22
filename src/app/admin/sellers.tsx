import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  Search,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { supabase } from "../../lib/supabase";
import { getImageUrl } from "../../lib/uploadImageToSupabase";

type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  institutional_email: string | null;
  role: "buyer" | "seller" | "admin";
  department: string | null;
  store_name: string | null;
  verification_status: string | null;
  is_suspended: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  id_document_url: string | null;
  valid_id_url: string | null;
  course_year: string | null;
  id_number: string | null;
  phone_number: string | null;
  preferred_pickup_spot: string | null;
  avatar_url: string | null;
  created_at: string;
};

type UserFilter = "All" | "Buyers" | "Sellers" | "Pending ID" | "Suspended";

const FILTERS: UserFilter[] = [
  "All",
  "Buyers",
  "Sellers",
  "Pending ID",
  "Suspended",
];

type UserDetails = {
  profile: UserProfile;
  email: string;
  orders: number;
  payments: number;
  idImage: string | null;
};

function showMessage(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
}

export default function AdminUsersScreen() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [filter, setFilter] = useState<UserFilter>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const loaded: UserProfile[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, full_name, email, institutional_email, role, department, store_name, verification_status, is_suspended, id_document_url, valid_id_url, course_year, id_number, phone_number, preferred_pickup_spot, avatar_url, created_at",
          )
          .in("role", ["buyer", "seller"])
          .order("created_at", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        const page = (data || []) as UserProfile[];
        loaded.push(...page);
        if (page.length < 1000) break;
      }
      setProfiles(loaded);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load users.";
      setErrorMessage(message);
      console.error("Could not load admin user directory.", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfiles();
    }, [loadProfiles]),
  );

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesFilter =
        filter === "All" ||
        (filter === "Buyers" && profile.role === "buyer") ||
        (filter === "Sellers" && profile.role === "seller") ||
        (filter === "Pending ID" &&
          profile.role === "seller" &&
          profile.verification_status === "pending") ||
        (filter === "Suspended" && profile.is_suspended);
      const matchesSearch =
        !query ||
        [
          profile.full_name,
          profile.email,
          profile.institutional_email,
          profile.store_name,
          profile.department,
        ].some((value) => String(value || "").toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [filter, profiles, search]);

  async function openUser(profile: UserProfile) {
    setBusy(true);
    setErrorMessage("");
    try {
      const [ordersResult, paymentsResult, featuredPaymentsResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`),
        supabase
          .from("seller_semester_payments")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", profile.id),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", profile.id)
          .or(
            "featured_status.eq.active,featured_status.eq.pending_review,featured_receipt_path.not.is.null,featured_reference_number.not.is.null",
          ),
      ]);
      if (ordersResult.error) throw ordersResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      if (featuredPaymentsResult.error) throw featuredPaymentsResult.error;
      let idImage: string | null = null;
      const path = profile.id_document_url || profile.valid_id_url;
      if (path) {
        const bucket = profile.id_document_url ? "id-documents" : "valid-ids";
        try {
          idImage = await getImageUrl(bucket, path);
        } catch (firstError) {
          if (bucket !== "id-documents") throw firstError;
          idImage = await getImageUrl("valid-ids", path);
        }
      }
      setSelected({
        profile,
        email: profile.institutional_email || profile.email || "—",
        orders: ordersResult.count || 0,
        payments:
          (paymentsResult.count || 0) + (featuredPaymentsResult.count || 0),
        idImage,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load user details.";
      setErrorMessage(message);
      showMessage("User Details Unavailable", message);
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(values: Partial<UserProfile>) {
    if (!selected) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", selected.profile.id)
        .select(
          "id, full_name, email, institutional_email, role, department, store_name, verification_status, is_suspended, id_document_url, valid_id_url, course_year, id_number, phone_number, preferred_pickup_spot, avatar_url, created_at",
        )
        .single();
      if (error) throw error;
      const profile = data as UserProfile;
      setProfiles((current) =>
        current.map((item) => (item.id === profile.id ? profile : item)),
      );
      setSelected({ ...selected, profile });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update this user.";
      setErrorMessage(message);
      showMessage("User Update Failed", message);
    } finally {
      setBusy(false);
    }
  }

  function confirmAction(title: string, message: string, action: () => void) {
    if (Platform.OS === "web") {
      if (window.confirm(message)) action();
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: action },
      ]);
    }
  }

  async function deleteUser() {
    if (!selected || selected.orders !== 0 || selected.payments !== 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_delete_unused_user", {
        target_user_id: selected.profile.id,
      });
      if (error) throw error;
      setProfiles((current) =>
        current.filter((item) => item.id !== selected.profile.id),
      );
      setSelected(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete this user.";
      setErrorMessage(message);
      showMessage("Delete Failed", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push("/admin")}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>User Management</Text>
          <Text style={styles.subtitle}>Manage campus buyers and sellers</Text>
        </View>
        <Text style={styles.count}>{profiles.length} users</Text>
      </View>

      <View style={styles.search}>
        <Search size={16} color={Colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, store, department"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filter, filter === item && styles.filterActive]}
            onPress={() => setFilter(item)}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextActive,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <FlatList
        data={filteredProfiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.muted}>No users match these filters.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            onPress={() => void openUser(item)}
            disabled={busy}
          >
            <View style={styles.avatar}>
              <UserRound size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.full_name || "Unnamed user"}</Text>
              <Text style={styles.userMeta}>
                {item.institutional_email || item.email || "No email"}
              </Text>
              <Text style={styles.userMeta}>
                {item.store_name ? `${item.store_name} · ` : ""}
                {item.department || "No department"}
              </Text>
            </View>
            <View style={styles.badges}>
              <Text style={styles.roleBadge}>{item.role.toUpperCase()}</Text>
              {item.is_suspended ? (
                <Text style={[styles.statusBadge, styles.suspended]}>
                  SUSPENDED
                </Text>
              ) : item.role === "seller" ? (
                <Text style={styles.statusBadge}>
                  {(item.verification_status || "pending").toUpperCase()}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {selected?.profile.full_name || "User details"}
                </Text>
                <Text style={styles.modalSubtitle}>{selected?.email}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <X size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {selected ? (
              <ScrollView contentContainerStyle={styles.details}>
                <Detail label="Role" value={selected.profile.role} />
                <Detail
                  label="Department"
                  value={selected.profile.department || "—"}
                />
                <Detail
                  label="Store"
                  value={selected.profile.store_name || "—"}
                />
                <Detail
                  label="Course / Year"
                  value={selected.profile.course_year || "—"}
                />
                <Detail
                  label="ID number"
                  value={selected.profile.id_number || "—"}
                />
                <Detail
                  label="Phone"
                  value={selected.profile.phone_number || "—"}
                />
                <Detail
                  label="Preferred pickup spot"
                  value={selected.profile.preferred_pickup_spot || "—"}
                />
                <Detail
                  label="Joined"
                  value={new Date(
                    selected.profile.created_at,
                  ).toLocaleDateString()}
                />
                <Detail
                  label="Seller ID status"
                  value={selected.profile.verification_status || "Not submitted"}
                />
                <Detail label="Total orders" value={String(selected.orders)} />
                <Detail label="Total payments" value={String(selected.payments)} />
                <Detail
                  label="Account status"
                  value={selected.profile.is_suspended ? "Suspended" : "Active"}
                />
                {selected.idImage ? (
                  <Image
                    source={{ uri: selected.idImage }}
                    style={styles.idImage}
                    resizeMode="contain"
                    accessibilityLabel="Uploaded school ID"
                  />
                ) : (
                  <Text style={styles.muted}>No uploaded ID image.</Text>
                )}
                {selected.profile.role === "seller" && (
                  <View style={styles.actionGroup}>
                    <Text style={styles.actionHeading}>Seller ID verification</Text>
                    <View style={styles.actionRow}>
                      {(["verified", "rejected", "pending"] as const).map(
                        (status) => (
                          <ActionButton
                            key={status}
                            label={
                              status === "pending"
                                ? "Revoke"
                                : status === "verified"
                                  ? "Verify"
                                  : "Reject"
                            }
                            onPress={() =>
                              void updateProfile({
                                verification_status: status,
                                is_verified: status === "verified",
                                verified_at:
                                  status === "verified"
                                    ? new Date().toISOString()
                                    : null,
                              })
                            }
                            disabled={busy}
                            primary={status === "verified"}
                          />
                        ),
                      )}
                    </View>
                  </View>
                )}
                <View style={styles.actionGroup}>
                  <Text style={styles.actionHeading}>Account actions</Text>
                  <ActionButton
                    label={`Change role to ${selected.profile.role === "buyer" ? "seller" : "buyer"}`}
                    onPress={() => {
                      const nextRole =
                        selected.profile.role === "buyer" ? "seller" : "buyer";
                      void updateProfile({
                        role: nextRole,
                        is_verified: nextRole === "buyer",
                        verification_status:
                          nextRole === "buyer" ? "verified" : "pending",
                        verified_at:
                          nextRole === "buyer" ? new Date().toISOString() : null,
                      });
                    }}
                    disabled={busy}
                  />
                  <ActionButton
                    label={
                      selected.profile.is_suspended
                        ? "Unsuspend account"
                        : "Suspend account"
                    }
                    onPress={() =>
                      confirmAction(
                        "Change account status",
                        selected.profile.is_suspended
                          ? "Allow this user to access AgriHub again?"
                          : "Suspend this user and block app access?",
                        () =>
                          void updateProfile({
                            is_suspended: !selected.profile.is_suspended,
                          }),
                      )
                    }
                    disabled={busy}
                  />
                  <ActionButton
                    label="Delete unused / spam user"
                    onPress={() =>
                      confirmAction(
                        "Delete user",
                        "Permanently delete this user and their authentication account?",
                        () => void deleteUser(),
                      )
                    }
                    disabled={
                      busy || selected.orders !== 0 || selected.payments !== 0
                    }
                    danger
                  />
                  {(selected.orders !== 0 || selected.payments !== 0) && (
                    <Text style={styles.muted}>
                      Deletion requires 0 orders and 0 payments.
                    </Text>
                  )}
                </View>
              </ScrollView>
            ) : null}
            {busy ? <ActivityIndicator color={Colors.primary} /> : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        primary && styles.actionPrimary,
        danger && styles.actionDanger,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {primary ? <Check size={15} color="#FFF" /> : danger ? <Trash2 size={15} color={Colors.danger} /> : <Shield size={15} color={Colors.primary} />}
      <Text style={[styles.actionText, primary && { color: "#FFF" }, danger && { color: Colors.danger }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11 },
  count: { color: Colors.primary, fontWeight: "800", fontSize: 12 },
  search: {
    height: 44,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 12 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filter: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "#FFF",
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 20,
  },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 11, color: Colors.text, fontWeight: "700" },
  filterTextActive: { color: "#FFF" },
  list: { padding: 16, paddingTop: 4, paddingBottom: 96, gap: 10 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
  },
  userName: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  userMeta: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  badges: { alignItems: "flex-end", gap: 5 },
  roleBadge: {
    color: Colors.primary,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 9,
    fontWeight: "800",
  },
  statusBadge: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 9,
    fontWeight: "800",
  },
  suspended: { color: Colors.danger, backgroundColor: "#FEE2E2" },
  empty: { padding: 32, alignItems: "center" },
  muted: { color: Colors.textMuted, fontSize: 11, textAlign: "center" },
  error: { color: Colors.danger, marginHorizontal: 16, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
    gap: 12,
  },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  details: { paddingTop: 10, paddingBottom: 12, gap: 6 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  detailLabel: { color: Colors.textMuted, fontSize: 11 },
  detailValue: {
    flex: 1,
    textAlign: "right",
    color: Colors.text,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  idImage: {
    width: "100%",
    height: 180,
    backgroundColor: Colors.background,
    borderRadius: 10,
    marginVertical: 8,
  },
  actionGroup: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  actionHeading: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  actionPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionDanger: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  actionText: { color: Colors.primary, fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
