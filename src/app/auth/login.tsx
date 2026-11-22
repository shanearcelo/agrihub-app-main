// src/app/auth/login.tsx
import { User } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react-native";
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
import { BrandLogo } from "../../components/BrandLogo";
import { GoogleAuthButton } from "../../components/GoogleAuthButton";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { PostLoginSplash } from "../../components/PostLoginSplash";
import { Colors } from "../../constants/theme";
import { isProfileComplete } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const ADMIN_EMAIL = "admin@adssu.edu.ph";
const ALLOWED_DOMAIN = "@adssu.edu.ph";

function isAllowedInstitutionalEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith(ALLOWED_DOMAIN) &&
    normalized.length > ALLOWED_DOMAIN.length
  );
}

function getAuthErrorMessage(error: unknown): string {
  const authErrorMap: Record<string, string> = {
    invalid_credentials: "Incorrect email or password. Please try again.",
    email_not_confirmed: "Please confirm your email before signing in.",
    too_many_requests: "Too many attempts. Please try again later.",
    user_already_exists: "An account already exists for this email.",
  };

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (authErrorMap[code]) return authErrorMap[code];
  }

  if (error instanceof Error) {
    if (/network|fetch/i.test(error.message)) {
      return "Network error. Check your connection and try again.";
    }
  }

  return "Login failed. Please check your credentials.";
}

