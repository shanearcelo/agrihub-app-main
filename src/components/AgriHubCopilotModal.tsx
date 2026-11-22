import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../constants/theme";

export type AgriHubRole = "admin" | "buyer" | "seller";

type Props = {
  visible: boolean;
  onClose: () => void;
  role?: AgriHubRole | null;
};

type Answer = {
  title: string;
  bullets: string[];
};

const ROLE_ANSWERS: Record<AgriHubRole, Answer> = {
  admin: {
    title: "Admin dashboard",
    bullets: [
      "Use Sellers to view auto-verified ADSSU/ASSCAT school IDs.",
      "Use Payments to review approved seller semester booth payments.",
      "Use Ads to approve or reject sponsorship placements.",
      "Use Reports for marketplace and monetization totals.",
      "Use Overview to monitor pending sellers, active sellers, sales, and revenue.",
    ],
  },
  buyer: {
    title: "Buyer guide",
    bullets: [
      "Browse published harvests on Home or find products in Search.",
      "Open a harvest, choose a quantity or pre-order option, and add it to your cart.",
      "At checkout, select GCash or Cash on Pick-up and choose the pickup details.",
      "For GCash orders, upload a clear receipt; for cash, confirm the order instructions.",
      "Track the order, message the seller by order, and confirm completion when appropriate.",
    ],
  },
  seller: {
    title: "Seller guide",
    bullets: [
      "Check your Semester Booth Fee card on the Seller Home screen.",
      "Pay ₱30, ₱20 remaining, or ₱50 full with a clear GCash receipt.",
      "Post a harvest with accurate stock, price, dates, pickup details, and payment options.",
      "Open Orders to verify receipts, prepare orders, and update pickup or delivery statuses.",
      "Use Messages to coordinate each order and My Harvests to manage listings.",
    ],
  },
};

function getAnswer(question: string, role?: AgriHubRole | null): Answer {
  const text = question.toLowerCase();

  if (/login|sign in|google|password|email/.test(text)) {
    return {
      title: "How to log in",
      bullets: [
        "Open AgriHub and enter your registered @adssu.edu.ph email and password.",
        "Or tap Continue with Google and choose an institutional account.",
        "Sign-up and Google setup require you to select Buyer or Seller.",
        "Both roles must complete official School ID verification before entering the marketplace.",
        "Admin access is restricted to the configured admin@adssu.edu.ph account.",
      ],
    };
  }

  if (/receipt|payment|gcash|cash/.test(text)) {
    if (role === "seller") {
      return {
        title: "Verify payments",
        bullets: [
          "Open Seller Orders and select the order.",
          "Open Order Payment to view the buyer's submitted GCash receipt.",
          "Approve or reject a pending GCash payment.",
          "Use the receipt reference and amount shown in the modal as the review basis.",
          "For Cash on Pick-up, follow the order status workflow instead of receipt approval.",
        ],
      };
    }
    return {
      title: "Pay for an order",
      bullets: [
        "Open Order Details after placing the order.",
        "Choose GCash or Cash on Pick-up during checkout.",
        "For GCash, use Receipt Camera or upload a clear receipt showing the amount and reference number.",
        "Wait for payment status to change to paid or for the seller to review it.",
        "Do not submit a second payment until you check the current order status.",
      ],
    };
  }

  if (/semester|booth|fee|50|30|20/.test(text)) {
    return {
      title: "Semester booth fee",
      bullets: [
        "Seller Home shows the Semester Booth Fee card.",
        "The fee is ₱50 and can be paid as ₱30, then ₱20 remaining.",
        "A full ₱50 payment is also available.",
        "Capture or upload a clear GCash receipt and wait for Admin verification.",
        "The card updates to Pending Admin Review, Approved, or the remaining balance due.",
      ],
    };
  }

  if (/chat|message|inbox|talk|contact/.test(text)) {
    return {
      title: "Chat Inbox",
      bullets: [
        "Buyer Messages and Seller Messages open conversations linked to orders.",
        "Open a conversation to send real-time messages by order.",
        "Use chat to coordinate pickup, timing, quantity, or order questions.",
        "Only conversations associated with an existing order appear in the inbox.",
        "If chat does not load, check your connection and reopen the screen.",
      ],
    };
  }

  if (/id|verify|verification|school/.test(text)) {
    return {
      title: "School ID verification",
      bullets: [
        "After sign-up or Google setup, upload or photograph an official School ID.",
        "Enter the ID number and course/year requested by the verification screen.",
        "The app checks the ID locally and then saves the verification documents.",
        "Sellers must have their ID document available before Seller access is allowed.",
        "If rejected, replace it with a clear, upright image containing your name and ID details.",
      ],
    };
  }

  if (/cart|checkout|order|pickup|pre-order/.test(text)) {
    if (role === "seller") {
      return {
        title: "Fulfill an order",
        bullets: [
          "Open Seller Orders and choose the relevant status tab.",
          "Review payment and open Order Details when a GCash receipt is submitted.",
          "Approve the payment, mark the order preparing, then mark it ready for pickup.",
          "Use the pickup scanner or order code to verify the buyer when required.",
          "Complete the order after pickup and coordinate exceptions in chat.",
        ],
      };
    }
    return {
      title: "Place and track an order",
      bullets: [
        "Add published, in-stock products to your cart.",
        "Open Cart, review quantities and totals, then choose Checkout.",
        "Select GCash or Cash on Pick-up and pickup date, venue, and time.",
        "Submit the order and open Order Details or Order History for status.",
        "Message the seller if pickup or product details need coordination.",
      ],
    };
  }

  if (/listing|post|harvest|inventory|stock|sell/.test(text)) {
    return {
      title: "Manage harvest listings",
      bullets: [
        "Use Post to create a harvest listing.",
        "Add a title, category, stock, price, photos, and available pickup information.",
        "Choose ready-now or in-ground pre-order details when supported.",
        "Use My Harvests to edit, publish, draft, feature, or manage existing listings.",
        "Keep stock accurate so buyers only see available products.",
      ],
    };
  }

  if (/dispute|refund|cancel|problem|issue/.test(text)) {
    return {
      title: "Resolve an order issue",
      bullets: [
        "Start with the order's Chat Inbox conversation and agree on the next step.",
        "Buyer or seller can use the order details and status controls shown for that order.",
        "For a GCash dispute, reopen Order Payment and review the submitted receipt.",
        "Keep the order and chat history unchanged while the issue is being resolved.",
        "Use the app support channel for technical failures not covered by order controls.",
      ],
    };
  }

  if (/admin|seller|buyer|role|dashboard/.test(text)) {
    if (/admin/.test(text)) return ROLE_ANSWERS.admin;
    if (/seller/.test(text)) return ROLE_ANSWERS.seller;
    if (/buyer/.test(text)) return ROLE_ANSWERS.buyer;
  }

  if (role && ROLE_ANSWERS[role]) return ROLE_ANSWERS[role];
  return {
    title: "How can I help?",
    bullets: [
      "Ask about login or School ID verification.",
      "Ask what an Admin, Buyer, or Seller can do.",
      "Ask about cart, checkout, receipts, orders, chat, listings, or the semester fee.",
      "Choose the role above to tailor the next steps.",
    ],
  };
}

