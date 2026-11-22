// src/app/_layout.tsx
import type { Session } from "@supabase/supabase-js";
import {
  Stack,
  useLocalSearchParams,
  usePathname,
  useRouter,
  type ErrorBoundaryProps,
} from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AgriHubCopilotModal,
  type AgriHubRole,
} from "../components/AgriHubCopilotModal";
import { PostLoginSplash } from "../components/PostLoginSplash";
import { CartProvider } from "../context/CartContext";
import {
  clearPendingGoogleAuth,
  getPendingGoogleAuth,
  isProfileComplete,
} from "../lib/authHelpers";
import { supabase, supabaseConfigError } from "../lib/supabase";

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const PROFILE_TIMEOUT_MS = 12_000;
const ALLOWED_DOMAIN = "@adssu.edu.ph";

function isAllowedInstitutionalEmail(email?: string | null): boolean {
  const normalized = (email || "").trim().toLowerCase();
  return (
    normalized.endsWith(ALLOWED_DOMAIN) &&
    normalized.length > ALLOWED_DOMAIN.length
  );
}

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

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { editName } = useLocalSearchParams<{ editName?: string }>();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [copilotVisible, setCopilotVisible] = useState(false);
  const [copilotRole, setCopilotRole] = useState<AgriHubRole | null>(null);

  const [splashConfig, setSplashConfig] = useState<{
    durationMs: number;
    subtitle: string;
  } | null>(null);

  const [resolvedRoute, setResolvedRoute] = useState<{
    userId: string | null;
    pathname: string;
  } | null>(null);

  const sessionUserId = useRef<string | null>(null);
  const currentPathnameRef = useRef<string>(pathname);
  currentPathnameRef.current = pathname;

  // Tracks whether the current session still needs its entry splash shown
  const pendingEntrySplashRef = useRef<boolean>(false);
  // Tracks if the user came through Sign Up / Role Select / ID Verification
  const completedVerificationFlowRef = useRef<boolean>(false);

  const hasOAuthCallbackRef = useRef<boolean>(
    Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.location.search.includes("code=") ||
        window.location.hash.includes("access_token=")),
  );

  // Mark as verification/signup flow whenever the user visits these screens
  useEffect(() => {
    if (
      pathname === "/auth/register" ||
      pathname === "/auth/role-select" ||
      pathname === "/auth/verify-id"
    ) {
      completedVerificationFlowRef.current = true;
      pendingEntrySplashRef.current = true;
    }
  }, [pathname]);

  const userId = session?.user.id ?? null;

  const triggerEntrySplash = () => {
    if (!pendingEntrySplashRef.current) return;
    pendingEntrySplashRef.current = false;

    const isFromVerification = completedVerificationFlowRef.current;
    completedVerificationFlowRef.current = false;

    setSplashConfig({
      durationMs: isFromVerification ? 10_000 : 5_000,
      subtitle: isFromVerification
        ? "ID Approved! Setting up your marketplace..."
        : "Preparing your marketplace...",
    });
  };

  useEffect(() => {
    if (supabaseConfigError) return;
    let active = true;
    let receivedAuthEvent = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setTimeout(() => {
        if (!active) return;
        receivedAuthEvent = true;
        const nextUserId = nextSession?.user.id ?? null;
        const userChanged = sessionUserId.current !== nextUserId;
        sessionUserId.current = nextUserId;
        setSession(nextSession);
        setAuthReady(true);

        const isOAuthRedirect = hasOAuthCallbackRef.current;
        if (nextUserId && isOAuthRedirect) {
          hasOAuthCallbackRef.current = false;
        }

        const isPasswordRecovery =
          event === "PASSWORD_RECOVERY" ||
          currentPathnameRef.current === "/auth/reset-password";

        // Queue the splash screen—skip if user is currently resetting their password
        if (
          !isPasswordRecovery &&
          nextUserId &&
          isAllowedInstitutionalEmail(nextSession?.user.email) &&
          ((event === "SIGNED_IN" && userChanged) || isOAuthRedirect)
        ) {
          pendingEntrySplashRef.current = true;
        }

        if (userChanged) setResolvedRoute(null);
      }, 0);
    });

    void withTimeout(
      supabase.auth.getSession(),
      BOOTSTRAP_TIMEOUT_MS,
      "Session bootstrap timed out.",
    )
      .then(({ data, error }) => {
        if (error) throw error;
        if (active && !receivedAuthEvent) {
          const nextUserId = data.session?.user.id ?? null;
          sessionUserId.current = nextUserId;
          setSession(data.session);

          if (
            nextUserId &&
            hasOAuthCallbackRef.current &&
            isAllowedInstitutionalEmail(data.session?.user.email)
          ) {
            hasOAuthCallbackRef.current = false;
            pendingEntrySplashRef.current = true;
          }
        }
      })
      .catch((error: unknown) => {
        console.error("Could not restore the user session.", error);
        if (active && !receivedAuthEvent) {
          sessionUserId.current = null;
          setSession(null);
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      supabaseConfigError ||
      !authReady ||
      (resolvedRoute !== null &&
        resolvedRoute.userId === userId &&
        resolvedRoute.pathname === pathname)
    ) {
      return;
    }
    let active = true;

    void (async () => {
      try {
        if (pathname === "/auth/onboarding") return;
        // Allow user to stay on reset-password screen even after OTP creates a recovery session
        if (pathname === "/auth/reset-password") return;
        if (
          pathname === "/auth/register" &&
          (Array.isArray(editName) ? editName[0] : editName) === "true"
        ) {
          return;
        }

        if (!userId) {
          pendingEntrySplashRef.current = false;
          completedVerificationFlowRef.current = false;
          setCopilotRole(null);

          const isPublicAuthScreen =
            pathname.startsWith("/auth/") &&
            pathname !== "/auth/role-select" &&
            pathname !== "/auth/verify-id";

          if (isPublicAuthScreen) {
            return;
          }

          router.replace(pathname === "/" ? "/auth/onboarding" : "/auth/login");
          return;
        }

        // Enforce @adssu.edu.ph on every active session (including Google OAuth)
        if (!isAllowedInstitutionalEmail(session?.user.email)) {
          setSplashConfig(null);
          pendingEntrySplashRef.current = false;
          await clearPendingGoogleAuth();
          await supabase.auth.signOut();
          const msg =
            "Only official @adssu.edu.ph institutional emails are allowed in ADSSU Marketplace.";
          if (Platform.OS === "web") {
            window.alert(`Institutional Email Required: ${msg}`);
          } else {
            Alert.alert("Institutional Email Required", msg);
          }
          router.replace("/auth/login");
          return;
        }

        let { data: profile, error } = await withTimeout(
          supabase
            .from("profiles")
            .select(
              "role, department, is_registered, full_name, valid_id_url, id_document_url, id_verification_completed, is_suspended",
            )
            .eq("id", userId)
            .maybeSingle(),
          PROFILE_TIMEOUT_MS,
          "Profile bootstrap timed out.",
        );
        if (error) throw error;

        if (profile?.is_suspended) {
          setSplashConfig(null);
          pendingEntrySplashRef.current = false;
          await supabase.auth.signOut();
          const message =
            "This account has been suspended. Contact the campus administrator for assistance.";
          if (Platform.OS === "web") {
            window.alert(`Account Suspended: ${message}`);
          } else {
            Alert.alert("Account Suspended", message);
          }
          router.replace("/auth/login");
          return;
        }

        const pendingAuth = await getPendingGoogleAuth();
        if (
          (!profile || !isProfileComplete(profile)) &&
          pendingAuth.role &&
          pendingAuth.department
        ) {
          completedVerificationFlowRef.current = true;
          try {
            const { error: rpcErr } = await withTimeout(
              supabase.rpc("set_registration_profile", {
                p_role: pendingAuth.role,
                p_full_name:
                  profile?.full_name ||
                  session?.user.user_metadata?.full_name ||
                  session?.user.user_metadata?.name ||
                  "",
                p_department: pendingAuth.department,
              }),
              PROFILE_TIMEOUT_MS,
              "Google profile registration timed out.",
            );
            if (rpcErr) throw rpcErr;
            await clearPendingGoogleAuth();
            const { data: updatedProfile, error: updatedProfileError } =
              await withTimeout(
                supabase
                  .from("profiles")
                  .select(
                    "role, department, is_registered, full_name, valid_id_url, id_document_url, id_verification_completed, is_suspended",
                  )
                  .eq("id", userId)
                  .maybeSingle(),
                PROFILE_TIMEOUT_MS,
                "Updated profile lookup timed out.",
              );
            if (updatedProfileError) throw updatedProfileError;
            if (updatedProfile) {
              profile = updatedProfile;
            }
          } catch (pendingErr) {
            console.warn(
              "Could not apply pending Google registration:",
              pendingErr,
            );
          }
        }

        if (!profile || !isProfileComplete(profile)) {
          // Still needs role selection -> do NOT show splash yet
          completedVerificationFlowRef.current = true;
          if (pathname !== "/auth/role-select") {
            router.replace("/auth/role-select");
          }
        } else if (
          profile.role !== "admin" &&
          (profile.id_verification_completed === false ||
            (profile.role === "seller" &&
              !(profile.valid_id_url || profile.id_document_url)))
        ) {
          // Still needs ID verification -> do NOT show splash yet!
          completedVerificationFlowRef.current = true;
          if (pathname !== "/auth/verify-id") {
            router.replace("/auth/verify-id");
          }
        } else if (profile.role === "admin") {
          setCopilotRole("admin");
          triggerEntrySplash();
          if (!pathname.startsWith("/admin") && pathname !== "/profile/edit") {
            router.replace("/admin");
          }
        } else if (profile.role === "seller") {
          setCopilotRole("seller");
          // Verified & Approved Seller! Play splash now (10s if just verified, 5s if normal login)
          triggerEntrySplash();
          if (
            pathname !== "/seller" &&
            !pathname.startsWith("/seller/") &&
            !pathname.startsWith("/seller-screens/") &&
            !pathname.startsWith("/chat/") &&
            pathname !== "/profile/edit"
          ) {
            router.replace("/seller");
          }
        } else {
          setCopilotRole("buyer");
          // Verified & Approved Buyer! Play splash now (10s if just verified, 5s if normal login)
          triggerEntrySplash();
          const isAllowedBuyerSubroute =
            pathname === "/buyer" ||
            pathname.startsWith("/buyer/") ||
            pathname.startsWith("/buyer-screens/") ||
            pathname === "/checkout" ||
            pathname.startsWith("/harvest/") ||
            pathname.startsWith("/order-success/") ||
            pathname.startsWith("/chat") ||
            pathname.startsWith("/profile");
          if (!isAllowedBuyerSubroute) {
            router.replace("/buyer");
          }
        }
      } catch (error) {
        console.error("Could not resolve the user's app route.", error);
        router.replace("/auth/login");
      } finally {
        if (active) setResolvedRoute({ userId, pathname });
      }
    })();

    return () => {
      active = false;
    };
  }, [authReady, editName, pathname, resolvedRoute, router, session, userId]);

  if (supabaseConfigError) {
    return <StartupErrorScreen message={supabaseConfigError} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <CartProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            animationDuration: 240,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="index" options={{ animation: "fade" }} />
          <Stack.Screen name="buyer" options={{ animation: "fade" }} />
          <Stack.Screen name="seller" options={{ animation: "fade" }} />
          <Stack.Screen name="admin" options={{ animation: "fade" }} />
          <Stack.Screen name="buyer-screens" />
          <Stack.Screen name="seller-screens" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="harvest/[id]" />
          <Stack.Screen name="order-success/[id]" />
          <Stack.Screen name="chat/[orderId]" />
          <Stack.Screen name="profile/edit" />
        </Stack>

        {splashConfig && (
          <PostLoginSplash
            durationMs={splashConfig.durationMs}
            subtitle={splashConfig.subtitle}
            onFinish={() => setSplashConfig(null)}
          />
        )}

        {authReady && userId && pathname !== "/auth/reset-password" ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open AgriHub Copilot"
              onPress={() => setCopilotVisible(true)}
              style={[styles.copilotFab, { bottom: 82 + insets.bottom }]}
            >
              <Text style={styles.copilotFabText}>Help</Text>
            </Pressable>
            <AgriHubCopilotModal
              key={copilotRole || "unknown"}
              visible={copilotVisible}
              onClose={() => setCopilotVisible(false)}
              role={copilotRole}
            />
          </>
        ) : null}
      </CartProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <StartupErrorScreen
      message={error.message || "An unexpected error occurred."}
      onRetry={() => {
        void retry().catch((retryError: unknown) => {
          console.error("Could not retry app startup.", retryError);
        });
      }}
    />
  );
}

function StartupErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>AgriHub couldn’t start</Text>
      <Text selectable style={styles.errorMessage}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  copilotFab: {
    position: "absolute",
    right: 16,
    zIndex: 100,
    elevation: 8,
    minWidth: 64,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: "#1B4332",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  copilotFabText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  errorScreen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    color: "#1B4332",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  errorMessage: {
    color: "#333333",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  retryButton: {
    alignSelf: "center",
    backgroundColor: "#1B4332",
    borderRadius: 8,
    marginTop: 24,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
