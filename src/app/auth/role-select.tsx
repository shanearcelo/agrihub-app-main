// src/app/auth/role-select.tsx
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  Check,
  ChevronDown,
  LogOut,
  ShoppingBag,
  Sprout,
  User as UserIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BrandLogo } from "../../components/BrandLogo";
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { Colors } from "../../constants/theme";
import {
  clearPendingGoogleAuth,
  getPendingGoogleAuth,
  isProfileComplete,
} from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const AUTH_OPERATION_TIMEOUT_MS = 12_000;

function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(operation),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string"
        ? `${error.code}: `
        : "";
    return `${code}${error.message}`;
  }
  return "Could not complete account setup.";
}

const DEPARTMENTS = [
  "CCIS - Computing & Information Sciences",
  "CA - College of Agriculture",
  "CAS - College of Arts & Sciences",
  "CTE - College of Teacher Education",
  "CEIS - Engineering & Industrial Technology",
  "Admin / Campus Staff",
];

export default function RoleSelectScreen() {
  const { role: roleParam, department: departmentParam } =
    useLocalSearchParams<{ role?: string; department?: string }>();
  const initialRole = roleParam === "seller" ? "seller" : "buyer";
  const initialDepartment =
    departmentParam && DEPARTMENTS.includes(departmentParam)
      ? departmentParam
      : DEPARTMENTS[0];
  const [role, setRole] = useState<"buyer" | "seller">(initialRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState(initialDepartment);
  const [showDeptList, setShowDeptList] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const router = useRouter();

  function showMessage(title: string, message: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const {
          data: { session },
        } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_OPERATION_TIMEOUT_MS,
          "Account session lookup timed out.",
        );
        if (!session?.user) {
          router.replace("/auth/login");
          return;
        }

        const user = session.user;
        const userEmail = (user.email || "").toLowerCase();

        // Check if user's profile is already complete
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from("profiles")
            .select(
              "role, department, full_name, valid_id_url, id_document_url, id_verification_completed, is_registered",
            )
            .eq("id", user.id)
            .maybeSingle(),
          AUTH_OPERATION_TIMEOUT_MS,
          "Account profile lookup timed out.",
        );
        if (profileError) throw profileError;

        if (profile && isProfileComplete(profile)) {
          const needsIdVerification =
            profile.role !== "admin" &&
            (profile.id_verification_completed === false ||
              (profile.role === "seller" &&
                !(profile.valid_id_url || profile.id_document_url)));
          if (needsIdVerification) {
            router.replace("/auth/verify-id");
          } else if (profile.role === "admin") {
            router.replace("/admin");
          } else if (profile.role === "seller") {
            router.replace("/seller");
          } else {
            router.replace("/buyer");
          }
          return;
        }

        const pendingAuth = await getPendingGoogleAuth();
        const effectiveRole =
          roleParam === "seller" || roleParam === "buyer"
            ? roleParam
            : pendingAuth.role === "seller" || pendingAuth.role === "buyer"
              ? pendingAuth.role
              : undefined;
        const effectiveDept =
          departmentParam && DEPARTMENTS.includes(departmentParam)
            ? departmentParam
            : pendingAuth.department &&
                DEPARTMENTS.includes(pendingAuth.department)
              ? pendingAuth.department
              : undefined;

        if (active) {
          setEmail(userEmail);
          const initialName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            profile?.full_name ||
            "";
          setFullName(initialName);
          if (effectiveRole) {
            setRole(effectiveRole);
          } else if (profile?.role === "buyer" || profile?.role === "seller") {
            setRole(profile.role);
          }
          if (effectiveDept) {
            setDepartment(effectiveDept);
          } else if (
            profile?.department &&
            DEPARTMENTS.includes(profile.department)
          ) {
            setDepartment(profile.department);
          }
        }
      } catch (err) {
        console.error("Error loading account for role selection:", err);
        if (active) {
          showMessage("Account Load Failed", describeError(err));
        }
      } finally {
        if (active) setInitializing(false);
      }
    }

    void loadCurrentUser();

    return () => {
      active = false;
    };
  }, [departmentParam, roleParam, router]);

  async function handleCompleteSetup() {
    if (!fullName.trim()) {
      return showMessage(
        "Full Name Required",
        "Please enter your full name to complete setup.",
      );
    }

    if (!department.trim()) {
      return showMessage(
        "Department Required",
        "Please select your ADSSU department.",
      );
    }

    if (!agreedTerms) {
      return showMessage(
        "Terms Required",
        "Please agree to the Terms & Conditions and ADSSU Data Privacy Policy.",
      );
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_OPERATION_TIMEOUT_MS,
        "Account session lookup timed out.",
      );
      if (!session?.user) {
        throw new Error("No active session found. Please sign in again.");
      }

      const { error: rpcError } = await withTimeout(
        supabase.rpc("set_registration_profile", {
          p_role: role,
          p_full_name: fullName.trim(),
          p_department: department.trim(),
        }),
        AUTH_OPERATION_TIMEOUT_MS,
        "Account setup timed out. Please try again.",
      );
      if (rpcError) throw rpcError;

      // Clear pending Google auth flags once registration is complete
      await clearPendingGoogleAuth();

      // Refresh Supabase session so layout listener picks up the new profile state
      const { error: refreshError } = await withTimeout(
        supabase.auth.refreshSession(),
        AUTH_OPERATION_TIMEOUT_MS,
        "Session refresh timed out after account setup.",
      );
      if (refreshError) throw refreshError;

      if (role === "seller") {
        router.replace("/auth/verify-id");
      } else {
        router.replace("/buyer");
      }
    } catch (err: unknown) {
      showMessage("Setup Failed", describeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await clearPendingGoogleAuth();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  if (initializing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your account...</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 22, paddingTop: 52, paddingBottom: 42 }}
      bounces={false}
    >
      {/* Brand Header */}
      <View style={styles.headerRow}>
        <BrandLogo size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>AgriHub Onboarding</Text>
          <Text style={styles.brandSubtitle}>Presko, Barato, Tatak ADSSU</Text>
        </View>
        <TouchableOpacity
          onPress={handleSignOut}
          style={styles.signOutBtn}
          accessibilityLabel="Sign out"
        >
          <LogOut size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.mainTitle}>Complete Your Profile</Text>
      <Text style={styles.subtitle}>
        Welcome! Please choose how you will be using AgriHub on campus.
      </Text>

      {/* Account Info Pill */}
      {email ? (
        <View style={styles.accountCard}>
          <Text style={styles.accountLabel}>Signed in with Google as:</Text>
          <Text style={styles.accountEmail}>{email}</Text>
        </View>
      ) : null}

      {/* Role Selection */}
      <Text style={styles.sectionLabel}>1. Select Your Role</Text>
      <View style={styles.roleColumn}>
        {/* Campus Buyer Card */}
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
              size={20}
              color={role === "buyer" ? "#FFF" : Colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.roleTitleRow}>
              <Text style={styles.roleTitle}>Campus Buyer</Text>
              {role === "buyer" && (
                <View style={styles.selectedBadge}>
                  <Check size={12} color="#FFF" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text style={styles.roleSub}>Students, Faculty & Staff</Text>
            <Text style={styles.roleDesc}>
              Browse produce, reserve pre-orders, and pick up fresh harvests on
              campus.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Student Seller Card */}
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
              size={20}
              color={role === "seller" ? "#FFF" : Colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.roleTitleRow}>
              <Text style={styles.roleTitle}>Student Seller</Text>
              {role === "seller" && (
                <View style={styles.selectedBadge}>
                  <Check size={12} color="#FFF" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text style={styles.roleSub}>Campus Agriculture & Production</Text>
            <Text style={styles.roleDesc}>
              List crops, manage pre-orders, and sell fresh produce to the
              campus community.
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Department Selection */}
      <Text style={styles.sectionLabel}>
        {role === "seller" ? "2. Department / Farm Unit" : "2. Department"}
      </Text>
      <TouchableOpacity
        style={styles.deptSelector}
        onPress={() => setShowDeptList(!showDeptList)}
      >
        <Building2 size={18} color={Colors.primary} />
        <Text style={styles.deptText} numberOfLines={1}>
          {department}
        </Text>
        <ChevronDown size={18} color={Colors.textMuted} />
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

      {/* Full Name */}
      <Text style={styles.sectionLabel}>3. Full Name</Text>
      <View style={styles.inputBox}>
        <UserIcon size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="e.g. Maria Santos"
          value={fullName}
          onChangeText={setFullName}
        />
      </View>

      {/* Terms Agreement */}
      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAgreedTerms(!agreedTerms)}
      >
        <View style={[styles.checkbox, agreedTerms && styles.checkboxActive]}>
          {agreedTerms && <Check size={12} color="#FFF" strokeWidth={3} />}
        </View>
        <Text style={styles.termsText}>
          I agree to the <Text style={styles.termsLink}>Terms & Conditions</Text>{" "}
          and <Text style={styles.termsLink}>ADSSU Data Privacy Policy</Text>.
        </Text>
      </TouchableOpacity>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.7 }]}
        onPress={handleCompleteSetup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitText}>
            {role === "seller"
              ? "Continue to ID Verification →"
              : "Complete Setup & Enter AgriHub →"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Switch Account */}
      <TouchableOpacity style={styles.switchAccountBtn} onPress={handleSignOut}>
        <Text style={styles.switchAccountText}>
          Not your account?{" "}
          <Text style={{ color: Colors.primary, fontWeight: "700" }}>
            Sign out
          </Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  brandTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  brandSubtitle: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  signOutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  mainTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  accountCard: {
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    marginBottom: 18,
  },
  accountLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  accountEmail: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 14,
    marginBottom: 8,
  },
  roleColumn: { gap: 12 },
  roleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  roleTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roleTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  selectedBadge: {
    backgroundColor: Colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  roleSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  roleDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },

  deptSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deptOptionText: { fontSize: 13, color: Colors.text },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 14, color: Colors.text },

  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
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

  submitBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 22,
  },
  submitText: { color: "#FFF", fontSize: 15, fontWeight: "800" },

  switchAccountBtn: {
    marginTop: 18,
    alignItems: "center",
  },
  switchAccountText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
