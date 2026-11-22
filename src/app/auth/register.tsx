// src/app/auth/register.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
    ArrowLeft,
    Building2,
    Check,
    ChevronDown,
    Eye,
    EyeOff,
    Lock,
    Mail,
    ShoppingBag,
    Sprout,
    User,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { GoogleAuthButton } from "../../components/GoogleAuthButton";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const DEPARTMENTS = [
  "CCIS - Computing & Information Sciences",
  "CA - College of Agriculture",
  "CAS - College of Arts & Sciences",
  "CTE - College of Teacher Education",
  "CEIS - Engineering & Industrial Technology",
  "Admin / Campus Staff",
];

const ADMIN_EMAIL = "admin@adssu.edu.ph";
const ALLOWED_DOMAIN = "@adssu.edu.ph";
const REGISTER_DRAFT_KEY = "agrihub_register_draft";

type RegisterDraft = {
  role: "buyer" | "seller";
  firstName: string;
  lastName: string;
  email: string;
  department: string;
};

let registrationDraftMemory = {
  password: "",
  confirmPassword: "",
};

function isAllowedInstitutionalEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith(ALLOWED_DOMAIN) &&
    normalized.length > ALLOWED_DOMAIN.length
  );
}

export default function RegisterScreen() {
  const {
    message: messageParam,
    editName: editNameParam,
    firstName: firstNameParam,
    lastName: lastNameParam,
    department: departmentParam,
    role: roleParam,
  } = useLocalSearchParams<{
    message?: string;
    editName?: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    role?: string;
  }>();
  const editName =
    (Array.isArray(editNameParam) ? editNameParam[0] : editNameParam) === "true";
  const infoMessage = Array.isArray(messageParam)
    ? messageParam[0]
    : messageParam;

  const paramFirstName = Array.isArray(firstNameParam) ? firstNameParam[0] : firstNameParam;
  const paramLastName = Array.isArray(lastNameParam) ? lastNameParam[0] : lastNameParam;
  const paramDepartment = Array.isArray(departmentParam) ? departmentParam[0] : departmentParam;
  const paramRole = Array.isArray(roleParam) ? roleParam[0] : roleParam;
  const [role, setRole] = useState<"buyer" | "seller">(
    paramRole === "seller" ? "seller" : "buyer",
  );
  const [firstName, setFirstName] = useState(paramFirstName || "");
  const [lastName, setLastName] = useState(paramLastName || "");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState(
    paramDepartment && DEPARTMENTS.includes(paramDepartment)
      ? paramDepartment
      : DEPARTMENTS[0],
  );
  const [showDeptList, setShowDeptList] = useState(false);
  const [password, setPassword] = useState(registrationDraftMemory.password);
  const [confirmPassword, setConfirmPassword] = useState(
    registrationDraftMemory.confirmPassword,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        if (editName) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("full_name, institutional_email, department, role")
            .eq("id", user.id)
            .maybeSingle();
          if (error) throw error;
          if (profile) {
            const profileName = (profile.full_name || "").trim();
            const nameParts = profileName.split(/\s+/).filter(Boolean);
            setFirstName((current: string) => current || nameParts[0] || "");
            setLastName((current: string) =>
              current || nameParts.slice(1).join(" "),
            );
            setEmail(profile.institutional_email || user.email || "");
            if (
              typeof profile.department === "string" &&
              DEPARTMENTS.includes(profile.department)
            ) {
              setDepartment(profile.department);
            }
            if (profile.role === "buyer" || profile.role === "seller") {
              setRole(profile.role);
            }
          } else {
            setEmail(user.email || "");
          }
          return;
        }
        const savedDraft = await AsyncStorage.getItem(REGISTER_DRAFT_KEY);
        if (!savedDraft) return;
        const draft = JSON.parse(savedDraft) as Partial<RegisterDraft>;
        if (draft.role === "buyer" || draft.role === "seller") setRole(draft.role);
        if (typeof draft.firstName === "string") setFirstName(draft.firstName);
        if (typeof draft.lastName === "string") setLastName(draft.lastName);
        if (typeof draft.email === "string") setEmail(draft.email);
        if (
          typeof draft.department === "string" &&
          DEPARTMENTS.includes(draft.department)
        ) {
          setDepartment(draft.department);
        }
      } catch (error) {
        console.warn("Could not restore registration draft.", error);
      }
    })();
  }, [editName]);

  useEffect(() => {
    if (editName) return;
    registrationDraftMemory = { password, confirmPassword };
    const draft: RegisterDraft = {
      role,
      firstName,
      lastName,
      email,
      department,
    };
    void AsyncStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(draft)).catch(
      (error: unknown) =>
        console.warn("Could not preserve registration draft.", error),
    );
  }, [role, firstName, lastName, email, department, password, confirmPassword, editName]);

  const hasCapital = /[A-Z]/.test(password);
  const hasSmall = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const hasMinLen = password.length >= 8;
  const isPasswordValid =
    hasCapital && hasSmall && hasNumber && hasSpecial && hasMinLen;

  function showMessage(title: string, message: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function handleRegister() {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (editName) {
      if (!cleanFirstName || !cleanLastName) {
        return showMessage(
          "Name Required",
          "First Name and Last Name are required.",
        );
      }
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/auth/login");
          return;
        }
        const combinedFullName = `${cleanFirstName} ${cleanLastName}`;
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: combinedFullName,
          })
          .eq("id", user.id);
        if (error) throw error;
        await AsyncStorage.removeItem(REGISTER_DRAFT_KEY).catch(() => undefined);
        router.replace("/auth/verify-id");
      } catch (error: unknown) {
        showMessage(
          "Could Not Save Name",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (
      !cleanFirstName ||
      !cleanLastName ||
      !cleanEmail ||
      !department.trim() ||
      !password ||
      !confirmPassword
    ) {
      return showMessage(
        "Missing Required Fields",
        "First Name, Last Name, Department, Institutional Email, and Password are all required.",
      );
    }
    if (!isAllowedInstitutionalEmail(cleanEmail)) {
      return showMessage(
        "Invalid Institutional Email",
        "Only official @adssu.edu.ph email addresses are allowed to sign up for AgriHub.",
      );
    }
    if (cleanEmail === ADMIN_EMAIL) {
      return showMessage(
        "Restricted Account",
        "Admin accounts cannot be registered via Sign Up. Please log in directly.",
      );
    }
    if (!isPasswordValid) {
      return showMessage(
        "Weak Password",
        "Password must be at least 8 characters with a capital letter, small letter, number, and special character.",
      );
    }
    if (password !== confirmPassword) {
      return showMessage("Password Mismatch", "Your passwords do not match.");
    }
    if (!agreedTerms) {
      return showMessage(
        "Terms Required",
        "Please agree to the Terms & Conditions and ADSSU Data Privacy Policy.",
      );
    }

    const combinedFullName = `${cleanFirstName} ${cleanLastName}`;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            first_name: cleanFirstName,
            last_name: cleanLastName,
            full_name: combinedFullName,
            role,
            department: department.trim(),
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        await supabase
          .from("profiles")
          .update({
            full_name: combinedFullName,
          })
          .eq("id", data.user.id);
      }
      await AsyncStorage.removeItem(REGISTER_DRAFT_KEY).catch(() => undefined);
      registrationDraftMemory = { password: "", confirmPassword: "" };

      if (!data.session) {
        showMessage(
          "Confirm Your Email",
          "Confirm the link sent to your @adssu.edu.ph email, then sign in to upload your official School ID.",
        );
        router.replace("/auth/login");
      } else {
        // Both Buyers and Sellers must proceed to Step 2 (Mandatory School ID Verification)
        router.replace("/auth/verify-id");
      }
    } catch (error: unknown) {
      showMessage(
        "Registration Failed",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 52, paddingBottom: 42 }}
    >
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.push("/auth/onboarding")}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <ArrowLeft size={20} color={Colors.text} />
          <Text style={styles.backBtnText}>Back to Home</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Account</Text>
        <Text style={styles.stepPill}>Step 1 of 2</Text>
      </View>

      {infoMessage ? (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>{infoMessage}</Text>
        </View>
      ) : null}

      <View style={styles.nameWarning}>
        <Text style={styles.nameWarningText}>
          {"⚠️ Important: Type your First Name and Last Name EXACTLY as printed on your ADSSU School ID (including suffixes like Jr. or III). Mismatched names will fail ID verification."}
        </Text>
      </View>

      <Text style={styles.label}>1. I am registering as a *</Text>
      <View style={styles.roleRow}>
        <TouchableOpacity
          style={[styles.roleCard, role === "buyer" && styles.roleCardActive]}
          onPress={() => setRole("buyer")}
        >
          <View
            style={[
              styles.roleIconBox,
              role === "buyer" && { backgroundColor: Colors.primary },
            ]}
          >
            <ShoppingBag
              size={18}
              color={role === "buyer" ? "#FFF" : Colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleCardTitle}>Campus Buyer</Text>
            <Text style={styles.roleCardSub}>Students, Faculty & Staff</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, role === "seller" && styles.roleCardActive]}
          onPress={() => setRole("seller")}
        >
          <View
            style={[
              styles.roleIconBox,
              role === "seller" && { backgroundColor: Colors.primary },
            ]}
          >
            <Sprout
              size={18}
              color={role === "seller" ? "#FFF" : Colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleCardTitle}>Student Seller</Text>
            <Text style={styles.roleCardSub}>Farm / Dept Unit</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>
        {role === "seller" ? "2. Department / Farm Unit *" : "2. Department *"}
      </Text>
      <TouchableOpacity
        style={styles.deptSelector}
        onPress={() => setShowDeptList(!showDeptList)}
      >
        <Building2 size={16} color={Colors.primary} />
        <Text style={styles.deptText} numberOfLines={1}>
          {department}
        </Text>
        <ChevronDown size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {showDeptList && (
        <View style={styles.deptDropdown}>
          {DEPARTMENTS.map((dept) => (
            <TouchableOpacity
              key={dept}
              style={styles.deptOption}
              onPress={() => {
                setDepartment(dept);
                setShowDeptList(false);
              }}
            >
              <Text
                style={[
                  styles.deptOptionText,
                  department === dept && {
                    color: Colors.primary,
                    fontWeight: "800",
                  },
                ]}
              >
                {dept}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAgreedTerms(!agreedTerms)}
      >
        <View style={[styles.checkbox, agreedTerms && styles.checkboxActive]}>
          {agreedTerms && <Check size={12} color="#FFF" strokeWidth={3} />}
        </View>
        <Text style={styles.termsText}>
          I agree to the{" "}
          <Text style={styles.termsLink}>Terms & Conditions</Text> and the{" "}
          <Text style={styles.termsLink}>ADSSU Data Privacy Policy</Text>. *
        </Text>
      </TouchableOpacity>

      <GoogleAuthButton
        label={`Continue with ADSSU Google as ${role === "seller" ? "Student Seller" : "Campus Buyer"}`}
        intent="signup"
        role={role}
        department={department}
        style={styles.googleBtn}
        textStyle={styles.googleText}
        disabled={!agreedTerms || loading}
      />

      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>or register manually</Text>
        <View style={styles.line} />
      </View>

      {/* First Name (Required - must match School ID) */}
      <Text style={styles.label}>First Name (as shown on School ID) *</Text>
      <View style={styles.inputBox}>
        <User size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="e.g. James Albert"
          value={firstName}
          onChangeText={setFirstName}
        />
      </View>

      {/* Last Name (Required - must match School ID) */}
      <Text style={styles.label}>Last Name (as shown on School ID) *</Text>
      <View style={styles.inputBox}>
        <User size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="e.g. Abasula"
          value={lastName}
          onChangeText={setLastName}
        />
      </View>

      {/* Institutional Email (Required) */}
      <Text style={styles.label}>Institutional Email (@adssu.edu.ph) *</Text>
      <View style={styles.inputBox}>
        <Mail size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="name@adssu.edu.ph"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>

      {/* Create Password (Required) */}
      <Text style={styles.label}>Create Password *</Text>
      <View style={styles.inputBox}>
        <Lock size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          secureTextEntry={!showPassword}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          onPress={() => setShowPassword((prev) => !prev)}
          hitSlop={8}
        >
          {showPassword ? (
            <EyeOff size={18} color={Colors.textMuted} />
          ) : (
            <Eye size={18} color={Colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.strengthRow}>
        <View style={styles.strengthBars}>
          <View
            style={[
              styles.bar,
              password.length > 0 && { backgroundColor: Colors.success },
            ]}
          />
          <View
            style={[
              styles.bar,
              hasCapital && hasSmall && { backgroundColor: Colors.success },
            ]}
          />
          <View
            style={[
              styles.bar,
              hasNumber && hasMinLen && { backgroundColor: Colors.success },
            ]}
          />
          <View
            style={[
              styles.bar,
              isPasswordValid && { backgroundColor: Colors.success },
            ]}
          />
        </View>
        <Text style={styles.strengthLabel}>
          {isPasswordValid ? "Strong password" : "Password rules"}
        </Text>
      </View>

      <View style={styles.rulesBox}>
        <Text style={[styles.ruleText, hasMinLen && styles.ruleValid]}>
          {hasMinLen ? "✓" : "○"} At least 8 characters
        </Text>
        <Text style={[styles.ruleText, hasCapital && styles.ruleValid]}>
          {hasCapital ? "✓" : "○"} 1 Capital letter (A–Z)
        </Text>
        <Text style={[styles.ruleText, hasSmall && styles.ruleValid]}>
          {hasSmall ? "✓" : "○"} 1 Small letter (a–z)
        </Text>
        <Text style={[styles.ruleText, hasNumber && styles.ruleValid]}>
          {hasNumber ? "✓" : "○"} 1 Number (0–9)
        </Text>
        <Text style={[styles.ruleText, hasSpecial && styles.ruleValid]}>
          {hasSpecial ? "✓" : "○"} 1 Special character (!@#$%^&*)
        </Text>
      </View>

      {/* Confirm Password (Required) */}
      <Text style={styles.label}>Confirm Password *</Text>
      <View style={styles.inputBox}>
        <Lock size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          secureTextEntry={!showConfirmPassword}
          placeholder="••••••••"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <TouchableOpacity
          onPress={() => setShowConfirmPassword((prev) => !prev)}
          hitSlop={8}
        >
          {showConfirmPassword ? (
            <EyeOff size={18} color={Colors.textMuted} />
          ) : (
            <Eye size={18} color={Colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.7 }]}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.submitText}>
          {editName
            ? "Save Name & Continue to ID Verification"
            : loading
            ? "Proceeding to Step 2..."
            : `Continue to Step 2 (ID Verification) →`}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footerHint}>
        Mandatory Step 2: Both Buyers and Sellers must upload an official School
        ID showing the school logo, school name, your name, ID number, and
        course.
      </Text>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backBtn: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  backBtnText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  stepPill: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  infoBanner: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  infoBannerText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },
  nameWarning: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  nameWarningText: {
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  roleRow: { flexDirection: "row", gap: 10 },
  roleCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  roleIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  roleCardTitle: { fontSize: 12, fontWeight: "800", color: Colors.text },
  roleCardSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
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
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
  },
  deptSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,
    backgroundColor: Colors.background,
  },
  deptText: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.text },
  deptDropdown: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 6,
    overflow: "hidden",
  },
  deptOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deptOptionText: { fontSize: 13, color: Colors.text },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
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
  termsText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  termsLink: { color: Colors.primary, fontWeight: "700" },
  googleBtn: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#DADCE0",
  },
  googleText: { fontSize: 13, fontWeight: "800", color: "#1F1F1F" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    gap: 10,
  },
  line: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: 12, color: Colors.textMuted },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  strengthBars: { flex: 1, flexDirection: "row", gap: 5 },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  strengthLabel: { fontSize: 11, fontWeight: "700", color: Colors.textMuted },
  rulesBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ruleText: { fontSize: 11, color: Colors.textMuted },
  ruleValid: { color: Colors.success, fontWeight: "700" },
  submitBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  footerHint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
});
