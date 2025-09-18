import React, { useEffect, useState, useCallback  } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, Pressable, FlatList, ActivityIndicator, TextInput, Alert, RefreshControl, ScrollView } from "react-native";
import { getDistricts, getProjects, postReport } from "./src/api";
import type { Project } from "./src/types";
import { getReports, getSummary } from "./src/api";
import { useFocusEffect } from "@react-navigation/native";
import IllustratedMap from "./src/components/IllustratedMap";
import ProjectsOverview from "./src/screens/ProjectsOverview";
import { useWindowDimensions } from "react-native";
import { Platform, LayoutAnimation } from "react-native";

// --- CHART IMPORTS (robust) ---
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VictoryNative = require("victory-native");
const { VictoryPie, VictoryChart, VictoryBar, VictoryAxis } = VictoryNative;
// Extras that are not always re-exported by victory-native:

const HAS_CHARTS = !!(VictoryPie && VictoryChart && VictoryBar);
if (!HAS_CHARTS) {
  console.warn("[charts] victory-native exports missing", Object.keys(VictoryNative || {}));
}

const API: string = process.env.EXPO_PUBLIC_API_URL || "https://a6f6f929227d.ngrok-free.app";
console.log("Charts API base:", API);

const SECTOR_COLORS = [
  "#1f2937", // slate-800
  "#4b5563", // gray-600
  "#6b7280", // gray-500
  "#9ca3af", // gray-400
  "#d1d5db", // gray-300
  "#111827", // gray-900
];


// optional: shorten long sector labels for legend
function shortLabel(name: string) {
  return name
    .replace("Other/Uncategorized", "Other")
    .replace("Procurement/General", "Procurement")
    .replace("Buildings/Facilities", "Buildings")
    .replace("Water/Sanitation", "Water/San.")
    .replace("Electric/ICT", "ICT");
}

type RootStackParamList = {
  Home: undefined;
  Projects: { district: string };
  ProjectsOverview: { district: string };
  Report: { project?: Project; district: string };
  ReportsFeed: { district: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", marginBottom: 8 }}>Kathmandu Valley</Text>
      <IllustratedMap
        onSelect={(district) => navigation.navigate("Projects", { district })}
      />
    </View>
  );
}


// ⬇️ NEW: types for stats
type SectorRow = { sector: string; count: number };
type TimelineBucket = { period: string; count: number };

