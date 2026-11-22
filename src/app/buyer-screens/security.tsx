// src/app/buyer-screens/security.tsx
import { useRouter } from "expo-router";
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

export default function BuyerSecurityScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function notify(title: string, msg: string) {
    if (Platform.OS === "web") window.alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  }

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/buyer/profile");
  }

  async function handleUpdatePassword() {
    setErrorMsg("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirmation do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setErrorMsg("New password must be different from your current password.");
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user?.email) {
        router.replace("/auth/login");
        return;
      }

      // 1. Re-authenticate with current password so Supabase allows the change safely
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setErrorMsg("Current password is incorrect.");
        return;
      }

      // 2. Update password without kicking the user out of their active session
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Password Updated", "Your account password has been changed.");
      handleBack();
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Could not update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back to profile"
          onPress={handleBack}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Account Security</Text>
          <Text style={styles.headerSub}>Manage your login password</Text>
        </View>
        <ShieldCheck size={20} color={Colors.primary} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Password</Text>

          {errorMsg ? (
            <Text style={styles.errorBanner} accessibilityRole="alert">
              {errorMsg}
            </Text>
          ) : null}

          <Text style={styles.label}>Current Password</Text>
          <View style={styles.inputRow}>
            <Lock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowCurrent((v) => !v)}>
              {showCurrent ? (
                <EyeOff size={17} color={Colors.textMuted} />
              ) : (
                <Eye size={17} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputRow}>
            <Lock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowNew((v) => !v)}>
              {showNew ? (
                <EyeOff size={17} color={Colors.textMuted} />
              ) : (
                <Eye size={17} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputRow}>
            <Lock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter new password"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
              {showConfirm ? (
                <EyeOff size={17} color={Colors.textMuted} />
              ) : (
                <Eye size={17} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => void handleUpdatePassword()}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? "Updating Password..." : "Update Password"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 52 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  body: { padding: 16 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    color: Colors.danger,
    fontSize: 12,
    fontWeight: "700",
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
    marginTop: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: 14, color: Colors.text, paddingVertical: 10 },
  saveBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
});
