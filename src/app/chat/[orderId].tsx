// src/app/chat/[orderId].tsx
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, CheckCheck, Send } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

type ChatMessage = {
  id: string;
  sender_id?: string;
  message_text?: string;
  created_at?: string;
  is_read?: boolean;
  status?: "sending" | "sent";
};

const MESSAGE_LIMIT = 100;

function formatMessageTime(createdAt?: string) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) return time;
  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

export default function OrderChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [listenerError, setListenerError] = useState("");
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const shouldAutoScroll = useRef(true);
  const [uid, setUid] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!orderId) {
        setMessages([]);
        setLoading(false);
        return;
      }

      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      setLoading(true);
      setMessages([]);
      shouldAutoScroll.current = true;
      setListenerError("");
      void (async () => {
        try {
          const user = await getCurrentUser();
          if (!active) return;
          if (!user) {
            router.replace("/auth/login");
            return;
          }
          setUid(user.id);
          const loadMessages = async () => {
            const { data, error } = await supabase
              .from("messages")
              .select("id, sender_id, content, created_at, is_read")
              .eq("chat_id", orderId)
              .order("created_at", { ascending: false })
              .limit(MESSAGE_LIMIT);
            if (error) throw error;
            const nextMessages = (data || [])
              .map((message) => ({
                ...message,
                message_text: message.content,
              }))
              .reverse() as ChatMessage[];
            if (!active) return;
            setMessages((current) => {
              const unchanged =
                current.length === nextMessages.length &&
                current.every(
                  (message, index) =>
                    message.id === nextMessages[index].id &&
                    message.sender_id === nextMessages[index].sender_id &&
                    message.message_text === nextMessages[index].message_text &&
                    message.created_at === nextMessages[index].created_at &&
                    message.is_read === nextMessages[index].is_read,
                );
              return unchanged ? current : nextMessages;
            });
            setLoading(false);
          };
          await loadMessages();
          const { error: readError } = await supabase.rpc("mark_chat_read", {
            p_chat_id: orderId,
          });
          if (readError) throw readError;
          if (!active) return;
          channel = supabase
            .channel(`chat-messages:${orderId}:${Date.now()}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "messages",
                filter: `chat_id=eq.${orderId}`,
              },
              (payload) => {
                const incoming = payload.new as {
                  id: string;
                  sender_id: string;
                  content: string;
                  created_at: string;
                  is_read?: boolean;
                };
                if (!incoming.id) return;
                setMessages((current) => {
                  if (current.some((message) => message.id === incoming.id)) {
                    return current;
                  }
                  return [
                    ...current,
                    {
                      id: incoming.id,
                      sender_id: incoming.sender_id,
                      message_text: incoming.content,
                      created_at: incoming.created_at,
                      is_read: incoming.is_read,
                    },
                  ].slice(-MESSAGE_LIMIT);
                });
                void (async () => {
                  try {
                    const { error } = await supabase.rpc("mark_chat_read", {
                      p_chat_id: orderId,
                    });
                    if (error) throw error;
                  } catch (error) {
                    console.error("Could not refresh chat messages.", error);
                    if (active) {
                      setListenerError(
                        error instanceof Error
                          ? error.message
                          : "Could not refresh messages.",
                      );
                    }
                  }
                })();
              },
            )
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "messages",
                filter: `chat_id=eq.${orderId}`,
              },
              (payload) => {
                const updated = payload.new as {
                  id: string;
                  is_read?: boolean;
                };
                if (!updated.id) return;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === updated.id
                      ? { ...message, is_read: updated.is_read }
                      : message,
                  ),
                );
              },
            )
            .subscribe((status, error) => {
              if (!active) return;
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                setListenerError(
                  error?.message || "The real-time connection was interrupted.",
                );
              }
            });
        } catch (error) {
          console.error("Chat messages failed to load:", error);
          if (!active) return;
          setListenerError(
            error instanceof Error ? error.message : "Could not load messages.",
          );
          setLoading(false);
        }
      })();

      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [orderId, router]),
  );

  async function sendMessage() {
    const messageText = text.trim();
    if (!messageText || !uid || !orderId || sending) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      sender_id: uid,
      message_text: messageText,
      created_at: new Date().toISOString(),
      status: "sending",
      is_read: false,
    };
    setMessages((current) => [...current, optimisticMessage].slice(-MESSAGE_LIMIT));
    setText("");
    setSending(true);
    try {
      const { data: savedMessage, error } = await supabase
        .from("messages")
        .insert({
          chat_id: orderId,
          sender_id: uid,
          content: messageText,
        })
        .select("id, sender_id, content, created_at, is_read")
        .single();
      if (error) throw error;
      if (savedMessage) {
        setMessages((current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  id: savedMessage.id,
                  sender_id: savedMessage.sender_id,
                  message_text: savedMessage.content,
                  created_at: savedMessage.created_at,
                  is_read: savedMessage.is_read,
                  status: "sent",
                }
              : message,
          ),
        );
      }

      await supabase
        .from("chats")
        .update({
          last_message: messageText,
          last_sender_id: uid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== tempId),
      );
      const message =
        error instanceof Error ? error.message : "Could not send this message.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Message Not Sent", message);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "bottom", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.push("/");
            }}
            style={styles.backButton}
          >
            <ArrowLeft size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Chat</Text>
        </View>

        {listenerError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              Could not load messages: {listenerError}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {loading ? "Loading messages…" : "Start the conversation."}
            </Text>
          }
          renderItem={({ item }) => {
            const isMe = item.sender_id === uid;
            const time = formatMessageTime(item.created_at);
            return (
              <View
                style={[
                  styles.bubble,
                  isMe ? styles.myBubble : styles.theirBubble,
                ]}
              >
                <Text style={[styles.msgText, isMe && styles.myMessageText]}>
                  {item.message_text || ""}
                </Text>
                {isMe ? (
                  <View style={styles.statusRow}>
                    {item.status === "sending" ? (
                      <Text style={styles.myMetaText}>Sending...</Text>
                    ) : item.is_read === true ? (
                      <>
                        <CheckCheck size={12} color="#D1FAE5" />
                        <Text style={styles.myMetaText}>
                          {time} • Delivered • Seen
                        </Text>
                      </>
                    ) : (
                      <>
                        <Check size={12} color="#D1FAE5" />
                        <Text style={styles.myMetaText}>
                          {time} • Sent & Delivered
                        </Text>
                      </>
                    )}
                  </View>
                ) : (
                  <Text style={styles.receivedMetaText}>
                    {time} • Delivered
                  </Text>
                )}
              </View>
            );
          }}
          onScroll={({ nativeEvent }) => {
            const distanceFromBottom =
              nativeEvent.contentSize.height -
              nativeEvent.layoutMeasurement.height -
              nativeEvent.contentOffset.y;
            shouldAutoScroll.current = distanceFromBottom < 100;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (shouldAutoScroll.current) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            accessibilityLabel="Message"
            value={text}
            onChangeText={setText}
            editable={Boolean(uid && orderId) && !sending}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!text.trim() || sending || !uid) && styles.sendButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={sendMessage}
            disabled={!text.trim() || sending || !uid}
          >
            <Send size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  messageList: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 8 },
  emptyText: {
    alignSelf: "center",
    color: Colors.textMuted,
    fontSize: 13,
    paddingVertical: 20,
  },
  bubble: { maxWidth: "82%", padding: 12, borderRadius: 16 },
  myBubble: { alignSelf: "flex-end", backgroundColor: Colors.primary },
  theirBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgText: { fontSize: 14, color: Colors.text },
  myMessageText: { color: "#FFF" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 5,
  },
  myMetaText: {
    color: "#D1FAE5",
    fontSize: 9,
    fontWeight: "600",
  },
  receivedMetaText: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 5,
  },
  errorBanner: {
    padding: 10,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  errorText: { color: Colors.danger, fontSize: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: { opacity: 0.5 },
});
