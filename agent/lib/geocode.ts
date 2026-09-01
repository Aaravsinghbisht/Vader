export interface GeocodeResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  displayName?: string;
  district?: string;
  state?: string;
  error?: string;
}

function parseAdmin(displayName: string): { district?: string; state?: string } {
  const parts = displayName.split(",").map((p) => p.trim());
  // Nominatim India format: ..., district, state, India
  const indiaIdx = parts.findIndex((p) => p.toLowerCase() === "india");
  if (indiaIdx >= 2) {
    return {
      state: parts[indiaIdx - 1],
      district: parts[indiaIdx - 2],
    };
  }
  if (parts.length >= 2) {
    return { state: parts[parts.length - 2] };
  }
  return {};
}

export async function geocodeLocation(query: string): Promise<GeocodeResult> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
      { headers: { "User-Agent": "VaderAgent/1.0 (disaster-management)" } }
    );
    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: "Location not found" };
    }

    const item = data[0];
    const admin = parseAdmin(item.display_name ?? "");
    const addr = item.address ?? {};

    return {
      success: true,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      displayName: item.display_name,
      district: addr.county ?? addr.state_district ?? admin.district,
      state: addr.state ?? admin.state,
    };
  } catch (error) {
    return { success: false, error: String(error).substring(0, 200) };
  }
}

export function isCoastal(lat: number, lon: number): boolean {
  // Rough India coastline bounding check
  const coastalRegions = [
    { minLat: 8, maxLat: 13.5, minLon: 74, maxLon: 77.5 }, // Kerala/Karnataka west
    { minLat: 12, maxLat: 20, minLon: 72.5, maxLon: 80 }, // Maharashtra/Goa/Karnataka
    { minLat: 20, maxLat: 23.5, minLon: 68.5, maxLon: 72.5 }, // Gujarat
    { minLat: 8, maxLat: 13.5, minLon: 77, maxLon: 80.5 }, // Tamil Nadu
    { minLat: 13.5, maxLat: 22, minLon: 80, maxLon: 88 }, // AP/Odisha/WB east
    { minLat: 21, maxLat: 24.5, minLon: 86.5, maxLon: 89.5 }, // Odisha/WB
    { minLat: 22, maxLat: 24, minLon: 88, maxLon: 89.5 }, // Sundarbans
    { minLat: 9, maxLat: 11, minLon: 92, maxLon: 93.5 }, // Andaman
  ];
  return coastalRegions.some(
    (r) => lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon
  );
}
