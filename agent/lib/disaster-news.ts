import { fetchWithTimeout } from "./fetch-utils";

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
}

export interface DisasterNewsResult {
  success: boolean;
  articles: NewsArticle[];
  searchQueries: string[];
  sourcesReachable: string[];
  sourcesFailed: string[];
  summary: string;
}

function parseRssItems(xml: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "Google News";
    const description =
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? "";

    if (title && link) {
      articles.push({
        title: title.replace(/<[^>]+>/g, "").trim(),
        url: link,
        source: source.replace(/<[^>]+>/g, "").trim(),
        publishedAt: pubDate,
        snippet: description.replace(/<[^>]+>/g, "").substring(0, 300).trim(),
      });
    }
  }

  return articles;
}

async function fetchGoogleNewsRss(query: string): Promise<NewsArticle[]> {
  const url =
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q: query,
      hl: "en-IN",
      gl: "IN",
      ceid: "IN:en",
    });

  const res = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": "VaderAgent/1.0" } },
    12000
  );
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRssItems(xml);
}

function buildSearchQueries(place: string, state?: string, district?: string): string[] {
  const shortPlace = place.split(",")[0].trim();
  const queries = [
    `${shortPlace} disaster flood rain weather`,
    `${shortPlace} cyclone storm alert India`,
    `${district ?? shortPlace} ${state ?? ""} disaster emergency`.trim(),
    `${shortPlace} road closure landslide`,
    `${shortPlace} rescue evacuation`,
  ];
  return [...new Set(queries.filter((q) => q.length > 5))].slice(0, 4);
}

export async function fetchDisasterNews(options: {
  place: string;
  state?: string;
  district?: string;
}): Promise<DisasterNewsResult> {
  const queries = buildSearchQueries(options.place, options.state, options.district);
  const sourcesReachable: string[] = [];
  const sourcesFailed: string[] = [];
  const allArticles: NewsArticle[] = [];

  const results = await Promise.allSettled(
    queries.map((q) => fetchGoogleNewsRss(q))
  );

  results.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value.length > 0) {
      sourcesReachable.push(`Google News: "${queries[i]}"`);
      allArticles.push(...result.value);
    } else {
      sourcesFailed.push(`Google News: "${queries[i]}"`);
    }
  });

  // Deduplicate by title similarity
  const seen = new Set<string>();
  const unique = allArticles.filter((a) => {
    const key = a.title.toLowerCase().substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const articles = unique.slice(0, 10);

  let summary = "No recent disaster-related news articles found for this area.";
  if (articles.length > 0) {
    const themes = new Set<string>();
    for (const a of articles) {
      const t = a.title.toLowerCase();
      if (t.includes("flood")) themes.add("flooding");
      if (t.includes("rain")) themes.add("heavy rain");
      if (t.includes("cyclone") || t.includes("storm")) themes.add("storms/cyclones");
      if (t.includes("landslide")) themes.add("landslides");
      if (t.includes("heat")) themes.add("heat waves");
      if (t.includes("fire")) themes.add("fires");
      if (t.includes("road") || t.includes("highway")) themes.add("road disruptions");
      if (t.includes("rescue") || t.includes("evacuat")) themes.add("rescue/evacuation");
    }
    summary = `Found ${articles.length} news items. Dominant themes: ${[...themes].join(", ") || "general weather/disaster coverage"}.`;
  }

  return {
    success: articles.length > 0,
    articles,
    searchQueries: queries,
    sourcesReachable,
    sourcesFailed,
    summary,
  };
}

export function buildNewsReport(news: DisasterNewsResult, place: string): string {
  const lines: string[] = [];
  lines.push("### Disaster news & public reports");
  lines.push("");
  lines.push(`**Area:** ${place}`);
  lines.push(`**Summary:** ${news.summary}`);
  lines.push(`**Search queries used:** ${news.searchQueries.join(" | ")}`);
  lines.push("");

  if (news.articles.length === 0) {
    lines.push("No recent news articles found. Recommend manual search on local media and social platforms.");
    return lines.join("\n");
  }

  lines.push("**Recent articles & reports (with links):**");
  lines.push("");
  for (let i = 0; i < news.articles.length; i++) {
    const a = news.articles[i];
    lines.push(`**${i + 1}. ${a.title}**`);
    lines.push(`- Source: ${a.source}`);
    if (a.publishedAt) lines.push(`- Published: ${a.publishedAt}`);
    if (a.snippet) lines.push(`- Excerpt: ${a.snippet}`);
    lines.push(`- Link: ${a.url}`);
    lines.push("");
  }

  lines.push("**What people & media are saying:**");
  lines.push(
    "The articles above represent current public reporting and on-ground accounts indexed by Google News. Cross-reference with official IMD/NDMA alerts before acting. Social media reports may appear in news excerpts — treat unverified claims cautiously."
  );
  lines.push("");
  lines.push(`*News sourced via Google News RSS. Queries: ${news.sourcesReachable.length} succeeded, ${news.sourcesFailed.length} failed.*`);

  return lines.join("\n");
}
