// src/components/GoogleAuthButton.tsx
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Colors } from "../constants/theme";
import {
  clearPendingGoogleAuth,
  GoogleAuthIntent,
  setPendingGoogleAuth,
} from "../lib/authHelpers";
import { getGoogleRedirectUri } from "../lib/googleAuth";
import { supabase } from "../lib/supabase";
import { GoogleLogo } from "./GoogleLogo";

WebBrowser.maybeCompleteAuthSession();

export interface GoogleAuthButtonProps {
  label?: string;
  disabled?: boolean;
  intent: GoogleAuthIntent;
  role?: "buyer" | "seller";
  department?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onError?: (error: Error) => void;
}

class OAuthCallbackError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "OAuthCallbackError";
  }
}

function getCallbackParameters(url: string) {
  const parsedUrl = new URL(url);
  const query = new URLSearchParams(parsedUrl.search);
  const fragment = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
  const get = (key: string) => query.get(key) || fragment.get(key);
  return {
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    code: get("code"),
    errorCode: get("error_code") || get("error"),
    errorMessage: get("error_description"),
  };
}

export function GoogleAuthButton({
  label = "Continue with Google",
  disabled = false,
  intent,
  role,
  department,
  style,
  textStyle,
  onError,
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const showAlert = useCallback((title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const handleAuthError = useCallback(
    (err: unknown) => {
      void clearPendingGoogleAuth();
      const error =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "Google Sign-In failed.");
      const code =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof err.code === "string"
          ? err.code
          : undefined;
      const message = `${code ? `${code}: ` : ""}${error.message}`;

      // Check if user cancelled or dismissed the modal
      const isCancellation =
        /cancel|dismiss|closed|user_cancelled/i.test(error.message) ||
        (typeof err === "object" &&
          err !== null &&
          "type" in err &&
          ((err as { type: string }).type === "cancel" ||
            (err as { type: string }).type === "dismiss"));

      if (isCancellation) {
        setLoading(false);
        return;
      }

      console.error("Google Auth Error:", error);
      showAlert(
        "Google Sign-In",
        message || "Google Sign-In failed. Please try again.",
      );

      if (onError) {
        onError(new Error(message));
      }
      setLoading(false);
    },
    [onError, showAlert],
  );

  async function handleNativeSignIn() {
    try {
      setLoading(true);

      await setPendingGoogleAuth({
        intent,
        role,
        department,
      });

      const redirectUrl = getGoogleRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) {
        throw new Error("Supabase did not return a Google authorization URL.");
      }

      const authResult = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
      );
      if (authResult.type === "cancel" || authResult.type === "dismiss") {
        await clearPendingGoogleAuth();
        return;
      }
      if (authResult.type !== "success" || !authResult.url) {
        throw new Error("Google Sign-In did not return an authorization URL.");
      }

      const callback = getCallbackParameters(authResult.url);
      if (callback.errorCode || callback.errorMessage) {
        throw new OAuthCallbackError(
          callback.errorMessage ||
            callback.errorCode ||
            "Google Sign-In failed.",
          callback.errorCode || undefined,
        );
      }
      if (callback.accessToken && callback.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (sessionError) throw sessionError;
        return;
      }
      if (callback.code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchangeError) throw exchangeError;
        return;
      }

      throw new Error(
        "Google Sign-In returned neither a session token nor an authorization code.",
      );
    } catch (err: unknown) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleWebSignIn() {
    try {
      setLoading(true);

      // Preserve signup role and department across the OAuth redirect.
      await setPendingGoogleAuth({
        intent,
        role,
        department,
      });

      const redirectTo = getGoogleRedirectUri();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
            hd: "adssu.edu.ph",
          },
        },
      });
      if (error) throw error;
      if (!data.url) {
        throw new Error("Supabase did not return a Google authorization URL.");
      }
    } catch (err: unknown) {
      handleAuthError(err);
      setLoading(false);
    }
  }

  async function handlePress() {
    if (loading || disabled) return;

    if (Platform.OS === "web") {
      await handleWebSignIn();
    } else {
      await handleNativeSignIn();
    }
  }

  const isButtonDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.googleBtn,
        isButtonDisabled && styles.googleBtnDisabled,
        style,
      ]}
      disabled={isButtonDisabled}
      onPress={handlePress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <View style={styles.contentRow}>
          <GoogleLogo />
          <Text style={[styles.googleText, textStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  googleBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: "#FFFFFF",
    minHeight: 50,
  },
  googleBtnDisabled: {
    opacity: 0.65,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  googleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F1F1F",
  },
});
