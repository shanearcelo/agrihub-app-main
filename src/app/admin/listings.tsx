import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Package, Search, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type Listing = {
  id: string;
  seller_id: string;
  title: string;
  price_per_unit: number;
  unit: string;
  available_stock: number;
  listing_type: string;
  status: string;
  image_url: string | null;
  seller_name: string;
  seller?: { full_name: string | null; store_name: string | null };
};

const LISTING_FILTERS = ["All", "published", "hidden", "draft", "paused"] as const;
type ListingFilter = (typeof LISTING_FILTERS)[number];

export default function AdminListingsScreen() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<ListingFilter>("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const loadListings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      let data: {
        id: string;
        seller_id: string;
        title: string;
        price_per_unit: number;
        unit: string;
        available_stock: number;
        listing_type: string;
        status: string;
        image_url: string | null;
        seller_name: string;
      }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase
          .from("products")
          .select(
            "id, seller_id, title, price_per_unit, unit, available_stock, listing_type, status, image_url, seller_name",
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        data = data.concat(page || []);
        if ((page || []).length < 1000) break;
      }
      const sellerIds = [...new Set(data.map((item) => item.seller_id))];
      const { data: sellers, error: sellerError } = sellerIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, store_name")
            .in("id", sellerIds)
        : { data: [], error: null };
      if (sellerError) throw sellerError;
      const sellerMap = new Map((sellers || []).map((seller) => [seller.id, seller]));
      setListings(
        data.map((item) => ({
          ...item,
          seller: sellerMap.get(item.seller_id),
        })) as Listing[],
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load listings.",
      );
      console.error("Could not load admin listings.", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadListings();
    }, [loadListings]),
  );

  const visibleListings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesStatus = filter === "All" || item.status === filter;
      const sellerName =
        item.seller?.store_name || item.seller?.full_name || item.seller_name;
      return (
        matchesStatus &&
        (!query ||
          item.title.toLowerCase().includes(query) ||
          String(sellerName || "").toLowerCase().includes(query))
      );
    });
  }, [filter, listings, search]);

  async function setListingStatus(item: Listing, status: string) {
    setBusyId(item.id);
    setErrorMessage("");
    try {
      const { error } = await supabase
        .from("products")
        .update({ status })
        .eq("id", item.id);
      if (error) throw error;
      setListings((current) =>
        current.map((listing) =>
          listing.id === item.id ? { ...listing, status } : listing,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update listing.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteListing(item: Listing) {
    setBusyId(item.id);
    setErrorMessage("");
    try {
      const { error } = await supabase.from("products").delete().eq("id", item.id);
      if (error) throw error;
      setListings((current) => current.filter((listing) => listing.id !== item.id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete listing.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(item: Listing) {
    const message = `Permanently delete "${item.title}"?`;
    const action = () => void deleteListing(item);
    if (Platform.OS === "web") {
      if (window.confirm(message)) action();
    } else {
      Alert.alert("Delete listing", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: action },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.push("/admin")}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Listing Moderation</Text>
          <Text style={styles.subtitle}>Review, hide, or remove marketplace listings</Text>
        </View>
      </View>
      <View style={styles.search}>
        <Search size={16} color={Colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search title or seller"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {LISTING_FILTERS.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filter, filter === item && styles.filterActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item === "All" ? item : item.replace("_", " ")}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.muted}>No listings found.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const sellerName =
            item.seller?.store_name || item.seller?.full_name || item.seller_name || "Unknown seller";
          return (
            <View style={styles.card}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imageFallback]}>
                  <Package size={22} color={Colors.primary} />
                </View>
              )}
              <View style={styles.content}>
                <View style={styles.cardHeading}>
                  <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.status}>{item.status.replace("_", " ").toUpperCase()}</Text>
                </View>
                <Text style={styles.meta}>{sellerName}</Text>
                <Text style={styles.meta}>
                  ₱{Number(item.price_per_unit || 0).toLocaleString()} / {item.unit} ·{" "}
                  {Number(item.available_stock || 0).toLocaleString()} available
                </Text>
                <Text style={styles.meta}>
                  Type: {item.listing_type.replace(/_/g, " ")}
                </Text>
                <View style={styles.actions}>
                  {item.status === "hidden" ? (
                    <TouchableOpacity
                      style={styles.action}
                      disabled={busyId === item.id}
                      onPress={() => void setListingStatus(item, "published")}
                    >
                      <Text style={styles.actionText}>Republish</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.action}
                      disabled={busyId === item.id}
                      onPress={() => void setListingStatus(item, "hidden")}
                    >
                      <Text style={styles.actionText}>Unpublish / Hide</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.action, styles.deleteAction]}
                    disabled={busyId === item.id}
                    onPress={() => confirmDelete(item)}
                  >
                    <Trash2 size={14} color={Colors.danger} />
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 11 },
  search: { height: 44, marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 12 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filter: { paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#FFF", borderColor: Colors.border, borderWidth: 1, borderRadius: 20 },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 11, color: Colors.text, fontWeight: "700", textTransform: "capitalize" },
  filterTextActive: { color: "#FFF" },
  list: { padding: 16, paddingTop: 0, paddingBottom: 96, gap: 10 },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12 },
  image: { width: 78, height: 78, borderRadius: 10, backgroundColor: Colors.background },
  imageFallback: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, gap: 4 },
  cardHeading: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  listingTitle: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "800" },
  status: { color: Colors.primary, fontSize: 9, fontWeight: "800" },
  meta: { color: Colors.textMuted, fontSize: 10 },
  actions: { flexDirection: "row", gap: 8, marginTop: 5 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 8, backgroundColor: "#DCFCE7" },
  actionText: { color: Colors.primary, fontSize: 10, fontWeight: "800" },
  deleteAction: { backgroundColor: "#FEF2F2" },
  deleteText: { color: Colors.danger, fontSize: 10, fontWeight: "800" },
  empty: { padding: 32, alignItems: "center" },
  muted: { color: Colors.textMuted, fontSize: 11 },
  error: { marginHorizontal: 16, color: Colors.danger, fontSize: 12 },
});
