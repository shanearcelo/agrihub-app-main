// src/app/seller/_layout.tsx
import { Tabs, useFocusEffect, usePathname, useRouter } from "expo-router";
import {
    ClipboardList,
    Home,
    LogOut,
    Package,
    PlusCircle,
    User,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLogo } from "../../components/BrandLogo";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

const SELLER_NAV_ITEMS = [
  { name: "index", href: "/seller", label: "Home", Icon: Home },
  {
    name: "orders",
    href: "/seller/orders",
    label: "Orders",
    Icon: ClipboardList,
  },
  {
    name: "post-harvest",
    href: "/seller/post-harvest",
    label: "Post Harvest",
    Icon: PlusCircle,
  },
  {
    name: "inventory",
    href: "/seller/inventory",
    label: "My Harvests",
    Icon: Package,
  },
  { name: "profile", href: "/seller/profile", label: "Profile", Icon: User },
] as const;

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

export default function SellerLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canEnter, setCanEnter] = useState(false);
  const [guardError, setGuardError] = useState("");
  const [retry, setRetry] = useState(0);

  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (retry > 0) setCanEnter(false);
      setCheckingAccess(true);
      setGuardError("");

      void (async () => {
        try {
          const user = await withTimeout(
            getCurrentUser(),
            15_000,
            "Checking your seller session timed out. Please try again.",
          );
          if (!user) {
            router.replace("/auth/login");
            return;
          }
          const { data: profile, error } = await withTimeout(
            supabase
              .from("profiles")
              .select("role, valid_id_url, id_document_url")
              .eq("id", user.id)
              .maybeSingle(),
            15_000,
            "Checking your seller profile timed out. Please try again.",
          );
          if (error) throw error;
          if (!profile) throw new Error("Seller profile could not be found.");
          if (profile.role !== "seller") {
            router.replace(profile.role === "admin" ? "/admin" : "/buyer");
            return;
          }
          if (!(profile.valid_id_url || profile.id_document_url)) {
            router.replace("/auth/verify-id");
            return;
          }
          if (active) setCanEnter(true);
        } catch (error) {
          console.error("Could not verify seller access.", error);
          if (active) {
            setCanEnter(false);
            setGuardError(
              error instanceof Error
                ? error.message
                : "Could not verify your seller account.",
            );
          }
        } finally {
          if (active) setCheckingAccess(false);
        }
      })();

      return () => {
        active = false;
      };
    }, [retry, router]),
  );

  async function performLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (Platform.OS === "web") {
        window.alert(`Sign Out Failed: ${error.message}`);
      } else {
        Alert.alert("Sign Out Failed", error.message);
      }
      return;
    }
    router.replace("/auth/login");
  }

  function handleLogout() {
    const message = "ARE U SURE U WANT TO LOG OUT?";
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

  function isRouteActive(href: string) {
    if (href === "/seller") {
      return pathname === "/seller" || pathname === "/seller/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (checkingAccess || !canEnter) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: Colors.background,
        }}
      >
        {checkingAccess ? (
          <>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text
              style={{
                color: Colors.textMuted,
                textAlign: "center",
                marginTop: 12,
              }}
            >
              Checking seller access…
            </Text>
          </>
        ) : guardError ? (
          <>
            <Text
              style={{
                color: Colors.text,
                textAlign: "center",
                fontWeight: "700",
              }}
            >
              Seller access could not be verified
            </Text>
            <Text
              style={{
                color: Colors.textMuted,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {guardError}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setRetry((current) => current + 1)}
              style={{
                marginTop: 16,
                paddingHorizontal: 18,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: Colors.primary,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "700" }}>
                Try again
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Desktop / Web Top Navigation Bar */}
      {isDesktopWeb && (
        <View style={styles.webNavbar}>
          <View style={styles.webNavbarInner}>
            {/* Left: Brand + Seller Hub Tag */}
            <Pressable
              style={styles.brandGroup}
              onPress={() => router.push("/seller")}
            >
              <BrandLogo size={34} />
              <View>
                <Text style={styles.brandTitle}>AgriHub</Text>
                <Text style={styles.brandSubtitle}>SELLER HUB</Text>
              </View>
            </Pressable>

            {/* Center: Navigation Links */}
            <View style={styles.navLinksRow}>
              {SELLER_NAV_ITEMS.map(({ name, href, label, Icon }) => {
                const active = isRouteActive(href);
                return (
                  <Pressable
                    key={name}
                    onPress={() => router.push(href as any)}
                    style={[styles.navItem, active && styles.navItemActive]}
                  >
                    <Icon
                      size={17}
                      color={active ? Colors.primary : Colors.textMuted}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    <Text
                      style={[styles.navLabel, active && styles.navLabelActive]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Right: Quick Logout Action */}
            <Pressable style={styles.logoutPill} onPress={handleLogout}>
              <LogOut size={15} color={Colors.danger} />
              <Text style={styles.logoutPillText}>Log Out</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Content + Mobile Bottom Tab Bar */}
      <View style={styles.contentWrap}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            headerShown: false,
            animation: "fade",
            tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
            tabBarStyle: isDesktopWeb
              ? { display: "none" }
              : {
                  width: "100%",
                  height: 62 + Math.max(insets.bottom, 8),
                  paddingBottom: Math.max(insets.bottom, 8),
                  paddingTop: 6,
                  backgroundColor: "#FFF",
                  borderTopColor: Colors.border,
                },
            tabBarItemStyle: {
              flex: 1,
              minWidth: 0,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 2,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color }) => <Home size={21} color={color} />,
            }}
          />
          <Tabs.Screen
            name="orders"
            options={{
              title: "Orders",
              tabBarIcon: ({ color }) => (
                <ClipboardList size={21} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="post-harvest"
            options={{
              title: "Post",
              tabBarIcon: ({ color }) => <PlusCircle size={21} color={color} />,
            }}
          />
          <Tabs.Screen
            name="inventory"
            options={{
              title: "My Harvests",
              tabBarIcon: ({ color }) => <Package size={21} color={color} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ color }) => <User size={21} color={color} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  webNavbar: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 24,
    height: 68,
    justifyContent: "center",
    zIndex: 50,
  },
  webNavbarInner: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.primary,
    lineHeight: 20,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  navLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: "#DCFCE7",
  },
  navLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  navLabelActive: {
    color: Colors.primary,
    fontWeight: "800",
  },
  logoutPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  logoutPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.danger,
  },
  contentWrap: {
    flex: 1,
  },
});
