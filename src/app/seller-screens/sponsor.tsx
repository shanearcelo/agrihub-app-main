import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Megaphone } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

type SponsorRequest = {
  id: string;
  title: string;
  subtitle: string;
  duration_days: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const DURATIONS = [7, 14, 30];

export default function SellerSponsorScreen() {
  const [storeName, setStoreName] = useState("");
  const [requests, setRequests] = useState<SponsorRequest[]>([]);
  const [durationDays, setDurationDays] = useState(7);
  const [requestNote, setRequestNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const [{ data: profile, error: profileError }, { data, error }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("store_name, full_name")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("sponsors")
            .select("id, title, subtitle, duration_days, status, created_at")
            .eq("seller_id", user.id)
            .order("created_at", { ascending: false }),
        ]);
      if (profileError) throw profileError;
      if (error) throw error;
      setStoreName(profile?.store_name || profile?.full_name || "My Store");
      setRequests((data || []) as SponsorRequest[]);
    } catch (error) {
      console.error("Could not load sponsor requests.", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load sponsor requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  async function submitRequest() {
    if (submitting) return;
    if (!requestNote.trim()) {
      setErrorMessage("Add a short note about the placement you are requesting.");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data, error } = await supabase
        .from("sponsors")
        .insert({
          seller_id: user.id,
          title: storeName,
          subtitle: requestNote.trim(),
          duration_days: durationDays,
          amount: 0,
          status: "pending",
        })
        .select("id, title, subtitle, duration_days, status, created_at")
        .single();
      if (error) throw error;
      setRequests((current) => [data as SponsorRequest, ...current]);
      setRequestNote("");
      if (Platform.OS === "web") {
        window.alert("Your store sponsorship request was sent for review.");
      } else {
        Alert.alert(
          "Request Sent",
          "Your store sponsorship request was sent for Admin review.",
        );
      }
    } catch (error) {
      console.error("Could not submit sponsor request.", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not submit your request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasPendingRequest = requests.some(
    (request) => request.status === "pending",
  );

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.push("/seller")}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to seller home"
        >
          <ArrowLeft size={19} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Sponsor My Store</Text>
          <Text style={styles.subtitle}>Request a featured marketplace placement.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Megaphone size={22} color={Colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{storeName}</Text>
        <Text style={styles.body}>
          Submit a placement request for Admin review. The placement fee and
          activation details will be confirmed after review.
        </Text>

        <Text style={styles.label}>Requested duration</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((days) => (
            <TouchableOpacity
              key={days}
              onPress={() => setDurationDays(days)}
              style={[
                styles.durationOption,
                durationDays === days && styles.durationSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: durationDays === days }}
            >
              <Text
                style={[
                  styles.durationText,
                  durationDays === days && styles.durationTextSelected,
                ]}
              >
                {days} days
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Request note</Text>
        <TextInput
          value={requestNote}
          onChangeText={setRequestNote}
          style={styles.noteInput}
          placeholder="Tell Admin what you would like to promote"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={400}
          textAlignVertical="top"
          accessibilityLabel="Sponsorship request note"
        />
        <Text style={styles.characterCount}>{requestNote.length}/400</Text>

        {errorMessage ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errorMessage}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={() => void submitRequest()}
          disabled={submitting || hasPendingRequest}
          style={[
            styles.submitButton,
            (submitting || hasPendingRequest) && styles.disabled,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>
            {hasPendingRequest
              ? "Request Under Review"
              : submitting
                ? "Sending…"
                : "Submit Request"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Request History</Text>
      {loading ? (
        <Text style={styles.body}>Loading requests…</Text>
      ) : requests.length === 0 ? (
        <View style={styles.historyEmpty}>
          <Text style={styles.body}>You have not submitted a request yet.</Text>
        </View>
      ) : (
        requests.map((request) => (
          <View key={request.id} style={styles.requestCard}>
            <View style={styles.requestTop}>
              <Text style={styles.requestTitle} numberOfLines={1}>
                {request.title}
              </Text>
              <Text
                style={[
                  styles.status,
                  request.status === "approved" && styles.approved,
                  request.status === "rejected" && styles.rejected,
                ]}
              >
                {request.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.requestNote}>{request.subtitle}</Text>
            <Text style={styles.requestMeta}>
              {request.duration_days} days ·{" "}
              {new Date(request.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingTop: 52,
    paddingBottom: 36,
    gap: 14,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: Colors.text, fontSize: 21, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  label: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },
  durationRow: { flexDirection: "row", gap: 8 },
  durationOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  durationSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationText: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  durationTextSelected: { color: "#FFF" },
  noteInput: {
    minHeight: 100,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    color: Colors.text,
    backgroundColor: "#FFF",
    fontSize: 13,
  },
  characterCount: {
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 4,
  },
  error: {
    color: Colors.danger,
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    fontSize: 12,
  },
  submitButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    marginTop: 14,
  },
  submitText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  historyEmpty: {
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  requestCard: {
    padding: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
  },
  requestTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  requestTitle: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "800" },
  status: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "800",
  },
  approved: { color: Colors.success, backgroundColor: "#DCFCE7" },
  rejected: { color: Colors.danger, backgroundColor: "#FEE2E2" },
  requestNote: { color: Colors.text, fontSize: 12, marginTop: 8 },
  requestMeta: { color: Colors.textMuted, fontSize: 10, marginTop: 6 },
});
