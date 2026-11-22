import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Bell, LogOut, MapPin, UserRound } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import {
  CAMPUS_PICKUP_SPOTS,
  DEFAULT_BUYER_NOTIFICATION_PREFERENCES,
  parseBuyerNotificationPreferences,
  type BuyerNotificationPreferences,
  type CampusPickupSpot,
} from "../../lib/buyerPreferences";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

export default function BuyerSettingsScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [pickupSpot, setPickupSpot] = useState<CampusPickupSpot>(
    CAMPUS_PICKUP_SPOTS[0],
  );
  const [notifications, setNotifications] =
    useState<BuyerNotificationPreferences>(
      DEFAULT_BUYER_NOTIFICATION_PREFERENCES,
    );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setErrorMessage("");
      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!user) {
            router.replace("/auth/login");
            return;
          }
          const { data, error } = await supabase
            .from("profiles")
            .select("preferred_pickup_spot, notification_preferences")
            .eq("id", user.id)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Buyer profile could not be found.");
          if (!active) return;
          setUserId(user.id);
          setPickupSpot(
            CAMPUS_PICKUP_SPOTS.find(
              (spot) => spot === data.preferred_pickup_spot,
            ) || CAMPUS_PICKUP_SPOTS[0],
          );
          setNotifications(
            parseBuyerNotificationPreferences(data.notification_preferences),
          );
        } catch (error) {
          console.error("Could not load buyer settings.", error);
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Could not load your settings.",
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [router]),
  );

  async function savePickupSpot(spot: CampusPickupSpot) {
    if (!userId || saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_pickup_spot: spot })
        .eq("id", userId);
      if (error) throw error;
      setPickupSpot(spot);
    } catch (error) {
      console.error("Could not save pickup preference.", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your pickup preference.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateNotificationPreference(
    key: keyof BuyerNotificationPreferences,
    value: boolean,
  ) {
    if (!userId || saving) return;
    const next = { ...notifications, [key]: value };
    setSaving(true);
    setErrorMessage("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: next })
        .eq("id", userId);
      if (error) throw error;
      setNotifications(next);
    } catch (error) {
      console.error("Could not save notification preference.", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your notification preference.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function logOut() {
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/auth/login");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not sign out.";
      setErrorMessage(message);
      if (Platform.OS === "web") window.alert(`Sign Out Failed: ${message}`);
      else Alert.alert("Sign Out Failed", message);
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={21} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>ACCOUNT</Text>
      <TouchableOpacity
        style={styles.menuRow}
        accessibilityRole="button"
        onPress={() => router.push("/profile/edit")}
      >
        <View style={styles.iconBox}>
          <UserRound size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Edit Profile Information</Text>
          <Text style={styles.rowDescription}>
            Update your name, department, and contact number
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>CAMPUS PICK-UP</Text>
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <MapPin size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Preferred Pick-up Spot</Text>
            <Text style={styles.rowDescription}>
              Used as your default when a seller offers this location.
            </Text>
          </View>
        </View>
        {CAMPUS_PICKUP_SPOTS.map((spot) => (
          <TouchableOpacity
            key={spot}
            style={styles.choiceRow}
            accessibilityRole="radio"
            accessibilityState={{ selected: pickupSpot === spot }}
            disabled={saving}
            onPress={() => void savePickupSpot(spot)}
          >
            <View
              style={[
                styles.radio,
                pickupSpot === spot && styles.radioSelected,
              ]}
            >
              {pickupSpot === spot ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={styles.choiceText}>{spot}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Bell size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Order and payment updates</Text>
            <Text style={styles.rowDescription}>
              Get notified about order progress and receipts.
            </Text>
          </View>
          <Switch
            value={notifications.orders}
            disabled={saving}
            onValueChange={(value) =>
              void updateNotificationPreference("orders", value)
            }
            accessibilityLabel="Order and payment updates"
          />
        </View>
        <View style={[styles.sectionHeader, styles.messagePreference]}>
          <Bell size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Messages</Text>
            <Text style={styles.rowDescription}>
              Get notified when a seller sends you a message.
            </Text>
          </View>
          <Switch
            value={notifications.messages}
            disabled={saving}
            onValueChange={(value) =>
              void updateNotificationPreference("messages", value)
            }
            accessibilityLabel="Message notifications"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.logoutButton, loggingOut && styles.disabled]}
        accessibilityRole="button"
        disabled={loggingOut}
        onPress={() => void logOut()}
      >
        {loggingOut ? (
          <ActivityIndicator color={Colors.danger} />
        ) : (
          <LogOut size={18} color={Colors.danger} />
        )}
        <Text style={styles.logoutText}>
          {loggingOut ? "Signing out..." : "Log Out"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingTop: 52, paddingBottom: 36 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { color: Colors.text, fontSize: 21, fontWeight: "800" },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
    padding: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  rowTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  rowDescription: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  choiceRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 8,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  choiceText: { color: Colors.text, fontSize: 12, fontWeight: "600" },
  messagePreference: { borderTopWidth: 1, borderTopColor: Colors.border },
  logoutButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF",
  },
  logoutText: { color: Colors.danger, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  error: {
    padding: 11,
    borderRadius: 10,
    color: Colors.danger,
    backgroundColor: "#FEE2E2",
  },
});
