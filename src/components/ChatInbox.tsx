// src/components/ChatInbox.tsx
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, MessageSquare } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../constants/theme";
import { getCurrentUser } from "../lib/authHelpers";
import { supabase } from "../lib/supabase";

type ChatAudience = "buyer" | "seller";

type Conversation = {
  id: string;
  buyer_name?: string;
  seller_name?: string;
  product_title?: string;
  last_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

const CONVERSATION_LIMIT = 50;

export default function ChatInbox({ audience }: { audience: ChatAudience }) {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      setLoading(true);
      setErrorMessage("");
      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!active) return;
          if (!user) {
            router.replace("/auth/login");
            return;
          }
          const participantColumn =
            audience === "buyer" ? "buyer_id" : "seller_id";
          const loadChats = async () => {
            const { data, error } = await supabase
              .from("chats")
              .select("*")
              .eq(participantColumn, user.id)
              .order("updated_at", { ascending: false })
              .limit(CONVERSATION_LIMIT);
            if (error) throw error;
            if (active) {
              setChats((data || []) as Conversation[]);
              setLoading(false);
            }
          };
          await loadChats();
          if (!active) return;
          channel = supabase
            .channel(`chat-inbox:${audience}:${user.id}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "chats",
                filter: `${participantColumn}=eq.${user.id}`,
              },
              () => {
                void loadChats().catch((error: unknown) => {
                  console.error("Chat inbox refresh failed:", error);
                  if (active) {
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : "Refresh failed.",
                    );
                  }
                });
              },
            )
            .subscribe((status, error) => {
              if (!active) return;
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                setErrorMessage(
                  error?.message || "The real-time connection was interrupted.",
                );
              }
            });
        } catch (error) {
          console.error("Chat inbox load failed:", error);
          if (!active) return;
          setErrorMessage(
            error instanceof Error ? error.message : "Could not load chats.",
          );
          setLoading(false);
        }
      })();

      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [audience, router]),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MessageSquare size={20} color={Colors.primary} />
        </View>
        <View>
          <Text style={styles.title}>Chats</Text>
          <Text style={styles.subtitle}>Conversations by order</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            Could not load chats: {errorMessage}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={chats}
        keyExtractor={(chat) => chat.id}
        contentContainerStyle={styles.list}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <MessageSquare size={26} color={Colors.primary} />
            <Text style={styles.emptyTitle}>
              {loading ? "Loading chats…" : "No conversations yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              Chats with buyers and sellers appear here when an order exists.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const contactName =
            audience === "buyer"
              ? item.seller_name || "Seller"
              : item.buyer_name || "Buyer";
          const chatDate = item.updated_at
            ? new Date(item.updated_at).toLocaleDateString()
            : "";

          return (
            <TouchableOpacity
              style={styles.orderCard}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${contactName}`}
              onPress={() =>
                router.push({
                  pathname: "/chat/[orderId]",
                  params: { orderId: item.id },
                })
              }
            >
              <View style={styles.chatIcon}>
                <MessageSquare size={18} color={Colors.primary} />
              </View>
              <View style={styles.orderInfo}>
                <View style={styles.orderHeading}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {contactName}
                  </Text>
                  <Text style={styles.orderDate}>{chatDate}</Text>
                </View>
                <Text style={styles.orderMeta}>
                  {item.product_title || "Marketplace conversation"}
                </Text>
                <Text style={styles.itemSummary} numberOfLines={1}>
                  {item.last_message || "Open conversation"}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
  },
  title: { color: Colors.text, fontSize: 19, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  list: { padding: 14, gap: 10, flexGrow: 1 },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  chatIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  orderInfo: { flex: 1 },
  orderHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  contactName: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "800" },
  orderDate: { color: Colors.textMuted, fontSize: 10 },
  orderMeta: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  itemSummary: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  errorBanner: {
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  errorText: { color: Colors.danger, fontSize: 12 },
  emptyCard: {
    flex: 1,
    minHeight: 180,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: "#FFF",
  },
  emptyTitle: {
    marginTop: 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  emptySubtitle: {
    marginTop: 4,
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
