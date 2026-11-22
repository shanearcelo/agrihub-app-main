// src/app/admin/verification.tsx
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  FileImage,
  Search,
  ShieldCheck,
  X,
  ZoomIn,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { getImageUrl } from "../../lib/uploadImageToSupabase";

type RoleFilter = "all" | "seller" | "buyer";

export default function AdminVerificationScreen() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<{
    imageUrl: string;
    fullName: string;
    idNumber: string;
    courseYear: string;
    role: string;
    email: string;
  } | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;

      const loadProfiles = async () => {
        setLoading(true);
        let query = supabase
          .from("profiles")
          .select("*")
          .in("role", ["seller", "buyer"])
          .order("verified_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (roleFilter !== "all") {
          query = query.eq("role", roleFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        const profilesList = await Promise.all(
          (data || [])
            .filter((profile) =>
              Boolean(
                profile.id_document_url ||
                profile.valid_id_url ||
                profile.verification_status === "verified",
              ),
            )
            .map(async (profile) => ({
              ...profile,
              resolved_id_url:
                (await getImageUrl(
                  "valid-ids",
                  profile.id_document_url || profile.valid_id_url,
                )) || null,
            })),
        );

        if (active) {
          setProfiles(profilesList);
          setLoading(false);
        }
      };

      void loadProfiles()
        .then(() => {
          if (!active) return;
          channel = supabase
            .channel(`admin-id-viewer:${roleFilter}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "profiles",
              },
              () => {
                void loadProfiles().catch((error: unknown) =>
                  console.error("[AdminIdViewer] Refresh failed:", error),
                );
              },
            )
            .subscribe();
        })
        .catch((error: unknown) => {
          console.error("[AdminIdViewer] Query failed:", error);
          if (active) setLoading(false);
        });

      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [roleFilter]),
  );

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((item) => {
      const name = String(item.full_name || "").toLowerCase();
      const email = String(item.institutional_email || "").toLowerCase();
      const idNum = String(item.id_number || "").toLowerCase();
      const course = String(item.course_year || "").toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        idNum.includes(q) ||
        course.includes(q)
      );
    });
  }, [profiles, searchQuery]);

  const openIdModal = (item: any) => {
    if (!item.resolved_id_url) return;
    setSelectedRecord({
      imageUrl: item.resolved_id_url,
      fullName: item.full_name || "Unnamed User",
      idNumber: item.id_number || "Not recorded",
      courseYear: item.course_year || "Not provided",
      role: String(item.role || "user").toUpperCase(),
      email: item.institutional_email || "",
    });
    setModalVisible(true);
  };

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
          <Text style={styles.header}>ADSSU ID Directory</Text>
          <Text style={styles.subHeader}>
            Auto-verified Student & Staff School IDs (View Only)
          </Text>
        </View>
        <View style={styles.autoPill}>
          <ShieldCheck size={13} color={Colors.primary} />
          <Text style={styles.autoPillText}>Auto-Verified</Text>
        </View>
      </View>

      {/* Role Filter Tabs */}
      <View style={styles.tabRow}>
        {(
          [
            { key: "all", label: "ALL IDs" },
            { key: "seller", label: "SELLERS" },
            { key: "buyer", label: "BUYERS" },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, roleFilter === tab.key && styles.tabActive]}
            onPress={() => setRoleFilter(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                roleFilter === tab.key && { color: "#FFF" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <Search size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, ID No. (e.g. M-008967), course, or email..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ID Records List */}
      <FlatList
        data={filteredProfiles}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <BadgeCheck size={32} color={Colors.primary} />
            <Text style={styles.emptyTitle}>
              {loading ? "Loading School IDs..." : "No School ID records found"}
            </Text>
            <Text style={styles.emptySub}>
              {loading
                ? "Fetching auto-verified ADSSU School ID submissions."
                : "Submitted ADSSU School IDs for Buyers and Sellers will appear here automatically."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isVerified = item.verification_status === "verified";
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>
                      {item.full_name || "Unnamed User"}
                    </Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {String(item.role || "").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {item.institutional_email} •{" "}
                    {item.department || "ADSSU Main"}
                  </Text>
                  <Text style={styles.idMeta}>
                    ID No.:{" "}
                    <Text style={styles.idMetaBold}>
                      {item.id_number || "Not recorded"}
                    </Text>
                    {item.course_year ? `  •  Course: ${item.course_year}` : ""}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    isVerified
                      ? { backgroundColor: "#DCFCE7" }
                      : { backgroundColor: "#FEF3C7" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      isVerified ? { color: "#15803D" } : { color: "#B45309" },
                    ]}
                  >
                    {isVerified ? "✓ AUTO-VERIFIED" : "UNVERIFIED"}
                  </Text>
                </View>
              </View>

              {/* Tap to inspect the submitted front of the School ID */}
              {item.resolved_id_url ? (
                <TouchableOpacity
                  style={styles.idPreviewContainer}
                  onPress={() => openIdModal(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`View School ID for ${item.full_name || "user"}`}
                >
                  <Image
                    source={{ uri: item.resolved_id_url }}
                    style={styles.idPreview}
                    resizeMode="contain"
                  />
                  <View style={styles.zoomHint}>
                    <ZoomIn size={14} color="#FFF" />
                    <Text style={styles.zoomText}>Tap to View Full ID</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[styles.idPreview, styles.noIdImage]}>
                  <FileImage size={22} color={Colors.textMuted} />
                  <Text style={styles.noIdText}>No ID Image Attached</Text>
                  <Text style={styles.noIdSub}>
                    Account has not uploaded a School ID image yet
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Fullscreen ID Viewer Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseIcon}
              onPress={() => setModalVisible(false)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>

            {selectedRecord && (
              <>
                <View style={styles.modalHeaderInfo}>
                  <Text style={styles.modalUserName}>
                    {selectedRecord.fullName} ({selectedRecord.role})
                  </Text>
                  <Text style={styles.modalUserSub}>
                    ID No.: {selectedRecord.idNumber} •{" "}
                    {selectedRecord.courseYear}
                  </Text>
                </View>

                <Image
                  source={{ uri: selectedRecord.imageUrl }}
                  style={styles.fullScreenIdImage}
                  resizeMode="contain"
                />
              </>
            )}

            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeModalText}>Close Viewer</Text>
            </TouchableOpacity>
          </View>
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
  autoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  autoPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: "800", color: Colors.text },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
  },

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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  name: { fontSize: 16, fontWeight: "800", color: Colors.text },
  roleTag: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  meta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: "500",
  },
  idMeta: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 4,
    fontWeight: "500",
  },
  idMetaBold: {
    fontWeight: "800",
    color: Colors.primary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: { fontSize: 10, fontWeight: "800" },

  idPreviewContainer: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  idPreview: {
    width: "100%",
    height: "100%",
  },
  zoomHint: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  zoomText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  noIdImage: {
    height: 110,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    gap: 4,
  },
  noIdText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "700",
  },
  noIdSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "92%",
    maxWidth: 520,
    height: "80%",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
  },
  modalCloseIcon: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  modalHeaderInfo: {
    width: "100%",
    paddingRight: 36,
    marginBottom: 8,
  },
  modalUserName: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
  },
  modalUserSub: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.primary,
    marginTop: 2,
  },
  fullScreenIdImage: {
    width: "100%",
    height: "75%",
  },
  closeModalBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  closeModalText: {
    color: "#FFF",
    fontWeight: "800",
  },
});
