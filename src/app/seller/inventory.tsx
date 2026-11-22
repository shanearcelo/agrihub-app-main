// src/app/seller/inventory.tsx
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  Check,
  Edit3,
  FileText,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

type SellerListing = {
  id: string;
  title: string;
  price_per_unit: number;
  unit: string;
  available_stock: number;
  total_stock: number;
  status: string;
  image_url: string | null;
  available_dates: string[] | null;
  featured_status: string;
  featured_fee: number;
};

type StatusFilter = "all" | "published" | "draft" | "paused";

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNext14Days(): string[] {
  return Array.from({ length: 14 }, (_, index) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + index);
    return getLocalDateKey(d);
  });
}

function formatDateLabel(dateKey: string): string {
  const todayKey = getLocalDateKey(new Date());
  const formatted = new Date(`${dateKey}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    },
  );
  return dateKey === todayKey ? `Today • ${formatted}` : formatted;
}

function getUpcomingDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return [];
  const todayKey = getLocalDateKey(new Date());
  return dates
    .filter(
      (d): d is string =>
        typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayKey,
    )
    .sort();
}

function getErrorMessage(error: unknown, fallback: string): string {
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

export default function SellerInventoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const initialTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  const [listings, setListings] = useState<SellerListing[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockInput, setStockInput] = useState("");
  const [priceInput, setPriceInput] = useState("");

  // Manual Pickup Dates Modal State
  const [editingDatesItem, setEditingDatesItem] =
    useState<SellerListing | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [savingDates, setSavingDates] = useState(false);

  const dateOptions = getNext14Days();

  useEffect(() => {
    if (
      initialTab === "draft" ||
      initialTab === "published" ||
      initialTab === "paused" ||
      initialTab === "all"
    ) {
      setStatusFilter(initialTab);
    }
  }, [initialTab]);

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, title, price_per_unit, unit, available_stock, total_stock, status, image_url, available_dates, featured_status, featured_fee",
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setListings((data as SellerListing[]) || []);
    } catch (error) {
      console.error("Failed to load seller inventory:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadListings();
    }, [loadListings]),
  );

  function startEditStock(item: SellerListing) {
    setEditingStockId(item.id);
    setStockInput(String(item.available_stock));
    setPriceInput(String(item.price_per_unit));
  }

  async function saveStockAndPrice(item: SellerListing) {
    const nextStock = Number(stockInput);
    const nextPrice = Number(priceInput);
    if (!Number.isFinite(nextStock) || nextStock < 0) {
      return showMessage("Invalid Stock", "Enter 0 or a positive number.");
    }
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      return showMessage("Invalid Price", "Price must be greater than ₱0.");
    }
    try {
      const { error } = await supabase
        .from("products")
        .update({
          available_stock: nextStock,
          total_stock: Math.max(Number(item.total_stock || 0), nextStock),
          price_per_unit: nextPrice,
        })
        .eq("id", item.id);
      if (error) throw error;
      setEditingStockId(null);
      await loadListings();
      showMessage("Updated", `${item.title} stock and price updated.`);
    } catch (err: unknown) {
      showMessage(
        "Update Failed",
        err instanceof Error ? err.message : "Could not update listing.",
      );
    }
  }

  function openEditDatesModal(item: SellerListing) {
    const existingUpcoming = getUpcomingDates(item.available_dates);
    setEditingDatesItem(item);
    setSelectedDates(
      existingUpcoming.length > 0 ? existingUpcoming : dateOptions.slice(0, 3),
    );
  }

  function toggleDateSelection(dateKey: string) {
    setSelectedDates((current) =>
      current.includes(dateKey)
        ? current.filter((d) => d !== dateKey)
        : [...current, dateKey].sort(),
    );
  }

  async function savePickupDates() {
    if (!editingDatesItem) return;
    if (selectedDates.length === 0) {
      return showMessage(
        "Select at Least One Date",
        "Choose at least one upcoming pickup date so buyers can order this harvest.",
      );
    }
    setSavingDates(true);
    try {
      const sortedDates = [...selectedDates].sort();
      const { error } = await supabase.rpc("update_product_pickup_dates", {
        p_product_id: editingDatesItem.id,
        p_dates: sortedDates,
      });
      if (error) throw error;
      const updatedTitle = editingDatesItem.title;
      setEditingDatesItem(null);
      await loadListings();
      showMessage(
        "Pickup Dates Saved",
        `${updatedTitle} now has ${sortedDates.length} active pickup date(s).`,
      );
    } catch (err: unknown) {
      showMessage(
        "Could Not Save Dates",
        err instanceof Error ? err.message : "Failed to update pickup dates.",
      );
    } finally {
      setSavingDates(false);
    }
  }

  async function toggleStatus(item: SellerListing) {
    // If publishing an incomplete draft, open it in the draft editor first
    if (
      item.status === "draft" &&
      (Number(item.available_stock) <= 0 ||
        Number(item.price_per_unit) <= 0 ||
        !item.image_url)
    ) {
      showMessage(
        "Complete Draft First",
        "Add photos, price, and stock in the draft editor before publishing.",
      );
      router.push({
        pathname: "/seller/post-harvest",
        params: { draftId: item.id },
      });
      return;
    }

    const nextStatus = item.status === "published" ? "paused" : "published";
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .update({ status: nextStatus })
        .eq("id", item.id)
        .eq("seller_id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("The listing could not be found for this seller.");
      await loadListings();
    } catch (err: unknown) {
      showMessage(
        "Status Update Failed",
        getErrorMessage(err, "Could not update status."),
      );
    }
  }

  async function deleteListing(item: SellerListing) {
    const proceed =
      Platform.OS === "web"
        ? window.confirm(`Remove "${item.title}" from your listings?`)
        : await new Promise<boolean>((resolve) =>
            Alert.alert(
              "Delete Listing",
              `Remove "${item.title}" from your listings?`,
              [
                {
                  text: "Cancel",
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => resolve(true),
                },
              ],
            ),
          );
    if (!proceed) return;
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
      await loadListings();
    } catch (err: unknown) {
      showMessage(
        "Delete Failed",
        err instanceof Error
          ? err.message
          : "This listing may have existing orders and cannot be deleted.",
      );
    }
  }

  const activeCount = listings.filter((i) => i.status === "published").length;
  const draftCount = listings.filter((i) => i.status === "draft").length;
  const pausedCount = listings.filter((i) => i.status === "paused").length;

  const filteredListings = listings.filter((item) => {
    if (statusFilter === "all") return true;
    return item.status === statusFilter;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Harvests</Text>
          <Text style={styles.subtitle}>
            Manage active listings, saved drafts, and pickup dates
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/seller/post-harvest")}
        >
          <Plus size={16} color="#FFF" />
          <Text style={styles.addBtnText}>Post New</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs (All / Active / Drafts / Paused) */}
      <View style={styles.filterBar}>
        {(
          [
            { key: "all", label: `All (${listings.length})` },
            { key: "published", label: `Active (${activeCount})` },
            { key: "draft", label: `Drafts (${draftCount})` },
            { key: "paused", label: `Paused (${pausedCount})` },
          ] as { key: StatusFilter; label: string }[]
        ).map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterChip,
                active && styles.filterChipActive,
                tab.key === "draft" &&
                  !active &&
                  draftCount > 0 &&
                  styles.filterChipDraftHint,
              ]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filteredListings.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>
            {statusFilter === "draft"
              ? "No Saved Drafts"
              : statusFilter === "paused"
                ? "No Paused Harvests"
                : statusFilter === "published"
                  ? "No Active Harvests"
                  : "No Harvests Listed Yet"}
          </Text>
          <Text style={styles.emptySub}>
            {statusFilter === "draft"
              ? 'When you tap "Save Draft" on Post Harvest, your drafts appear here.'
              : 'Tap "Post New" to publish your first crop listing.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredListings.map((item) => {
            const upcomingDates = getUpcomingDates(item.available_dates);
            const hasExpiredDates = upcomingDates.length === 0;
            const isEditing = editingStockId === item.id;
            const isDraft = item.status === "draft";
            const isPublished = item.status === "published";

            return (
              <View
                key={item.id}
                style={[styles.card, isDraft && styles.draftCard]}
              >
                <View style={styles.topRow}>
                  <Image
                    source={{
                      uri: item.image_url?.startsWith("http")
                        ? item.image_url
                        : "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200",
                    }}
                    style={styles.thumb}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          isDraft && styles.statusPillDraft,
                          !isPublished && !isDraft && styles.statusPillPaused,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            isDraft && styles.statusTextDraft,
                            !isPublished &&
                              !isDraft && { color: Colors.textMuted },
                          ]}
                        >
                          {isPublished
                            ? "Active"
                            : isDraft
                              ? "Draft"
                              : "Paused"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.metaText}>
                      ₱{Number(item.price_per_unit).toFixed(2)} / {item.unit} •{" "}
                      {item.available_stock} {item.unit} left
                    </Text>

                    {item.featured_status === "unpaid" && (
                      <Text style={styles.featuredUnpaidBadge}>
                        Featured • Unpaid (₱{Number(item.featured_fee || 0)})
                      </Text>
                    )}
                    {item.featured_status === "pending_review" && (
                      <Text style={styles.featuredUnpaidBadge}>
                        Featured • Pending Admin review
                      </Text>
                    )}

                    {/* Scheduled Pickup Dates Summary */}
                    <View style={styles.dateSummaryRow}>
                      <Calendar
                        size={12}
                        color={hasExpiredDates ? "#B45309" : Colors.primary}
                      />
                      <Text
                        style={[
                          styles.dateSummaryText,
                          hasExpiredDates && { color: "#B45309" },
                        ]}
                        numberOfLines={1}
                      >
                        {hasExpiredDates
                          ? "Pickup dates expired — tap Edit Dates"
                          : `Pickup: ${upcomingDates
                              .slice(0, 3)
                              .map(formatDateLabel)
                              .join(", ")}${
                              upcomingDates.length > 3
                                ? ` +${upcomingDates.length - 3} more`
                                : ""
                            }`}
                      </Text>
                    </View>
                  </View>
                </View>

                {isEditing && (
                  <View style={styles.inlineEditBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLbl}>Available Stock</Text>
                      <TextInput
                        style={styles.input}
                        value={stockInput}
                        onChangeText={setStockInput}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLbl}>Price (₱)</Text>
                      <TextInput
                        style={styles.input}
                        value={priceInput}
                        onChangeText={setPriceInput}
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.saveSmallBtn}
                      onPress={() => void saveStockAndPrice(item)}
                    >
                      <Check size={16} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelSmallBtn}
                      onPress={() => setEditingStockId(null)}
                    >
                      <X size={16} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.actionsRow}>
                  {isDraft && (
                    <TouchableOpacity
                      style={[styles.actionChip, styles.editDraftChip]}
                      onPress={() =>
                        router.push({
                          pathname: "/seller/post-harvest",
                          params: { draftId: item.id },
                        })
                      }
                    >
                      <FileText size={13} color="#92400E" />
                      <Text
                        style={[styles.actionChipText, { color: "#92400E" }]}
                      >
                        Edit Draft
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.actionChip,
                      hasExpiredDates && styles.actionChipWarning,
                    ]}
                    onPress={() => openEditDatesModal(item)}
                  >
                    <Calendar
                      size={13}
                      color={hasExpiredDates ? "#B45309" : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.actionChipText,
                        hasExpiredDates && { color: "#B45309" },
                      ]}
                    >
                      Edit Dates
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => startEditStock(item)}
                  >
                    <Edit3 size={13} color={Colors.text} />
                    <Text
                      style={[styles.actionChipText, { color: Colors.text }]}
                    >
                      Stock / Price
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => void toggleStatus(item)}
                  >
                    {isPublished ? (
                      <>
                        <PauseCircle size={13} color={Colors.textMuted} />
                        <Text
                          style={[
                            styles.actionChipText,
                            { color: Colors.textMuted },
                          ]}
                        >
                          Pause
                        </Text>
                      </>
                    ) : (
                      <>
                        <PlayCircle size={13} color={Colors.primary} />
                        <Text style={styles.actionChipText}>Publish</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionChip, { borderColor: "#FECACA" }]}
                    onPress={() => void deleteListing(item)}
                  >
                    <Trash2 size={13} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Manual Pickup Dates Modal */}
      <Modal
        visible={Boolean(editingDatesItem)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!savingDates) setEditingDatesItem(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Edit Pickup Dates</Text>
                <Text style={styles.modalSub}>
                  {editingDatesItem?.title} • Tap dates when buyers can pick up
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingDatesItem(null)}
                disabled={savingDates}
                style={{ padding: 6 }}
              >
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setSelectedDates(dateOptions.slice(0, 3))}
              >
                <Text style={styles.presetChipText}>Next 3 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setSelectedDates(dateOptions.slice(0, 7))}
              >
                <Text style={styles.presetChipText}>Next 7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setSelectedDates([])}
              >
                <Text style={styles.presetChipText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.dateGrid}>
              {dateOptions.map((dateKey) => {
                const active = selectedDates.includes(dateKey);
                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => toggleDateSelection(dateKey)}
                  >
                    <Text
                      style={[
                        styles.dateChipText,
                        active && styles.dateChipTextActive,
                      ]}
                    >
                      {formatDateLabel(dateKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingDatesItem(null)}
                disabled={savingDates}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  (selectedDates.length === 0 || savingDates) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={() => void savePickupDates()}
                disabled={selectedDates.length === 0 || savingDates}
              >
                <Text style={styles.modalSaveText}>
                  {savingDates
                    ? "Saving..."
                    : `Save ${selectedDates.length} Date(s)`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 52,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipDraftHint: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  filterChipTextActive: {
    color: "#FFF",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  listContent: { padding: 16, gap: 12, paddingBottom: 90 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  draftCard: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFDF7",
  },
  topRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, flex: 1 },
  statusPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillDraft: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  statusPillPaused: {
    backgroundColor: "#F3F4F6",
  },
  statusText: { fontSize: 10, fontWeight: "800", color: Colors.primary },
  statusTextDraft: { color: "#B45309" },
  featuredUnpaidBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
  },
  metaText: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  dateSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  dateSummaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
    flex: 1,
  },
  inlineEditBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  inputLbl: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMuted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  saveSmallBtn: {
    backgroundColor: Colors.primary,
    padding: 10,
    borderRadius: 10,
  },
  cancelSmallBtn: {
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  editDraftChip: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  actionChipWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  actionChipText: { fontSize: 11, fontWeight: "700", color: Colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingTop: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  presetChipText: { fontSize: 11, fontWeight: "800", color: Colors.primary },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 18,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  dateChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dateChipText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  dateChipTextActive: { color: "#FFF" },
  modalFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 13, fontWeight: "700", color: Colors.text },
  modalSaveBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 13, fontWeight: "800", color: "#FFF" },
});
