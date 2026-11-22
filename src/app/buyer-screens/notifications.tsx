import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import {
  DEFAULT_BUYER_NOTIFICATION_PREFERENCES,
  isBuyerNotificationEnabled,
  parseBuyerNotificationPreferences,
} from "../../lib/buyerPreferences";
import { supabase } from "../../lib/supabase";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
};

function showError(message: string) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Notification Error", message);
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_BUYER_NOTIFICATION_PREFERENCES,
  );
  const [loadError, setLoadError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;

      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!active) return;
          if (!user) {
            router.replace("/auth/login");
            return;
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("notification_preferences")
            .eq("id", user.id)
            .maybeSingle();
          if (profileError) throw profileError;

          if (active) {
            setLoadError("");
            setNotificationPreferences(
              parseBuyerNotificationPreferences(
                profile?.notification_preferences,
              ),
            );
          }

          const loadNotifications = async () => {
            const { data, error } = await supabase
              .from("notifications")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(100);
            if (error) throw error;
            if (active) setItems((data || []) as AppNotification[]);
          };

          await loadNotifications();
          if (!active) return;

          const sub = supabase
            .channel(`notifications:${user.id}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${user.id}`,
              },
              () => {
                void loadNotifications().catch((error: unknown) => {
                  console.error("Could not refresh notifications.", error);
                  if (active) {
                    setLoadError(
                      error instanceof Error
                        ? error.message
                        : "Refresh failed.",
                    );
                  }
                });
              },
            )
            .subscribe();

          if (!active) {
            void supabase.removeChannel(sub);
          } else {
            channel = sub;
          }
        } catch (error) {
          console.error("Could not load notifications.", error);
          if (active) {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Could not load notifications.",
            );
          }
        }
      })();

      return () => {
        active = false;
        if (channel) {
          void supabase.removeChannel(channel);
          channel = null;
        }
      };
    }, [router]),
  );

  async function markAllAsRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0 || markingAll) return;

    setMarkingAll(true);
    setItems((current) => current.map((n) => ({ ...n, is_read: true })));

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
      if (error) throw error;
    } catch (error: unknown) {
      console.error("Could not mark all notifications as read.", error);
      showError(
        error instanceof Error
          ? `Could not mark all as read: ${error.message}`
          : "Could not mark all notifications as read.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  function openNotification(item: AppNotification) {
    if (!item.is_read) {
      setItems((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
      void (async () => {
        try {
          const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", item.id);
          if (error) throw error;
        } catch (error: unknown) {
          console.error("Could not mark notification as read.", error);
          showError(
            error instanceof Error
              ? `Could not mark notification as read: ${error.message}`
              : "Could not mark notification as read.",
          );
        }
      })();
    }

    if (item.type === "message" && item.reference_id) {
      router.push({
        pathname: "/chat/[orderId]",
        params: { orderId: item.reference_id },
      });
    } else if (item.type === "order" || item.type === "payment") {
      if (item.reference_id) {
        router.push({
          pathname: "/order-success/[id]",
          params: { id: item.reference_id },
        });
      } else {
        router.push("/buyer-screens/orders-history");
      }
    } else if (item.type === "verification") {
      router.push("/buyer/profile");
    } else {
      router.push("/buyer");
    }
  }

  const visibleItems = items.filter((item) =>
    isBuyerNotificationEnabled(item.type, notificationPreferences),
  );
  const hasUnread = visibleItems.some((item) => !item.is_read);

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(insets.top + 12, 20) }]}
    >
      <View style={styles.top}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/buyer");
            }}
          >
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
        </View>

        {hasUnread ? (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={() => void markAllAsRead()}
            disabled={markingAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <CheckCheck size={15} color={Colors.primary} />
            <Text style={styles.markAllText}>Read all</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loadError ? (
        <Text style={styles.errorText}>Could not load alerts: {loadError}</Text>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom + 24, 24) },
        ]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>You&apos;re all caught up.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.card,
              !item.is_read && styles.unreadCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => openNotification(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.body}`}
            accessibilityHint="Open the related AgriHub screen"
          >
            <Bell
              size={18}
              color={item.is_read ? Colors.textMuted : Colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.nTitle}>{item.title}</Text>
              <Text style={styles.nDesc}>{item.body}</Text>
              <Text style={styles.nTime}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            {!item.is_read ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 18,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  list: { paddingHorizontal: 18, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressedCard: { opacity: 0.72 },
  unreadCard: { borderColor: Colors.primary, backgroundColor: "#F0FDF4" },
  nTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  nDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  nTime: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: "700",
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.textMuted,
    paddingVertical: 36,
  },
});
