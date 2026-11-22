// src/app/admin/profile.tsx
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import {
    Building2,
    Camera,
    LogOut,
    Mail,
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

export default function AdminProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
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
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (error) throw error;
    if (data) setProfile({ id: data.id, ...data });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile().catch((error: unknown) =>
        console.error("Could not load admin profile.", error),
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

  const initials = (profile?.full_name || "AD").slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Campus Admin Profile</Text>

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

        <Text style={styles.name}>{profile?.full_name || "Campus Admin"}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>CAMPUS ADMINISTRATOR</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>ADMIN DETAILS</Text>
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
            <Text style={styles.detailLbl}>Administrative Office</Text>
            <Text style={styles.detailVal}>
              {profile?.department || "TBI & CCIS Oversight"}
            </Text>
          </View>
        </View>
        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <ShieldCheck size={18} color={Colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLbl}>Verification Status</Text>
            <Text style={[styles.detailVal, { color: Colors.success }]}>
              {(profile?.verification_status || "verified").toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <LogOut size={18} color={Colors.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
});