export function ProjectsScreen({ route, navigation }: any) {
  const { district } = route.params as { district: string };

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Summary
  const [summary, setSummary] = useState<{
    projects: number;
    reports: number;
    status_breakdown: Record<string, number>;
  } | null>(null);

  // Charts
  const [sector, setSector] = useState<SectorRow[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsCollapsed, setChartsCollapsed] = useState(true); // start collapsed

  const { width: screenWidth } = useWindowDimensions();
  const cardW = Math.min(360, screenWidth - 32);

  // fetch list + summary
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getProjects(district, 20, 0).then(setProjects),
      getSummary(district).then(setSummary),
      // sector stats
      fetch(
        `${process.env.EXPO_PUBLIC_API_BASE}/stats/sector?district=${encodeURIComponent(district)}`
      )
        .then((r) => r.json())
        .then((rows) => setSector(Array.isArray(rows) ? rows : []))
        .finally(() => setChartsLoading(false)),
    ]).finally(() => setLoading(false));
  }, [district]);

  // refresh summary on focus
  useFocusEffect(
    useCallback(() => {
      getSummary(district).then(setSummary).catch(() => {});
    }, [district])
  );

  // derived (kept minimal)
  const bd = summary?.status_breakdown || {};
  const stalled = bd["stalled"] ?? 0;
  const usable = bd["usable"] ?? 0;
  const closed = bd["closed"] ?? 0;
  const unknown = bd["unknown"] ?? 0;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>
        {district} Projects
      </Text>

      {/* Summary widget */}
      <View
        style={{
          backgroundColor: "#f1f5f9",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>
          Summary ({district})
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text>Projects</Text>
          <Text>{summary?.projects ?? "—"}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text>Reports</Text>
          <Text>{summary?.reports ?? "—"}</Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Tag label={`Stalled: ${stalled}`} />
          <Tag label={`Usable: ${usable}`} />
          <Tag label={`Closed: ${closed}`} />
          <Tag label={`Unknown: ${unknown}`} />
        </View>
      </View>

      {/* ==== BY SECTOR CARD (collapsible; unclipped) ==== */}
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          marginBottom: 12,
        }}
      >
        {/* Header row + toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700" }}>
            By Sector {summary?.projects ? `(${summary.projects})` : ""}
          </Text>

          <Pressable
            hitSlop={10}
            onPress={() => {
              if (Platform.OS === "ios")
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setChartsCollapsed((v) => !v);
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: "#f1f5f9",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
          >
            <Text style={{ fontWeight: "600" }}>
              {chartsCollapsed ? "Show charts ▾" : "Hide charts ▴"}
            </Text>
          </Pressable>
        </View>

        {/* Body (only when expanded) */}
        {!chartsCollapsed && (
          <>
            <View
              style={{
                marginTop: 8,
                height: 260,
                justifyContent: "center",
                alignItems: "center",
                overflow: "visible",
              }}
            >
              {!chartsLoading && sector.length > 0 ? (
                <>
                  <VictoryPie
                    data={sector.map((s) => ({ x: s.sector, y: s.count }))}
                    width={cardW - 24}
                    height={220}
                    innerRadius={70}
                    padAngle={1.5}
                    labels={() => ""}
                    colorScale={SECTOR_COLORS}
                  />
                  <Text
                    style={{
                      position: "absolute",
                      textAlign: "center",
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    {summary?.projects ?? ""}
                  </Text>
                </>
              ) : (
                <ActivityIndicator />
              )}
            </View>

            {/* Legend */}
            {!chartsLoading && sector.length > 0 && (
              <View
                style={{
                  marginTop: 6,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {sector.map((s, i) => (
                  <View
                    key={s.sector}
                    style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 6, marginVertical: 4 }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
                        marginRight: 6,
                      }}
                    />
                    <Text style={{ fontSize: 12 }}>
                      {shortLabel(s.sector)}: {s.count}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* View Reports button (with live count) */}
      <Pressable
        onPress={() => navigation.navigate("ReportsFeed", { district })}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: "#eef2ff",
          borderRadius: 8,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
        }}
      >
        <Text style={{ color: "#1e40af", fontWeight: "600" }}>
          View reports for {district}{" "}
          {typeof summary?.reports === "number" ? `(${summary.reports})` : ""}
        </Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("Report", { project: item, district })}
              style={{ padding: 12, backgroundColor: "#f6f6f6", borderRadius: 10 }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600" }}>{item.title}</Text>
              <Text style={{ color: "#555", marginTop: 4 }}>
                {item.agency?.name ?? "—"}
              </Text>
              <Text style={{ color: "#777", marginTop: 2 }}>
                {item.sector ?? "Uncategorized"}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("Report", { project: undefined, district })}
        style={{
          marginTop: 16,
          padding: 14,
          backgroundColor: "#e0f0ff",
          borderRadius: 10,
        }}
      >
        <Text>Report a general issue (no specific project)</Text>
      </Pressable>
    </View>
  );
}

// unchanged
function Tag({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: "#e5e7eb",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 12, color: "#111827" }}>{label}</Text>
    </View>
  );
}


