import { defineTool } from "eve/tools";
import { z } from "zod";
import { runBriefing } from "../lib/run-briefing";

export default defineTool({
  description:
    "ONLY TOOL NEEDED for area disaster queries. Pass a place name/address. Returns a complete ready-to-deliver markdown briefing — weather, NavIC, roads, web intel, alerts, news with links, risk assessment, and actions. After calling this, output the `report` field to the user. Do NOT call any other tools.",
  inputSchema: z.object({
    query: z.string().describe("Place name, address, or area (e.g. 'Kolar Bhopal MP')"),
    radiusKm: z
      .number()
      .optional()
      .default(5)
      .describe("Search radius in km for nearby roads (max 25)"),
  }),
  async execute(input) {
    return runBriefing({ query: input.query, radiusKm: input.radiusKm });
  },
});
