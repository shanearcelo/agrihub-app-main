// src/app/checkout.tsx
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Copy,
  Lock,
  MapPin,
  Upload,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../constants/theme";
import { useCart } from "../context/CartContext";
import { getCurrentUser } from "../lib/authHelpers";
import { supabase } from "../lib/supabase";
import {
  createImageUploadPath,
  getImageUrl,
  uploadPrivateImageToSupabase,
  type UploadableImageAsset,
} from "../lib/uploadImageToSupabase";

type PaymentMethod = "GCash" | "Cash on Pick-up";

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getValidPickupDates(rawDates: string[]): string[] {
  const todayKey = getLocalDateKey(new Date());
  return rawDates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayKey)
    .sort();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function formatPickupDate(date: string) {
  const todayKey = getLocalDateKey(new Date());
  const label = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return date === todayKey ? `Today • ${label}` : label;
}

function getErrorMessage(
  error: unknown,
  fallback = "Could not place your order.",
): string {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null) {
    const record = error as {
      code?: unknown;
      statusCode?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const code =
      typeof record.code === "string" || typeof record.code === "number"
        ? String(record.code)
        : typeof record.statusCode === "string" ||
            typeof record.statusCode === "number"
          ? String(record.statusCode)
          : "";
    const parts: string[] = [];
    if (typeof record.message === "string" && record.message.trim()) {
      parts.push(
        `${code ? `Supabase error ${code}: ` : ""}${record.message.trim()}`,
      );
    }
    for (const field of ["message", "details", "hint"] as const) {
      if (field === "message") continue;
      const value = record[field];
      if (typeof value === "string") {
        const detail = value.trim();
        if (detail && !parts.includes(detail)) parts.push(detail);
      }
    }
    if (parts.length > 0) return parts.join(" ");
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function schemaErrorNeedsMigration(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return ["42703", "42883", "PGRST202", "PGRST204"].includes(
    String(error.code),
  );
}

type ProductPaymentDetails = {
  methods: PaymentMethod[];
  gcashAccountName: string;
  gcashMobileNumber: string;
  gcashQrUrl: string;
  gcashQrPath: string;
  defaultPickupSpot: string;
  availableDates: string[];
  hadExpiredDatesOnly: boolean;
  pickupVenues: string[];
  pickupTimes: string[];
  availableStock: number;
  exists: boolean;
};

type SellerCheckoutDefaults = {
  seller_id: string;
  preferred_pickup_spot: string | null;
};

export default function CheckoutScreen() {
  const { items: cartItems, clearCart } = useCart();
  const params = useLocalSearchParams<{
    directId?: string;
    directTitle?: string;
    directPrice?: string;
    directUnit?: string;
    directQty?: string;
    directSellerId?: string;
    directSellerName?: string;
  }>();

  const isDirectOrder = Boolean(params.directId);

  const items = useMemo(() => {
    if (isDirectOrder && params.directId) {
      return [
        {
          harvestId: String(params.directId),
          title: String(params.directTitle || "Harvest"),
          pricePerUnit: Number(params.directPrice || 0),
          unit: String(params.directUnit || "kg"),
          quantity: Math.max(1, Number(params.directQty || 1)),
          sellerId: String(params.directSellerId || ""),
          sellerName: String(params.directSellerName || "Seller"),
        },
      ];
    }
    return cartItems;
  }, [
    isDirectOrder,
    params.directId,
    params.directTitle,
    params.directPrice,
    params.directUnit,
    params.directQty,
    params.directSellerId,
    params.directSellerName,
    cartItems,
  ]);

  const totalAmount = useMemo(
    () =>
      items.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0),
    [items],
  );

  const [paymentDetails, setPaymentDetails] = useState<
    Record<string, ProductPaymentDetails>
  >({});
  const [selectedMethods, setSelectedMethods] = useState<
    Record<string, PaymentMethod>
  >({});
  const [selectedPickupDates, setSelectedPickupDates] = useState<
    Record<string, string>
  >({});
  const [selectedPickupVenues, setSelectedPickupVenues] = useState<
    Record<string, string>
  >({});
  const [selectedPickupTimes, setSelectedPickupTimes] = useState<
    Record<string, string>
  >({});
  const [receiptAssets, setReceiptAssets] = useState<
    Record<string, UploadableImageAsset>
  >({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [schemaWarning, setSchemaWarning] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function loadPaymentDetails() {
      setLoadingProducts(true);
      try {
        if (items.length === 0) {
          setPaymentDetails({});
          setSelectedMethods({});
          return;
        }
        let preferredPickupSpot = "";
        const currentUser = await getCurrentUser();
        if (currentUser) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("preferred_pickup_spot")
            .eq("id", currentUser.id)
            .maybeSingle();
          if (profileError) {
            if (!schemaErrorNeedsMigration(profileError)) throw profileError;
            const { error: fallbackError } = await supabase
              .from("profiles")
              .select(
                "id, full_name, role, department, avatar_url, phone_number",
              )
              .eq("id", currentUser.id)
              .maybeSingle();
            if (fallbackError) throw fallbackError;
            setSchemaWarning(true);
          } else {
            preferredPickupSpot = profile?.preferred_pickup_spot || "";
          }
        }
        const { data: products, error } = await supabase
          .from("products")
          .select(
            "id, seller_id, status, available_stock, accepts_gcash, accepts_cash, payment_methods, gcash_account_name, gcash_number, gcash_mobile_number, gcash_qr_url, available_dates, pickup_venues, pickup_times",
          )
          .in(
            "id",
            items.map((item) => item.harvestId),
          );
        if (error) throw error;
        const sellerIds = [
          ...new Set((products || []).map((product) => product.seller_id)),
        ];
        const { data: sellerDefaults, error: defaultsError } =
          sellerIds.length > 0
            ? await supabase.rpc("get_seller_checkout_defaults", {
                p_seller_ids: sellerIds,
              })
            : { data: [], error: null };
        if (defaultsError) {
          if (
            defaultsError.code === "42703" ||
            defaultsError.code === "42883" ||
            defaultsError.code === "PGRST202"
          ) {
            setSchemaWarning(true);
          } else {
            throw defaultsError;
          }
        }
        const defaultsBySellerId = new Map<string, SellerCheckoutDefaults>();
        (sellerDefaults || []).forEach((seller: SellerCheckoutDefaults) => {
          defaultsBySellerId.set(seller.seller_id, seller);
        });
        const productById = new Map(
          (products || []).map((product) => [product.id, product]),
        );
        const results = await Promise.all(
          items.map(async (item) => {
            const data = productById.get(item.harvestId);
            if (!data || data.status !== "published") {
              return [
                item.harvestId,
                {
                  methods: [],
                  gcashAccountName: "",
                  gcashMobileNumber: "",
                  gcashQrUrl: "",
                  gcashQrPath: "",
                  defaultPickupSpot: "",
                  availableDates: [],
                  hadExpiredDatesOnly: false,
                  pickupVenues: [],
                  pickupTimes: [],
                  availableStock: 0,
                  exists: false,
                } satisfies ProductPaymentDetails,
              ] as const;
            }
            const sellerDefaults = defaultsBySellerId.get(data.seller_id);
            const gcashAccountName = String(data.gcash_account_name || "");
            const gcashMobileNumber = String(
              data.gcash_number || data.gcash_mobile_number || "",
            );
            const gcashQrPath = String(data.gcash_qr_url || "");
            let gcashQrUrl = "";
            try {
              gcashQrUrl = (await getImageUrl("gcash-qrs", gcashQrPath)) || "";
            } catch (error) {
              if (!schemaErrorNeedsMigration(error)) throw error;
              setSchemaWarning(true);
            }
            const availablePickupVenues = stringArray(data.pickup_venues);
            const defaultPickupSpot = String(
              sellerDefaults?.preferred_pickup_spot || "",
            );
            if (availablePickupVenues.length === 0 && defaultPickupSpot) {
              availablePickupVenues.push(defaultPickupSpot);
            }
            const methods: PaymentMethod[] = [
              ...(data.accepts_gcash &&
              gcashAccountName &&
              gcashMobileNumber &&
              gcashQrUrl
                ? ["GCash" as const]
                : []),
              ...(data.accepts_cash ? ["Cash on Pick-up" as const] : []),
            ];

            const rawDates = stringArray(data.available_dates);
            const validDates = getValidPickupDates(rawDates);
            const hadExpiredDatesOnly =
              rawDates.length > 0 && validDates.length === 0;

            return [
              item.harvestId,
              {
                methods,
                gcashAccountName,
                gcashMobileNumber,
                gcashQrUrl,
                gcashQrPath,
                defaultPickupSpot,
                availableDates: validDates,
                hadExpiredDatesOnly,
                pickupVenues: availablePickupVenues,
                pickupTimes: stringArray(data.pickup_times),
                availableStock: Number(data.available_stock) || 0,
                exists: true,
              } satisfies ProductPaymentDetails,
            ] as const;
          }),
        );
        if (!active) return;
        const nextDetails = results.reduce<
          Record<string, ProductPaymentDetails>
        >((details, [harvestId, productDetails]) => {
          details[harvestId] = productDetails;
          return details;
        }, {});
        setPaymentDetails(nextDetails);
        setSelectedPickupDates((current) => {
          const next = { ...current };
          for (const [harvestId, detail] of Object.entries(nextDetails)) {
            if (!detail.availableDates.includes(next[harvestId])) {
              next[harvestId] = detail.availableDates[0] || "";
            }
          }
          return next;
        });
        setSelectedPickupVenues((current) => {
          const next = { ...current };
          for (const [harvestId, detail] of Object.entries(nextDetails)) {
            if (!detail.pickupVenues.includes(next[harvestId])) {
              next[harvestId] = detail.pickupVenues.includes(
                detail.defaultPickupSpot,
              )
                ? detail.defaultPickupSpot
                : detail.pickupVenues.includes(preferredPickupSpot)
                  ? preferredPickupSpot
                  : detail.pickupVenues[0] || "";
            }
          }
          return next;
        });
        setSelectedPickupTimes((current) => {
          const next = { ...current };
          for (const [harvestId, detail] of Object.entries(nextDetails)) {
            if (!detail.pickupTimes.includes(next[harvestId])) {
              next[harvestId] = detail.pickupTimes[0] || "";
            }
          }
          return next;
        });
        setSelectedMethods((current) => {
          const next = { ...current };
          for (const [harvestId, detail] of Object.entries(nextDetails)) {
            if (!detail.methods.includes(next[harvestId])) {
              next[harvestId] = detail.methods[0];
            }
          }
          return next;
        });
      } catch (error) {
        if (active) {
          const message = getErrorMessage(
            error,
            "Could not load product payment options.",
          );
          setCheckoutError(message);
          if (Platform.OS === "web") {
            window.alert(`Checkout Unavailable: ${message}`);
          } else {
            Alert.alert("Checkout Unavailable", message);
          }
        }
      } finally {
        if (active) setLoadingProducts(false);
      }
    }
    void loadPaymentDetails();
    return () => {
      active = false;
    };
  }, [items]);

  function showMessage(title: string, msg: string) {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  }

  function showCheckoutError(title: string, error: unknown, fallback?: string) {
    const message = getErrorMessage(error, fallback);
    setCheckoutError(message);
    showMessage(title, message);
  }

  async function handlePlaceOrder() {
    setCheckoutError("");
    if (items.length === 0) {
      return showCheckoutError(
        "Cart Empty",
        "Add a product before placing an order.",
      );
    }
    if (loadingProducts) {
      return showCheckoutError(
        "Please Wait",
        "Loading product payment options.",
      );
    }
    const todayKey = getLocalDateKey(new Date());
    for (const item of items) {
      const details = paymentDetails[item.harvestId];
      const method = selectedMethods[item.harvestId];
      if (!details?.exists || !method || !details.methods.includes(method)) {
        return showCheckoutError(
          "Payment Option Unavailable",
          `${item.title} is unavailable or has no valid payment method. Remove it from your cart or contact the seller.`,
        );
      }
      if (item.quantity > details.availableStock) {
        return showCheckoutError(
          "Stock Changed",
          `${item.title} has only ${details.availableStock} ${item.unit} available. Update your cart and try again.`,
        );
      }
      if (details.availableDates.length === 0) {
        return showCheckoutError(
          "Pick-up Schedule Expired",
          `The seller's scheduled pick-up dates for ${item.title} have passed. Ask the seller to refresh their pick-up dates or remove this item.`,
        );
      }
      if (
        details.pickupVenues.length === 0 ||
        details.pickupTimes.length === 0
      ) {
        return showCheckoutError(
          "Pick-up Options Unavailable",
          `${item.title} is missing a pick-up venue or time configured by the seller.`,
        );
      }
      if (
        !details.pickupVenues.includes(selectedPickupVenues[item.harvestId])
      ) {
        return showCheckoutError(
          "Pick-up Venue Required",
          `Select a valid pick-up venue for ${item.title}.`,
        );
      }
      const chosenDate = selectedPickupDates[item.harvestId];
      if (
        !details.availableDates.includes(chosenDate) ||
        chosenDate < todayKey
      ) {
        return showCheckoutError(
          "Pick-up Date Required",
          `Select a valid upcoming pick-up date for ${item.title}.`,
        );
      }
      if (!details.pickupTimes.includes(selectedPickupTimes[item.harvestId])) {
        return showCheckoutError(
          "Pick-up Time Required",
          `Select a valid pick-up time window for ${item.title}.`,
        );
      }
      if (method === "GCash" && !receiptAssets[item.harvestId]) {
        return showCheckoutError(
          "Receipt Required",
          `Upload a GCash receipt for ${item.title} before placing the order.`,
        );
      }
    }
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error("Please log in first.");
      const receiptPaths: Record<string, string> = {};
      const gcashItems = items.filter(
        (item) => selectedMethods[item.harvestId] === "GCash",
      );
      await Promise.all(
        gcashItems.map(async (item) => {
          const receiptAsset = receiptAssets[item.harvestId];
          if (!receiptAsset) {
            throw new Error(`Select a GCash receipt for ${item.title}.`);
          }
          receiptPaths[item.harvestId] = await uploadPrivateImageToSupabase(
            receiptAsset,
            "payment-receipts",
            createImageUploadPath(
              currentUser.id,
              receiptAsset.mimeType,
              item.harvestId,
            ),
          );
        }),
      );
      type CheckoutGroup = {
        seller_id: string;
        payment_method: "gcash" | "cash";
        pickup_date: string;
        pickup_venue: string;
        pickup_point: string;
        pickup_time: string;
        pickup_time_window: string;
        items: {
          product_id: string;
          quantity: number;
          receipt_path: string | null;
        }[];
      };
      const orderGroups = new Map<string, CheckoutGroup>();
      for (const item of items) {
        const method = selectedMethods[item.harvestId];
        if (!item.sellerId) {
          throw new Error(`Could not identify the seller for ${item.title}.`);
        }
        const paymentMethod = method === "GCash" ? "gcash" : "cash";
        const pickupDate = selectedPickupDates[item.harvestId] || "";
        const pickupVenue = selectedPickupVenues[item.harvestId] || "";
        const pickupTime = selectedPickupTimes[item.harvestId] || "";
        const groupKey = `${item.sellerId}:${paymentMethod}:${pickupDate}:${pickupVenue}:${pickupTime}`;
        const group: CheckoutGroup = orderGroups.get(groupKey) || {
          seller_id: item.sellerId,
          payment_method: paymentMethod,
          pickup_date: pickupDate,
          pickup_venue: pickupVenue,
          pickup_point: pickupVenue,
          pickup_time: pickupTime,
          pickup_time_window: pickupTime,
          items: [],
        };
        group.items.push({
          product_id: item.harvestId,
          quantity: item.quantity,
          receipt_path:
            paymentMethod === "gcash" ? receiptPaths[item.harvestId] : null,
        });
        orderGroups.set(groupKey, group);
      }
      const { data: createdOrders, error } = await supabase.rpc(
        "place_orders",
        {
          p_orders: [...orderGroups.values()],
        },
      );
      if (error) throw error;
      const orderReferences = Array.isArray(createdOrders)
        ? createdOrders.filter(
            (order): order is { id: string; order_code: string } =>
              typeof order?.id === "string" &&
              typeof order?.order_code === "string",
          )
        : [];
      if (orderReferences.length === 0) {
        throw new Error(
          "The orders were created but no order references were returned.",
        );
      }
      if (!isDirectOrder) {
        clearCart();
      }
      router.replace({
        pathname: "/order-success/[id]",
        params: {
          id: orderReferences[0].order_code,
          orders: JSON.stringify(orderReferences),
        },
      });
    } catch (error: unknown) {
      console.error("Could not place buyer order.", error);
      showCheckoutError("Order Failed", error);
    } finally {
      setLoading(false);
    }
  }

  async function pickReceipt(harvestId: string) {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return showCheckoutError(
          "Photo Access Needed",
          "Allow photo library access to upload your GCash receipt.",
        );
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        setCheckoutError("");
        setReceiptAssets((current) => ({
          ...current,
          [harvestId]: result.assets[0],
        }));
      }
    } catch (error) {
      console.error("Could not select the GCash receipt image.", error);
      showCheckoutError(
        "Image Selection Failed",
        error,
        "Could not select the receipt image.",
      );
    }
  }

  async function copyNumber(number: string) {
    try {
      await Clipboard.setStringAsync(number, {
        android: { isSensitive: true },
      });
      showMessage("Copied", "GCash number copied to clipboard.");
    } catch (error) {
      showCheckoutError(
        "Copy Failed",
        error,
        "Could not copy the GCash number.",
      );
    }
  }

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSub}>
            {isDirectOrder
              ? "Direct Order • Pick-up & payment"
              : "Step 2 of 2 • Pick-up & payment"}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {schemaWarning ? (
          <Text style={styles.schemaWarning} accessibilityRole="alert">
            Some seller payment settings are unavailable. Run
            supabase/migrations/20261118000000_seller_portal_settings.sql, then
            reload checkout.
          </Text>
        ) : null}
        {checkoutError ? (
          <Text style={styles.checkoutError} accessibilityRole="alert">
            {checkoutError}
          </Text>
        ) : null}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {isDirectOrder
              ? "Pick-up & Payment Details"
              : "Pick-up & Payment per Product"}
          </Text>
        </View>
        {loadingProducts ? (
          <Text style={styles.loadingText}>
            Loading seller pick-up & payment options…
          </Text>
        ) : items.length === 0 ? (
          <Text style={styles.emptyCheckout}>
            Your cart is empty. Add a harvest before checking out.
          </Text>
        ) : (
          items.map((item) => {
            const details = paymentDetails[item.harvestId];
            const selectedMethod = selectedMethods[item.harvestId];
            const selectedVenue = selectedPickupVenues[item.harvestId];
            const selectedDate = selectedPickupDates[item.harvestId];
            const selectedTime = selectedPickupTimes[item.harvestId];
            const receiptUri = receiptAssets[item.harvestId]?.uri;
            return (
              <View key={item.harvestId} style={styles.paymentProductCard}>
                <View style={styles.productHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{item.title}</Text>
                    <Text style={styles.optionSub}>
                      {item.sellerName} • {item.quantity} × ₱
                      {item.pricePerUnit.toFixed(2)} = ₱
                      {(item.pricePerUnit * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                </View>
                {!details?.exists ? (
                  <Text style={styles.paymentError}>
                    This listing is no longer available.
                  </Text>
                ) : (
                  <>
                    {/* Pick-up Venue */}
                    {details.pickupVenues.length > 0 && (
                      <View style={styles.pickupBlock}>
                        <View style={styles.subLabelRow}>
                          <MapPin size={13} color={Colors.primary} />
                          <Text style={styles.subLabel}>Pick-up Venue</Text>
                        </View>
                        <View style={styles.paymentMethodList}>
                          {details.pickupVenues.map((venue) => {
                            const active = selectedVenue === venue;
                            return (
                              <TouchableOpacity
                                key={venue}
                                style={[
                                  styles.methodOption,
                                  active && styles.optionActive,
                                ]}
                                onPress={() =>
                                  setSelectedPickupVenues((current) => ({
                                    ...current,
                                    [item.harvestId]: venue,
                                  }))
                                }
                              >
                                <View
                                  style={[
                                    styles.radio,
                                    active && styles.radioActive,
                                  ]}
                                >
                                  {active && <View style={styles.radioDot} />}
                                </View>
                                <Text style={styles.optionTitle}>{venue}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                    {/* Pick-up Date */}
                    {details.availableDates.length > 0 ? (
                      <View style={styles.pickupBlock}>
                        <View style={styles.subLabelRow}>
                          <Calendar size={13} color={Colors.primary} />
                          <Text style={styles.subLabel}>Pick-up Date</Text>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {details.availableDates.map((date) => {
                            const active = selectedDate === date;
                            return (
                              <TouchableOpacity
                                key={date}
                                style={[
                                  styles.timeChip,
                                  active && styles.timeChipActive,
                                ]}
                                onPress={() =>
                                  setSelectedPickupDates((current) => ({
                                    ...current,
                                    [item.harvestId]: date,
                                  }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.timeText,
                                    active && { color: "#FFF" },
                                  ]}
                                >
                                  {formatPickupDate(date)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : (
                      <Text style={styles.paymentError}>
                        {details.hadExpiredDatesOnly
                          ? "The seller's scheduled pick-up dates have expired. Ask the seller to refresh their pick-up dates before ordering."
                          : "The seller has not set any pick-up dates for this listing."}
                      </Text>
                    )}
                    {/* Pick-up Time Window */}
                    {details.pickupTimes.length > 0 && (
                      <View style={styles.pickupBlock}>
                        <Text style={styles.subLabel}>Pick-up Time</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {details.pickupTimes.map((time) => {
                            const active = selectedTime === time;
                            return (
                              <TouchableOpacity
                                key={time}
                                style={[
                                  styles.timeChip,
                                  active && styles.timeChipActive,
                                ]}
                                onPress={() =>
                                  setSelectedPickupTimes((current) => ({
                                    ...current,
                                    [item.harvestId]: time,
                                  }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.timeText,
                                    active && { color: "#FFF" },
                                  ]}
                                >
                                  {time}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                    {/* Payment Methods */}
                    {details.methods.length === 0 ? (
                      <Text style={styles.paymentError}>
                        The seller has not configured a valid payment method for
                        this listing.
                      </Text>
                    ) : (
                      <>
                        <Text style={[styles.subLabel, { marginTop: 10 }]}>
                          Payment Method
                        </Text>
                        <View style={styles.paymentMethodList}>
                          {details.methods.map((method) => {
                            const active = selectedMethod === method;
                            return (
                              <TouchableOpacity
                                key={method}
                                style={[
                                  styles.methodOption,
                                  active && styles.optionActive,
                                ]}
                                onPress={() =>
                                  setSelectedMethods((current) => ({
                                    ...current,
                                    [item.harvestId]: method,
                                  }))
                                }
                              >
                                <View
                                  style={[
                                    styles.radio,
                                    active && styles.radioActive,
                                  ]}
                                >
                                  {active && <View style={styles.radioDot} />}
                                </View>
                                <Text style={styles.optionTitle}>{method}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {selectedMethod === "GCash" && (
                          <View style={styles.gcashDetails}>
                            <Text style={styles.gcashTitle}>
                              Pay ₱
                              {(item.pricePerUnit * item.quantity).toFixed(2)}{" "}
                              to
                            </Text>
                            <Text style={styles.gcashName}>
                              {details.gcashAccountName}
                            </Text>
                            <View style={styles.numberRow}>
                              <Text style={styles.gcashNumber}>
                                {details.gcashMobileNumber}
                              </Text>
                              <TouchableOpacity
                                style={styles.copyButton}
                                onPress={() =>
                                  copyNumber(details.gcashMobileNumber)
                                }
                              >
                                <Copy size={14} color={Colors.primary} />
                                <Text style={styles.copyText}>Copy Number</Text>
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{ uri: details.gcashQrUrl }}
                              style={styles.sellerQr}
                              accessibilityLabel="Seller GCash QR code"
                            />
                            <Text style={styles.receiptLabel}>
                              Upload GCash Receipt *
                            </Text>
                            <TouchableOpacity
                              style={styles.uploadButton}
                              onPress={() => pickReceipt(item.harvestId)}
                            >
                              <Upload size={15} color={Colors.primary} />
                              <Text style={styles.uploadText}>
                                {receiptUri
                                  ? "Change Receipt"
                                  : "Select Receipt"}
                              </Text>
                            </TouchableOpacity>
                            {receiptUri ? (
                              <Image
                                source={{ uri: receiptUri }}
                                style={styles.receiptPreview}
                                accessibilityLabel="Selected GCash receipt preview"
                              />
                            ) : (
                              <Text style={styles.receiptRequired}>
                                A receipt is required to place this GCash order.
                              </Text>
                            )}
                          </View>
                        )}
                        {selectedMethod === "Cash on Pick-up" && (
                          <Text style={styles.cashNote}>
                            Pay the seller when you pick up this product.
                          </Text>
                        )}
                      </>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}
        {/* Payment Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.sumRow}>
            <Text style={styles.sumLbl}>Items ({items.length})</Text>
            <Text style={styles.sumVal}>₱{totalAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLbl}>Payment fees</Text>
            <Text style={styles.sumVal}>₱0.00</Text>
          </View>
          <View style={[styles.sumRow, styles.totalRow]}>
            <Text style={styles.totalLbl}>Total to pay</Text>
            <Text style={styles.totalVal}>₱{totalAmount.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>
      {/* Bottom Place Order Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.placeBtn,
            (items.length === 0 || loadingProducts) && { opacity: 0.5 },
          ]}
          onPress={handlePlaceOrder}
          disabled={loading || loadingProducts || items.length === 0}
        >
          <Lock size={16} color="#FFF" />
          <Text style={styles.placeText}>
            {loading
              ? "Placing Order..."
              : loadingProducts
                ? "Loading Checkout Options..."
                : items.length === 0
                  ? "Cart Empty"
                  : `Place Order • ₱${totalAmount.toFixed(2)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 52 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
  },
  schemaWarning: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 17,
  },
  checkoutError: {
    color: "#991B1B",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
  },
  emptyCheckout: {
    color: Colors.textMuted,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  pickupBlock: {
    marginBottom: 12,
  },
  subLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: "#F0FDF4" },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  optionTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  optionSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  loadingText: {
    fontSize: 12,
    color: Colors.textMuted,
    padding: 14,
    backgroundColor: "#FFF",
    borderRadius: 12,
  },
  paymentProductCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  paymentMethodList: { gap: 8 },
  methodOption: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
  },
  paymentError: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  gcashDetails: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  gcashTitle: { fontSize: 12, color: Colors.textMuted, fontWeight: "700" },
  gcashName: {
    marginTop: 4,
    fontSize: 16,
    color: Colors.text,
    fontWeight: "800",
    textAlign: "center",
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  gcashNumber: { fontSize: 16, color: Colors.text, fontWeight: "800" },
  copyButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
  },
  copyText: { fontSize: 11, fontWeight: "800", color: Colors.primary },
  sellerQr: {
    width: 190,
    height: 190,
    marginTop: 12,
    backgroundColor: "#FFF",
    borderRadius: 10,
    resizeMode: "contain",
  },
  receiptLabel: {
    alignSelf: "flex-start",
    marginTop: 14,
    marginBottom: 6,
    fontSize: 12,
    color: Colors.text,
    fontWeight: "800",
  },
  uploadButton: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
    backgroundColor: "#FFF",
  },
  uploadText: { color: Colors.primary, fontSize: 12, fontWeight: "800" },
  receiptPreview: {
    width: "100%",
    height: 180,
    marginTop: 10,
    borderRadius: 10,
    resizeMode: "contain",
    backgroundColor: "#FFF",
  },
  receiptRequired: {
    alignSelf: "flex-start",
    color: Colors.danger,
    fontSize: 11,
    marginTop: 6,
  },
  cashNote: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: Colors.background,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  summaryCard: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 10,
  },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  sumLbl: { fontSize: 12, color: Colors.textMuted },
  sumVal: { fontSize: 12, fontWeight: "700", color: Colors.text },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
    paddingTop: 8,
  },
  totalLbl: { fontSize: 15, fontWeight: "800", color: Colors.text },
  totalVal: { fontSize: 17, fontWeight: "800", color: Colors.primary },
  footer: {
    padding: 14,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  placeBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 14,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  placeText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
});
