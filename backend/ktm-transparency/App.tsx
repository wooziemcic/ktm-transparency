import React, { useEffect, useState, useCallback  } from "react";
import { NavigationContainer, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, Pressable, FlatList, ActivityIndicator, TextInput, Alert, RefreshControl, ScrollView, Dimensions, StyleSheet, Image, TouchableOpacity, Linking } from "react-native";
import { getDistricts, getProjects, postReport } from "./src/api";
import type { Project } from "./src/types";
import { getReports, getSummary } from "./src/api";
import { useFocusEffect } from "@react-navigation/native";
import IllustratedMap from "./src/components/IllustratedMap";
import ProjectsOverview from "./src/screens/ProjectsOverview";
import { useWindowDimensions } from "react-native";
import { Platform, LayoutAnimation } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import "react-native-gesture-handler";
import NewsFeedScreen from "./src/screens/NewsFeed";
import { useNavigation } from "@react-navigation/native";





// --- CHART IMPORTS (robust) ---
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VictoryNative = require("victory-native");
const { VictoryPie, VictoryChart, VictoryBar, VictoryAxis } = VictoryNative;
// Extras that are not always re-exported by victory-native:

const HAS_CHARTS = !!(VictoryPie && VictoryChart && VictoryBar);
if (!HAS_CHARTS) {
  console.warn("[charts] victory-native exports missing", Object.keys(VictoryNative || {}));
}

const API: string = process.env.EXPO_PUBLIC_API_URL || "https://2b57b11487d1.ngrok-free.app";
console.log("Charts API base:", API);

const SECTOR_COLORS = [
  "#1f2937", // slate-800
  "#4b5563", // gray-600
  "#6b7280", // gray-500
  "#9ca3af", // gray-400
  "#d1d5db", // gray-300
  "#111827", // gray-900
];

type Summary = {
  projects: number;
  reports: number;
  status_breakdown: Record<string, number>;
};

const cardW = Dimensions.get("window").width - 32;


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
  NewsFeed: { area: "valley" | "kathmandu" | "lalitpur" | "bhaktapur" };
  ValleyNews: { district?: DistrictKey } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type DistrictKey = "Kathmandu" | "Bhaktapur" | "Lalitpur";
type Article = { title: string; url: string; source?: string; publishedAt?: string };


// ---------------- Kathmandu Post scrapers ----------------
type Headline = { title: string; link: string };

const KP_ORIGIN = "https://kathmandupost.com";


// Dumb, fast HTML text helpers (no extra libs)
const stripTags = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Scrape a KP section page ("/valley" or "/valley/kathmandu" etc.)
async function fetchKPSection(sectionPath: string): Promise<Headline[]> {
  try {
    const res = await fetch(`${KP_ORIGIN}${sectionPath}`);
    const html = await res.text();

    // 1) Prefer <a ... href="/valley/...">Title</a> blocks inside <article> or <h3> clusters
    const links = new Set<string>();
    const results: Headline[] = [];

    // Grab anchor tags that link into the requested section
    const aRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = aRe.exec(html))) {
      const href = m[1];
      const raw = m[2];

      // Only keep links that remain inside the requested section (and are article-ish)
      if (!href.startsWith("/") || href.includes("/video") || href.includes("/gallery")) continue;
      if (!href.startsWith(sectionPath)) continue;

      const title = decodeEntities(stripTags(raw));
      if (title.length < 10) continue; // skip tiny/utility links

      const absolute = `${KP_ORIGIN}${href}`;
      if (!links.has(absolute)) {
        links.add(absolute);
        results.push({ title, link: absolute });
      }
    }

    // Keep the first 30 to be safe
    return results.slice(0, 30);
  } catch {
    return [];
  }
}

// Convenience wrappers
const fetchValleyHeadlines = () => fetchKPSection("/valley");
const fetchDistrictHeadlines = (d: "Kathmandu" | "Bhaktapur" | "Lalitpur") =>
  fetchKPSection(`/valley/${d.toLowerCase()}`);

// Simple helper to filter by district keyword
function filterByDistrict(list: Headline[], district: "Kathmandu"|"Bhaktapur"|"Lalitpur") {
  const key = district.toLowerCase();
  return list.filter(h =>
    h.title.toLowerCase().includes(key) || h.link.toLowerCase().includes(key)
  );
}

