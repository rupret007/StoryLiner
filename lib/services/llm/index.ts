import { MockLlmAdapter } from "./mock-adapter";
import { OpenAiLlmAdapter } from "./openai-adapter";
import type { LLMAdapter } from "./types";

let _adapter: LLMAdapter | null = null;

export function getLlmAdapter(): LLMAdapter {
  if (_adapter) return _adapter;

  const adapterName = process.env.LLM_ADAPTER ?? "mock";

  switch (adapterName) {
    case "openai":
      _adapter = new OpenAiLlmAdapter();
      break;
    case "mock":
    default:
      _adapter = new MockLlmAdapter();
      break;
  }

  return _adapter;
}

export type { LLMAdapter, GenerateContentOptions, GeneratedContent, RewriteOptions, RiskAssessment } from "./types";
