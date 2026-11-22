// src/app/seller-screens/_layout.tsx
import { Slot, usePathname, useRouter, type Href } from "expo-router";
import {
    ArrowLeft,
    Home,
    LogOut,
    MessageSquare,
    Package,
    PlusCircle,
    Sprout,
    User,
} from "lucide-react-native";
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const SELLER_NAV_ITEMS = [
  { label: "Home", path: "/seller", icon: Home },
  { label: "My Harvests", path: "/seller/inventory", icon: Package },
  { label: "Post Harvest", path: "/seller/post-harvest", icon: PlusCircle },
  { label: "Messages", path: "/seller-screens/messages", icon: MessageSquare },
  { label: "Profile", path: "/seller/profile", icon: User },
] as const;

export default function SellerScreensLayout() {
  const router = useRouter();
  const pathname = usePathname();

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/seller");
  }

  async function handleLogout() {
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("Log out of your seller account?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("Log Out", "Log out of your seller account?", [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Log Out",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]),
          );

    if (!confirmed) return;
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  return (
    <View style={styles.shell}>
      <View style={styles.navbar}>
        {/* Left: Back Button + AgriHub Brand */}
        <View style={styles.leftGroup}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color={Colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.brandRow}
            onPress={() => router.push("/seller")}
          >
            <View style={styles.logoCircle}>
              <Sprout size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.brandTitle}>AgriHub</Text>
              <Text style={styles.brandSub}>CAMPUS MARKETPLACE</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Center: Seller Navigation Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navLinksRow}
        >
          {SELLER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/seller"
                ? pathname === "/seller"
                : pathname.startsWith(item.path);

            return (
              <TouchableOpacity
                key={item.path}
                style={[styles.navChip, isActive && styles.navChipActive]}
                onPress={() => router.push(item.path as Href)}
              >
                <Icon
                  size={15}
                  color={isActive ? Colors.primary : Colors.textMuted}
                />
                <Text
                  style={[
                    styles.navChipText,
                    isActive && styles.navChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Right: Log Out Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => void handleLogout()}
        >
          <LogOut size={14} color={Colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Active Screen Content */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.primary,
    lineHeight: 17,
  },
  brandSub: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.7,
  },
  navLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  navChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  navChipActive: {
    backgroundColor: "#DCFCE7",
  },
  navChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  navChipTextActive: {
    color: Colors.primary,
    fontWeight: "800",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.danger,
  },
  content: {
    flex: 1,
  },
});
