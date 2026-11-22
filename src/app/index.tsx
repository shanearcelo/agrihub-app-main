import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "../components/BrandLogo";
import { Colors } from "../constants/theme";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.outerGlow}>
        <View style={styles.logoRing}>
          <BrandLogo size={108} />
        </View>
      </View>

      <Text style={styles.tagline}>Presko, Barato, Tatak ADSSU</Text>
      <Text style={styles.subTagline}>Campus Fresh Produce Marketplace</Text>

      {/* Progress Dots + Spinner */}
      <View style={styles.dotsRow}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      <ActivityIndicator
        size="small"
        color={Colors.accent}
        style={{ marginTop: 18 }}
      />
      <Text style={styles.loadingText}>Loading fresh harvests...</Text>

      <Text style={styles.footer}>
        Agusan del Sur State College of Agriculture and Technology
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  outerGlow: {
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  logoRing: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  tagline: { fontSize: 14, fontWeight: "700", color: "#FDE68A", marginTop: 4 },
  subTagline: { fontSize: 12, color: "#D8F3DC", marginTop: 2 },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 22,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    width: 16,
    backgroundColor: Colors.accent,
  },
  loadingText: { fontSize: 11, color: "#A7F3D0", marginTop: 8 },
  footer: {
    position: "absolute",
    bottom: 32,
    fontSize: 11,
    color: "#D8F3DC",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
