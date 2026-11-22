import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, Eye, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { getImageUrl } from "../../lib/uploadImageToSupabase";

type PaymentStatus = "approved" | "pending_review" | "rejected";
type PaymentType = "Semester booth fee" | "Featured listing";

type PaymentRow = {
  id: string;
  entityId: string;
  seller_id: string;
  seller_name: string;
  department: string;
  title: string;
  type: PaymentType;
  amount: number;
  reference_number: string | null;
  created_at: string;
  status: PaymentStatus;
  receipt_url: string | null;
  semester?: string;
  duration_days?: number;
};

type BoothPaymentRecord = {
  id: string;
  seller_id: string;
  semester: string;
  amount: number;
  receipt_path: string | null;
  reference_number: string | null;
  status: string;
  created_at: string;
};

type FeaturedPaymentRecord = {
  id: string;
  seller_id: string;
  title: string;
  featured_fee: number;
  featured_days: number | null;
  featured_reference_number: string | null;
  featured_receipt_path: string | null;
  featured_status: string;
  created_at: string;
  updated_at: string;
};

function showMessage(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
}

function confirmAction(message: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) action();
  } else {
    Alert.alert("Confirm payment action", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: action },
    ]);
  }
}

function getFeaturedExpiration(durationDays: number): string {
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

export default function AdminPaymentsScreen() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const router = useRouter();

  const loadPayments = useCallback(async () => {
    try {
      setLoadError("");
      const boothPayments: BoothPaymentRecord[] = [];
      const featuredProducts: FeaturedPaymentRecord[] = [];
      for (let offset = 0; ; offset += 1000) {
        const [boothResult, featuredResult] = await Promise.all([
          supabase
            .from("seller_semester_payments")
            .select(
              "id, seller_id, semester, amount, receipt_path, reference_number, status, created_at",
            )
            .order("created_at", { ascending: false })
            .range(offset, offset + 999),
          supabase
            .from("products")
            .select(
              "id, seller_id, title, featured_fee, featured_days, featured_reference_number, featured_receipt_path, featured_status, created_at, updated_at",
            )
            .in("featured_status", ["active", "pending_review", "unpaid"])
            .order("updated_at", { ascending: false })
            .range(offset, offset + 999),
        ]);
        if (boothResult.error) throw boothResult.error;
        if (featuredResult.error) throw featuredResult.error;
        const boothPage = (boothResult.data || []) as BoothPaymentRecord[];
        const featuredPage = (featuredResult.data || []) as FeaturedPaymentRecord[];
        boothPayments.push(...boothPage);
        featuredProducts.push(...featuredPage);
        if (boothPage.length < 1000 && featuredPage.length < 1000) break;
      }

      const sellerIds = [
        ...new Set([
          ...boothPayments.map((payment) => payment.seller_id),
          ...featuredProducts.map((product) => product.seller_id),
        ]),
      ];
      const { data: profiles, error: profileError } = sellerIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, store_name, department")
            .in("id", sellerIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const sellerMap = new Map(
        (profiles || []).map((profile) => [
          profile.id,
          {
            name: profile.store_name?.trim() || profile.full_name || "Seller",
            department: profile.department || "—",
          },
        ]),
      );

      const boothRows = await Promise.all(
        boothPayments.map(async (payment) => {
          const seller = sellerMap.get(payment.seller_id);
          return {
            id: `booth:${payment.id}`,
            entityId: payment.id,
            seller_id: payment.seller_id,
            seller_name: seller?.name || "Seller",
            department: seller?.department || "—",
            title: payment.semester,
            type: "Semester booth fee" as const,
            amount: Number(payment.amount || 0),
            reference_number: payment.reference_number,
            created_at: payment.created_at,
            status:
              payment.status === "approved"
                ? ("approved" as const)
                : payment.status === "rejected"
                  ? ("rejected" as const)
                  : ("pending_review" as const),
            receipt_url: payment.receipt_path
              ? await getImageUrl("payment-receipts", payment.receipt_path)
              : null,
            semester: payment.semester,
          };
        }),
      );

      const featuredRows = await Promise.all(
        featuredProducts
          .filter(
            (product) =>
              product.featured_status === "active" ||
              product.featured_status === "pending_review" ||
              Boolean(
                product.featured_receipt_path ||
                  product.featured_reference_number,
              ),
          )
          .map(async (product) => {
            const seller = sellerMap.get(product.seller_id);
            return {
              id: `featured:${product.id}`,
              entityId: product.id,
              seller_id: product.seller_id,
              seller_name: seller?.name || "Seller",
              department: seller?.department || "—",
              title: product.title,
              type: "Featured listing" as const,
              amount: Number(product.featured_fee || 0),
              duration_days: Number(product.featured_days || 7),
              reference_number: product.featured_reference_number,
              created_at: product.updated_at || product.created_at,
              status:
                product.featured_status === "active"
                  ? ("approved" as const)
                  : product.featured_status === "pending_review"
                    ? ("pending_review" as const)
                    : ("rejected" as const),
              receipt_url: product.featured_receipt_path
                ? await getImageUrl(
                    "payment-receipts",
                    product.featured_receipt_path,
                  )
                : null,
            };
          }),
      );
      setRows(
        [...boothRows, ...featuredRows].sort(
          (left, right) =>
            new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime(),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load payments.";
      setLoadError(message);
      console.error("Could not load admin payments.", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPayments();
      const channel = supabase
        .channel("admin-payment-audit")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "seller_semester_payments" },
          () => void loadPayments(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          () => void loadPayments(),
        )
        .subscribe();
      return () => void supabase.removeChannel(channel);
    }, [loadPayments]),
  );

  async function updatePayment(row: PaymentRow, nextStatus: PaymentStatus) {
    setBusyId(row.id);
    try {
      if (row.type === "Semester booth fee") {
        const { error } = await supabase.rpc(
          "admin_set_semester_payment_status",
          {
            p_payment_id: row.entityId,
            p_status: nextStatus === "approved" ? "approved" : "rejected",
            p_rejection_reason:
              nextStatus === "approved" ? null : "Rejected by campus administrator.",
          },
        );
        if (error) throw error;
      } else {
        const patch =
          nextStatus === "approved"
            ? {
                is_featured: true,
                featured_status: "active",
                featured_expires_at: getFeaturedExpiration(
                  Math.max(1, Number(row.duration_days || 7)),
                ),
              }
            : {
                is_featured: false,
                featured_status: "unpaid",
                featured_expires_at: null,
              };
        const { data, error } = await supabase
          .from("products")
          .update(patch)
          .eq("id", row.entityId)
          .eq(
            "featured_status",
            row.status === "pending_review" ? "pending_review" : "active",
          )
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("The featured listing could not be updated.");
      }
      await loadPayments();
      showMessage(
        nextStatus === "approved" ? "Payment approved" : "Payment revoked",
        nextStatus === "approved"
          ? "The seller's payment status has been updated."
          : "The payment was rejected or revoked and the associated status recalculated.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update payment.";
      setLoadError(message);
      showMessage("Payment update failed", message);
    } finally {
      setBusyId(null);
    }
  }

  const totalApproved = rows
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.push("/admin")}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payment Audit</Text>
          <Text style={styles.subtitle}>
            Booth and featured listing receipts · Approved ₱
            {totalApproved.toLocaleString()}
          </Text>
        </View>
      </View>
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.muted}>No seller payments found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.seller}>{item.seller_name}</Text>
                <Text style={styles.meta}>
                  {item.type} · {item.title}
                  {item.duration_days ? ` · ${item.duration_days} days` : ""}
                </Text>
                <Text style={styles.meta}>{item.department}</Text>
                <Text style={styles.meta}>
                  ₱{item.amount.toLocaleString()} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                <Text style={styles.meta}>
                  GCash reference: {item.reference_number || "Not extracted"}
                </Text>
              </View>
              <Text
                style={[
                  styles.status,
                  item.status === "approved"
                    ? styles.approved
                    : item.status === "pending_review"
                      ? styles.pending
                      : styles.rejected,
                ]}
              >
                {item.status.toUpperCase()}
              </Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.receiptButton}
                disabled={!item.receipt_url}
                onPress={() => setSelectedImage(item.receipt_url)}
              >
                <Eye size={15} color={Colors.primary} />
                <Text style={styles.receiptText}>View Receipt</Text>
              </TouchableOpacity>
              {item.status === "pending_review" ? (
                <>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    disabled={busyId === item.id}
                    onPress={() =>
                      confirmAction(
                        "Reject this receipt and remove its paid status?",
                        () => void updatePayment(item, "rejected"),
                      )
                    }
                  >
                    <X size={14} color={Colors.danger} />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    disabled={busyId === item.id}
                    onPress={() => void updatePayment(item, "approved")}
                  >
                    <CheckCircle2 size={14} color="#FFF" />
                    <Text style={styles.approveText}>Approve</Text>
                  </TouchableOpacity>
                </>
              ) : item.status === "approved" ? (
                <TouchableOpacity
                  style={styles.rejectButton}
                  disabled={busyId === item.id}
                  onPress={() =>
                    confirmAction(
                      "Revoke this approved payment and recalculate seller status?",
                      () => void updatePayment(item, "rejected"),
                    )
                  }
                >
                  <X size={14} color={Colors.danger} />
                  <Text style={styles.rejectText}>Revoke</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      />
      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedImage(null)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
            {selectedImage ? (
              <Image
                source={{ uri: selectedImage }}
                style={styles.receiptImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: 20, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  list: { padding: 16, paddingBottom: 96, gap: 10 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  seller: { fontSize: 14, fontWeight: "800", color: Colors.text },
  meta: { fontSize: 10, color: Colors.textMuted, marginTop: 3 },
  status: { fontSize: 9, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  approved: { color: "#15803D", backgroundColor: "#DCFCE7" },
  pending: { color: "#92400E", backgroundColor: "#FEF3C7" },
  rejected: { color: Colors.danger, backgroundColor: "#FEE2E2" },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 12 },
  receiptButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#F0FDF4", borderRadius: 9 },
  receiptText: { color: Colors.primary, fontSize: 10, fontWeight: "800" },
  rejectButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#FEF2F2", borderRadius: 9 },
  rejectText: { color: Colors.danger, fontSize: 10, fontWeight: "800" },
  approveButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: Colors.primary, borderRadius: 9 },
  approveText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  error: { marginHorizontal: 16, color: Colors.danger, fontSize: 12 },
  empty: { padding: 32, alignItems: "center" },
  muted: { color: Colors.textMuted, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  modal: { width: "100%", maxWidth: 480, backgroundColor: "#FFF", borderRadius: 16, padding: 14, alignItems: "flex-end" },
  closeButton: { padding: 6, marginBottom: 6 },
  receiptImage: { width: "100%", height: 460 },
});
