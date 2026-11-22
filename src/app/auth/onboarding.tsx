import { useRouter } from "expo-router";
import {
  ArrowRight,
  BadgeCheck,
  Leaf,
  MessageCircle,
  PackageCheck,
  Recycle,
  ShieldCheck,
  Sprout,
  Store,
  Users,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Image,
  LayoutChangeEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type LiveHarvest = {
  id: string;
  title: string;
  price_per_unit: number;
  unit: string;
  available_stock: number;
  listing_type: string;
  image_url: string | null;
};

type SectionKey = "features" | "harvests" | "how" | "community";

const FALLBACK_HARVESTS: LiveHarvest[] = [
  {
    id: "fallback-tomato",
    title: "Fresh Campus Tomatoes",
    price_per_unit: 60,
    unit: "kg",
    available_stock: 18,
    listing_type: "ready_now",
    image_url:
      "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "fallback-pechay",
    title: "Green Pechay",
    price_per_unit: 35,
    unit: "bunch",
    available_stock: 24,
    listing_type: "ready_now",
    image_url:
      "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "fallback-eggs",
    title: "Free-Range Eggs",
    price_per_unit: 180,
    unit: "tray",
    available_stock: 12,
    listing_type: "in_ground_preorder",
    image_url:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "fallback-papaya",
    title: "Sweet Papaya",
    price_per_unit: 45,
    unit: "piece",
    available_stock: 20,
    listing_type: "in_ground_preorder",
    image_url:
      "https://images.unsplash.com/photo-1517282009859-f000ec3b26fe?auto=format&fit=crop&w=600&q=80",
  },
];

const FALLBACK_IMAGES = FALLBACK_HARVESTS.map(
  (harvest) => harvest.image_url,
).filter((url): url is string => Boolean(url));

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [harvests, setHarvests] = useState<LiveHarvest[]>([]);
  const [harvestLoading, setHarvestLoading] = useState(true);
  const [sectionOffsets, setSectionOffsets] = useState<
    Partial<Record<SectionKey, number>>
  >({});

  useEffect(() => {
    let active = true;

    async function loadHarvests() {
      try {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, title, price_per_unit, unit, available_stock, listing_type, image_url",
          )
          .eq("status", "published")
          .gt("available_stock", 0)
          .limit(4);

        if (error) throw error;
        if (active) setHarvests((data || []) as LiveHarvest[]);
      } catch (error) {
        // The public landing page should remain usable even when the preview
        // table is unavailable. Keep the fallback cards visible instead of
        // surfacing a development console overlay to visitors.
        if (__DEV__) {
          console.warn(
            "Live harvest preview unavailable; using fallback harvest cards.",
            error instanceof Error ? error.message : "Unknown Supabase error",
          );
        }
        if (active) setHarvests([]);
      } finally {
        if (active) setHarvestLoading(false);
      }
    }

    void loadHarvests();
    return () => {
      active = false;
    };
  }, []);

  function handleSectionLayout(
    key: SectionKey,
    event: LayoutChangeEvent,
  ) {
    setSectionOffsets((current) => ({
      ...current,
      [key]: event.nativeEvent.layout.y,
    }));
  }

  function scrollToSection(key: SectionKey) {
    const y = sectionOffsets[key];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ x: 0, y: Math.max(0, y - 72), animated: true });
    }
  }

  const displayedHarvests =
    harvestLoading || harvests.length === 0 ? FALLBACK_HARVESTS : harvests;

  const navLinks: { label: string; key: SectionKey }[] = [
    { label: "Features", key: "features" },
    { label: "Live Harvests", key: "harvests" },
    { label: "How It Works", key: "how" },
    { label: "For Farmers & Students", key: "community" },
  ];

  const stickyHeaderStyle: ViewStyle =
    isDesktop && process.env.NODE_ENV !== "test"
      ? ({ position: "sticky", top: 0 } as ViewStyle)
      : {};

  return (
    <View style={styles.page}>
      <View style={[styles.header, stickyHeaderStyle]}>
        <View style={[styles.navContent, isDesktop && styles.navContentDesktop]}>
          <TouchableOpacity
            style={styles.brand}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            accessibilityRole="button"
            accessibilityLabel="AgriHub home"
          >
            <View style={styles.logoBadge}>
              <Sprout size={24} color="#FFF" />
            </View>
            <View>
              <Text style={styles.brandName}>AgriHub</Text>
              <Text style={styles.brandSubtitle}>ADSSU Farm-to-Campus</Text>
            </View>
          </TouchableOpacity>

          {isDesktop ? (
            <View style={styles.navLinks}>
              {navLinks.map((link) => (
                <TouchableOpacity
                  key={link.key}
                  onPress={() => scrollToSection(link.key)}
                  accessibilityRole="button"
                >
                  <Text style={styles.navLinkText}>{link.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={[styles.navActions, !isDesktop && styles.navActionsMobile]}>
            <TouchableOpacity
              style={[
                styles.loginButton,
                !isDesktop && styles.loginButtonMobile,
              ]}
              onPress={() => router.push("/auth/login")}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.loginButtonText,
                  !isDesktop && styles.navButtonTextMobile,
                ]}
              >
                Log In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.startButton,
                !isDesktop && styles.startButtonMobile,
              ]}
              onPress={() => router.push("/auth/register")}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  !isDesktop && styles.navButtonTextMobile,
                ]}
              >
                Get Started
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, isDesktop ? styles.heroDesktop : styles.heroMobile]}>
          <View style={[styles.heroCopy, isDesktop && styles.heroCopyDesktop]}>
            <View style={styles.eyebrow}>
              <Text style={styles.eyebrowText}>🌱 PRESKO, BARATO, TATAK ADSSU!</Text>
            </View>
            <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>
              Fresh Student-Grown Harvests, Straight From Campus Plots to Your Table.
            </Text>
            <Text style={[styles.heroSubtitle, isDesktop && styles.heroSubtitleDesktop]}>
              AgriHub connects ADSSU Agriculture student-farmers directly with dormitory residents and the campus community—eliminating food waste, middlemen, and guesswork.
            </Text>
            <View style={[styles.heroActions, isDesktop && styles.heroActionsDesktop]}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => scrollToSection("harvests")}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>Explore Live Harvests</Text>
                <ArrowRight size={17} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push("/auth/login")}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Log In to Order / Sell</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.heroVisual, isDesktop && styles.heroVisualDesktop]}>
            <Image
              source={require("../../../assets/images/onboarding-1.png")}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityLabel="Fresh ADSSU student-grown harvests"
            />
            <View style={[styles.floatBadge, styles.floatBadgeTop]}>
              <PackageCheck size={16} color={Colors.primary} />
              <Text style={styles.floatBadgeText}>Live Stock Countdowns</Text>
            </View>
            <View style={[styles.floatBadge, styles.floatBadgeLeft]}>
              <Recycle size={16} color={Colors.primary} />
              <Text style={styles.floatBadgeText}>Zero Food Waste</Text>
            </View>
            <View style={[styles.floatBadge, styles.floatBadgeBottom]}>
              <BadgeCheck size={16} color={Colors.primary} />
              <Text style={styles.floatBadgeText}>ADSSU ID Verified</Text>
            </View>
          </View>
        </View>

        <View
          style={styles.sectionWrap}
          onLayout={(event) => handleSectionLayout("harvests", event)}
        >
          <View style={[styles.container, styles.section]}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionEyebrow}>FRESH ON CAMPUS</Text>
                <Text style={styles.sectionTitle}>Live Campus Harvests</Text>
              </View>
              {isDesktop ? (
                <TouchableOpacity
                  style={styles.textButton}
                  onPress={() => router.push("/auth/login")}
                >
                  <Text style={styles.textButtonText}>View all harvests</Text>
                  <ArrowRight size={15} color={Colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View
              style={[
                styles.productGrid,
                isDesktop ? styles.productGridDesktop : styles.productGridMobile,
              ]}
            >
              {displayedHarvests.map((harvest, index) => (
                <View
                  key={harvest.id}
                  style={[
                    styles.productCard,
                    isDesktop && styles.productCardDesktop,
                  ]}
                >
                  <View style={styles.productImageWrap}>
                    {harvest.image_url?.startsWith("http") ? (
                      <Image
                        source={{ uri: harvest.image_url }}
                        style={styles.productImage}
                        resizeMode="cover"
                        accessibilityLabel={harvest.title}
                      />
                    ) : (
                      <Image
                        source={{
                          uri: FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
                        }}
                        style={styles.productImage}
                        resizeMode="cover"
                        accessibilityLabel={harvest.title}
                      />
                    )}
                    <View style={styles.stockBadge}>
                      <View style={styles.stockDot} />
                      <Text style={styles.stockText}>
                        {harvest.available_stock} {harvest.unit} left
                      </Text>
                    </View>
                  </View>
                  <View style={styles.productBody}>
                    <Text style={styles.productTitle} numberOfLines={2}>
                      {harvest.title}
                    </Text>
                    <Text style={styles.productPrice}>
                      ₱{Number(harvest.price_per_unit).toFixed(0)} / {harvest.unit}
                    </Text>
                    <TouchableOpacity
                      style={styles.reserveButton}
                      onPress={() => router.push("/auth/login")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.reserveButtonText}>Log In to Reserve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View
          style={styles.sectionWrapFeature}
          onLayout={(event) => handleSectionLayout("features", event)}
        >
          <View style={[styles.container, styles.section]}>
            <View style={styles.centerHeading}>
              <Text style={styles.sectionEyebrow}>WHY AGRIHUB?</Text>
              <Text style={styles.sectionTitle}>Built for the Campus Community</Text>
              <Text style={styles.sectionSubtitle}>
                Fresh produce, fair pricing, and simple campus transactions.
              </Text>
            </View>

            <View style={[styles.featureGrid, isDesktop ? styles.featureGridDesktop : styles.featureGridMobile]}>
              <FeatureCard
                isDesktop={isDesktop}
                icon={<Leaf size={22} color={Colors.primary} />}
                title="Real-Time Inventory Countdowns"
                description="Live stock updates from student farm plots so buyers immediately see what is freshly harvested today."
              />
              <FeatureCard
                isDesktop={isDesktop}
                icon={<PackageCheck size={22} color={Colors.primary} />}
                title="In-Ground Pre-Orders"
                description="Reserve upcoming crops before harvest day to prevent spoilage and guarantee fair student-farmer income."
              />
              <FeatureCard
                isDesktop={isDesktop}
                icon={<MessageCircle size={22} color={Colors.primary} />}
                title="Campus Pick-Up Notes & Direct Chat"
                description="Clear ADSSU meetup instructions and buyer-to-seller messaging—no need to skip classes for physical stalls."
              />
              <FeatureCard
                isDesktop={isDesktop}
                icon={<ShieldCheck size={22} color={Colors.primary} />}
                title="Student ID Verified & GCash Ready"
                description="Trusted campus-only accounts, admin verification, and instant GCash receipt verification."
              />
            </View>
          </View>
        </View>

        <View
          style={styles.sectionWrap}
          onLayout={(event) => handleSectionLayout("how", event)}
        >
          <View style={[styles.container, styles.section]}>
            <View style={styles.centerHeading}>
              <Text style={styles.sectionEyebrow}>HOW IT WORKS</Text>
              <Text style={styles.sectionTitle}>Simple From Plot to Pick-Up</Text>
            </View>
            <View style={[styles.compareGrid, isDesktop && styles.compareGridDesktop]}>
              <ComparisonCard
                icon={<Users size={22} color="#2563EB" />}
                title="For ADSSU Buyers & Dormers"
                color="#EFF6FF"
                steps={[
                  "Browse live campus harvests & prices.",
                  "Reserve or pre-order & upload GCash receipt.",
                  "Meet at the designated ADSSU campus pick-up spot.",
                ]}
              />
              <ComparisonCard
                icon={<Store size={22} color={Colors.primary} />}
                title="For Agriculture Student-Sellers"
                color="#ECFDF5"
                steps={[
                  "Verify your ADSSU student/unit account.",
                  "Post ready-to-harvest or in-ground crops.",
                  "Fulfill confirmed student orders with zero wasted produce.",
                ]}
              />
            </View>
          </View>
        </View>

        <View
          style={styles.communityWrap}
          onLayout={(event) => handleSectionLayout("community", event)}
        >
          <View style={[styles.container, styles.communityContent]}>
            <View style={styles.communityIcon}>
              <Sprout size={26} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Ready to support ADSSU student-farmers?</Text>
              <Text style={styles.ctaSubtitle}>
                Join AgriHub as a buyer or student-seller.
              </Text>
            </View>
            <View style={[styles.ctaActions, !isDesktop && styles.ctaActionsMobile]}>
              <TouchableOpacity
                style={styles.ctaPrimary}
                onPress={() => router.push("/auth/register")}
              >
                <Text style={styles.ctaPrimaryText}>Sign Up as Buyer or Seller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={() => router.push("/auth/login")}
              >
                <Text style={styles.ctaSecondaryText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.container, styles.footerContent]}>
            <View style={[styles.footerBrand, !isDesktop && styles.footerBrandMobile]}>
              <View style={styles.footerBrandRow}>
                <View style={styles.logoBadgeSmall}>
                  <Sprout size={18} color="#FFF" />
                </View>
                <Text style={styles.footerBrandName}>AgriHub</Text>
              </View>
              <Text style={styles.footerDescription}>
                Agusan del Sur State University — College of Computing and Information Sciences (CCIS)
              </Text>
            </View>
            <View style={styles.footerLinks}>
              {navLinks.map((link) => (
                <TouchableOpacity
                  key={link.key}
                  onPress={() => scrollToSection(link.key)}
                  accessibilityRole="button"
                >
                  <Text style={styles.footerLinkText}>{link.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.container, styles.copyright]}>
            <Text style={styles.copyrightText}>
              © {new Date().getFullYear()} AgriHub. Official Farm-to-Campus Marketplace of ADSSU.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  isDesktop,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  isDesktop: boolean;
}) {
  return (
    <View
      style={[
        styles.featureCard,
        isDesktop && styles.featureCardDesktop,
      ]}
    >
      <View style={styles.featureIcon}>{icon}</View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </View>
  );
}

function ComparisonCard({
  icon,
  title,
  color,
  steps,
}: {
  icon: ReactNode;
  title: string;
  color: string;
  steps: string[];
}) {
  return (
    <View style={[styles.compareCard, { backgroundColor: color }]}>
      <View style={styles.compareHeader}>
        <View style={styles.compareIcon}>{icon}</View>
        <Text style={styles.compareTitle}>{title}</Text>
      </View>
      {steps.map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFF" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    zIndex: 50,
  },
  navContent: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  navContentDesktop: { paddingHorizontal: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9, flexShrink: 1, maxWidth: "58%" },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  brandSubtitle: { color: Colors.textMuted, fontSize: 9, fontWeight: "700", marginTop: 1 },
  navLinks: { flexDirection: "row", alignItems: "center", gap: 22 },
  navLinkText: { color: Colors.text, fontSize: 13, fontWeight: "700" },
  navActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  navActionsMobile: { marginLeft: "auto" },
  loginButtonMobile: { minHeight: 38, paddingHorizontal: 8 },
  startButtonMobile: { minHeight: 38, paddingHorizontal: 8 },
  navButtonTextMobile: { fontSize: 10 },
  loginButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loginButtonText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  startButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  startButtonText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  hero: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  heroDesktop: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 64,
    paddingHorizontal: 24,
    gap: 54,
  },
  heroMobile: { paddingHorizontal: 16, paddingTop: 38, paddingBottom: 44 },
  heroCopy: { width: "100%" },
  heroCopyDesktop: { flex: 1.08 },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  eyebrowText: { color: Colors.primary, fontSize: 11, fontWeight: "900" },
  heroTitle: {
    color: Colors.text,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "900",
    marginTop: 18,
  },
  heroTitleDesktop: { fontSize: 52, lineHeight: 60 },
  heroSubtitle: {
    color: Colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  heroSubtitleDesktop: { fontSize: 18, lineHeight: 28, maxWidth: 620 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  heroActionsDesktop: { flexWrap: "nowrap" },
  primaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  heroVisual: {
    width: "100%",
    height: 300,
    marginTop: 34,
    borderRadius: 24,
    backgroundColor: "#DCFCE7",
    overflow: "visible",
  },
  heroVisualDesktop: { flex: 0.92, height: 430, marginTop: 0 },
  heroImage: { width: "100%", height: "100%", borderRadius: 24 },
  floatBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  floatBadgeText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  floatBadgeTop: { top: 18, right: 12 },
  floatBadgeLeft: { left: -8, top: "48%" },
  floatBadgeBottom: { right: 14, bottom: 16 },
  sectionWrap: { width: "100%", backgroundColor: "#FFF" },
  sectionWrapFeature: { width: "100%", backgroundColor: "#F8FAF9" },
  container: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  section: { paddingHorizontal: 16, paddingVertical: 48 },
  sectionHeadingRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
  },
  sectionEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    marginTop: 5,
  },
  sectionSubtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 8 },
  centerHeading: { alignItems: "center", marginBottom: 24 },
  textButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  textButtonText: { color: Colors.primary, fontSize: 13, fontWeight: "800" },
  productGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productGridDesktop: {},
  productGridMobile: { justifyContent: "space-between" },
  productCard: {
    width: "48%",
    maxWidth: 280,
    flexGrow: 1,
    borderRadius: 16,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  productCardDesktop: { width: "23%", flexGrow: 0, maxWidth: 320 },
  productImageWrap: { height: 150, position: "relative", backgroundColor: Colors.background },
  productImage: { width: "100%", height: "100%" },
  stockBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  stockText: { color: Colors.text, fontSize: 9, fontWeight: "900" },
  productBody: { padding: 12 },
  productTitle: { color: Colors.text, minHeight: 38, fontSize: 14, fontWeight: "900" },
  productPrice: { color: Colors.primary, fontSize: 13, fontWeight: "800", marginTop: 5 },
  reserveButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#EFF7F2",
    marginTop: 10,
  },
  reserveButtonText: { color: Colors.primary, fontSize: 11, fontWeight: "900" },
  featureGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  featureGridDesktop: {},
  featureGridMobile: {},
  featureCard: {
    flexGrow: 1,
    width: "48%",
    minHeight: 210,
    borderRadius: 16,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  featureCardDesktop: { width: "23%", flexGrow: 0 },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 14 },
  featureDescription: { color: Colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  compareGrid: { flexDirection: "column", gap: 12 },
  compareGridDesktop: { flexDirection: "row" },
  compareCard: { flex: 1, borderRadius: 18, padding: 18 },
  compareHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  compareIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  compareTitle: { flex: 1, color: Colors.text, fontSize: 16, fontWeight: "900" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: Colors.primary, fontSize: 12, fontWeight: "900" },
  stepText: { flex: 1, color: Colors.text, fontSize: 13, lineHeight: 20, fontWeight: "700" },
  communityWrap: { width: "100%", backgroundColor: Colors.primary },
  communityContent: {
    minHeight: 220,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 34,
  },
  communityIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: { color: "#FFF", fontSize: 24, lineHeight: 30, fontWeight: "900" },
  ctaSubtitle: { color: "#DCFCE7", fontSize: 13, marginTop: 5 },
  ctaActions: { flexDirection: "row", gap: 9 },
  ctaActionsMobile: { width: "100%", marginTop: 4 },
  ctaPrimary: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
  },
  ctaPrimaryText: { color: Colors.primary, fontSize: 12, fontWeight: "900" },
  ctaSecondary: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FFF",
    paddingHorizontal: 16,
  },
  ctaSecondaryText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  footer: { width: "100%", backgroundColor: "#10281E" },
  footerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 24,
    paddingHorizontal: 16,
    paddingTop: 34,
    paddingBottom: 24,
  },
  footerBrand: { width: "55%", maxWidth: 480 },
  footerBrandMobile: { width: "100%" },
  footerBrandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  logoBadgeSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBrandName: { color: "#FFF", fontSize: 17, fontWeight: "900" },
  footerDescription: { color: "#CDE2D5", fontSize: 12, lineHeight: 18, marginTop: 12 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  footerLinkText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  copyright: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  copyrightText: { color: "#A7C2B4", fontSize: 11, textAlign: "center" },
});
