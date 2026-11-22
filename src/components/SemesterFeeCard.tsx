import { AlertCircle, CheckCircle2, Clock } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "../constants/theme";

type Props = {
  amountPaid: number;
  pendingReview: boolean;
  onPress?: () => void;
  onPay?: (amount: 30 | 20 | 50) => void;
  error?: string | null;
};

export function SemesterFeeCard({
  amountPaid,
  pendingReview,
  onPress,
  onPay,
  error,
}: Props) {
  function handlePayPress(amount: 30 | 20 | 50) {
    if (onPay) {
      onPay(amount);
    } else if (onPress) {
      onPress();
    }
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Semester Booth Fee</Text>
        <Text style={styles.error}>
          Could not load the current fee status: {error}
        </Text>
        <TouchableOpacity
          style={styles.payButton}
          accessibilityRole="button"
          onPress={() => handlePayPress(30)}
        >
          <Text style={styles.payButtonText}>Open Semester Booth Fee</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPaid = amountPaid >= 50;
  const status = pendingReview
    ? "Pending Admin Review"
    : isPaid || amountPaid > 0
      ? "Approved"
      : "Unpaid";

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          {pendingReview ? (
            <Clock size={18} color="#B45309" />
          ) : isPaid ? (
            <CheckCircle2 size={18} color={Colors.success} />
          ) : (
            <AlertCircle size={18} color="#B45309" />
          )}
          <Text style={styles.title}>Semester Booth Fee</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            pendingReview
              ? styles.pendingBadge
              : isPaid || amountPaid > 0
                ? styles.approvedBadge
                : styles.unpaidBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              pendingReview
                ? styles.pendingText
                : isPaid || amountPaid > 0
                  ? styles.approvedText
                  : styles.unpaidText,
            ]}
          >
            {status}
          </Text>
        </View>
      </View>

      <Text style={styles.amount}>
        ₱{amountPaid} / ₱50{" "}
        {isPaid
          ? "Fully Paid"
          : amountPaid === 30
            ? "Partial — ₱20 Balance Due"
            : amountPaid > 0
              ? `Partial — ₱${50 - amountPaid} Balance Due`
              : "Unpaid"}
      </Text>

      {pendingReview ? (
        <Text style={styles.description}>
          Your installment receipt is awaiting Admin review.
        </Text>
      ) : !isPaid ? (
        <View style={styles.buttonRow}>
          {amountPaid === 0 ? (
            <>
              <TouchableOpacity
                style={styles.payButton}
                accessibilityRole="button"
                onPress={() => handlePayPress(30)}
              >
                <Text style={styles.payButtonText}>Pay ₱30 Installment</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payButton, styles.payFullButton]}
                accessibilityRole="button"
                onPress={() => handlePayPress(50)}
              >
                <Text style={[styles.payButtonText, styles.payFullButtonText]}>
                  Pay Full ₱50
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.payButton}
              accessibilityRole="button"
              onPress={() =>
                handlePayPress((Math.max(0, 50 - amountPaid) as 20) || 20)
              }
            >
              <Text style={styles.payButtonText}>
                {amountPaid >= 30
                  ? "Pay Remaining ₱20"
                  : `Pay Remaining ₱${50 - amountPaid}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  pendingBadge: { backgroundColor: "#FEF3C7" },
  approvedBadge: { backgroundColor: "#DCFCE7" },
  unpaidBadge: { backgroundColor: "#FEE2E2" },
  statusText: { fontSize: 10, fontWeight: "800" },
  pendingText: { color: "#92400E" },
  approvedText: { color: "#166534" },
  unpaidText: { color: "#991B1B" },
  amount: { color: Colors.text, fontSize: 14, fontWeight: "700", marginTop: 10 },
  description: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  error: { color: Colors.danger, fontSize: 11, marginTop: 8 },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  payButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: Colors.primary,
  },
  payButtonText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  payFullButton: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  payFullButtonText: {
    color: Colors.primary,
  },
});
