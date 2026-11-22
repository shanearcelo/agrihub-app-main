// src/app/profile/edit.tsx
import { useRouter } from "expo-router";
import { ArrowLeft, BadgeCheck, Save, Trash2 } from "lucide-react-native";
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
import { KeyboardAwareScrollView } from "../../components/KeyboardAwareScrollView";
import { Colors } from "../../constants/theme";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";

function getSupabaseErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      return record.details
        ? `${record.message} (${String(record.details)})`
        : record.message;
    }
  }
  return fallback;
}

export default function EditProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [role, setRole] = useState<"buyer" | "seller" | "admin">("buyer");
  const [hasProfileRow, setHasProfileRow] = useState(false);
  const [phoneColumn, setPhoneColumn] = useState<
    "contact_number" | "phone" | null
  >(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [department, setDepartment] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [program, setProgram] = useState("");
  const [schoolIdNumber, setSchoolIdNumber] = useState("");
  const [idOnFile, setIdOnFile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    async function loadProfile() {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.replace("/auth/login");
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!active) return;

        setUserId(user.id);
        setUserEmail(user.email || "");

        if (data) {
          setHasProfileRow(true);
          if (data.role) setRole(data.role);

          if ("contact_number" in data) {
            setPhoneColumn("contact_number");
            setContactNumber(
              typeof data.contact_number === "string"
                ? data.contact_number
                : "",
            );
          } else if ("phone" in data) {
            setPhoneColumn("phone");
            setContactNumber(typeof data.phone === "string" ? data.phone : "");
          } else {
            setPhoneColumn(null);
          }

          const full = (data.full_name || "").trim();
          const parts = full.split(/\s+/);
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
          setDepartment(data.department || "");
          setProgram(data.course || data.course_year || "");
          setSchoolIdNumber(
            data.school_id_number || data.id_number || data.student_id_number || "",
          );
          const hasIdDocument = Boolean(data.valid_id_url || data.id_document_url);
          setIdOnFile(hasIdDocument);
        } else {
          setHasProfileRow(false);
          const metaName =
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name.trim()
              : "";
          const parts = metaName.split(/\s+/);
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSaveChanges() {
    if (!userId) return;

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanDept = department.trim();
    const cleanContact = contactNumber.trim();

    if (!cleanFirst) {
      return showMessage("Required Field", "Please enter your First Name.");
    }
    if (!cleanLast) {
      return showMessage("Required Field", "Please enter your Last Name.");
    }
    if (!cleanDept) {
      return showMessage(
        "Required Field",
        "Please enter your Department / Unit.",
      );
    }

    setSaving(true);
    try {
      const fullName = `${cleanFirst} ${cleanLast}`.trim();
      const payload: Record<string, unknown> = {
        full_name: fullName,
        department: cleanDept,
        course: program.trim() ? program.trim().toUpperCase() : null,
        course_year: program.trim() ? program.trim().toUpperCase() : null,
        school_id_number: schoolIdNumber.trim()
          ? schoolIdNumber.trim().toUpperCase()
          : null,
      };

      // Only include the phone field if that column exists in your profiles table
      if (phoneColumn) {
        payload[phoneColumn] = cleanContact || null;
      }

      if (hasProfileRow) {
        const { error } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profiles").upsert({
          id: userId,
          email: userEmail || null,
          role,
          ...payload,
        });
        if (error) throw error;
        setHasProfileRow(true);
      }

      // Also sync full_name to Supabase Auth metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName },
      });

      showMessage("Profile Updated", "Your changes have been saved!");
      if (router.canGoBack()) {
        router.back();
      } else if (role === "seller") {
        router.replace("/seller/profile");
      } else {
        router.replace("/buyer/profile");
      }
    } catch (err: unknown) {
      console.error("Profile update error:", err);
      showMessage(
        "Save Failed",
        getSupabaseErrorMessage(err, "Could not save your profile."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile() {
    const confirmed =
      Platform.OS === "web"
        ? window.confirm(
            "Are you sure you want to sign out and deactivate your profile?",
          )
        : true;
    if (!confirmed) return;

    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 44, paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/buyer/profile")
          }
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Edit Profile</Text>
          <Text style={styles.subtitle}>* Required fields</Text>
        </View>
      </View>

      {/* First Name */}
      <Text style={styles.label}>First Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., James"
        value={firstName}
        onChangeText={setFirstName}
        editable={!saving}
      />

      {/* Last Name */}
      <Text style={styles.label}>Last Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Albert Abasula"
        value={lastName}
        onChangeText={setLastName}
        editable={!saving}
      />

      {/* Department / Unit */}
      <Text style={styles.label}>Department / Unit *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., CCIS - Computing & Information Sciences"
        value={department}
        onChangeText={setDepartment}
        editable={!saving}
      />

      <View style={styles.verifiedFieldHeading}>
        <Text style={styles.label}>Program</Text>
        {idOnFile ? (
          <View style={styles.verifiedBadge}>
            <BadgeCheck size={13} color={Colors.success} />
            <Text style={styles.verifiedBadgeText}>
              {role === "admin" ? "On file" : "School ID"}
            </Text>
          </View>
        ) : null}
      </View>
      <TextInput
        style={styles.input}
        placeholder="e.g. BSIT"
        value={program}
        onChangeText={setProgram}
        autoCapitalize="characters"
        editable={!saving}
      />

      <View style={styles.verifiedFieldHeading}>
        <Text style={styles.label}>School ID Number</Text>
        {schoolIdNumber ? (
          <View style={styles.verifiedBadge}>
            <BadgeCheck size={13} color={Colors.success} />
            <Text style={styles.verifiedBadgeText}>
              {idOnFile ? "School ID" : "On file"}
            </Text>
          </View>
        ) : null}
      </View>
      <TextInput
        style={styles.input}
        placeholder="e.g. M-006799"
        value={schoolIdNumber}
        onChangeText={setSchoolIdNumber}
        autoCapitalize="characters"
        editable={!saving}
      />

      {/* Contact Number (Optional) */}
      <Text style={styles.label}>Contact Number (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 09171234567 (optional)"
        keyboardType="phone-pad"
        value={contactNumber}
        onChangeText={setContactNumber}
        editable={!saving}
      />

      {/* Save Changes */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={() => void handleSaveChanges()}
        disabled={saving}
      >
        <Save size={17} color="#FFF" />
        <Text style={styles.saveText}>
          {saving ? "Saving..." : "Save Changes"}
        </Text>
      </TouchableOpacity>

      {/* Delete Profile */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => void handleDeleteProfile()}
        disabled={saving}
      >
        <Trash2 size={17} color={Colors.danger} />
        <Text style={styles.deleteText}>Delete Profile</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  verifiedFieldHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedBadgeText: { color: Colors.success, fontSize: 10, fontWeight: "800" },
  readOnlyField: {
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  readOnlyText: { color: Colors.text, fontSize: 14, fontWeight: "700" },
  input: {
    minHeight: 48,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 24,
  },
  saveText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 12,
  },
  deleteText: { color: Colors.danger, fontSize: 15, fontWeight: "800" },
});
