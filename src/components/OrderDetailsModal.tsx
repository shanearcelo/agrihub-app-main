import {
  Modal,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../constants/theme";

type PaymentReceipt = {
  harvest_id?: string;
  title?: string;
  receipt_image_url?: string;
};

export type SellerOrderDetails = {
  order_code?: string;
  buyer_name?: string;
  payment_method?: string;
  payment_status?: "unpaid" | "pending_verification" | "paid" | "rejected" | string;
  total_amount?: number;
  receipt_image_url?: string | null;
  payment_receipts?: PaymentReceipt[];
  rejection_reason?: string | null;
};

type OrderDetailsModalProps = {
  visible: boolean;
  order: SellerOrderDetails | null;
  onClose: () => void;
  reviewInProgress?: boolean;
  onApprovePayment?: () => void;
  onRejectPayment?: () => void;
};

export default function OrderDetailsModal({
  visible,
  order,
  onClose,
  reviewInProgress = false,
  onApprovePayment,
  onRejectPayment,
}: OrderDetailsModalProps) {
  const receipts =
    order?.payment_receipts?.filter((receipt) => receipt.receipt_image_url) ||
    [];
  const receiptUrls = receipts.length
    ? receipts
    : order?.receipt_image_url
      ? [{ receipt_image_url: order.receipt_image_url }]
      : [];
  const paymentStatus = order?.payment_status || "unpaid";
  const statusLabel = paymentStatus.replace("_", " ").toUpperCase();
  const isPaid = paymentStatus === "paid";
  const isRejected = paymentStatus === "rejected";
  const canReview =
    order?.payment_method === "gcash" &&
    paymentStatus === "pending_verification";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Order Payment</Text>
              <Text style={styles.subtitle}>
                #{order?.order_code || "Order"} • {order?.buyer_name || "Buyer"}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isPaid ? styles.paidBadge : styles.unpaidBadge,
                isRejected && styles.rejectedBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isPaid ? styles.paidText : styles.unpaidText,
                  isRejected && styles.rejectedText,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.method}>
            {order?.payment_method === "cash"
              ? "Cash on Pick-up"
              : order?.payment_method === "gcash"
                ? "GCash"
                : order?.payment_method || "Payment method unavailable"} • ₱
            {Number(order?.total_amount || 0).toFixed(2)}
          </Text>
          {order?.rejection_reason ? (
            <Text style={styles.rejectionReason}>
              Receipt review: {order.rejection_reason}
            </Text>
          ) : null}

          <ScrollView
            style={styles.receiptList}
            contentContainerStyle={styles.receiptContent}
          >
            {receiptUrls.length > 0 ? (
              receiptUrls.map((receipt, index) => (
                <View
                  key={receipt.harvest_id || receipt.receipt_image_url || index}
                  style={styles.receiptCard}
                >
                  {receipt.title ? (
                    <Text style={styles.receiptTitle}>{receipt.title}</Text>
                  ) : null}
                  <Image
                    source={{ uri: receipt.receipt_image_url }}
                    style={styles.receiptImage}
                    resizeMode="contain"
                    accessibilityLabel="Buyer GCash payment receipt"
                  />
                </View>
              ))
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  No GCash receipt was submitted for this order.
                </Text>
              </View>
            )}
          </ScrollView>

          {canReview ? (
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={[styles.rejectButton, reviewInProgress && styles.disabled]}
                onPress={onRejectPayment}
                disabled={reviewInProgress}
                accessibilityRole="button"
              >
                <Text style={styles.rejectText}>
                  {reviewInProgress ? "Saving..." : "Reject Payment"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveButton, reviewInProgress && styles.disabled]}
                onPress={onApprovePayment}
                disabled={reviewInProgress}
                accessibilityRole="button"
              >
                <Text style={styles.approveText}>
                  {reviewInProgress ? "Saving..." : "Approve Payment"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    maxHeight: "85%",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  paidBadge: { backgroundColor: "#DCFCE7" },
  unpaidBadge: { backgroundColor: "#FEF3C7" },
  rejectedBadge: { backgroundColor: "#FEE2E2" },
  statusText: { fontSize: 10, fontWeight: "900" },
  paidText: { color: Colors.success },
  unpaidText: { color: "#B45309" },
  rejectedText: { color: "#B91C1C" },
  rejectionReason: { color: "#B91C1C", fontSize: 12, marginBottom: 8 },
  method: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 8,
  },
  receiptList: { flexGrow: 0 },
  receiptContent: { gap: 10, paddingBottom: 8 },
  receiptCard: {
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  receiptTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  receiptImage: { width: "100%", height: 260 },
  empty: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  emptyText: { textAlign: "center", color: Colors.textMuted, fontSize: 12 },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  rejectButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
  },
  rejectText: { color: Colors.danger, fontSize: 13, fontWeight: "800" },
  approveButton: {
    flex: 1.2,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
  },
  approveText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  closeButton: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    marginTop: 12,
  },
  closeText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
});
