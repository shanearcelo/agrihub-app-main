import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
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
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export default function ResetPasswordScreen() {
  const { email: initialEmail } = useLocalSearchParams<{
    email?: string;
  }>();

  const [email, setEmail] = useState(
    typeof initialEmail === "string" ? initialEmail : "",
  );
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const router = useRouter();

  // Countdown timer for Resend Code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const hasMinLen = newPassword.length >= 8;
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

  // Step 1: Check if account exists, then send verification code to email
  async function handleSendCode() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return showMessage(
        "Email Required",
        "Enter your ADSSU institutional email first.",
      );
    }

    setLoading(true);
    try {
      const { data: existingProfile, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .ilike("institutional_email", cleanEmail)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (!existingProfile) {
        return showMessage(
          "Account Not Found",
          "No registered account matches that email address. Please check your email or register first.",
        );
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;

      setOtpSent(true);
      setRecoveryReady(false);
      setOtpCode("");
      setResendCooldown(60);

      showMessage(
        "Verification Code Sent",
        `We sent a verification code to ${cleanEmail}. Check your email and paste the code below.`,
      );
    } catch (error: unknown) {
      showMessage(
        "Error",
        error instanceof Error
          ? error.message
          : "Could not send the verification code.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify the pasted code from email
  async function handleVerifyCode() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = otpCode.trim();

    if (!cleanEmail) {
      return showMessage("Email Required", "Please enter your email address.");
    }
    if (!cleanToken || cleanToken.length < 6) {
      return showMessage(
        "Invalid Code",
        "Please paste the verification code sent to your email.",
      );
    }

    setVerifyingCode(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: "recovery",
      });

      if (error) throw error;

      setRecoveryReady(true);
      showMessage(
        "Email Verified",
        "Code verified! You can now enter your new password below.",
      );
    } catch (error: unknown) {
      showMessage(
        "Verification Failed",
        error instanceof Error
          ? error.message
          : "The verification code is invalid or has expired. Please try again.",
      );
    } finally {
      setVerifyingCode(false);
    }
  }

  // Step 3: Update password after code is verified
  async function handleConfirmReset() {
    if (!recoveryReady) {
      return showMessage(
        "Verification Required",
        "Please verify the code sent to your email first.",
      );
    }
    if (!hasMinLen || !hasNumber || !hasSymbol) {
      return showMessage(
        "Weak Password",
        "New password must have 8+ characters, at least 1 number, and 1 symbol.",
      );
    }
    if (newPassword !== confirmPassword) {
      return showMessage(
        "Mismatch",
        "New password and confirmation do not match.",
      );
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      await supabase.auth.signOut();
      showMessage(
        "Password Recovery Complete",
        "Your password was updated. Please log in with the new password.",
      );
      router.replace("/auth/login");
    } catch (error: unknown) {
      showMessage(
        "Error",
        error instanceof Error
          ? error.message
          : "Could not update your password.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 22, paddingTop: 52, paddingBottom: 36 }}
    >
      {/* Top Row */}
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/auth/login");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Shield Crest */}
      <View style={styles.iconCircle}>
        <ShieldCheck size={34} color={Colors.primary} />
        <View style={styles.lockTag}>
          <Lock size={10} color="#FFF" />
        </View>
      </View>

      <Text style={styles.title}>
        {recoveryReady
          ? "Choose a new password"
          : otpSent
            ? "Verify your email"
            : "Reset your password"}
      </Text>
      <Text style={styles.sub}>
        {recoveryReady
          ? "Your email is verified. Set a new password below."
          : otpSent
            ? `Enter the verification code sent to ${email.trim().toLowerCase()}.`
            : "Enter your institutional email to receive a verification code."}
      </Text>

      {/* Email Field */}
      <Text style={styles.label}>Email / Institutional ID</Text>
      <View style={styles.inputBox}>
        <Mail size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="name@adssu.edu.ph"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          editable={!recoveryReady}
          onChangeText={(text) => {
            setEmail(text);
            if (otpSent) {
              setOtpSent(false);
              setRecoveryReady(false);
              setOtpCode("");
            }
          }}
        />
        {!recoveryReady && (
          <TouchableOpacity
            style={[
              styles.sendCodePill,
              (loading || resendCooldown > 0) && { opacity: 0.6 },
            ]}
            onPress={handleSendCode}
            disabled={loading || resendCooldown > 0}
          >
            <Text style={styles.sendCodeText}>
              {loading
                ? "Sending..."
                : resendCooldown > 0
                  ? `Wait ${resendCooldown}s`
                  : otpSent
                    ? "Resend Code"
                    : "Send Code"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Paste Verification Code Section */}
      {otpSent && !recoveryReady && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Verification Code</Text>
          <View style={styles.inputBox}>
            <KeyRound size={16} color={Colors.primary} />
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="Paste code from email"
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={8}
              value={otpCode}
              onChangeText={setOtpCode}
            />
          </View>

          <View style={styles.resendRow}>
            <Text style={styles.resendHint}>
              Check your inbox or spam folder for the code.
            </Text>
            {resendCooldown > 0 && (
              <Text style={styles.resendTimer}>{resendCooldown}s</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.btn,
              (verifyingCode || !otpCode.trim()) && { opacity: 0.6 },
            ]}
            onPress={handleVerifyCode}
            disabled={verifyingCode || !otpCode.trim()}
          >
            <ShieldCheck size={17} color="#FFF" />
            <Text style={styles.btnText}>
              {verifyingCode ? "Verifying..." : "Verify Code"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* New Password Section (Shown after code is verified) */}
      {recoveryReady && (
        <>
          <View style={styles.verifiedBadge}>
            <Check size={14} color={Colors.success} strokeWidth={3} />
            <Text style={styles.verifiedBadgeText}>
              Email ownership verified
            </Text>
          </View>

          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputBox}>
            <Lock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              secureTextEntry={!showNewPass}
              placeholder="••••••••"
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity onPress={() => setShowNewPass(!showNewPass)}>
              {showNewPass ? (
                <EyeOff size={16} color={Colors.textMuted} />
              ) : (
                <Eye size={16} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputBox}>
            <Lock size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              secureTextEntry={!showNewPass}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          {/* Inline Validation Rules */}
          <View style={styles.inlineRules}>
            <Text style={[styles.ruleChip, hasMinLen && styles.ruleChipOk]}>
              {hasMinLen ? "✓" : "○"} 8+ characters
            </Text>
            <Text style={[styles.ruleChip, hasNumber && styles.ruleChipOk]}>
              {hasNumber ? "✓" : "○"} 1 number
            </Text>
            <Text style={[styles.ruleChip, hasSymbol && styles.ruleChipOk]}>
              {hasSymbol ? "✓" : "○"} 1 symbol
            </Text>
          </View>

          {/* Confirm CTA */}
          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.7 }]}
            onPress={handleConfirmReset}
            disabled={loading}
          >
            <Check size={17} color="#FFF" strokeWidth={3} />
            <Text style={styles.btnText}>
              {loading ? "Processing..." : "Confirm New Password"}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 12,
    position: "relative",
  },
  lockTag: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 18,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: Colors.text },
  codeInput: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 3,
  },
  sendCodePill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sendCodeText: { fontSize: 11, fontWeight: "800", color: Colors.primary },

  resendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  resendHint: { fontSize: 11, color: Colors.textMuted },
  resendTimer: { fontSize: 11, fontWeight: "700", color: Colors.primary },

  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 14,
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.success,
  },

  inlineRules: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  ruleChip: { fontSize: 11, fontWeight: "600", color: Colors.textMuted },
  ruleChipOk: { color: Colors.success, fontWeight: "700" },

  btn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    padding: 15,
    borderRadius: 14,
    marginTop: 22,
  },
  btnText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
});
