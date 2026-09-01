import { NextResponse } from "next/server";
import { runBriefing } from "@/agent/lib/run-briefing";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string; radiusKm?: number };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Missing query parameter" },
        { status: 400 }
      );
    }

    const result = await runBriefing({
      query,
      radiusKm: body.radiusKm,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Briefing failed",
        report: "An error occurred while generating the briefing.",
      },
      { status: 500 }
    );
  }
}
