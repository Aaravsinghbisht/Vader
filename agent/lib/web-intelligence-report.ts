import type { WebEnrichedResult, WebIntelResult } from "./web-intelligence";

function formatResultItem(r: WebEnrichedResult, index: number): string[] {
  const lines: string[] = [];
  lines.push(`**${index}. ${r.title}**`);
  if (r.snippet) lines.push(`- Summary: ${r.snippet}`);
  if (r.excerpt) lines.push(`- Detail: ${r.excerpt}`);
  lines.push(`- Link: ${r.url}`);
  lines.push("");
  return lines;
}

export function buildWebIntelReport(web: WebIntelResult, place: string): string {
  const lines: string[] = [];
  lines.push("### Live web intelligence");
  lines.push("");
  lines.push(`**Area:** ${place}`);
  lines.push(`**Summary:** ${web.summary}`);
  lines.push(`**Queries:** ${web.searchQueries.join(" | ")}`);
  lines.push("");

  if (web.roadReports.length > 0) {
    lines.push("**Road & traffic reports:**");
    lines.push("");
    web.roadReports.forEach((r, i) => lines.push(...formatResultItem(r, i + 1)));
  } else {
    lines.push("**Road & traffic:** No live closure or traffic reports found in web search.");
    lines.push("");
  }

  if (web.officialMentions.length > 0) {
    lines.push("**Official / IMD mentions:**");
    lines.push("");
    web.officialMentions.forEach((r, i) => lines.push(...formatResultItem(r, i + 1)));
  }

  lines.push(
    `*Web intel via DuckDuckGo HTML search. ${web.sourcesReachable.length} queries succeeded, ${web.sourcesFailed.length} failed.*`
  );
  return lines.join("\n");
}

export function buildGroundSituationReport(web: WebIntelResult, place: string): string {
  const lines: string[] = [];
  lines.push("### Area situation (ground reports)");
  lines.push("");
  lines.push(`**Area:** ${place}`);

  if (web.groundReports.length === 0) {
    lines.push("No recent ground-level disaster reports found in web search. Monitor local media and district control rooms.");
    return lines.join("\n");
  }

  lines.push(`**${web.groundReports.length} ground reports indexed:**`);
  lines.push("");
  web.groundReports.forEach((r, i) => lines.push(...formatResultItem(r, i + 1)));

  lines.push(
    "**Assessment:** These reports reflect public media and indexed web content. Cross-check with IMD/NDMA before operational decisions."
  );
  return lines.join("\n");
}

export function extractWebRiskSignals(web: WebIntelResult): string[] {
  const signals: string[] = [];
  const blob = web.allResults
    .map((r) => `${r.title} ${r.snippet} ${r.excerpt ?? ""}`)
    .join(" ")
    .toLowerCase();

  if (/\b(road blocked|road closed|nh blocked|highway closed)\b/.test(blob)) {
    signals.push("Web: road closure reported");
  }
  if (/\b(evacuat|rescue|stranded)\b/.test(blob)) {
    signals.push("Web: evacuation/rescue activity reported");
  }
  if (/\b(flood|submerged|waterlog|inundat)\b/.test(blob)) {
    signals.push("Web: flooding/waterlogging reported");
  }
  if (/\b(landslide|mudslide)\b/.test(blob)) {
    signals.push("Web: landslide reported");
  }
  if (/\b(red alert|orange alert|severe warning)\b/.test(blob)) {
    signals.push("Web: high-severity alert mentioned");
  }
  return signals;
}
