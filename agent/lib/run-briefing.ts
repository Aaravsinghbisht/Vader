import { fetchDisasterNews } from "./disaster-news";
import { geocodeLocation, isCoastal } from "./geocode";
import { fetchGovAlerts } from "./gov-alerts";
import { buildFullReport } from "./full-report";
import { fetchNavicContext } from "./navic-context";
import { fetchNearbyRoads } from "./roads-overpass";
import { fetchWeatherMetrics } from "./weather-metrics";
import { fetchWebIntelligence } from "./web-intelligence";

export interface BriefingOptions {
  query: string;
  radiusKm?: number;
  webFetchTimeoutMs?: number;
}

export interface BriefingResult {
  success: boolean;
  report: string;
  error?: string;
  _noteForModel?: string;
  area?: {
    name: string;
    latitude: number;
    longitude: number;
    district?: string;
    state?: string;
    coastal: boolean;
  };
  stats?: {
    weatherMetrics: number;
    roadSegments: number;
    newsArticles: number;
    alerts: number;
    hazardFlags: string[];
    webResults: number;
  };
  meta?: {
    fetchedAt: string;
    sourcesReachable: string[];
    sourcesFailed: string[];
  };
}

const DEFAULT_RADIUS_KM = Number(process.env.BRIEFING_RADIUS_KM ?? 5);
const MAX_RADIUS_KM = 25;
const WEB_TIMEOUT_MS = Number(process.env.WEB_FETCH_TIMEOUT_MS ?? 12000);

function clampRadius(radiusKm?: number): number {
  const r = radiusKm ?? DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(1, r));
}

export async function runBriefing(options: BriefingOptions): Promise<BriefingResult> {
  const fetchedAt = new Date().toISOString();
  const sourcesReachable: string[] = [];
  const sourcesFailed: string[] = [];
  const radiusKm = clampRadius(options.radiusKm);
  const webTimeout = options.webFetchTimeoutMs ?? WEB_TIMEOUT_MS;

  const geo = await geocodeLocation(options.query);
  if (!geo.success || geo.latitude === undefined || geo.longitude === undefined) {
    return {
      success: false,
      error: geo.error ?? "Could not geocode location",
      report: `Could not find location "${options.query}". Please try a more specific address (e.g. include city and state).`,
    };
  }

  sourcesReachable.push("Nominatim");
  const coastal = isCoastal(geo.latitude, geo.longitude);
  const areaName = geo.displayName ?? options.query;

  const [weather, roads, alertsResult, news, webIntel] = await Promise.all([
    fetchWeatherMetrics(geo.latitude, geo.longitude, areaName),
    fetchNearbyRoads(geo.latitude, geo.longitude, radiusKm, areaName),
    fetchGovAlerts({
      state: geo.state,
      district: geo.district,
      coastal,
    }),
    fetchDisasterNews({
      place: areaName,
      state: geo.state,
      district: geo.district,
    }),
    fetchWebIntelligence({
      place: areaName,
      state: geo.state,
      district: geo.district,
      timeoutMs: webTimeout,
    }),
  ]);

  if (weather.success) {
    sourcesReachable.push(...weather.sources);
  } else {
    sourcesFailed.push("Open-Meteo");
  }

  if (roads.success) {
    sourcesReachable.push("OpenStreetMap Overpass");
  } else {
    sourcesFailed.push("OpenStreetMap Overpass");
  }

  sourcesReachable.push(...alertsResult.sourcesReachable);
  sourcesFailed.push(...alertsResult.sourcesFailed);

  if (news.success) {
    sourcesReachable.push(...news.sourcesReachable);
  } else {
    sourcesFailed.push(...news.sourcesFailed);
  }

  sourcesReachable.push(...webIntel.sourcesReachable);
  sourcesFailed.push(...webIntel.sourcesFailed);

  const navic = await fetchNavicContext({
    latitude: geo.latitude,
    longitude: geo.longitude,
    coastal,
    marine: weather.marine,
  });

  sourcesReachable.push(...navic.sourcesReachable);
  sourcesFailed.push(...navic.sourcesFailed);

  const alerts = [
    ...alertsResult.alerts,
    ...webIntel.officialMentions.map((m) => ({
      source: "Web search (official)",
      alertType: "Weather/Hazard",
      severity: /red alert|extreme|severe/i.test(`${m.title} ${m.snippet}`)
        ? "High"
        : /orange|warning/i.test(`${m.title} ${m.snippet}`)
          ? "Moderate"
          : "Low",
      text: `${m.title}. ${m.snippet || m.excerpt || ""}`.trim(),
      url: m.url,
      fetchedAt,
    })),
  ];

  const report = buildFullReport({
    areaName,
    query: options.query,
    latitude: geo.latitude,
    longitude: geo.longitude,
    district: geo.district ?? navic.bhuvanAdmin?.district,
    state: geo.state ?? navic.bhuvanAdmin?.state,
    village: navic.bhuvanAdmin?.village,
    coastal,
    weather,
    roads,
    navic,
    news,
    webIntel,
    alerts,
    sourcesReachable: [...new Set(sourcesReachable)],
    sourcesFailed: [...new Set(sourcesFailed)],
    fetchedAt,
  });

  return {
    success: true,
    report,
    _noteForModel:
      "The full report is already displayed to the user in the chat UI. Reply with ONE short introductory sentence only. Do not repeat the report. Do not ask questions.",
    area: {
      name: areaName,
      latitude: geo.latitude,
      longitude: geo.longitude,
      district: geo.district,
      state: geo.state,
      coastal,
    },
    stats: {
      weatherMetrics: weather.metricCount,
      roadSegments: roads.totalCount,
      newsArticles: news.articles.length,
      alerts: alerts.length,
      hazardFlags: weather.hazardFlags,
      webResults: webIntel.allResults.length,
    },
    meta: {
      fetchedAt,
      sourcesReachable: [...new Set(sourcesReachable)],
      sourcesFailed: [...new Set(sourcesFailed)],
    },
  };
}
