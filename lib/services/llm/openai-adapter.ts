/**
 * OpenAI LLM Adapter - server-only, requires OPENAI_API_KEY env var.
 * 
 * This is a stubbed integration seam. To wire this up:
 * 1. npm install openai
 * 2. Set OPENAI_API_KEY in .env.local
 * 3. Set LLM_ADAPTER=openai in .env.local
 * 4. Implement the prompt assembly and call in each method
 * 
 * See docs/architecture.md for full prompt engineering guidance.
 */

import type { Band, BandVoiceProfile, Platform } from "@prisma/client";
import type {
  LLMAdapter,
  GenerateContentOptions,
  GeneratedContent,
  RewriteOptions,
  RiskAssessment,
} from "./types";

export class OpenAiLlmAdapter implements LLMAdapter {
  name = "openai";

  private get apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    return key;
  }

  private get model(): string {
    return process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateContent(_options: GenerateContentOptions): Promise<GeneratedContent> {
    throw new Error(
      "OpenAI adapter not fully implemented. Set LLM_ADAPTER=mock or implement this method. See docs/architecture.md."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async rewriteContent(_options: RewriteOptions): Promise<string> {
    throw new Error("OpenAI adapter not fully implemented.");
  }

  async assessRisk(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _caption: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _band: Band & { voiceProfile: BandVoiceProfile | null }
  ): Promise<RiskAssessment> {
    throw new Error("OpenAI adapter not fully implemented.");
  }

  async generateTalkingPoints(_options: {
    livestreamTitle: string;
    bandName: string;
    runOfShowItems: string[];
  }): Promise<string[]> {
    throw new Error("OpenAI adapter not fully implemented.");
  }

  async generateEngagementPrompts(_options: {
    bandName: string;
    platform: Platform;
  }): Promise<string[]> {
    throw new Error("OpenAI adapter not fully implemented.");
  }
}
