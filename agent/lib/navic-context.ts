import { fetchWithTimeout, stripHtml } from "./fetch-utils";

export interface NavicContextResult {
  success: boolean;
  disclaimer: string;
  coverage: {
    inPrimaryZone: boolean;
    latitude: number;
    longitude: number;
    zone: string;
  };
  constellationStatus: {
    operational: boolean;
    summary: string;
    source: string;
  };
  marine: Record<string, number | null> | { error: string };
  incoisAlerts: Array<{ text: string; url: string }>;
  bhuvanAdmin?: {
    village?: string;
    district?: string;
    state?: string;
    source: string;
  };
  mapLinks: {
    bhuvan: string;
    nasaWorldview: string;
    sentinelHub: string;
  };
  gaganNote: string;
  operationalGuidance: string[];
  sourcesReachable: string[];
  sourcesFailed: string[];
}

function inNavicPrimaryZone(lat: number, lon: number): boolean {
  return lat >= 0 && lat <= 42 && lon >= 55 && lon <= 105;
}

function buildMapLinks(lat: number, lon: number): NavicContextResult["mapLinks"] {
  const bbox = `${lon - 0.1},${lat - 0.1},${lon + 0.1},${lat + 0.1}`;
  return {
    bhuvan: `https://bhuvan.nrsc.gov.in/home/index.php?lat=${lat}&lon=${lon}`,
    nasaWorldview: `https://worldview.earthdata.nasa.gov/?v=${bbox}&l=MODIS_Terra_CorrectedReflectance_TrueColor`,
    sentinelHub: `https://apps.sentinel-hub.com/eo-browser/?lat=${lat}&lng=${lon}&zoom=12`,
  };
}

function buildOperationalGuidance(
  inZone: boolean,
  coastal: boolean
): string[] {
  const guidance: string[] = [];
  if (inZone) {
    guidance.push(
      "NavIC SPS available in this zone — field teams with NavIC-enabled receivers can obtain positioning when cellular networks fail."
    );
    guidance.push(
      "GAGAN SBAS augmentation improves aviation-grade accuracy; useful for helicopter rescue and drone operations in disaster zones."
    );
  } else {
    guidance.push(
      "Outside NavIC primary zone — rely on GPS/GLONASS; NavIC may have degraded or no signal."
    );
  }
  if (coastal) {
    guidance.push(
      "Coastal ops: combine NavIC positioning with INCOIS marine bulletins and wave forecasts for safe vessel movement."
    );
  }
  guidance.push(
    "No public API provides live satellite telemetry — deploy NavIC receiver hardware for real-time GNSS data at this coordinate."
  );
  return guidance;
}

async function fetchNavicStatus(): Promise<{
  summary: string;
  operational: boolean;
  ok: boolean;
}> {
  const url = "https://www.isro.gov.in/SatelliteNavigationServices.html";
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "VaderAgent/1.0" },
    });
    if (!res.ok) return { summary: "ISRO NavIC page unreachable", operational: false, ok: false };

    const text = stripHtml(await res.text());
    const hasNavic = text.toLowerCase().includes("navic");
    const satelliteMatch = text.match(/(\d+)\s+satellites?/i);
    const accuracyMatch = text.match(/(\d+)\s*m/i);

    let summary = "NavIC (IRNSS) regional navigation constellation operated by ISRO.";
    if (satelliteMatch) summary += ` Constellation: ${satelliteMatch[0]}.`;
    if (accuracyMatch) summary += ` Advertised accuracy: ~${accuracyMatch[1]}m.`;
    if (!hasNavic) summary = "ISRO navigation services page loaded; NavIC details limited.";

    return { summary, operational: hasNavic, ok: true };
  } catch {
    return { summary: "Could not fetch ISRO NavIC status", operational: false, ok: false };
  }
}

async function fetchBhuvanReverseGeocode(
  lat: number,
  lon: number
): Promise<{ village?: string; district?: string; state?: string; ok: boolean }> {
  try {
    const url = `https://bhuvan-app1.nrsc.gov.in/api/admin/adminunit?lat=${lat}&lon=${lon}`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "VaderAgent/1.0" },
    });
    if (!res.ok) return { ok: false };

    const data = await res.json();
    return {
      village: data.village ?? data.Village,
      district: data.district ?? data.District,
      state: data.state ?? data.State,
      ok: true,
    };
  } catch {
    return { ok: false };
  }
}

