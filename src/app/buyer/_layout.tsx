// src/app/buyer/_layout.tsx
import { Tabs, usePathname, useRouter } from "expo-router";
import {
    Home,
    LogOut,
    MessageSquare,
    Search,
    ShoppingCart,
    User,
} from "lucide-react-native";
import {
    Alert,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLogo } from "../../components/BrandLogo";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const BUYER_NAV_ITEMS = [
  { name: "index", href: "/buyer", label: "Home", Icon: Home },
  { name: "search", href: "/buyer/search", label: "Search", Icon: Search },
  { name: "cart", href: "/buyer/cart", label: "Cart", Icon: ShoppingCart },
  {
    name: "message",
    href: "/buyer/message",
    label: "Messages",
    Icon: MessageSquare,
  },
  { name: "profile", href: "/buyer/profile", label: "Profile", Icon: User },
] as const;

export default function BuyerLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  const isDesktopWeb = Platform.OS === "web" && width >= 768;

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
    if (href === "/buyer") {
      return pathname === "/buyer" || pathname === "/buyer/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <View style={styles.root}>
      {/* Desktop / Web Top Navigation Bar */}
      {isDesktopWeb && (
        <View style={styles.webNavbar}>
          <View style={styles.webNavbarInner}>
            {/* Left: Brand + Buyer Marketplace Tag */}
            <Pressable
              style={styles.brandGroup}
              onPress={() => router.push("/buyer")}
            >
              <BrandLogo size={34} />
              <View>
                <Text style={styles.brandTitle}>AgriHub</Text>
                <Text style={styles.brandSubtitle}>CAMPUS MARKETPLACE</Text>
              </View>
            </Pressable>

            {/* Center: Navigation Links */}
            <View style={styles.navLinksRow}>
              {BUYER_NAV_ITEMS.map(({ name, href, label, Icon }) => {
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
          backBehavior="history"
          screenOptions={{
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            headerShown: false,
            animation: "fade",
            tabBarStyle: isDesktopWeb
              ? { display: "none" }
              : {
                  width: "100%",
                  maxWidth: 720,
                  alignSelf: "center",
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
              paddingVertical: 2,
            },
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: "700",
              lineHeight: 14,
              marginBottom: 0,
            },
            tabBarIconStyle: { alignItems: "center", justifyContent: "center" },
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
            name="search"
            options={{
              title: "Search",
              tabBarIcon: ({ color }) => <Search size={21} color={color} />,
            }}
          />
          <Tabs.Screen
            name="cart"
            options={{
              title: "Cart",
              tabBarIcon: ({ color }) => (
                <ShoppingCart size={21} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="message"
            options={{
              title: "Messages",
              tabBarIcon: ({ color }) => (
                <MessageSquare size={21} color={color} />
              ),
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
