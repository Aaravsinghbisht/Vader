import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const ollamaModel = process.env.OLLAMA_MODEL ?? "lfm2.5";

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: ollamaBaseUrl,
});

export default defineAgent({
  model: ollama(ollamaModel),
  modelContextWindowTokens: 8192,
  compaction: {
    thresholdPercent: 0.7,
  },
  limits: {
    maxInputTokensPerSession: 8000,
    maxOutputTokensPerSession: 4000,
  },
});
