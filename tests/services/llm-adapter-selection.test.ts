describe("LLM adapter selection", () => {
  const originalAdapter = process.env.LLM_ADAPTER;
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    jest.resetModules();
    if (originalAdapter === undefined) {
      delete process.env.LLM_ADAPTER;
    } else {
      process.env.LLM_ADAPTER = originalAdapter;
    }
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("uses the offline mock adapter by default", async () => {
    delete process.env.LLM_ADAPTER;
    const { getLlmAdapter } = await import("@/lib/services/llm");

    expect(getLlmAdapter().name).toBe("mock");
  });

  it("fails closed for an unsupported adapter name", async () => {
    process.env.LLM_ADAPTER = "opneai";
    const { getLlmAdapter } = await import("@/lib/services/llm");

    expect(() => getLlmAdapter()).toThrow(
      '[StoryLiner] Unsupported LLM_ADAPTER="opneai". Use "mock" or "openai".'
    );
  });

  it("requires an API key before selecting the OpenAI adapter", async () => {
    process.env.LLM_ADAPTER = "openai";
    delete process.env.OPENAI_API_KEY;
    const { getLlmAdapter } = await import("@/lib/services/llm");

    expect(() => getLlmAdapter()).toThrow(/OPENAI_API_KEY is not defined/);
  });
});
