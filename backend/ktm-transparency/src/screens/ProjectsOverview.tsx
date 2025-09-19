import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView } from "react-native";
// --- CHART IMPORTS (robust) ---
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VictoryNative = require("victory-native");
const { VictoryPie, VictoryChart, VictoryBar } = VictoryNative;
// Extras that are not always re-exported by victory-native:

if (!VictoryPie || !VictoryChart || !VictoryBar) {
  console.warn("victory-native exports missing:", Object.keys(VictoryNative || {}));
}

const API: string = process.env.EXPO_PUBLIC_API_URL || "https://2b57b11487d1.ngrok-free.app";

type SectorRow = { sector: string; count: number };
type TM = { year: number; month: number; count: number };
type ChartsProps = {
  HAS_CHARTS: boolean;
  totalProjects?: number;
  chartsLoading: boolean;
  pieData: { x: string; y: number }[];
  barData: { x: string; y: number }[];
};

export default function ProjectsOverview({ route }: any) {
  const district: string = route.params?.district ?? "Kathmandu";
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [timeline, setTimeline] = useState<TM[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [s, t] = await Promise.all([
          fetch(`${API}/stats/sector?district=${encodeURIComponent(district)}`).then(r => r.json()),
          fetch(`${API}/stats/timeline?district=${encodeURIComponent(district)}`).then(r => r.json()),
        ]);
        if (mounted) { setSectors(s); setTimeline(t); }
      } catch (e) {
        console.warn(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [district]);

  const total = useMemo(() => sectors.reduce((a,b)=>a+b.count,0), [sectors]);
  const pieData = useMemo(() => sectors.map(s => ({ x: s.sector, y: s.count })), [sectors]);
  const barData = useMemo(() => timeline.map(t => ({
    x: `${t.year}-${String(t.month).padStart(2,"0")}`,
    y: t.count
  })), [timeline]);

  // === Added to satisfy external references with minimal changes ===
  const HAS_CHARTS = !!VictoryPie;      // victory-native available
  const totalProjects = total;           // alias for existing total
  const chartsLoading = loading;         // alias for existing loading
  // =================================================================

  if (loading) return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 8 }}>
        {district} Overview
      </Text>

      {/* Donut by sector */}
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Text style={{ marginBottom: 8, color: "#555" }}>By sector (total {total})</Text>
        <VictoryPie
          data={pieData}
          innerRadius={60}
          padAngle={2}
          style={{ labels: { fontSize: 11 } }}
          width={300}
          height={220}
        />
      </View>

      {/* Timeline bars */}
      <Text style={{ marginBottom: 8, color: "#555" }}>Projects over time</Text>
      <VictoryChart domainPadding={{ x: 12, y: 12 }} width={340} height={220}>
        {/* Victory will auto-render axes, so we drop explicit <VictoryAxis/> */}
        <VictoryBar
          data={barData}
          // Simple labels; no tooltip component
          labels={({ datum }: { datum: { x: string; y: number } }) => `${datum.y}`}
          cornerRadius={3}
        />
      </VictoryChart>
    </ScrollView>
  );
}
