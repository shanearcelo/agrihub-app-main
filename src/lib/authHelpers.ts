import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type GoogleAuthIntent = "login" | "signup";

export const GOOGLE_STORAGE_KEYS = {
  INTENT: "pending_google_intent",
  ROLE: "pending_google_role",
  DEPARTMENT: "pending_google_department",
} as const;

export interface GoogleAuthContext {
  intent: GoogleAuthIntent | null;
  role?: "buyer" | "seller";
  department?: string;
}

export async function setPendingGoogleAuth(context: {
  intent: GoogleAuthIntent;
  role?: "buyer" | "seller";
  department?: string;
}): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("Browser storage is unavailable for Google Sign-In.");
    }
    window.localStorage.setItem(GOOGLE_STORAGE_KEYS.INTENT, context.intent);
    if (context.role) {
      window.localStorage.setItem(GOOGLE_STORAGE_KEYS.ROLE, context.role);
    } else {
      window.localStorage.removeItem(GOOGLE_STORAGE_KEYS.ROLE);
    }
    if (context.department) {
      window.localStorage.setItem(
        GOOGLE_STORAGE_KEYS.DEPARTMENT,
        context.department,
      );
    } else {
      window.localStorage.removeItem(GOOGLE_STORAGE_KEYS.DEPARTMENT);
    }
    return;
  }

  try {
    await AsyncStorage.setItem(GOOGLE_STORAGE_KEYS.INTENT, context.intent);
    if (context.role) {
      await AsyncStorage.setItem(GOOGLE_STORAGE_KEYS.ROLE, context.role);
    } else {
      await AsyncStorage.removeItem(GOOGLE_STORAGE_KEYS.ROLE);
    }
    if (context.department) {
      await AsyncStorage.setItem(
        GOOGLE_STORAGE_KEYS.DEPARTMENT,
        context.department,
      );
    } else {
      await AsyncStorage.removeItem(GOOGLE_STORAGE_KEYS.DEPARTMENT);
    }
  } catch (error) {
    console.error("Could not write to AsyncStorage:", error);
    throw error;
  }
}

export async function getPendingGoogleAuth(): Promise<GoogleAuthContext> {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    const intent = window.localStorage.getItem(
      GOOGLE_STORAGE_KEYS.INTENT,
    ) as GoogleAuthIntent | null;
    const roleRaw = window.localStorage.getItem(GOOGLE_STORAGE_KEYS.ROLE);
    const role =
      roleRaw === "buyer" || roleRaw === "seller" ? roleRaw : undefined;
    const department =
      window.localStorage.getItem(GOOGLE_STORAGE_KEYS.DEPARTMENT) || undefined;
    return { intent, role, department };
  }

  try {
    const intent = (await AsyncStorage.getItem(
      GOOGLE_STORAGE_KEYS.INTENT,
    )) as GoogleAuthIntent | null;
    const roleRaw = await AsyncStorage.getItem(GOOGLE_STORAGE_KEYS.ROLE);
    const role =
      roleRaw === "buyer" || roleRaw === "seller" ? roleRaw : undefined;
    const department =
      (await AsyncStorage.getItem(GOOGLE_STORAGE_KEYS.DEPARTMENT)) || undefined;
    return { intent, role, department };
  } catch (error) {
    console.error("Could not read from AsyncStorage:", error);
    return { intent: null };
  }
}

export function getPendingGoogleAuthSync(): GoogleAuthContext {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    const intent = window.localStorage.getItem(
      GOOGLE_STORAGE_KEYS.INTENT,
    ) as GoogleAuthIntent | null;
    const roleRaw = window.localStorage.getItem(GOOGLE_STORAGE_KEYS.ROLE);
    const role =
      roleRaw === "buyer" || roleRaw === "seller" ? roleRaw : undefined;
    const department =
      window.localStorage.getItem(GOOGLE_STORAGE_KEYS.DEPARTMENT) || undefined;
    return { intent, role, department };
  }
  return { intent: null };
}

export async function clearPendingGoogleAuth(): Promise<void> {
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.localStorage
  ) {
    window.localStorage.removeItem(GOOGLE_STORAGE_KEYS.INTENT);
    window.localStorage.removeItem(GOOGLE_STORAGE_KEYS.ROLE);
    window.localStorage.removeItem(GOOGLE_STORAGE_KEYS.DEPARTMENT);
  }
  try {
    await AsyncStorage.multiRemove([
      GOOGLE_STORAGE_KEYS.INTENT,
      GOOGLE_STORAGE_KEYS.ROLE,
      GOOGLE_STORAGE_KEYS.DEPARTMENT,
    ]);
  } catch (error) {
    console.error("Could not clear pending Google auth from AsyncStorage:", error);
  }
}

// Backwards-compatible aliases
export const setPendingGoogleAuthContext = setPendingGoogleAuth;
export const clearPendingGoogleAuthContext = clearPendingGoogleAuth;
export const restorePendingGoogleAuthContext = getPendingGoogleAuth;
export const getPendingGoogleAuthContext = getPendingGoogleAuthSync;

export interface UserProfileSummary {
  id?: string;
  role?: string | null;
  department?: string | null;
  full_name?: string | null;
  is_registered?: boolean | null;
  valid_id_url?: string | null;
  id_document_url?: string | null;
  id_verification_completed?: boolean | null;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please sign in to continue.");
  return user;
}

/**
 * Checks whether an authenticated user's profile is complete.
 * Brand new Google users who have not completed role selection will return false.
 */
export function isProfileComplete(
  profile: UserProfileSummary | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;

  if (profile.is_registered === false) return false;

  const hasValidRole = profile.role === "buyer" || profile.role === "seller";
  if (!hasValidRole) return false;

  if (profile.is_registered === true) return true;

  // Older accounts may not have is_registered set; their role and department
  // are the registration record for those profiles.
  return Boolean(profile.department?.trim());
}
