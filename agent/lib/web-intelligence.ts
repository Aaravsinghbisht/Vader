import { extractAlertSnippets, fetchWithTimeout, stripHtml } from "./fetch-utils";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  category: "road" | "ground" | "official" | "general";
  query: string;
}

export interface WebEnrichedResult extends WebSearchResult {
  excerpt?: string;
}

export interface WebIntelResult {
  success: boolean;
  roadReports: WebEnrichedResult[];
  groundReports: WebEnrichedResult[];
  officialMentions: WebEnrichedResult[];
  allResults: WebEnrichedResult[];
  searchQueries: string[];
  sourcesReachable: string[];
  sourcesFailed: string[];
  summary: string;
}

const ROAD_KEYWORDS = [
  "road",
  "highway",
  "nh ",
  "closure",
  "blocked",
  "traffic",
  "waterlog",
  "bridge",
  "detour",
  "jam",
];

const GROUND_KEYWORDS = [
  "flood",
  "cyclone",
  "landslide",
  "evacuat",
  "rescue",
  "submerged",
  "inundat",
  "damage",
  "destroyed",
  "ground report",
  "situation",
];

const OFFICIAL_KEYWORDS = [
  "imd",
  "ndma",
  "alert",
  "warning",
  "advisory",
  "red alert",
  "orange alert",
  "bulletin",
  "incois",
];

function buildSearchQueries(
  place: string,
  state?: string,
  district?: string
): Array<{ query: string; category: WebSearchResult["category"] }> {
  const short = place.split(",")[0].trim();
  const region = [district, state].filter(Boolean).join(" ").trim();

  return [
    { query: `${short} road closure flood highway India`, category: "road" },
    { query: `${short} traffic situation today`, category: "road" },
    { query: `${short} flood cyclone landslide ground report`, category: "ground" },
    { query: `${short} IMD weather alert`, category: "official" },
    { query: `${short} evacuation rescue disaster`, category: "ground" },
    {
      query: `${region || short} disaster news India`.trim(),
      category: "general",
    },
  ];
}

function parseDuckDuckGoResults(html: string, query: string, category: WebSearchResult["category"]): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const title = stripHtml(match[2]);
    const url = decodeDuckDuckGoUrl(rawUrl);
    if (title && url) links.push({ url, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(match[1]));
  }

  for (let i = 0; i < links.length && i < 8; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
      category,
      query,
    });
  }

  return results;
}

function decodeDuckDuckGoUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http")) return url;
  try {
    const u = new URL(url, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    // fall through
  }
  return url;
}

async function searchDuckDuckGo(
  query: string,
  category: WebSearchResult["category"],
  timeoutMs: number
): Promise<WebSearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?${new URLSearchParams({ q: query })}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VaderAgent/1.0; disaster-intelligence)",
        Accept: "text/html",
      },
    },
    timeoutMs
  );
  if (!res.ok) return [];
  const html = await res.text();
  return parseDuckDuckGoResults(html, query, category);
}

function scoreRelevance(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((score, kw) => (lower.includes(kw) ? score + 1 : score), 0);
}

function categorizeResult(result: WebSearchResult): WebSearchResult["category"] {
  const blob = `${result.title} ${result.snippet}`.toLowerCase();
  if (scoreRelevance(blob, OFFICIAL_KEYWORDS) >= 2) return "official";
  if (scoreRelevance(blob, ROAD_KEYWORDS) >= 2) return "road";
  if (scoreRelevance(blob, GROUND_KEYWORDS) >= 2) return "ground";
  return result.category;
}

async function enrichResult(
  result: WebSearchResult,
  timeoutMs: number
): Promise<WebEnrichedResult> {
  try {
    const res = await fetchWithTimeout(
      result.url,
      { headers: { "User-Agent": "VaderAgent/1.0" } },
      timeoutMs
    );
    if (!res.ok) return result;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return result;
    }
    const text = stripHtml(await res.text());
    const keywords = [...ROAD_KEYWORDS, ...GROUND_KEYWORDS, ...OFFICIAL_KEYWORDS];
    const snippets = extractAlertSnippets(text, keywords);
    const excerpt = snippets[0]?.substring(0, 400);
    return excerpt ? { ...result, excerpt } : result;
  } catch {
    return result;
  }
}

function dedupeResults(results: WebEnrichedResult[]): WebEnrichedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchWebIntelligence(options: {
  place: string;
  state?: string;
  district?: string;
  timeoutMs?: number;
}): Promise<WebIntelResult> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const queries = buildSearchQueries(options.place, options.state, options.district);
  const sourcesReachable: string[] = [];
  const sourcesFailed: string[] = [];
  const allRaw: WebSearchResult[] = [];

  const settled = await Promise.allSettled(
    queries.map(async ({ query, category }) => {
      const results = await searchDuckDuckGo(query, category, timeoutMs);
      return { query, results };
    })
  );

  for (let i = 0; i < settled.length; i++) {
    const q = queries[i].query;
    const result = settled[i];
    if (result.status === "fulfilled" && result.value.results.length > 0) {
      sourcesReachable.push(`DuckDuckGo: "${q}"`);
      allRaw.push(...result.value.results);
    } else {
      sourcesFailed.push(`DuckDuckGo: "${q}"`);
    }
  }

  const categorized = allRaw.map((r) => ({ ...r, category: categorizeResult(r) }));
  const unique = dedupeResults(categorized).slice(0, 20);

  const toEnrich = unique.slice(0, 5);
  const enriched = await Promise.all(
    toEnrich.map((r) => enrichResult(r, Math.min(timeoutMs, 8000)))
  );
  const enrichedUrls = new Set(enriched.map((r) => r.url));
  const rest = unique.filter((r) => !enrichedUrls.has(r.url));
  const allResults = [...enriched, ...rest];

  const roadReports = allResults.filter((r) => r.category === "road").slice(0, 8);
  const groundReports = allResults.filter((r) => r.category === "ground").slice(0, 8);
  const officialMentions = allResults.filter((r) => r.category === "official").slice(0, 6);

  let summary = "No live web reports found for this area.";
  if (allResults.length > 0) {
    const parts: string[] = [];
    if (roadReports.length > 0) parts.push(`${roadReports.length} road/traffic reports`);
    if (groundReports.length > 0) parts.push(`${groundReports.length} ground situation reports`);
    if (officialMentions.length > 0) parts.push(`${officialMentions.length} official mentions`);
    summary = `Found ${allResults.length} web results: ${parts.join(", ") || "general coverage"}.`;
  }

  return {
    success: allResults.length > 0,
    roadReports,
    groundReports,
    officialMentions,
    allResults,
    searchQueries: queries.map((q) => q.query),
    sourcesReachable,
    sourcesFailed,
    summary,
  };
}