async function fetchIncoisAlerts(coastal: boolean): Promise<{
  alerts: Array<{ text: string; url: string }>;
  ok: boolean;
}> {
  if (!coastal) return { alerts: [], ok: true };

  const url = "https://incois.gov.in/";
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "VaderAgent/1.0" },
    });
    if (!res.ok) return { alerts: [], ok: false };

    const text = stripHtml(await res.text());
    const keywords = ["warning", "alert", "cyclone", "tsunami", "storm", "surge", "high wave"];
    const alerts: Array<{ text: string; url: string }> = [];

    for (const kw of keywords) {
      const idx = text.toLowerCase().indexOf(kw);
      if (idx >= 0) {
        alerts.push({
          text: text.slice(Math.max(0, idx - 60), idx + 180).trim(),
          url,
        });
      }
    }

    return { alerts: alerts.slice(0, 5), ok: true };
  } catch {
    return { alerts: [], ok: false };
  }
}

export async function fetchNavicContext(options: {
  latitude: number;
  longitude: number;
  coastal: boolean;
  marine: Record<string, number | null> | { error: string };
}): Promise<NavicContextResult> {
  const { latitude, longitude, coastal, marine } = options;
  const sourcesReachable: string[] = [];
  const sourcesFailed: string[] = [];
  const inZone = inNavicPrimaryZone(latitude, longitude);

  const [navicStatus, bhuvan, incois] = await Promise.allSettled([
    fetchNavicStatus(),
    fetchBhuvanReverseGeocode(latitude, longitude),
    fetchIncoisAlerts(coastal),
  ]);

  let constellationStatus = {
    operational: false,
    summary: "Unknown",
    source: "isro.gov.in",
  };
  if (navicStatus.status === "fulfilled" && navicStatus.value.ok) {
    sourcesReachable.push("ISRO NavIC");
    constellationStatus = {
      operational: navicStatus.value.operational,
      summary: navicStatus.value.summary,
      source: "https://www.isro.gov.in/SatelliteNavigationServices.html",
    };
  } else {
    sourcesFailed.push("ISRO NavIC");
    constellationStatus.summary = "ISRO NavIC status page unreachable";
  }

  let bhuvanAdmin: NavicContextResult["bhuvanAdmin"];
  if (bhuvan.status === "fulfilled" && bhuvan.value.ok) {
    sourcesReachable.push("Bhuvan");
    bhuvanAdmin = {
      village: bhuvan.value.village,
      district: bhuvan.value.district,
      state: bhuvan.value.state,
      source: "https://bhuvan-app1.nrsc.gov.in/api/",
    };
  } else {
    sourcesFailed.push("Bhuvan");
  }

  let incoisAlerts: Array<{ text: string; url: string }> = [];
  if (incois.status === "fulfilled" && incois.value.ok) {
    if (coastal) sourcesReachable.push("INCOIS");
    incoisAlerts = incois.value.alerts;
  } else if (coastal) {
    sourcesFailed.push("INCOIS");
  }

  return {
    success: true,
    disclaimer:
      "NavIC direct satellite telemetry is not available via public API. Geospatial intelligence below is derived from ISRO/INCOIS public sources, map portals, and model-based marine forecasts.",
    coverage: {
      inPrimaryZone: inZone,
      latitude,
      longitude,
      zone: inZone
        ? "NavIC primary service area (India + 1500 km)"
        : "Outside NavIC primary coverage",
    },
    constellationStatus,
    marine,
    incoisAlerts,
    bhuvanAdmin,
    mapLinks: buildMapLinks(latitude, longitude),
    gaganNote:
      "GAGAN (GPS Aided GEO Augmented Navigation) is India's SBAS — provides enhanced accuracy for aviation and can support disaster helicopter/drone ops. Operated by AAI/ISRO over the Indian FIR.",
    operationalGuidance: buildOperationalGuidance(inZone, coastal),
    sourcesReachable,
    sourcesFailed,
  };
}
