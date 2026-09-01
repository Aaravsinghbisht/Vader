import type { GovAlert } from "./gov-alerts";
import type { DisasterNewsResult } from "./disaster-news";
import { buildNewsReport } from "./disaster-news";
import type { NavicContextResult } from "./navic-context";
import { buildNavicReport } from "./navic-report";
import type { RoadsResult } from "./roads-overpass";
import { buildRoadsReport } from "./roads-report";
import type { WeatherMetricsResult } from "./weather-metrics";
import { buildWeatherNarrative } from "./weather-narrative";
import type { WebIntelResult } from "./web-intelligence";
import {
  buildGroundSituationReport,
  buildWebIntelReport,
  extractWebRiskSignals,
} from "./web-intelligence-report";

export interface FullReportInput {
  areaName: string;
  query: string;
  latitude: number;
  longitude: number;
  district?: string;
  state?: string;
  village?: string;
  coastal: boolean;
  weather: WeatherMetricsResult;
  roads: RoadsResult;
  navic: NavicContextResult;
  news: DisasterNewsResult;
  webIntel: WebIntelResult;
  alerts: GovAlert[];
  sourcesReachable: string[];
  sourcesFailed: string[];
  fetchedAt: string;
}

function computeRiskLevel(input: FullReportInput): {
  level: string;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  for (const flag of input.weather.hazardFlags) {
    score += 2;
    reasons.push(`Weather: ${flag}`);
  }

  for (const alert of input.alerts) {
    if (alert.severity === "Extreme") score += 4;
    else if (alert.severity === "High") score += 3;
    else if (alert.severity === "Moderate") score += 2;
    else score += 1;
    reasons.push(`Alert (${alert.source}): ${alert.alertType}`);
  }

  for (const signal of extractWebRiskSignals(input.webIntel)) {
    score += 2;
    reasons.push(signal);
  }

  if (input.news.articles.length >= 5) {
    const disasterNews = input.news.articles.filter((a) =>
      /flood|cyclone|landslide|evacuat|rescue|storm|heavy rain|disaster/i.test(a.title)
    );
    if (disasterNews.length > 0) {
      score += 2;
      reasons.push(`News: ${disasterNews.length} active disaster-related reports`);
    }
  }

  if (!input.roads.success || input.roads.totalCount === 0) {
    reasons.push("Road data incomplete — access assessment limited");
  }

  let level = "Low";
  if (score >= 8) level = "Extreme";
  else if (score >= 5) level = "High";
  else if (score >= 2) level = "Moderate";

  if (reasons.length === 0) {
    reasons.push("No major hazard flags in current data — continue monitoring");
  }

  return { level, reasons };
}

function buildActions(riskLevel: string, coastal: boolean): string[] {
  const actions: string[] = [
    "Share this briefing with local disaster management cell and district collector office.",
    "Monitor IMD and NDMA official channels for updated advisories.",
  ];

  if (riskLevel === "High" || riskLevel === "Extreme") {
    actions.unshift("Activate local emergency coordination — pre-position rescue teams and relief supplies.");
    actions.push("Issue public advisory via district emergency operations center.");
    actions.push("Identify evacuation routes using major highways listed in roads section; avoid bridges if flooding expected.");
  } else if (riskLevel === "Moderate") {
    actions.push("Pre-check drainage, vulnerable structures, and emergency shelter readiness.");
    actions.push("Brief field teams on current weather trend and road access options.");
  } else {
    actions.push("Maintain routine monitoring; no immediate evacuation indicated from current data.");
  }

  if (coastal) {
    actions.push("Coastal area: monitor INCOIS bulletins and restrict non-essential marine activity if waves rise.");
  }

  return actions;
}

export function buildFullReport(input: FullReportInput): string {
  const lines: string[] = [];
  const risk = computeRiskLevel(input);
  const actions = buildActions(risk.level, input.coastal);

  lines.push(`# Disaster Intelligence Briefing`);
  lines.push("");
  lines.push(`**Area queried:** ${input.query}`);
  lines.push(`**Resolved location:** ${input.areaName}`);
  lines.push(`**Coordinates:** ${input.latitude}°, ${input.longitude}°`);
  lines.push(`**Report generated:** ${input.fetchedAt}`);
  lines.push(`**Sources reached:** ${input.sourcesReachable.length} | **Failed:** ${input.sourcesFailed.length}`);
  lines.push("");

  lines.push("## 1. Area & Coordinates");
  lines.push(`- **Coordinates:** ${input.latitude}°, ${input.longitude}°`);
  if (input.district) lines.push(`- **District:** ${input.district}`);
  if (input.state) lines.push(`- **State:** ${input.state}`);
  if (input.village) lines.push(`- **Village:** ${input.village}`);
  lines.push(`- **Context:** ${input.coastal ? "Coastal zone" : "Inland area"}`);
  lines.push("");

  lines.push("## 2. Weather Situation");
  lines.push("");
  lines.push(
    input.weather.success
      ? buildWeatherNarrative(input.weather)
      : "Weather data unavailable."
  );
  lines.push("");

  lines.push("## 3. Geospatial & NavIC-Adjacent Intelligence");
  lines.push("");
  lines.push(buildNavicReport(input.navic, input.coastal));
  lines.push("");

  lines.push("## 4. Live Web Intelligence");
  lines.push("");
  lines.push(buildWebIntelReport(input.webIntel, input.areaName));
  lines.push("");

  lines.push("## 5. Active Alerts & Hazards");
  if (input.alerts.length === 0) {
    lines.push("No specific hazard alerts extracted from IMD/NDMA public pages. Verify manually at [mausam.imd.gov.in](https://mausam.imd.gov.in/) and [ndma.gov.in](https://ndma.gov.in/).");
  } else {
    for (const a of input.alerts) {
      lines.push(`- **[${a.severity}] ${a.alertType}** (${a.source}): ${a.text}`);
      lines.push(`  - Source: ${a.url}`);
    }
  }
  lines.push("");

  lines.push("## 6. Roads & Access");
  lines.push("");
  lines.push(
    input.roads.success
      ? buildRoadsReport(input.roads, input.areaName, input.webIntel)
      : "Road data unavailable — Overpass API may have timed out. Retry or check OpenStreetMap manually."
  );
  lines.push("");

  lines.push("## 7. Disaster News & Public Reports");
  lines.push("");
  lines.push(buildNewsReport(input.news, input.areaName));
  lines.push("");

  lines.push("## 8. Area Situation (Ground Reports)");
  lines.push("");
  lines.push(buildGroundSituationReport(input.webIntel, input.areaName));
  lines.push("");

  lines.push("## 9. Overall Risk Assessment");
  lines.push(`**Risk level: ${risk.level}**`);
  lines.push("");
  lines.push("**Key factors:**");
  for (const r of risk.reasons) {
    lines.push(`- ${r}`);
  }
  lines.push("");

  lines.push("## 10. Recommended Actions");
  actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");

  lines.push("## Sources");
  lines.push(`**Reached:** ${input.sourcesReachable.join(", ") || "none"}`);
  if (input.sourcesFailed.length > 0) {
    lines.push(`**Unreachable:** ${input.sourcesFailed.join(", ")}`);
  }

  return lines.join("\n");
}
