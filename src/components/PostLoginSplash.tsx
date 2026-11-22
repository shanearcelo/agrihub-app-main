// src/components/PostLoginSplash.tsx
import { useEffect, useRef } from "react";
import {
    Animated,
    Easing,
    Platform,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Colors } from "../constants/theme";
import { BrandLogo } from "./BrandLogo";

interface PostLoginSplashProps {
  durationMs?: number; // 5000 for login, 10000 for sign up
  subtitle?: string;
  onFinish: () => void;
}

export function PostLoginSplash({
  durationMs = 5000,
  subtitle = "Preparing your marketplace...",
  onFinish,
}: PostLoginSplashProps) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(12)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(16)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fadeOutDuration = 450;
    const fillDuration = Math.max(durationMs - fadeOutDuration, 1000);

    Animated.parallel([
      // 1. Pop-in Logo
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),

      // 2. Slide up "AgriHub" title
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.timing(titleTranslateY, {
            toValue: 0,
            duration: 450,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),

      // 3. Slide up "PRESKO, BARATO, TATAK ADSSU!"
      Animated.sequence([
        Animated.delay(450),
        Animated.parallel([
          Animated.timing(taglineOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(taglineTranslateY, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),

      // 4. Smooth loading bar matching exact duration
      Animated.timing(progressWidth, {
        toValue: 1,
        duration: fillDuration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();

    // 5. Fade out cleanly at the end of durationMs
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: fadeOutDuration,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, fillDuration);

    return () => clearTimeout(timer);
  }, [durationMs]);

  const barWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: screenOpacity }]}>
      {/* Animated Brand Logo */}
      <Animated.View
        style={[
          styles.logoWrapper,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <BrandLogo size={96} />
      </Animated.View>

      {/* Brand Name */}
      <Animated.Text
        style={[
          styles.brandTitle,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        AgriHub
      </Animated.Text>

      {/* Tagline Badge */}
      <Animated.View
        style={[
          styles.taglineBadge,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineTranslateY }],
          },
        ]}
      >
        <Text style={styles.taglineText}>PRESKO, BARATO, TATAK ADSSU!</Text>
      </Animated.View>

      {/* Bottom Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth }]} />
        </View>
        <Text style={styles.loadingText}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99999,
    paddingHorizontal: 24,
  },
  logoWrapper: {
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  taglineBadge: {
    marginTop: 12,
    backgroundColor: "rgba(253, 230, 138, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(253, 230, 138, 0.4)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  taglineText: {
    color: "#FDE68A",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    textAlign: "center",
  },
  progressContainer: {
    position: "absolute",
    bottom: 64,
    alignItems: "center",
    width: "100%",
  },
  progressTrack: {
    width: 210,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FDE68A",
    borderRadius: 4,
  },
  loadingText: {
    color: "#D8F3DC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
    letterSpacing: 0.5,
  },
});
