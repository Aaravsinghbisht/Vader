import { fetchWithTimeout } from "./fetch-utils";

export interface RoadSegment {
  id: number;
  name: string;
  ref: string;
  highway: string;
  surface: string;
  lanes: string;
  maxspeed: string;
  bridge: boolean;
  tunnel: boolean;
  lengthM: number;
}

export interface RoadsResult {
  success: boolean;
  totalCount: number;
  radiusM: number;
  byClass: Record<string, number>;
  majorHighways: RoadSegment[];
  allRoads: RoadSegment[];
  bridges: RoadSegment[];
  tunnels: RoadSegment[];
  emergencyFacilities: Array<{ type: string; name: string; lat?: number; lon?: number }>;
  nhaiReachable: boolean;
  note: string;
  error?: string;
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

function parseWay(el: OverpassWay): RoadSegment {
  const tags = el.tags ?? {};
  const geom = el.geometry ?? [];
  const lengthM =
    geom.length > 1 ? estimateWayLength(geom) : estimateLengthFromBounds(el.bounds);
  return {
    id: el.id,
    name: tags.name ?? tags["name:en"] ?? "Unnamed road",
    ref: tags.ref ?? "",
    highway: tags.highway ?? "unknown",
    surface: tags.surface ?? "unknown",
    lanes: tags.lanes ?? "",
    maxspeed: tags.maxspeed ?? "",
    bridge: tags.bridge === "yes",
    tunnel: tags.tunnel === "yes",
    lengthM,
  };
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateWayLength(geometry: Array<{ lat: number; lon: number }>): number {
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    total += haversineM(
      geometry[i - 1].lat,
      geometry[i - 1].lon,
      geometry[i].lat,
      geometry[i].lon
    );
  }
  return Math.round(total);
}

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function estimateLengthFromBounds(bounds?: {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}): number {
  if (!bounds) return 0;
  return Math.round(
    haversineM(bounds.minlat, bounds.minlon, bounds.maxlat, bounds.maxlon)
  );
}

const MAJOR_CLASSES = new Set(["motorway", "trunk", "primary", "secondary"]);

async function queryOverpass(query: string, retries = 2): Promise<{ elements: OverpassWay[] } | null> {
  const body = new URLSearchParams({ data: query }).toString();

  for (const server of OVERPASS_SERVERS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
      try {
        const res = await fetchWithTimeout(
          server,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "VaderAgent/1.0",
              Accept: "application/json",
            },
            body,
          },
          45000
        );
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.startsWith("{")) continue;
        return JSON.parse(text);
      } catch {
        // retry
      }
    }
  }
  return null;
}

async function checkNhaiReachable(): Promise<boolean> {
  for (const url of ["https://nhai.gov.in/", "https://www.nhai.gov.in/"]) {
    try {
      const res = await fetchWithTimeout(url, {}, 5000);
      if (res.ok) return true;
    } catch {
      // try next
    }
  }
  return false;
}

export async function fetchNearbyRoads(
  latitude: number,
  longitude: number,
  radiusKm = 5,
  area = "location"
): Promise<RoadsResult> {
  const radiusM = Math.round(radiusKm * 1000);

  // Major roads first (fast, reliable in dense cities)
  const majorQuery = `
[out:json][timeout:25];
way["highway"~"motorway|trunk|primary|secondary"](around:${radiusM},${latitude},${longitude});
out tags 200;
`.trim();

  // Broader inventory with cap to avoid timeouts in dense urban areas
  const allQuery = `
[out:json][timeout:25];
way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential"](around:${radiusM},${latitude},${longitude});
out tags 500;
`.trim();

  // Infrastructure: hospitals, police, fuel for disaster access planning
  const infraQuery = `
[out:json][timeout:25];
(
  node["amenity"~"hospital|police|fire_station|fuel"](around:${radiusM},${latitude},${longitude});
  way["amenity"~"hospital|police|fire_station"](around:${radiusM},${latitude},${longitude});
);
out center 50;
`.trim();

  try {
    // Sequential queries to avoid Overpass rate limits
    const majorData = await queryOverpass(majorQuery);
    const allData = await queryOverpass(allQuery);
    const infraData = await queryOverpass(infraQuery);
    const nhaiReachable = await checkNhaiReachable();

    const overpassData = allData ?? majorData;

    if (!overpassData) {
      return {
        success: false,
        totalCount: 0,
        radiusM,
        byClass: {},
        majorHighways: [],
        allRoads: [],
        bridges: [],
        tunnels: [],
        emergencyFacilities: [],
        nhaiReachable,
        note: "All Overpass API servers failed or timed out",
        error: "Road data fetch failed",
      };
    }

    const elements = overpassData.elements ?? [];

    const roads: RoadSegment[] = elements
      .filter((el) => el.type === "way")
      .map(parseWay);

    const byClass: Record<string, number> = {};
    for (const r of roads) {
      byClass[r.highway] = (byClass[r.highway] ?? 0) + 1;
    }

    const majorHighways = roads
      .filter((r) => MAJOR_CLASSES.has(r.highway) || r.ref.match(/^(NH|SH|MDR|ODR)/i))
      .sort((a, b) => b.lengthM - a.lengthM)
      .slice(0, 50);

    const bridges = roads.filter((r) => r.bridge).sort((a, b) => b.lengthM - a.lengthM);
    const tunnels = roads.filter((r) => r.tunnel);

    const emergencyFacilities: RoadsResult["emergencyFacilities"] = [];
    for (const el of infraData?.elements ?? []) {
      const tags = (el as { tags?: Record<string, string> }).tags ?? {};
      const center = (el as { center?: { lat: number; lon: number }; lat?: number; lon?: number }).center;
      const lat = center?.lat ?? (el as { lat?: number }).lat;
      const lon = center?.lon ?? (el as { lon?: number }).lon;
      if (tags.amenity && tags.name) {
        emergencyFacilities.push({
          type: tags.amenity,
          name: tags.name,
          lat,
          lon,
        });
      }
    }

    const capped = allData ? false : majorData !== null;
    const capNote = capped
      ? " Full inventory capped at 500 segments (dense area). Major highways query used as supplement."
      : "";

    const nhaiNote = nhaiReachable
      ? "NHAI portal reachable but live closure GIS is not publicly queryable. Road inventory from OpenStreetMap."
      : "NHAI portal unreachable. Road inventory from OpenStreetMap only.";

    return {
      success: true,
      totalCount: roads.length,
      radiusM,
      byClass,
      majorHighways,
      allRoads: roads.slice(0, 150),
      bridges: bridges.slice(0, 30),
      tunnels: tunnels.slice(0, 20),
      emergencyFacilities: emergencyFacilities.slice(0, 30),
      nhaiReachable,
      note: `${roads.length} road segments within ${radiusKm} km of ${area}.${capNote} ${nhaiNote}`,
    };
  } catch (error) {
    return {
      success: false,
      totalCount: 0,
      radiusM,
      byClass: {},
      majorHighways: [],
      allRoads: [],
      bridges: [],
      tunnels: [],
      emergencyFacilities: [],
      nhaiReachable: false,
      note: "Failed to query OpenStreetMap Overpass API",
      error: String(error).substring(0, 200),
    };
  }
}
