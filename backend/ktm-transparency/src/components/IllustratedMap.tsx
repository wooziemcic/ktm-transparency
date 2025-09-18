import React, { useMemo } from "react";
import { View, ImageBackground, Pressable, Text, useWindowDimensions } from "react-native";

type DistrictKey = "Kathmandu" | "Bhaktapur" | "Lalitpur";
export type OnSelect = (d: DistrictKey) => void;

// --- Hotspot layout (normalized to the image 0..1) ---
// Using the image you approved (square-ish composition):
// - Kathmandu = big top mass
// - Bhaktapur = right-middle wedge
// - Lalitpur  = lower block
const AREAS: Record<DistrictKey, { left:number; top:number; width:number; height:number }> = {
  Kathmandu: { left: 0.06, top: 0.07, width: 0.88, height: 0.35 },
  Bhaktapur: { left: 0.62, top: 0.36, width: 0.32, height: 0.23 },
  Lalitpur:  { left: 0.13, top: 0.45, width: 0.52, height: 0.45 },
};

export default function IllustratedMap({ onSelect }: { onSelect: OnSelect }) {
  // Keep the map square and responsive
  const { width } = useWindowDimensions();
  const size = Math.min(width, 640); // cap for nicer layout

  // Optional: overlay debug frames while tuning hit areas
  const DEBUG = false;

  return (
    <View style={{ alignItems: "center" }}>
      <ImageBackground
        source={require("../../assets/valley_map.png")}
        style={{ width: size, height: size, borderRadius: 20, overflow: "hidden" }}
        resizeMode="cover"
      >
        { (Object.keys(AREAS) as DistrictKey[]).map((k) => {
          const a = AREAS[k];
          return (
            <Pressable
              key={k}
              onPress={() => onSelect(k)}
              accessibilityLabel={`Open ${k} projects`}
              style={{
                position: "absolute",
                left: a.left * size,
                top: a.top * size,
                width: a.width * size,
                height: a.height * size,
                // Debug view to tune touch zones:
                borderWidth: DEBUG ? 1 : 0,
                borderColor: DEBUG ? "rgba(255,255,0,0.6)" : "transparent",
                backgroundColor: "transparent",
              }}
              hitSlop={8}
            />
          );
        })}
      </ImageBackground>

      {/* Small legend / hint */}
      <Text style={{ marginTop: 10, color: "#666" }}>Tap a region to continue</Text>
    </View>
  );
}