function ReportScreen({ route, navigation }: any) {
  const { project, district } = route.params;
  const [statusFlag, setStatusFlag] = useState<"usable" | "closed" | "stalled" | "unknown">("stalled");
  const [rating, setRating] = useState("2");
  const [text, setText] = useState(project ? `Issue with: ${project.title}` : "");

  const submit = async () => {
    const body = {
      project_id: project?.id ?? null,
      status_flag: statusFlag,
      rating: Number(rating),
      text,
      district,
      ward: "1", // can make dynamic later
      reporter_hash: "devicehash123" // replace with a hashed device id later
    };
    try {
      const r = await postReport(body);
      if (r?.id) {
        Alert.alert("Thank you!", "Report submitted.");
        navigation.popToTop();
      } else {
        Alert.alert("Error", "Could not submit report");
      }
    } catch (e: any) {
      Alert.alert("Error", String(e?.message ?? e));
    }
  };

  const StatusButton = ({ value, label }: any) => (
    <Pressable
      onPress={() => setStatusFlag(value)}
      style={{
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: statusFlag === value ? "#2563eb" : "#ccc",
        backgroundColor: statusFlag === value ? "#dbeafe" : "#fff",
        marginRight: 8
      }}>
      <Text>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>
        {project ? "Report on Project" : "General Report"}
      </Text>
      {project && (
        <Text style={{ color: "#444" }}>
          {project.title}{"\n"}
          {project.agency?.name ?? ""}
        </Text>
      )}

      <Text style={{ marginTop: 8 }}>Status</Text>
      <View style={{ flexDirection: "row" }}>
        <StatusButton value="usable" label="Usable" />
        <StatusButton value="closed" label="Closed" />
        <StatusButton value="stalled" label="Stalled" />
        <StatusButton value="unknown" label="Unknown" />
      </View>

      <Text>Rating (1–5)</Text>
      <TextInput
        keyboardType="number-pad"
        value={rating}
        onChangeText={setRating}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
      />

      <Text>Notes</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, minHeight: 80 }}
      />

      <Pressable
        onPress={submit}
        style={{ marginTop: 8, padding: 14, backgroundColor: "#2563eb", borderRadius: 10 }}>
        <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>Submit</Text>
      </Pressable>
    </View>
  );
}


function ReportsFeedScreen({ route }: any) {
  const { district } = route.params;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [end, setEnd] = useState(false);

  const PAGE = 20;

  const load = useCallback(async (reset = false) => {
    if (end && !reset) return;
    if (reset) {
      setOffset(0);
      setEnd(false);
    }
    const nextOffset = reset ? 0 : offset;
    if (!reset) setLoading(true);
    const data = await getReports({ district, limit: PAGE, offset: nextOffset });
    if (reset) {
      setItems(data);
    } else {
      setItems((prev) => [...prev, ...data]);
    }
    if (data.length < PAGE) setEnd(true);
    setOffset(nextOffset + data.length);
    setLoading(false);
  }, [district, offset, end]);

  useEffect(() => {
    load(true);
  }, [district]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const renderItem = ({ item }: any) => (
    <View style={{ padding: 12, backgroundColor: "#f6f6f6", borderRadius: 10 }}>
      <Text style={{ fontWeight: "700" }}>
        {item.status_flag?.toUpperCase() || "UNKNOWN"} · {item.district}{item.ward ? ` (Ward ${item.ward})` : ""}
      </Text>
      {!!item.text && <Text style={{ marginTop: 4 }}>{item.text}</Text>}
      <Text style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
        {new Date(item.created_at).toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>
        {district} — Reports
      </Text>

      {loading && items.length === 0 ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={renderItem}
          onEndReachedThreshold={0.4}
          onEndReached={() => load(false)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListFooterComponent={() => (
            loading && items.length > 0 ? <ActivityIndicator /> : null
          )}
          ListEmptyComponent={() => (
            <Text style={{ color: "#666" }}>No reports yet.</Text>
          )}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="ProjectsOverview" component={ProjectsOverview} />
        <Stack.Screen name="Report" component={ReportScreen} />
        <Stack.Screen name="ReportsFeed" component={ReportsFeedScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
