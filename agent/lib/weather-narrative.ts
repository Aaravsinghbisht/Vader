import type { WeatherMetricsResult } from "./weather-metrics";

function n(v: number | string | null | undefined, unit = ""): string {
  if (v === null || v === undefined) return "N/A";
  return `${v}${unit}`;
}

function windDir(deg: number | string | null | undefined): string {
  if (deg === null || deg === undefined) return "N/A";
  const d = Number(deg);
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${d}° (${dirs[Math.round(d / 45) % 8]})`;
}

function dayHazardFlag(day: Record<string, number | string | null>): string {
  const rain = day.precipitation_sum as number | null;
  const wind = day.wind_speed_10m_max as number | null;
  const gust = day.wind_gusts_10m_max as number | null;
  const flags: string[] = [];
  if (rain !== null && rain >= 30) flags.push("heavy rain");
  if (wind !== null && wind >= 50) flags.push("high wind");
  if (gust !== null && gust >= 70) flags.push("dangerous gusts");
  return flags.length > 0 ? flags.join(", ") : "—";
}

export function buildWeatherNarrative(weather: WeatherMetricsResult): string {
  const c = weather.current;
  const lines: string[] = [];

  lines.push("### Weather intelligence narrative");
  lines.push("");

  const temp = c.temperature_2m as number | null;
  const feels = c.apparent_temperature as number | null;
  const humidity = c.relative_humidity_2m as number | null;
  const condition = c.weather_code as string | null;

  lines.push(
    `**Current conditions:** ${condition ?? "Unknown"} with air temperature **${n(temp, "°C")}** (feels like **${n(feels, "°C")}**). Relative humidity is **${n(humidity, "%")}**, dew point **${n(c.dew_point_2m as number, "°C")}**.`
  );

  const precip = c.precipitation as number | null;
  const rain = c.rain as number | null;
  const showers = c.showers as number | null;
  lines.push(
    `**Precipitation now:** ${n(precip, " mm")} total (rain ${n(rain, " mm")}, showers ${n(showers, " mm")}). Visibility **${n(c.visibility as number, " m")}**.`
  );

  lines.push(
    `**Wind:** ${n(c.wind_speed_10m as number, " km/h")} at 10 m, direction ${windDir(c.wind_direction_10m)}, gusts up to **${n(c.wind_gusts_10m as number, " km/h")}**. Upper-level wind (80 m): **${n(c.wind_speed_80m as number, " km/h")}**.`
  );

  lines.push(
    `**Atmospheric pressure:** surface **${n(c.surface_pressure as number, " hPa")}**, MSL **${n(c.pressure_msl as number, " hPa")}**. UV index **${n(c.uv_index as number)}**, shortwave radiation **${n(c.shortwave_radiation as number, " W/m²")}**.`
  );

  lines.push(
    `**Cloud cover:** total **${n(c.cloud_cover as number, "%")}** (low ${n(c.cloud_cover_low as number, "%")}, mid ${n(c.cloud_cover_mid as number, "%")}, high ${n(c.cloud_cover_high as number, "%")}).`
  );

  const cape = c.cape as number | null;
  const soil0 = c.soil_moisture_0_to_1cm as number | null;
  const soil3 = c.soil_moisture_3_to_9cm as number | null;
  lines.push(
    `**Flood/landslide indicators:** CAPE **${n(cape, " J/kg")}** (thunderstorm fuel), soil moisture surface **${n(soil0, " m³/m³")}**, subsurface (3-9 cm) **${n(soil3, " m³/m³")}**, soil temp **${n(c.soil_temperature_0cm as number, "°C")}**, evapotranspiration **${n(c.evapotranspiration as number, " mm")}**.`
  );

  if (weather.hazardFlags.length > 0) {
    lines.push(`**Active hazard flags:** ${weather.hazardFlags.join("; ")}.`);
  } else {
    lines.push("**Active hazard flags:** None flagged at current readings.");
  }

  lines.push("");
  lines.push("**7-day future outlook listing:**");
  lines.push("| Date | Condition | Temp (°C) | Rain (mm) | Rain % | Max wind | Gusts | Hazards |");
  lines.push("|------|-----------|-------------|-----------|--------|----------|-------|---------|");
  for (const day of weather.daily) {
    lines.push(
      `| ${day.date} | ${day.weather_code} | ${n(day.temperature_2m_min as number)}–${n(day.temperature_2m_max as number)} | ${n(day.precipitation_sum as number)} | ${n(day.precipitation_probability_max as number)} | ${n(day.wind_speed_10m_max as number)} | ${n(day.wind_gusts_10m_max as number)} | ${dayHazardFlag(day)} |`
    );
  }

  lines.push("");
  lines.push("**Next 24 hours (every 3h):**");
  lines.push("| Time | Temp | Rain (mm) | Wind | Gusts | Condition |");
  lines.push("|------|------|-----------|------|-------|-----------|");
  const hourly3h = weather.hourlyLast24.filter((_, i) => i % 3 === 0).slice(0, 8);
  for (const h of hourly3h) {
    const time = String(h.time ?? "").replace(/T/, " ");
    lines.push(
      `| ${time} | ${n(h.temperature_2m as number, "°C")} | ${n(h.precipitation as number)} | ${n(h.wind_speed_10m as number)} | ${n(h.wind_gusts_10m as number)} | ${h.weather_code ?? "—"} |`
    );
  }

  if (!("error" in weather.marine)) {
    const m = weather.marine;
    lines.push("");
    lines.push("**Marine/coastal layer:**");
    lines.push(
      `Waves **${n(m.wave_height, " m")}** (period ${n(m.wave_period, " s")}, direction ${windDir(m.wave_direction)}), wind-waves **${n(m.wind_wave_height, " m")}**, swell **${n(m.swell_wave_height, " m")}**, sea surface temp **${n(m.sea_surface_temperature, "°C")}**.`
    );
  }

  const temps = weather.hourlyLast24
    .map((h) => h.temperature_2m as number)
    .filter((t) => t !== null && t !== undefined);
  if (temps.length >= 2) {
    const trend = temps[temps.length - 1] - temps[0];
    const trendWord = trend > 1 ? "warming" : trend < -1 ? "cooling" : "stable";
    lines.push("");
    lines.push(
      `**24-hour temperature trend:** ${trendWord} (${temps[0]}°C → ${temps[temps.length - 1]}°C over last ${temps.length} hours).`
    );
  }

  lines.push("");
  lines.push(
    `*${weather.metricCount} live metrics sourced from ${weather.sources.join(", ")}.*`
  );

  return lines.join("\n");
}
