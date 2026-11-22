// src/app/buyer-screens/map.tsx
import { useRouter } from "expo-router";
import { ArrowLeft, Clock, MapPin } from "lucide-react-native";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../../constants/theme";

export default function CampusMapScreen() {
  const router = useRouter();
  const stalls = [
    {
      name: "Agriculture Dept Stalls #1–4",
      loc: "Near Main Gate 2 • 120m away",
      hours: "7:00 AM – 5:30 PM",
      status: "Open Now",
    },
    {
      name: "Fisheries Unit Booth",
      loc: "Aquaculture Demo Pond • 280m away",
      hours: "7:00 AM – 12:00 PM",
      status: "Open Now",
    },
    {
      name: "CEIS Lobby Pick-up Point",
      loc: "Ground Floor, CCIS Bldg • 350m away",
      hours: "8:00 AM – 5:00 PM",
      status: "Pre-Order Hub",
    },
    {
      name: "TBI Incubator Office",
      loc: "Admin Building, 2nd Floor • 450m away",
      hours: "8:00 AM – 5:00 PM",
      status: "Open Now",
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 18, paddingTop: 52 }}
    >
      <View style={styles.top}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push("/buyer");
          }}
        >
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Campus Pick-up Points</Text>
      </View>

      {stalls.map((s, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.rowBetween}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <MapPin size={16} color={Colors.primary} />
              <Text style={styles.name}>{s.name}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{s.status}</Text>
            </View>
          </View>
          <Text style={styles.loc}>{s.loc}</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 6,
            }}
          >
            <Clock size={12} color={Colors.textMuted} />
            <Text style={styles.hours}>{s.hours}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "800" },
  card: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 14, fontWeight: "800" },
  pill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pillText: { fontSize: 10, fontWeight: "700", color: Colors.primary },
  loc: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  hours: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});
