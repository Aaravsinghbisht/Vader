"use client";

import type { UserContent } from "ai";
import type { ChatStatus } from "ai";
import { useEveAgent } from "eve/react";
import { BrainIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AgentMessage } from "@/app/_components/agent-message";
import {
  advanceBriefingSteps,
  BRIEFING_STEPS,
  BriefingProgress,
  completeBriefingSteps,
  type BriefingStep,
} from "@/app/chat/BriefingProgress";
import {
  EXAMPLE_QUERIES,
  extractLocationQuery,
  isBriefingQuery,
} from "@/lib/location-query";

const AGENT_NAME = "vader";

type BriefingMeta = {
  fetchedAt?: string;
  sourcesReachable?: string[];
  sourcesFailed?: string[];
  areaName?: string;
  latitude?: number;
  longitude?: number;
};

export type LocalChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; report?: string; meta?: BriefingMeta };

export function AgentChat() {
  const agent = useEveAgent();
  const [cancellationError, setCancellationError] = useState<string>();
  const [briefingError, setBriefingError] = useState<string>();
  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([]);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingSteps, setBriefingSteps] = useState<BriefingStep[]>(BRIEFING_STEPS);
  const lastSentMessageRef = useRef<string | UserContent | null>(null);
  const briefingAbortRef = useRef<AbortController | null>(null);

  const isAgentBusy = agent.status === "submitted" || agent.status === "streaming";
  const isBusy = isAgentBusy || briefingBusy;
  const hasConversation = localMessages.length > 0 || agent.data.messages.length > 0;
  const lastMessage = agent.data.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start");
  const showPendingThinking =
    isAgentBusy &&
    (agent.status === "submitted" || lastMessage?.role !== "assistant" || isPendingAssistantShell);

  const errorMessage = cancellationError ?? briefingError ?? agent.error?.message;

  const requestCancellation = () => {
    if (briefingBusy) {
      briefingAbortRef.current?.abort();
      setBriefingBusy(false);
      setBriefingError("Briefing cancelled.");
      return;
    }
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
    });
  };

  const sendMessage = useCallback(
    async (content: string | UserContent) => {
      lastSentMessageRef.current = content;
      setCancellationError(undefined);
      setBriefingError(undefined);
      try {
        await agent.send(content);
      } catch (error: unknown) {
        setCancellationError(toErrorMessage(error));
        throw error;
      }
    },
    [agent],
  );

  const runDirectBriefing = useCallback(async (rawText: string) => {
    const query = extractLocationQuery(rawText);
    const userId = nanoid();
    const assistantId = nanoid();

    setBriefingError(undefined);
    setBriefingBusy(true);
    setBriefingSteps(BRIEFING_STEPS);

    setLocalMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: rawText },
    ]);

    const controller = new AbortController();
    briefingAbortRef.current = controller;

    const stepTimer = window.setInterval(() => {
      setBriefingSteps((prev) => {
        const activeIndex = prev.findIndex((s) => s.status === "active");
        const nextIndex = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, prev.length - 1);
        return advanceBriefingSteps(prev, nextIndex);
      });
    }, 2200);

    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      const data = (await res.json()) as {
        success: boolean;
        report?: string;
        error?: string;
        area?: { name: string; latitude: number; longitude: number };
        meta?: {
          fetchedAt: string;
          sourcesReachable: string[];
          sourcesFailed: string[];
        };
      };

      if (!res.ok || !data.success || !data.report) {
        throw new Error(data.error ?? "Briefing request failed");
      }

      setBriefingSteps(completeBriefingSteps(BRIEFING_STEPS));

      const place = data.area?.name ?? query;
      setLocalMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          text: `Disaster intelligence briefing for ${place}:`,
          report: data.report,
          meta: {
            fetchedAt: data.meta?.fetchedAt,
            sourcesReachable: data.meta?.sourcesReachable,
            sourcesFailed: data.meta?.sourcesFailed,
            areaName: data.area?.name,
            latitude: data.area?.latitude,
            longitude: data.area?.longitude,
          },
        },
      ]);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message = toErrorMessage(error);
      setBriefingError(message);
      setLocalMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          text: `Could not generate briefing: ${message}`,
        },
      ]);
    } finally {
      window.clearInterval(stepTimer);
      setBriefingBusy(false);
      briefingAbortRef.current = null;
    }
  }, []);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isBusy) return;

    if (message.files.length > 0) {
      const parts: UserContent = [];
      if (text.length > 0) {
        parts.push({ text, type: "text" });
      }
      for (const file of message.files) {
        parts.push({
          data: file.url,
          filename: file.filename ?? "attachment",
          mediaType: file.mediaType ?? "application/octet-stream",
          type: "file",
        });
      }
      await sendMessage(parts);
      return;
    }

    if (isBriefingQuery(text)) {
      await runDirectBriefing(text);
      return;
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {hasConversation ? (
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b pl-4 pr-2">
            <span className="truncate text-muted-foreground text-sm">{AGENT_NAME}</span>
            <span className="hidden truncate text-muted-foreground text-xs md:inline">
              Disaster intelligence · live weather · NavIC · web search · roads
            </span>
          </header>
        ) : null}

        {errorMessage ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
            <div
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
              role="alert"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">Request failed</p>
                <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
              </div>
            </div>
          </div>
        ) : null}

        {hasConversation ? (
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
              {localMessages.map((message) => (
                <LocalMessage key={message.id} message={message} />
              ))}
              {agent.data.messages.map((message, index) =>
                showPendingThinking &&
                isPendingAssistantShell &&
                message.id === lastMessage?.id ? null : (
                  <AgentMessage
                    canRespond={!isBusy}
                    isStreaming={
                      agent.status === "streaming" && index === agent.data.messages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={(responses) => agent.respond(responses)}
                  />
                ),
              )}
              {briefingBusy ? <BriefingProgress steps={briefingSteps} /> : null}
              {showPendingThinking ? <PendingThinking /> : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        ) : null}

        <div
          className={
            hasConversation
              ? "mx-auto w-full max-w-3xl shrink-0 px-4 pb-6 sm:px-6"
              : "mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 pb-[10vh]"
          }
        >
          {!hasConversation ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-5xl font-medium tracking-tighter">Vader</h1>
              <p className="max-w-md text-pretty text-sm text-muted-foreground">
                Disaster intelligence agent. Enter any location — live weather, web search, NavIC
                marine, and road conditions.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {EXAMPLE_QUERIES.map((example) => (
                  <button
                    className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={isBusy}
                    key={example}
                    onClick={() => void runDirectBriefing(example)}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <PromptInput className="rounded-2xl" onSubmit={handleSubmit}>
            <PromptInputTextarea
              disabled={isBusy}
              className="min-h-14 max-h-48 py-3.5 pr-12 text-left placeholder:text-center [&:placeholder-shown]:text-center"
              placeholder="Enter any place — Indore, Chennai, इंदौर, दिल्ली…"
            />
            <PromptInputSubmit
              onStop={requestCancellation}
              status={toChatStatus(agent.status, briefingBusy)}
            />
          </PromptInput>
        </div>
      </main>
    </div>
  );
}

function LocalMessage({ message }: { message: LocalChatMessage }) {
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent>
          <MessageResponse>{message.text}</MessageResponse>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>{message.text}</MessageResponse>
        {message.meta ? <BriefingMetaBar meta={message.meta} /> : null}
        {message.report ? (
          <MessageResponse className="mt-2">{message.report}</MessageResponse>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function BriefingMetaBar({ meta }: { meta: BriefingMeta }) {
  const reached = meta.sourcesReachable?.length ?? 0;
  const failed = meta.sourcesFailed?.length ?? 0;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
      {meta.fetchedAt ? (
        <span className="rounded-md border bg-muted/30 px-2 py-0.5">
          {new Date(meta.fetchedAt).toLocaleString()}
        </span>
      ) : null}
      {meta.latitude !== undefined && meta.longitude !== undefined ? (
        <span className="rounded-md border bg-muted/30 px-2 py-0.5">
          {meta.latitude.toFixed(4)}°, {meta.longitude.toFixed(4)}°
        </span>
      ) : null}
      <span className="rounded-md border bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
        {reached} sources OK
      </span>
      {failed > 0 ? (
        <span className="rounded-md border bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
          {failed} failed
        </span>
      ) : null}
    </div>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-sm text-muted-foreground">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toChatStatus(
  status: string,
  briefingBusy: boolean
): ChatStatus | undefined {
  if (briefingBusy) return "streaming";
  if (status === "resuming") return "streaming";
  if (
    status === "submitted" ||
    status === "streaming" ||
    status === "ready" ||
    status === "error"
  ) {
    return status;
  }
  return undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete the request.";
}
