// src/app/buyer/profile.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import {
    BadgeCheck,
    Bell,
    Camera,
    ChevronRight,
    Edit3,
    Heart,
    LogOut,
    MapPin,
    Receipt,
    Settings,
    ShieldCheck,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";
import {
    createImageUploadPath,
    uploadImageToSupabase,
} from "../../lib/uploadImageToSupabase";

export default function UserProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    ordersCount: 0,
    activeCount: 0,
    totalSpent: 0,
    avgRating: "4.9",
    kgSaved: 0,
  });
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const loadProfileAndStats = useCallback(
    async (uid: string, fallbackEmail: string) => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();
        if (profileError) throw profileError;
        if (profileData) {
          setProfile(profileData);
        } else {
          setProfile({
            id: uid,
            full_name: "Campus Buyer",
            email: fallbackEmail,
            institutional_email: fallbackEmail,
            role: "buyer",
            department: "Main Campus ADSSU",
            verification_status: "verified",
          });
        }

        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("id, total_amount, order_status, items")
          .eq("buyer_id", uid);
        if (ordersError) throw ordersError;
        let spent = 0;
        let active = 0;
        let totalKg = 0;

        (orders || []).forEach((data) => {
          const status = String(data.order_status || "pending").toLowerCase();
          if (status !== "cancelled") {
            spent += Number(data.total_amount || 0);
            totalKg += Array.isArray(data.items)
              ? data.items.reduce(
                  (sum: number, item: any) => sum + Number(item.quantity || 1),
                  0,
                )
              : 1;
          }
          if (
            status === "pending" ||
            status === "confirmed" ||
            status === "ready_for_pickup"
          ) {
            active += 1;
          }
        });

        setStats({
          ordersCount: orders?.length || 0,
          activeCount: active,
          totalSpent: spent,
          avgRating: "4.9",
          kgSaved: Math.max(totalKg, (orders?.length || 0) > 0 ? 1 : 0),
        });
      } catch (error) {
        console.warn("Error loading buyer profile:", error);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const currentUser = await getCurrentUser();
          if (!active) return;
          if (!currentUser) {
            router.replace("/auth/login");
            return;
          }
          await loadProfileAndStats(currentUser.id, currentUser.email || "");
        } catch (error) {
          console.error("Could not load current user.", error);
        }
      })();
      return () => {
        active = false;
      };
    }, [loadProfileAndStats, router]),
  );

  async function handleUploadAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.35,
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
      const finalUrl = await uploadImageToSupabase(
        asset,
        "avatars",
        createImageUploadPath(profile.id, asset.mimeType),
      );
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: finalUrl })
        .eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, avatar_url: finalUrl });
      showMessage("Updated", "Profile picture saved!");
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

  const fullName = profile?.full_name || "Campus Buyer";
  const isIdVerified =
    profile?.verification_status === "verified" &&
    Boolean(profile?.id_document_url || profile?.valid_id_url);
  const nameParts = fullName.trim().split(" ");
  const initials =
    nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
      : fullName.slice(0, 2).toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 34 }}
    >
      {/* Green Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ width: 32 }} />
          <Text style={styles.pageTitle}>My Profile</Text>
          <TouchableOpacity
            style={styles.gearBtn}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/buyer-screens/settings")}
          >
            <Settings size={18} color="#FFF" />
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
            <Camera size={13} color="#FFF" />
          </View>
        </TouchableOpacity>

        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {fullName}
          </Text>
          {isIdVerified ? (
            <View style={styles.idVerifiedBadge}>
              <BadgeCheck size={13} color="#DCFCE7" />
              <Text style={styles.idVerifiedText}>ID Verified</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Overlapping Identity Card */}
      <View style={styles.identityCard}>
        <View style={styles.identityTopRow}>
          <View style={styles.badgeRow}>
            <Text style={styles.roleTag}>Campus Buyer</Text>
          </View>
          <TouchableOpacity
            style={styles.editIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Edit profile information"
            onPress={() => router.push("/profile/edit")}
          >
            <Edit3 size={15} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.emailText}>
          {profile?.email ||
            profile?.institutional_email ||
            "student@adssu.edu.ph"}
        </Text>
        <Text style={styles.deptSubText}>
          {[
            profile?.department || "Main Campus ADSSU",
            profile?.course || profile?.course_year
              ? `Program: ${profile.course || profile.course_year}`
              : null,
            profile?.school_id_number || profile?.id_number
              ? `School ID Number: ${profile.school_id_number || profile.id_number}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")}
        </Text>
      </View>

      {/* 4 Stats Grid (Orders, Spent, Rating, Saved) */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.ordersCount}</Text>
          <Text style={styles.statLbl}>Orders</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>
            ₱{stats.totalSpent.toLocaleString()}
          </Text>
          <Text style={styles.statLbl}>Spent</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.avgRating}</Text>
          <Text style={styles.statLbl}>Rating</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: Colors.primary }]}>
            {stats.kgSaved} kg
          </Text>
          <Text style={styles.statLbl}>Saved</Text>
        </View>
      </View>

      {/* ACCOUNT Section */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/buyer-screens/orders-history")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#DCFCE7" }]}>
            <Receipt size={17} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Transaction History</Text>
            <Text style={styles.menuSub}>
              {stats.ordersCount} orders • {stats.activeCount} active
            </Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/buyer-screens/favorites")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#FEE2E2" }]}>
            <Heart size={17} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>My Favorites</Text>
            <Text style={styles.menuSub}>View your saved harvests</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/buyer-screens/map")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#DBEAFE" }]}>
            <MapPin size={17} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Saved Pick-up Spots</Text>
            <Text style={styles.menuSub}>Agri Stalls, CEIS Lobby, TBI</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomWidth: 0 }]}
          onPress={() => router.push("/buyer-screens/security")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#FEF3C7" }]}>
            <ShieldCheck size={17} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Account Security</Text>
            <Text style={styles.menuSub}>Password, OTP, 2FA devices</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* PREFERENCES Section */}
      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/buyer-screens/notifications")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#F3E8FF" }]}>
            <Bell size={17} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Notifications</Text>
            <Text style={styles.menuSub}>Harvest alerts, reminders</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomWidth: 0 }]}
          onPress={handleLogout}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#FEE2E2" }]}>
            <LogOut size={17} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, { color: Colors.danger }]}>
              Logout
            </Text>
            <Text style={styles.menuSub}>Sign out from this device</Text>
          </View>
          <ChevronRight size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 50,
    paddingBottom: 38,
    paddingHorizontal: 18,
    alignItems: "center",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  pageTitle: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  gearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrap: { position: "relative" },
  avatarImg: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: "#FFF",
  },
  avatarFallback: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFF",
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: "#111827" },
  camBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  nameRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  name: { color: "#FFF", fontSize: 20, fontWeight: "800", flexShrink: 1 },
  idVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  idVerifiedText: { color: "#FFF", fontSize: 10, fontWeight: "800" },

  identityCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: -22,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  identityTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  roleTag: { fontSize: 12, fontWeight: "800", color: Colors.text },
  editIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  emailText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 6,
  },
  deptSubText: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNum: { fontSize: 15, fontWeight: "800", color: Colors.text },
  statLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 18,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  menuTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  menuSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
});