function StoryBubble({
  label,
  onPress,
  active,
}: {
  label: "Kathmandu" | "Bhaktapur" | "Lalitpur";
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: "center", marginRight: 14 }}>
      <View
        style={{
          width: 70,
          height: 70,
          borderRadius: 35,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#fff",
          borderWidth: 3,
          borderColor: active ? "#0a84ff" : "#e5e7eb",
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        <Text style={{ fontWeight: "700" }}>{label[0]}</Text>
      </View>
      <Text style={{ marginTop: 6, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ValleyNews({ route }: any) {
  const headlines: Headline[] = route.params?.headlines ?? [];
  const title: string = route.params?.title ?? "Valley News";
  React.useLayoutEffect(() => {
    // If you want to set the header title from params:
    // navigation.setOptions?.({ title });
  }, [title]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16 }}>
      {headlines.length === 0 ? (
        <Text>No headlines found.</Text>
      ) : (
        headlines.map(h => (
          <Pressable key={h.link} onPress={() => Linking.openURL(h.link)} style={{
            padding: 14, borderRadius: 12, backgroundColor: "#f8fafc",
            borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 10
          }}>
            <Text style={{ fontSize: 16, lineHeight: 22 }}>{h.title}</Text>
            <Text style={{ color: "#64748b", marginTop: 6 }} numberOfLines={1}>{h.link}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}


function HomeScreen({ navigation }: any) {
  const [headlines, setHeadlines] = React.useState<Headline[]>([]);
  const [loadingNews, setLoadingNews] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingNews(true);
      const data = await fetchValleyHeadlines();
      if (mounted) setHeadlines(data);
      setLoadingNews(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const openNewsList = (items: Headline[], title = "Valley News") => {
    navigation.navigate("NewsFeed", { headlines: items, title });
  };

  const openDistrictNews = async (
    district: "Kathmandu" | "Bhaktapur" | "Lalitpur"
  ) => {
    const items = await fetchDistrictHeadlines(district);
    openNewsList(items, `${district} News`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      {/* Story bubbles — tap opens district news list */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: 16, paddingTop: 8 }}
        contentContainerStyle={{ paddingVertical: 10, gap: 18 }}
      >
        {(["Kathmandu", "Bhaktapur", "Lalitpur"] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => openDistrictNews(d)}
            style={{ width: 84, alignItems: "center" }}
          >
            <View
              style={{
                width: 74,
                height: 74,
                borderRadius: 37,
                borderWidth: 3,
                borderColor: "#3b82f6",
                backgroundColor: "#fff",
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Text
                style={{ fontWeight: "800", fontSize: 22, color: "#111827" }}
              >
                {d[0]}
              </Text>
            </View>
            <Text style={{ marginTop: 6, fontSize: 14 }}>{d}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Map card (unchanged navigation to Projects) */}
      <View
        style={{
          margin: 16,
          borderRadius: 16,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#eef2f7",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          padding: 14,
        }}
      >
        <IllustratedMap
          onSelect={(district) =>
            navigation.navigate("Projects", { district })
          }
        />
      </View>

      {/* News header */}
      <View
        style={{
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: "800" }}>
          Latest Valley News
        </Text>
        <Pressable
          onPress={() => openNewsList(headlines, "Valley News")}
          style={{
            backgroundColor: "#eef2ff",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#1e40af", fontWeight: "700" }}>See all</Text>
        </Pressable>
      </View>

      {/* Top 3 */}
      <View style={{ padding: 16, gap: 10 }}>
        {loadingNews && headlines.length === 0 ? (
          <ActivityIndicator />
        ) : (
          headlines.slice(0, 3).map((h) => (
            <Pressable
              key={h.link}
              onPress={() => Linking.openURL(h.link)}
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: "#f5faff",
                borderWidth: 1,
                borderColor: "#e5ecff",
              }}
            >
              <Text style={{ fontSize: 16, lineHeight: 22 }}>{h.title}</Text>
              <Text
                style={{ color: "#64748b", marginTop: 6 }}
                numberOfLines={1}
              >
                {h.link}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ⬇️ NEW: types for stats
type SectorRow = { sector: string; count: number };

export function ProjectsScreen({ route, navigation }: any) {
  const { district } = route.params as { district: string };

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // summary
  const [summary, setSummary] = useState<Summary | null>(null);

  // charts
  const [chartsCollapsed, setChartsCollapsed] = useState<boolean>(true);
  const [chartsLoading, setChartsLoading] = useState<boolean>(false);
  const [sector, setSector] = useState<SectorRow[]>([]);

  // ---- data fetchers ----
  async function fetchCharts(d: string) {
    try {
      setChartsLoading(true);
      const res = await fetch(
        `${API}/stats/sector?district=${encodeURIComponent(d)}`
      );
      const s = (await res.json()) as SectorRow[] | any;
      setSector(Array.isArray(s) ? s : []);
    } catch {
      setSector([]);
    } finally {
      setChartsLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getProjects(district, 20, 0).then(setProjects),
      getSummary(district).then(setSummary),
      // optional: prefetch sector so it is ready when user expands
      fetchCharts(district),
    ]).finally(() => setLoading(false));
  }, [district]);

  // refresh summary when screen gains focus
  useFocusEffect(
    useCallback(() => {
      getSummary(district).then(setSummary).catch(() => {});
    }, [district])
  );

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
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}
        >
          <Text>Projects</Text>
          <Text>{summary?.projects ?? "—"}</Text>
        </View>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}
        >
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

      {/* ===== By Sector (collapsible) ===== */}
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 12,
          paddingBottom: chartsCollapsed ? 8 : 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700" }}>
            By Sector {summary?.projects ? `(${summary.projects})` : ""}
          </Text>

          <Pressable
            hitSlop={10}
            onPress={async () => {
              if (Platform.OS === "ios") {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut
                );
              }
              const next = !chartsCollapsed;
              setChartsCollapsed(next);
              // if expanding and no data yet, fetch once
              if (!next && sector.length === 0) {
                await fetchCharts(district);
              }
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
              {chartsLoading ? (
                <ActivityIndicator />
              ) : sector.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>No sector data</Text>
              ) : (
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
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginHorizontal: 6,
                      marginVertical: 4,
                    }}
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

      {/* View Reports button */}
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

// -------- New Feeds screen (stub) --------
function FeedsScreen() {
  return (
    <View style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>Feeds (Coming soon)</Text>
      <Text style={{ textAlign: "center", color: "#666" }}>
        Here we’ll show ward-tagged photo posts with likes & comments.
      </Text>
    </View>
  );
}

const Tab = createBottomTabNavigator();

// --------- Floating tab bar ----------
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // Figure out the currently focused route inside the tab
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;

  // If the focused screen asked to hide the tab bar, don't render it
  const display = (focusedOptions?.tabBarStyle as any)?.display;
  if (display === "none") return null;

  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 12,
        borderRadius: 28,
        backgroundColor: "#fff",
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const iconName =
          route.name === "HomeTab" ? (isFocused ? "home" : "home-outline")
        : route.name === "FeedsTab" ? (isFocused ? "image" : "image-outline")
        : "ellipse";

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={{
              flex: 1,
              marginHorizontal: 6,
              borderRadius: 20,
              backgroundColor: isFocused ? "#eef2f5" : "transparent",
              alignItems: "center",
              paddingVertical: 10,
            }}
          >
            <Ionicons name={iconName as any} size={24} color={isFocused ? "#0f172a" : "#64748b"} />
          </Pressable>
        );
      })}
    </View>
  );
}

// Stack navigator for the "Home" flow
function HomeStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="ProjectsOverview" component={ProjectsOverview} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="ReportsFeed" component={ReportsFeedScreen} />
      <Stack.Screen name="NewsFeed" component={NewsFeedScreen} options={{ title: "Valley News" }} />
    </Stack.Navigator>
  );
}

// --------- Root with tabs ----------
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props: BottomTabBarProps) => <FloatingTabBar {...props} />}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNavigator}
          options={({ route }) => {
            const nested = getFocusedRouteNameFromRoute(route) ?? "Home";
            const shouldHide = nested !== "Home"; // hide for Projects, Report, etc.

            return {
              headerShown: false,
              tabBarStyle: shouldHide ? { display: "none" } : undefined,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
              title: "Home",
            };
          }}
        />
        <Tab.Screen name="FeedsTab" component={FeedsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

