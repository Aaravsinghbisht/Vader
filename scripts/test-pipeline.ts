
import { runBriefing } from "../agent/lib/run-briefing";
import { fetchWebIntelligence } from "../agent/lib/web-intelligence";
import { geocodeLocation, isCoastal } from "../agent/lib/geocode";

async function testWebIntel(query: string) {
  const geo = await geocodeLocation(query);
  if (!geo.success || !geo.latitude || !geo.longitude) {
    console.error("  Web intel: SKIP (geocode failed)");
    return false;
  }

  const web = await fetchWebIntelligence({
    place: geo.displayName ?? query,
    state: geo.state,
    district: geo.district,
    timeoutMs: 15000,
  });

  console.log(
    `  Web intel: ${web.success ? "OK" : "PARTIAL"} (${web.allResults.length} results, ${web.roadReports.length} road, ${web.groundReports.length} ground)`
  );
  return web.searchQueries.length > 0;
}

async function testBriefing(query: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing briefing: ${query}`);
  console.log("=".repeat(60));

  const result = await runBriefing({ query, radiusKm: 5 });

  if (!result.success || !result.area) {
    console.error("BRIEFING FAILED:", result.error);
    return false;
  }

  const coastal = isCoastal(result.area.latitude, result.area.longitude);

  console.log(`Area: ${result.area.name}`);
  console.log(`Coastal: ${coastal}`);
  console.log(`Weather metrics: ${result.stats?.weatherMetrics ?? 0}`);
  console.log(`Road segments: ${result.stats?.roadSegments ?? 0}`);
  console.log(`News articles: ${result.stats?.newsArticles ?? 0}`);
  console.log(`Alerts: ${result.stats?.alerts ?? 0}`);
  console.log(`Web results: ${result.stats?.webResults ?? 0}`);
  console.log(`Report length: ${result.report.length} chars`);
  console.log(`Sources OK: ${result.meta?.sourcesReachable.length ?? 0}`);
  console.log(`Sources failed: ${result.meta?.sourcesFailed.length ?? 0}`);

  const ok =
    result.report.length > 2000 &&
    (result.stats?.weatherMetrics ?? 0) >= 20 &&
    result.report.includes("Disaster Intelligence Briefing") &&
    result.report.includes("7-day future outlook") &&
    result.report.includes("Live web intelligence");

  console.log(`Result: ${ok ? "PASS" : "FAIL"}`);
  return ok;
}

const results: boolean[] = [];

for (const query of ["Kolar Bhopal MP", "Chennai Marina"]) {
  results.push(await testWebIntel(query));
  results.push(await testBriefing(query));
}

const allPass = results.every(Boolean);
console.log(`\n${"=".repeat(60)}`);
console.log(allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
process.exit(allPass ? 0 : 1);