export function AgriHubCopilotModal({ visible, onClose, role }: Props) {
  const [selectedRole, setSelectedRole] = useState<AgriHubRole | null>(
    role || null,
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer>(
    role ? ROLE_ANSWERS[role] : {
      title: "AgriHub Copilot",
      bullets: [
        "Choose your role or ask a question.",
        "I use the app's actual screens and workflows.",
      ],
    },
  );
  const activeRole = selectedRole || role || null;

  function ask(text: string) {
    const clean = text.trim();
    setQuestion(clean);
    setAnswer(getAnswer(clean, activeRole));
  }

  const quickQuestions =
    activeRole === "admin"
      ? ["How do I verify sellers?", "How do I review payments?", "How do I approve ads?"]
      : activeRole === "seller"
        ? ["How do I pay the semester fee?", "How do I post a harvest?", "How do I verify a buyer receipt?"]
        : activeRole === "buyer"
          ? ["How do I place an order?", "How do I upload a receipt?", "How do I chat with a seller?"]
          : ["How do I log in?", "What can a Buyer do?", "What can a Seller do?"];

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
              <Text style={styles.eyebrow}>AGRIHUB COPILOT</Text>
              <Text style={styles.title}>{answer.title}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close AgriHub Copilot"
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.roleRow}>
              {(["buyer", "seller", "admin"] as AgriHubRole[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.roleChip,
                    activeRole === item && styles.roleChipActive,
                  ]}
                  onPress={() => {
                    setSelectedRole(item);
                    setAnswer(ROLE_ANSWERS[item]);
                    setQuestion("");
                  }}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.roleText,
                      activeRole === item && styles.roleTextActive,
                    ]}
                  >
                    {item[0].toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.answerCard}>
              {answer.bullets.map((bullet, index) => (
                <View key={`${bullet}-${index}`} style={styles.answerRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.answerText}>{bullet}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.quickLabel}>Quick questions</Text>
            <View style={styles.quickWrap}>
              {quickQuestions.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.quickChip}
                  onPress={() => ask(item)}
                  accessibilityRole="button"
                >
                  <Text style={styles.quickText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputRow}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={() => ask(question)}
                placeholder="Ask about AgriHub..."
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[
                  styles.askButton,
                  !question.trim() && styles.askButtonDisabled,
                ]}
                onPress={() => ask(question)}
                disabled={!question.trim()}
                accessibilityRole="button"
              >
                <Text style={styles.askText}>Ask</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  card: {
    maxHeight: "82%",
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3,
  },
  closeButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  closeText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 28 },
  roleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  roleChip: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleText: { color: Colors.textMuted, fontSize: 12, fontWeight: "800" },
  roleTextActive: { color: "#FFF" },
  answerCard: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  answerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 },
  bullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
    marginRight: 9,
  },
  answerText: { flex: 1, color: Colors.text, fontSize: 13, lineHeight: 19 },
  quickLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 8,
  },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    paddingHorizontal: 11,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  quickText: { color: Colors.primary, fontSize: 11, fontWeight: "800" },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  input: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: Colors.text,
  },
  askButton: {
    minWidth: 58,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  askButtonDisabled: { opacity: 0.45 },
  askText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
});
