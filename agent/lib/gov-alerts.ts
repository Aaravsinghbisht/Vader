import { extractAlertSnippets, fetchWithTimeout, stripHtml } from "./fetch-utils";

export interface GovAlert {
  source: string;
  alertType: string;
  severity: string;
  text: string;
  url: string;
  fetchedAt: string;
}

export interface GovAlertsResult {
  success: boolean;
  alerts: GovAlert[];
  sourcesReachable: string[];
  sourcesFailed: string[];
}

const ALERT_KEYWORDS = [
  "cyclone",
  "heavy rain",
  "flood",
  "heat wave",
  "thunderstorm",
  "landslide",
  "warning",
  "alert",
  "advisory",
  "red alert",
  "orange alert",
  "yellow alert",
  "tsunami",
  "storm surge",
  "earthquake",
];

function inferSeverity(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("red alert") || lower.includes("extreme")) return "Extreme";
  if (lower.includes("orange") || lower.includes("severe")) return "High";
  if (lower.includes("yellow") || lower.includes("watch")) return "Moderate";
  if (lower.includes("advisory") || lower.includes("alert")) return "Low";
  return "Unknown";
}

function inferType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("cyclone")) return "Cyclone";
  if (lower.includes("flood")) return "Flood";
  if (lower.includes("heat")) return "Heat wave";
  if (lower.includes("thunder")) return "Thunderstorm";
  if (lower.includes("landslide")) return "Landslide";
  if (lower.includes("tsunami")) return "Tsunami";
  if (lower.includes("earthquake")) return "Earthquake";
  return "Weather/Hazard";
}

function parseRssAlerts(xml: string, source: string, url: string): GovAlert[] {
  const fetchedAt = new Date().toISOString();
  const alerts: GovAlert[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title =
      block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? url;
    const description =
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? "";

    const text = stripHtml(`${title}. ${description}`);
    if (!text || text.length < 10) continue;

    const lower = text.toLowerCase();
    const isRelevant = ALERT_KEYWORDS.some((kw) => lower.includes(kw));
    if (!isRelevant) continue;

    alerts.push({
      source,
      alertType: inferType(text),
      severity: inferSeverity(text),
      text: text.substring(0, 400),
      url: link,
      fetchedAt,
    });
  }

  return alerts;
}

async function fetchPageAlerts(
  source: string,
  url: string,
  context?: string
): Promise<{ alerts: GovAlert[]; ok: boolean }> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "VaderAgent/1.0" },
    });
    if (!res.ok) return { alerts: [], ok: false };

    const html = await res.text();
    const text = stripHtml(html);
    const snippets = extractAlertSnippets(text, ALERT_KEYWORDS);

    if (snippets.length === 0 && context) {
      const contextSnippets = extractAlertSnippets(text, [context.toLowerCase()]);
      snippets.push(...contextSnippets);
    }

    const alerts: GovAlert[] = snippets.map((snippet) => ({
      source,
      alertType: inferType(snippet),
      severity: inferSeverity(snippet),
      text: snippet.substring(0, 400),
      url,
      fetchedAt,
    }));

    return { alerts, ok: true };
  } catch {
    return { alerts: [], ok: false };
  }
}

async function fetchRssAlerts(
  source: string,
  url: string
): Promise<{ alerts: GovAlert[]; ok: boolean }> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "VaderAgent/1.0", Accept: "application/rss+xml, application/xml" },
    });
    if (!res.ok) return { alerts: [], ok: false };
    const xml = await res.text();
    const alerts = parseRssAlerts(xml, source, url);
    return { alerts, ok: true };
  } catch {
    return { alerts: [], ok: false };
  }
}

export async function fetchGovAlerts(options: {
  state?: string;
  district?: string;
  coastal?: boolean;
}): Promise<GovAlertsResult> {
  const state = options.state ?? "";
  const district = options.district ?? "";
  const context = district || state;

  const sources: Array<{ name: string; url: string; type: "page" | "rss" }> = [
    { name: "IMD", url: "https://mausam.imd.gov.in/", type: "page" },
    { name: "NDMA", url: "https://ndma.gov.in/", type: "page" },
    {
      name: "NDMA Press",
      url: "https://ndma.gov.in/en/media-gallery/press-releases.html",
      type: "page",
    },
    {
      name: "IMD RSS",
      url: "https://mausam.imd.gov.in/imd_latest/contents/warning/rss.xml",
      type: "rss",
    },
  ];

  if (options.coastal) {
    sources.push({ name: "INCOIS", url: "https://incois.gov.in/", type: "page" });
  }

  if (state) {
    const stateSlug = state.toLowerCase().replace(/\s+/g, "-");
    sources.push({
      name: `IMD ${state}`,
      url: `https://mausam.imd.gov.in/imd_latest/contents/${stateSlug}`,
      type: "page",
    });
  }

  const results = await Promise.allSettled(
    sources.map((s) =>
      s.type === "rss"
        ? fetchRssAlerts(s.name, s.url)
        : fetchPageAlerts(s.name, s.url, context)
    )
  );

  const alerts: GovAlert[] = [];
  const sourcesReachable: string[] = [];
  const sourcesFailed: string[] = [];

  results.forEach((result, i) => {
    const source = sources[i];
    if (result.status === "fulfilled" && result.value.ok) {
      sourcesReachable.push(source.name);
      alerts.push(...result.value.alerts);
    } else {
      sourcesFailed.push(source.name);
    }
  });

  const seen = new Set<string>();
  const unique = alerts.filter((a) => {
    const key = a.text.substring(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const severityOrder: Record<string, number> = {
    Extreme: 4,
    High: 3,
    Moderate: 2,
    Low: 1,
    Unknown: 0,
  };

  unique.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));

  return {
    success: unique.length > 0 || sourcesReachable.length > 0,
    alerts: unique.slice(0, 15),
    sourcesReachable,
    sourcesFailed,
  };
}
