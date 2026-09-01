"use client";

import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";

export type BriefingStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

export const BRIEFING_STEPS: BriefingStep[] = [
  { id: "geocode", label: "Geocoding location", status: "pending" },
  { id: "weather", label: "Fetching weather & 7-day forecast", status: "pending" },
  { id: "web", label: "Searching web for live reports", status: "pending" },
  { id: "roads", label: "Mapping roads & infrastructure", status: "pending" },
  { id: "navic", label: "Gathering NavIC & geospatial data", status: "pending" },
  { id: "report", label: "Building intelligence briefing", status: "pending" },
];

export function BriefingProgress({ steps }: { steps: BriefingStep[] }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <Shimmer duration={1.2}>Gathering intel from 8+ sources…</Shimmer>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li className="flex items-center gap-2 text-sm" key={step.id}>
            {step.status === "done" ? (
              <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
            ) : step.status === "active" ? (
              <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={
                step.status === "active"
                  ? "text-foreground"
                  : step.status === "done"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function advanceBriefingSteps(
  steps: BriefingStep[],
  activeIndex: number
): BriefingStep[] {
  return steps.map((step, i) => ({
    ...step,
    status: i < activeIndex ? "done" : i === activeIndex ? "active" : "pending",
  }));
}

export function completeBriefingSteps(steps: BriefingStep[]): BriefingStep[] {
  return steps.map((step) => ({ ...step, status: "done" as const }));
}
