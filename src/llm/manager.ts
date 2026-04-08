import type {
  LLMProvider,
  LLMMessage,
  LLMOptions,
  LLMResponse,
  LLMStreamEvent,
} from './provider.ts';

export class LLMManager {
  private providers: Map<string, LLMProvider> = new Map();
  private primaryProvider = '';
  private fallbackChain: string[] = [];
  private static readonly MAX_RETRIES_PER_PROVIDER = 3;

  constructor() {}

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);

    // Set as primary if it's the first provider
    if (!this.primaryProvider) {
      this.primaryProvider = provider.name;
    }
  }

  setPrimary(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' not registered`);
    }
    this.primaryProvider = name;
  }

  setFallbackChain(names: string[]): void {
    for (const name of names) {
      if (!this.providers.has(name)) {
        throw new Error(`Provider '${name}' not registered`);
      }
    }
    this.fallbackChain = names;
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  getPrimary(): string {
    return this.primaryProvider;
  }

  getFallbackChain(): string[] {
    return [...this.fallbackChain];
  }

  getProviderNames(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Atomically replace all providers. Safe for in-flight requests because
   * JS is single-threaded and the map assignment is atomic.
   */
  replaceProviders(providers: LLMProvider[], primary: string, fallback: string[]): void {
    const newMap = new Map<string, LLMProvider>();
    for (const p of providers) {
      newMap.set(p.name, p);
    }
    this.providers = newMap;
    this.primaryProvider = newMap.has(primary) ? primary : (providers[0]?.name ?? '');
    this.fallbackChain = fallback.filter(n => newMap.has(n));
  }

  /**
   * Temporarily override the primary provider for a single call.
   * Used for per-message LLM selection from chat dashboard.
   */
  async chatWithOverride(
    messages: LLMMessage[],
    overridePrimary: string | null,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const providerName = overridePrimary && this.providers.has(overridePrimary) ? overridePrimary : this.primaryProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not registered`);
    }

    const errors: string[] = [];
    for (let attempt = 1; attempt <= LLMManager.MAX_RETRIES_PER_PROVIDER; attempt++) {
      try {
        return await provider.chat(messages, options);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`attempt ${attempt}: ${errorMsg}`);
        console.error(`Provider ${providerName} failed (attempt ${attempt}/${LLMManager.MAX_RETRIES_PER_PROVIDER}):`, errorMsg);
      }
    }

    throw new Error(
      `Provider '${providerName}' failed after ${LLMManager.MAX_RETRIES_PER_PROVIDER} attempts:\n${errors.map(e => `  ${e}`).join('\n')}`
    );
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const providerName = this.primaryProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not registered`);
    }

    const errors: string[] = [];
    for (let attempt = 1; attempt <= LLMManager.MAX_RETRIES_PER_PROVIDER; attempt++) {
      try {
        return await provider.chat(messages, options);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`attempt ${attempt}: ${errorMsg}`);
        console.error(`Provider ${providerName} failed (attempt ${attempt}/${LLMManager.MAX_RETRIES_PER_PROVIDER}):`, errorMsg);
      }
    }

    throw new Error(
      `Provider '${providerName}' failed after ${LLMManager.MAX_RETRIES_PER_PROVIDER} attempts:\n${errors.map(e => `  ${e}`).join('\n')}`
    );
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMStreamEvent> {
    const providerName = this.primaryProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      yield { type: 'error', error: `Provider '${providerName}' not registered` };
      return;
    }

    const errors: string[] = [];
    for (let attempt = 1; attempt <= LLMManager.MAX_RETRIES_PER_PROVIDER; attempt++) {
      try {
        let hasError = false;
        for await (const event of provider.stream(messages, options)) {
          if (event.type === 'error') {
            hasError = true;
            errors.push(`attempt ${attempt}: ${event.error}`);
            console.error(`Provider ${providerName} stream error (attempt ${attempt}/${LLMManager.MAX_RETRIES_PER_PROVIDER}):`, event.error);
            break;
          }
          yield event;
        }

        if (!hasError) {
          return;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`attempt ${attempt}: ${errorMsg}`);
        console.error(`Provider ${providerName} stream failed (attempt ${attempt}/${LLMManager.MAX_RETRIES_PER_PROVIDER}):`, errorMsg);
      }
    }

    yield {
      type: 'error',
      error: `Provider '${providerName}' failed after ${LLMManager.MAX_RETRIES_PER_PROVIDER} attempts:\n${errors.map(e => `  ${e}`).join('\n')}`,
    };
  }
}
