// src/screens/NewsFeed.tsx
import React, { useEffect, useState, useCallback, useLayoutEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { API } from "../config";

// Keep the original shape; we'll normalize incoming params to this.
type NewsItem = { title: string; url: string; image?: string | null };

type Area = "valley" | "kathmandu" | "lalitpur" | "bhaktapur";

type Props = {
  route: {
    params?: {
      // New: headlines + title (when navigated from Home)
      headlines?: Array<{ title: string; link?: string; url?: string; image?: string | null }>;
      title?: string;
      // Existing: area (when you want the screen to fetch by itself)
      area?: Area;
    };
  };
  navigation: any;
};

export default function NewsFeedScreen({ route, navigation }: Props) {
  const params = route?.params ?? {};
  const passedHeadlines = Array.isArray(params.headlines) ? params.headlines : [];

  // Normalize “headlines” (title + link/url) into NewsItem[]
  const initialItems: NewsItem[] = passedHeadlines.map((h) => ({
    title: h.title,
    url: h.link ?? h.url ?? "",
    image: h.image ?? null,
  })).filter((x) => x.url);

  const [items, setItems] = useState<NewsItem[]>(initialItems);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  // Optional: set the header title from params.title
  useLayoutEffect(() => {
    if (params.title) navigation.setOptions?.({ title: params.title });
  }, [params.title, navigation]);

  const load = useCallback(async () => {
    // Only fetch if we don’t already have headlines passed in
    if (initialItems.length > 0) return;

    const area = params.area ?? "valley";
    setLoading(true);
    try {
      const r = await fetch(`${API}/news?area=${encodeURIComponent(area)}&limit=20`);
      const j = await r.json();
      const arr = (Array.isArray(j) ? j : []) as NewsItem[];
      // Normalize any { link } → { url }
      const normalized = arr.map((x: any) => ({
        title: x.title,
        url: x.url ?? x.link ?? "",
        image: x.image ?? null,
      })).filter((x) => x.url);
      setItems(normalized);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [API, params.area, initialItems.length]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading && items.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, idx) => item.url + idx}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
      renderItem={({ item, index }) => {
        const seed = encodeURIComponent(item.url || String(index));
        const img = item.image || `https://picsum.photos/seed/${seed}/900/900`;
        return (
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              backgroundColor: "#fff",
              overflow: "hidden",
            }}
          >
            <Image source={{ uri: img }} style={{ width: "100%", aspectRatio: 1 }} />
            <Pressable onPress={() => Linking.openURL(item.url)} style={{ padding: 12 }}>
              <Text style={{ fontWeight: "600", fontSize: 16, color: "#111827" }}>
                {item.title}
              </Text>
              <Text style={{ color: "#6b7280", marginTop: 6 }}>Open article →</Text>
            </Pressable>
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={{ padding: 16, alignItems: "center" }}>
          <Text>No news found.</Text>
        </View>
      }
    />
  );
}
