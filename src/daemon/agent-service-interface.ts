import type { LLMStreamEvent } from '../llm/provider.ts';

/**
 * Common interface for agent services that can handle messages.
 * Both the main AgentService (user chat) and BackgroundAgentService
 * (heartbeat/reactions) implement this.
 */
export interface IAgentService {
  handleMessage(text: string, conversationId: string, channel?: string): Promise<string>;
  streamMessage(text: string, conversationId: string, channel?: string, siteContext?: string): {
    stream: AsyncIterable<LLMStreamEvent>;
    onComplete: (fullText: string) => Promise<void>;
  };
  handleHeartbeat(coalescedEvents?: string): Promise<string | null>;
}
