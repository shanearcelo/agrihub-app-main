import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

export function getGoogleRedirectUri(): string {
  if (Platform.OS === "web") {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:8081";
    return `${origin.replace(/\/$/, "")}/auth/login`;
  }

  return AuthSession.makeRedirectUri({ path: "auth/login" });
}
