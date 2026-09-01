const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function weatherCodeLabel(v: number | undefined): string {
  if (v === undefined || v === null) return "Unknown";
  return WMO[v] ?? `Code ${v}`;
}

const CURRENT_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "dew_point_2m",
  "precipitation",
  "rain",
  "showers",
  "weather_code",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "wind_speed_80m",
  "surface_pressure",
  "pressure_msl",
  "uv_index",
  "shortwave_radiation",
  "cape",
  "soil_moisture_0_to_1cm",
  "soil_moisture_3_to_9cm",
  "soil_temperature_0cm",
  "evapotranspiration",
].join(",");

const HOURLY_VARS = CURRENT_VARS;

const DAILY_VARS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_sum",
  "precipitation_hours",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "uv_index_max",
  "shortwave_radiation_sum",
  "et0_fao_evapotranspiration",
].join(",");

const MARINE_CURRENT = [
  "wave_height",
  "wave_direction",
  "wave_period",
  "wind_wave_height",
  "swell_wave_height",
  "sea_surface_temperature",
].join(",");

export interface WeatherMetricsResult {
  success: boolean;
  area: string;
  latitude: number;
  longitude: number;
  current: Record<string, number | string | null>;
  hourlyLast24: Array<Record<string, number | string | null>>;
  daily: Array<Record<string, number | string | null>>;
  marine: Record<string, number | null> | { error: string };
  hazardFlags: string[];
  metricCount: number;
  sources: string[];
  error?: string;
}

function pickCurrent(
  current: Record<string, unknown>,
  units: Record<string, string>
): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [key, val] of Object.entries(current)) {
    if (key === "time" || key === "interval") continue;
    if (key === "weather_code") {
      out[key] = weatherCodeLabel(val as number);
      out[`${key}_raw`] = val as number;
    } else {
      out[key] = val as number | null;
    }
    if (units[key]) out[`${key}_unit`] = units[key];
  }
  return out;
}

function computeHazardFlags(
  current: Record<string, number | string | null>,
  daily: Array<Record<string, number | string | null>>
): string[] {
  const flags: string[] = [];
  const precip = current.precipitation as number | null;
  const wind = current.wind_speed_10m as number | null;
  const gust = current.wind_gusts_10m as number | null;
  const cape = current.cape as number | null;
  const soil = current.soil_moisture_0_to_1cm as number | null;
  const codeRaw = current.weather_code_raw as number | undefined;

  if (precip !== null && precip >= 10) flags.push("Heavy precipitation now");
  if (wind !== null && wind >= 50) flags.push("High wind speed");
  if (gust !== null && gust >= 70) flags.push("Dangerous wind gusts");
  if (cape !== null && cape >= 1000) flags.push("High convective energy (thunderstorm risk)");
  if (soil !== null && soil >= 0.4) flags.push("Saturated soil (flood/landslide risk)");
  if (codeRaw !== undefined && [65, 82, 95, 96, 99].includes(codeRaw))
    flags.push("Severe weather condition active");

  const today = daily[0];
  if (today) {
    const rainSum = today.precipitation_sum as number | null;
    if (rainSum !== null && rainSum >= 50) flags.push("Heavy rainfall expected in forecast period");
    const maxWind = today.wind_speed_10m_max as number | null;
    if (maxWind !== null && maxWind >= 60) flags.push("Strong winds forecast");
  }

  return flags;
}

