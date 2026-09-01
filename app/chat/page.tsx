import type { Metadata } from "next";
import { AgentChat } from "./AgentChat";

export const metadata: Metadata = {
  title: "Vader — Disaster Intelligence",
};

export default function ChatPage() {
  return <AgentChat />;
}
