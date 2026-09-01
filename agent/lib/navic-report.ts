import type { NavicContextResult } from "./navic-context";

function n(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined) return "N/A";
  return `${v}${unit}`;
}

export function buildNavicReport(navic: NavicContextResult, coastal: boolean): string {
  const lines: string[] = [];
  lines.push("### Geospatial & NavIC-adjacent intelligence");
  lines.push("");
  lines.push(`> ${navic.disclaimer}`);
  lines.push("");

  lines.push("**Positioning & coverage:**");
  lines.push(`- Coordinates: **${navic.coverage.latitude}°, ${navic.coverage.longitude}°**`);
  lines.push(`- NavIC primary zone: **${navic.coverage.inPrimaryZone ? "YES — inside service area" : "NO — outside primary coverage"}**`);
  lines.push(`- Coverage zone: ${navic.coverage.zone}`);
  lines.push("");

  lines.push("**NavIC constellation (ISRO):**");
  lines.push(`- Operational status: **${navic.constellationStatus.operational ? "Operational" : "Unknown/Degraded"}**`);
  lines.push(`- Summary: ${navic.constellationStatus.summary}`);
  lines.push(`- Source: ${navic.constellationStatus.source}`);
  lines.push("");

  lines.push("**GAGAN / SBAS augmentation:**");
  lines.push(`- ${navic.gaganNote}`);
  lines.push("");

  lines.push("**Satellite & map resources for this coordinate:**");
  lines.push(`- [Bhuvan ISRO map portal](${navic.mapLinks.bhuvan})`);
  lines.push(`- [NASA Worldview (recent satellite imagery)](${navic.mapLinks.nasaWorldview})`);
  lines.push(`- [Sentinel Hub EO Browser](${navic.mapLinks.sentinelHub})`);
  lines.push("");

  lines.push("**NavIC operational guidance for this coordinate:**");
  for (const g of navic.operationalGuidance) {
    lines.push(`- ${g}`);
  }
  lines.push("");

  lines.push("**NavIC system facts (public ISRO data):**");
  lines.push("- NavIC (IRNSS) is India's regional GNSS — provides positioning, navigation, and timing over India + 1500 km.");
  lines.push("- Standard Position Service (SPS) on L1/L5/S bands; civilian accuracy ~20 m, timing ~50 ns.");
  lines.push("- Direct live satellite telemetry is NOT available via public API — requires NavIC receiver hardware.");
  lines.push("- For disaster ops: NavIC-enabled devices can provide resilient positioning when cellular fails.");
  lines.push("");

  if (navic.bhuvanAdmin) {
    lines.push("**Bhuvan administrative boundaries (ISRO/NRSC):**");
    if (navic.bhuvanAdmin.village) lines.push(`- Village: ${navic.bhuvanAdmin.village}`);
    if (navic.bhuvanAdmin.district) lines.push(`- District: ${navic.bhuvanAdmin.district}`);
    if (navic.bhuvanAdmin.state) lines.push(`- State: ${navic.bhuvanAdmin.state}`);
    lines.push(`- Source: ${navic.bhuvanAdmin.source}`);
    lines.push("");
  }

  if (!("error" in navic.marine)) {
    const m = navic.marine;
    lines.push("**Marine geospatial layer (model-derived, Open-Meteo):**");
    lines.push(`- Wave height: **${n(m.wave_height, " m")}**`);
    lines.push(`- Wave direction: **${n(m.wave_direction, "°")}**`);
    lines.push(`- Wave period: **${n(m.wave_period, " s")}**`);
    lines.push(`- Wind-wave height: **${n(m.wind_wave_height, " m")}**`);
    lines.push(`- Swell height: **${n(m.swell_wave_height, " m")}**`);
    lines.push(`- Sea surface temperature: **${n(m.sea_surface_temperature, "°C")}**`);
    if (m.wave_height_max_today != null) {
      lines.push(`- Max wave height today: **${n(m.wave_height_max_today, " m")}**`);
    }
    lines.push("");
  } else if (coastal) {
    lines.push("**Marine layer:** Data unavailable for this coordinate (may be inland from coast).");
    lines.push("");
  }

  if (navic.incoisAlerts.length > 0) {
    lines.push("**INCOIS coastal alerts:**");
    for (const alert of navic.incoisAlerts) {
      lines.push(`- ${alert.text} ([source](${alert.url}))`);
    }
    lines.push("");
  } else if (coastal) {
    lines.push("**INCOIS:** No active coastal alert keywords detected on public portal (verify manually at [incois.gov.in](https://incois.gov.in/)).");
    lines.push("");
  }

  lines.push(`*Sources reached: ${navic.sourcesReachable.join(", ") || "none"}. Failed: ${navic.sourcesFailed.join(", ") || "none"}.*`);
  return lines.join("\n");
}