export async function fetchWeatherMetrics(
  latitude: number,
  longitude: number,
  name = "location"
): Promise<WeatherMetricsResult> {
  const tz = "Asia/Kolkata";

  const landUrl =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: tz,
      forecast_days: "7",
      current: CURRENT_VARS,
      hourly: HOURLY_VARS,
      daily: DAILY_VARS,
    });

  const marineUrl =
    "https://marine-api.open-meteo.com/v1/marine?" +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: tz,
      forecast_days: "7",
      current: MARINE_CURRENT,
      daily: "wave_height_max",
    });

  try {
    const [landRes, marineRes] = await Promise.all([fetch(landUrl), fetch(marineUrl)]);
    const land = await landRes.json();
    const marineRaw = await marineRes.json();

    if (land.error) {
      return {
        success: false,
        area: name,
        latitude,
        longitude,
        current: {},
        hourlyLast24: [],
        daily: [],
        marine: { error: "unavailable" },
        hazardFlags: [],
        metricCount: 0,
        sources: [],
        error: land.reason ?? "Open-Meteo forecast failed",
      };
    }

    const c = land.current ?? {};
    const units = { ...(land.current_units ?? {}), ...(land.hourly_units ?? {}) };
    const current = pickCurrent(c, units);

    const hourly = land.hourly ?? {};
    const times: string[] = hourly.time ?? [];
    const last24 = times.slice(0, 24).map((t: string, i: number) => {
      const row: Record<string, number | string | null> = { time: t };
      for (const key of Object.keys(hourly)) {
        if (key === "time") continue;
        const val = hourly[key]?.[i];
        row[key] = key === "weather_code" ? weatherCodeLabel(val) : (val ?? null);
      }
      return row;
    });

    const d = land.daily ?? {};
    const daily = (d.time ?? []).map((t: string, i: number) => {
      const row: Record<string, number | string | null> = { date: t };
      for (const key of Object.keys(d)) {
        if (key === "time") continue;
        const val = d[key]?.[i];
        row[key] = key === "weather_code" ? weatherCodeLabel(val) : (val ?? null);
      }
      return row;
    });

    const marineCurrent = marineRaw.error ? null : marineRaw.current ?? {};
    const marine: Record<string, number | null> | { error: string } = marineCurrent
      ? {
          wave_height: marineCurrent.wave_height ?? null,
          wave_direction: marineCurrent.wave_direction ?? null,
          wave_period: marineCurrent.wave_period ?? null,
          wind_wave_height: marineCurrent.wind_wave_height ?? null,
          swell_wave_height: marineCurrent.swell_wave_height ?? null,
          sea_surface_temperature: marineCurrent.sea_surface_temperature ?? null,
          wave_height_max_today: marineRaw.daily?.wave_height_max?.[0] ?? null,
        }
      : { error: "Marine/wave data unavailable (inland or out of coverage)" };

    const hazardFlags = computeHazardFlags(current, daily);
    const metricCount = Object.keys(current).filter((k) => !k.endsWith("_unit")).length;

    return {
      success: true,
      area: name,
      latitude,
      longitude,
      current,
      hourlyLast24: last24,
      daily,
      marine,
      hazardFlags,
      metricCount,
      sources: ["open-meteo.com", "marine-api.open-meteo.com"],
    };
  } catch (error) {
    return {
      success: false,
      area: name,
      latitude,
      longitude,
      current: {},
      hourlyLast24: [],
      daily: [],
      marine: { error: "unavailable" },
      hazardFlags: [],
      metricCount: 0,
      sources: [],
      error: String(error).substring(0, 200),
    };
  }
}

/** Backward-compatible summary for weather_forecast tool */
export async function fetchWeatherSummary(
  latitude: number,
  longitude: number,
  name?: string
) {
  const full = await fetchWeatherMetrics(latitude, longitude, name);
  if (!full.success) {
    return { success: false, error: full.error };
  }

  return {
    success: true,
    area: full.area,
    latitude: full.latitude,
    longitude: full.longitude,
    land: {
      current: {
        condition: full.current.weather_code,
        temperatureC: full.current.temperature_2m,
        feelsLikeC: full.current.apparent_temperature,
        humidityPct: full.current.relative_humidity_2m,
        precipitationMm: full.current.precipitation,
        windKmh: full.current.wind_speed_10m,
        windDirectionDeg: full.current.wind_direction_10m,
      },
      forecast: full.daily.map((d) => ({
        date: d.date,
        condition: d.weather_code,
        maxTempC: d.temperature_2m_max,
        minTempC: d.temperature_2m_min,
        precipitationMm: d.precipitation_sum,
        precipProbPct: d.precipitation_probability_max,
        maxWindKmh: d.wind_speed_10m_max,
        maxGustKmh: d.wind_gusts_10m_max,
      })),
    },
    marine:
      "error" in full.marine
        ? full.marine
        : {
            current: {
              waveHeightM: full.marine.wave_height,
              waveDirectionDeg: full.marine.wave_direction,
              wavePeriodS: full.marine.wave_period,
              windWaveHeightM: full.marine.wind_wave_height,
              swellWaveHeightM: full.marine.swell_wave_height,
              seaSurfaceTempC: full.marine.sea_surface_temperature,
            },
            maxWaveTodayM: full.marine.wave_height_max_today,
          },
    metrics: full.current,
    hazardFlags: full.hazardFlags,
    metricCount: full.metricCount,
  };
}
