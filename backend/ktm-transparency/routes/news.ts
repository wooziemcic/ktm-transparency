// routes/news.ts
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const router = express.Router();

// Simple in-memory cache (10 min)
type CacheVal = { at: number; data: NewsItem[] };
const cache: Record<string, CacheVal> = {};
const TTL = 10 * 60 * 1000;

export type NewsItem = {
  title: string;
  url: string;
  image?: string | null;
  source: "Kathmandu Post";
};

const BASE = "https://kathmandupost.com";

function pickFirst<T>(arr: T[], n = 3) {
  return arr.slice(0, n);
}

async function fetchHtml(url: string) {
  const { data } = await axios.get(url, {
    headers: {
      // a polite UA helps some sites
      "User-Agent":
        "Mozilla/5.0 (compatible; KTMTransparency/1.0; +https://example.org)",
      Accept: "text/html",
    },
    timeout: 12000,
  });
  return data as string;
}

function parseList(html: string): NewsItem[] {
  const $ = cheerio.load(html);
  const out: NewsItem[] = [];

  // The KP site layout varies; we look for common card patterns
  //  - article cards with an <h2>/<h3> inside a link
  //  - list items with .card / .item classes
  $("article, .card, .item, li").each((_, el) => {
    const root = $(el);
    // headline text
    const h = root.find("h3, h2").first();
    const title = h.text().trim();
    if (!title) return;

    // href (prefer the heading's parent link, else any link under the card)
    let href =
      h.closest("a").attr("href") ||
      root.find("a[href]").first().attr("href") ||
      "";
    if (!href) return;
    if (!href.startsWith("http")) href = BASE + href;

    // try to grab a thumbnail (optional)
    const img =
      root.find("img").attr("data-src") ||
      root.find("img").attr("src") ||
      null;

    out.push({ title, url: href, image: img, source: "Kathmandu Post" });
  });

  // De-dupe by URL and keep only sensible results
  const seen = new Set<string>();
  const cleaned = out.filter((n) => {
    if (!n.title || !n.url.includes("kathmandupost.com")) return false;
    if (seen.has(n.url)) return false;
    seen.add(n.url);
    return true;
  });

  return cleaned;
}

async function getNews(area: string, limit = 3): Promise<NewsItem[]> {
  const key = `${area}:${limit}`;
  const now = Date.now();
  const c = cache[key];
  if (c && now - c.at < TTL) return pickFirst(c.data, limit);

  const path =
    area === "valley"
      ? "/valley"
      : `/valley/${area.toLowerCase()}`; // kathmandu | lalitpur | bhaktapur

  const html = await fetchHtml(BASE + path);
  const parsed = parseList(html);
  cache[key] = { at: now, data: parsed };
  return pickFirst(parsed, limit);
}

// GET /news?area=valley|kathmandu|lalitpur|bhaktapur&limit=3
router.get("/", async (req, res) => {
  try {
    const area = String(req.query.area || "valley").toLowerCase();
    const limit = parseInt(String(req.query.limit || 3), 10);
    if (!["valley", "kathmandu", "lalitpur", "bhaktapur"].includes(area)) {
      return res.status(400).json({ error: "invalid area" });
    }
    const data = await getNews(area, isNaN(limit) ? 3 : limit);
    res.json(data);
  } catch (e) {
    console.error("news error", e);
    res.status(500).json([]);
  }
});

export default router;
