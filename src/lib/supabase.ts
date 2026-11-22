import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const FALLBACK_SUPABASE_URL =
  "https://mgtoqydkclnidurwtwtt.supabase.co/rest/v1/";
const FALLBACK_SUPABASE_ANON_KEY =
  "sb_publishable_VBy4losU3MUPwELH7zhBRg_3jK6yhFb";

function resolveSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const errors: string[] = [];

  if (!url) {
    errors.push("EXPO_PUBLIC_SUPABASE_URL is missing.");
  } else {
    try {
      const parsedUrl = new URL(url);
      if (
        (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") ||
        !parsedUrl.hostname
      ) {
        errors.push("EXPO_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.");
      }
    } catch {
      errors.push("EXPO_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.");
    }
  }

  if (!anonKey) {
    errors.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  if (errors.length > 0 || !url || !anonKey) {
    const message = `Supabase configuration error: ${errors.join(" ")} Add the values to the build environment and rebuild AgriHub.`;
    console.error(`[AgriHub] ${message}`);
    return {
      url: FALLBACK_SUPABASE_URL,
      anonKey: FALLBACK_SUPABASE_ANON_KEY,
      error: message,
    };
  }

  return { url, anonKey, error: null };
}

const config = resolveSupabaseConfig();
export const supabaseConfigError = config.error;

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce",
  },
});