export default function LoginScreen() {
  const {
    error: queryError,
    error_code: queryErrorCode,
    error_description: queryErrorDescription,
  } = useLocalSearchParams<{
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const router = useRouter();

  const redirectErrorCode = Array.isArray(queryErrorCode)
    ? queryErrorCode[0]
    : queryErrorCode ||
      (Array.isArray(queryError) ? queryError[0] : queryError);
  const redirectErrorDescription = Array.isArray(queryErrorDescription)
    ? queryErrorDescription[0]
    : queryErrorDescription;
  const redirectError =
    redirectErrorCode || redirectErrorDescription
      ? `${redirectErrorCode ? `${redirectErrorCode}: ` : ""}${redirectErrorDescription || ""}`
      : null;
  const errorMessage = loginError || redirectError;

  // Trigger the 3-second splash before redirecting to the dashboard
  const routeByRole = useCallback((userRole: string) => {
    if (userRole === "admin") setPendingRoute("/admin");
    else if (userRole === "seller") setPendingRoute("/seller");
    else setPendingRoute("/buyer");
  }, []);

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  const handleSupabaseUser = useCallback(
    async (supabaseUser: User) => {
      const userEmail = (supabaseUser.email || "").trim().toLowerCase();

      if (!isAllowedInstitutionalEmail(userEmail)) {
        await supabase.auth.signOut();
        const msg =
          "Only official @adssu.edu.ph institutional accounts are allowed to log in to ADSSU Marketplace.";
        setLoginError(msg);
        showMessage("Institutional Email Required", msg);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          "role, department, full_name, valid_id_url, id_document_url, id_verification_completed, is_registered, is_suspended",
        )
        .eq("id", supabaseUser.id)
        .maybeSingle();

      if (error) throw error;

      if (profile?.is_suspended) {
        await supabase.auth.signOut();
        const msg =
          "This account has been suspended. Contact the campus administrator for assistance.";
        setLoginError(msg);
        showMessage("Account Suspended", msg);
        return;
      }

      if (!profile || !isProfileComplete(profile)) {
        if (userEmail === ADMIN_EMAIL) {
          await supabase.auth.signOut();
          showMessage(
            "Admin Account Not Configured",
            `Create or invite ${ADMIN_EMAIL} in Supabase Auth, then run the AgriHub migration so its admin profile is created.`,
          );
          return;
        }

        await supabase.auth.signOut();
        showMessage(
          "Sign Up Required",
          "This account is not registered yet. Please sign up first.",
        );
        router.replace("/auth/register");
        return;
      }

      if (userEmail === ADMIN_EMAIL && profile.role !== "admin") {
        await supabase.auth.signOut();
        showMessage(
          "Admin Role Not Configured",
          `The profile for ${ADMIN_EMAIL} does not have the admin role. Have the project owner correct it in the Supabase SQL Editor.`,
        );
        return;
      }

      if (
        profile.role !== "admin" &&
        (profile.id_verification_completed === false ||
          (profile.role === "seller" &&
            !(profile.valid_id_url || profile.id_document_url)))
      ) {
        router.replace("/auth/verify-id");
        return;
      }

      routeByRole(profile.role || "buyer");
    },
    [routeByRole, router],
  );

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return showMessage(
        "Missing Fields",
        "Please enter your Institutional Email and Password.",
      );
    }

    if (!isAllowedInstitutionalEmail(cleanEmail)) {
      const msg =
        "Only official @adssu.edu.ph email addresses are allowed to log in.";
      setLoginError(msg);
      return showMessage("Invalid Email Domain", msg);
    }

    setLoading(true);
    setLoginError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error("No account was returned.");
      await handleSupabaseUser(data.user);
    } catch (error: unknown) {
      showMessage("Login Failed", getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPasswordPress() {
    const cleanEmail = email.trim().toLowerCase();

    // If user didn't type an email yet, go to reset-password screen (which also checks account existence)
    if (!cleanEmail) {
      router.push("/auth/reset-password");
      return;
    }

    if (!isAllowedInstitutionalEmail(cleanEmail)) {
      const msg =
        "Only official @adssu.edu.ph email addresses can reset a password.";
      setLoginError(msg);
      return showMessage("Invalid Email Domain", msg);
    }

    setLoading(true);
    setLoginError(null);
    try {
      const { data: existingProfile, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("institutional_email", cleanEmail)
        .maybeSingle();

      if (error) throw error;

      if (!existingProfile) {
        const msg =
          "This account does not exist. Please check your email or sign up first.";
        setLoginError(msg);
        return showMessage("Account Not Found", msg);
      }

      router.push({
        pathname: "/auth/reset-password",
        params: { email: cleanEmail },
      });
    } catch (error: unknown) {
      showMessage(
        "Error",
        error instanceof Error
          ? error.message
          : "Could not verify your account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        bounces={false}
      >
        {/* Green Header Banner */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backToHome}
            onPress={() => router.push("/auth/onboarding")}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
          >
            <ArrowLeft size={18} color="#FFF" />
            <Text style={styles.backToHomeText}>Back to Home</Text>
          </TouchableOpacity>
          <View style={styles.brandRow}>
            <BrandLogo size={42} />
            <View>
              <Text style={styles.brandName}>AgriHub</Text>
              <Text style={styles.brandSub}>Presko, Barato, Tatak ADSSU</Text>
            </View>
          </View>
          <Text style={styles.welcome}>Welcome back!</Text>
          <Text style={styles.welcomeSub}>
            Log in with your registered @adssu.edu.ph account.
          </Text>
        </View>

        {/* Form Container */}
        <View style={styles.formCard}>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Institutional Email (@adssu.edu.ph)</Text>
          <View style={styles.inputBox}>
            <Mail size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="name@adssu.edu.ph"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputBox}>
            <Lock size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              secureTextEntry={!showPass}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              {showPass ? (
                <EyeOff size={18} color={Colors.textMuted} />
              ) : (
                <Eye size={18} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View
                style={[styles.checkbox, rememberMe && styles.checkboxActive]}
              >
                {rememberMe && (
                  <Text
                    style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}
                  >
                    ✓
                  </Text>
                )}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleForgotPasswordPress()}
              disabled={loading}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.loginText}>
              {loading ? "Logging in..." : "Log in"}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.orText}>or log in with</Text>
            <View style={styles.line} />
          </View>

          {/* Centralized Cross-Platform Google Auth Button */}
          <GoogleAuthButton
            label="Continue with ADSSU Google"
            intent="login"
            disabled={loading}
          />

          {/* Sign Up Section */}
          <View style={styles.signupBox}>
            <Text style={styles.noAccountText}>{"Don't have an account?"}</Text>
            <TouchableOpacity
              style={styles.signupBtn}
              onPress={() => router.push("/auth/register")}
            >
              <Text style={styles.signupBtnText}>Sign Up</Text>
            </TouchableOpacity>
            <Text style={styles.termsHint}>
              By signing in, you agree to the Campus Marketplace Terms.
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* 3-Second Post-Login Splash Screen */}
      {pendingRoute && (
        <PostLoginSplash
          onFinish={() => {
            const destination = pendingRoute;
            setPendingRoute(null);
            router.replace(destination as any);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backToHome: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
    marginBottom: 8,
  },
  backToHomeText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  brandName: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  brandSub: { color: "#FDE68A", fontSize: 11, fontWeight: "600" },
  welcome: { color: "#FFF", fontSize: 26, fontWeight: "800" },
  welcomeSub: { color: "#D8F3DC", fontSize: 13, marginTop: 4 },
  formCard: { padding: 24 },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.background,
    gap: 10,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 14, color: Colors.text },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: { backgroundColor: Colors.primary },
  rememberText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  forgotText: { fontSize: 12, color: Colors.primary, fontWeight: "700" },
  loginBtn: {
    backgroundColor: Colors.primary,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  loginText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    gap: 10,
  },
  line: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: 12, color: Colors.textMuted },
  signupBox: {
    marginTop: 24,
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  noAccountText: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  signupBtn: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
  },
  signupBtnText: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  termsHint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
});
