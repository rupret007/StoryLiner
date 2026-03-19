import { MockLlmAdapter } from "./mock-adapter";
import { OpenAiLlmAdapter } from "./openai-adapter";
import type { LLMAdapter } from "./types";

let _adapter: LLMAdapter | null = null;

export function getLlmAdapter(): LLMAdapter {
  if (_adapter) return _adapter;

  const adapterName = process.env.LLM_ADAPTER ?? "mock";

  switch (adapterName) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "[StoryLiner] LLM_ADAPTER=openai is set but OPENAI_API_KEY is not defined in .env.local. " +
            "Add it, or set LLM_ADAPTER=mock to use the template-based mock adapter."
        );
      }
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
