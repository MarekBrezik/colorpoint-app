interface CloudflareEnv {
  AI: Ai;
  AI_MODEL?: string;
  ASSETS: Fetcher;
}

declare interface Ai {
  run(
    model: string,
    inputs: Record<string, unknown> | { messages: Array<{ role: string; content: string }> },
  ): Promise<unknown>;
}
