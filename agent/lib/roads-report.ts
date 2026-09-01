import type { RoadSegment, RoadsResult } from "./roads-overpass";
import type { WebIntelResult } from "./web-intelligence";

export function buildRoadsReport(
  roads: RoadsResult,
  areaName: string,
  webIntel?: WebIntelResult
): string {
  const lines: string[] = [];
  lines.push("### Roads & access intelligence");
  lines.push("");
  lines.push(`**Area:** ${areaName}`);
  lines.push(`**Search radius:** ${(roads.radiusM / 1000).toFixed(1)} km`);
  lines.push(`**Total road segments found:** ${roads.totalCount}`);
  lines.push(`**NHAI portal:** ${roads.nhaiReachable ? "reachable" : "unreachable"}`);
  lines.push(`**Note:** ${roads.note}`);
  lines.push("");
  lines.push(
    "> **Data distinction:** OpenStreetMap = road infrastructure map (what exists). Web search = live reported conditions (closures, flooding on roads)."
  );
  lines.push("");

  if (webIntel && webIntel.roadReports.length > 0) {
    lines.push("**Live road situation (web reports):**");
    for (const r of webIntel.roadReports.slice(0, 6)) {
      lines.push(`- **${r.title}**`);
      if (r.snippet) lines.push(`  - ${r.snippet}`);
      if (r.excerpt) lines.push(`  - ${r.excerpt}`);
      lines.push(`  - [Source](${r.url})`);
    }
    lines.push("");
  } else {
    lines.push("**Live road situation:** No road closure or traffic disruption reports found in web search.");
    lines.push("");
  }

  if (Object.keys(roads.byClass).length > 0) {
    lines.push("**Breakdown by road class:**");
    const sorted = Object.entries(roads.byClass).sort((a, b) => b[1] - a[1]);
    for (const [cls, count] of sorted) {
      lines.push(`- ${cls}: ${count} segments`);
    }
    lines.push("");
  }

  const bridges = roads.bridges ?? roads.allRoads.filter((r) => r.bridge);
  const tunnels = roads.tunnels ?? roads.allRoads.filter((r) => r.tunnel);
  if (bridges.length > 0) {
    lines.push(`**Bridges in area:** ${bridges.length} (evacuation/access choke points)`);
    for (const b of bridges.slice(0, 15)) {
      lines.push(`- ${b.name}${b.ref ? ` (${b.ref})` : ""} [${b.highway}]`);
    }
    lines.push("");
  }
  if (tunnels.length > 0) {
    lines.push(`**Tunnels in area:** ${tunnels.length}`);
    for (const t of tunnels.slice(0, 10)) {
      lines.push(`- ${t.name}${t.ref ? ` (${t.ref})` : ""} [${t.highway}]`);
    }
    lines.push("");
  }

  lines.push("**Major highways & arteries (top 30):**");
  lines.push("| Name | Ref | Class | Surface | Lanes | Length | Bridge |");
  lines.push("|------|-----|-------|---------|-------|--------|--------|");
  for (const r of roads.majorHighways) {
    lines.push(
      `| ${r.name} | ${r.ref || "—"} | ${r.highway} | ${r.surface} | ${r.lanes || "—"} | ${r.lengthM}m | ${r.bridge ? "yes" : "no"} |`
    );
  }
  lines.push("");

  const namedRoads = roads.allRoads
    .filter((r) => r.name !== "Unnamed road")
    .slice(0, 60);
  if (namedRoads.length > 0) {
    lines.push("**Named roads in vicinity (sample):**");
    lines.push("| Name | Ref | Class | Surface | Max speed |");
    lines.push("|------|-----|-------|---------|-----------|");
    for (const r of namedRoads) {
      lines.push(
        `| ${r.name} | ${r.ref || "—"} | ${r.highway} | ${r.surface} | ${r.maxspeed || "—"} |`
      );
    }
    lines.push("");
  }

  if (roads.emergencyFacilities && roads.emergencyFacilities.length > 0) {
    lines.push("**Emergency facilities nearby:**");
    lines.push("| Type | Name |");
    lines.push("|------|------|");
    for (const f of roads.emergencyFacilities.slice(0, 20)) {
      lines.push(`| ${f.type} | ${f.name} |`);
    }
    lines.push("");
  }

  lines.push(`*Road inventory from OpenStreetMap Overpass API. ${roads.allRoads.length} segments listed in dossier.*`);
  return lines.join("\n");
}

export function buildRoadsAccessSummary(roads: RoadsResult): {
  totalSegments: number;
  majorCount: number;
  bridgeCount: number;
  tunnelCount: number;
  topHighways: string[];
} {
  return {
    totalSegments: roads.totalCount,
    majorCount: roads.majorHighways.length,
    bridgeCount: (roads.bridges ?? []).length || roads.allRoads.filter((r) => r.bridge).length,
    tunnelCount: (roads.tunnels ?? []).length || roads.allRoads.filter((r) => r.tunnel).length,
    topHighways: roads.majorHighways.slice(0, 10).map((r) => {
      const label = r.ref ? `${r.ref} ${r.name}` : r.name;
      return `${label} (${r.highway}, ${r.lengthM}m)`;
    }),
  };
}
