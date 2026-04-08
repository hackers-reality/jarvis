/**
 * Agent Service — The Brain
 *
 * Owns the LLM manager, agent orchestrator, and personality state.
 * Builds dynamic system prompts each turn with role context, personality,
 * commitments, and observations.
 */

import { join } from 'node:path';
import type { Service, ServiceStatus } from './services.ts';
import type { JarvisConfig } from '../config/types.ts';
import type { ContentBlock, LLMMessage, LLMResponse, LLMStreamEvent, LLMTool, LLMToolCall } from '../llm/provider.ts';
import type { RoleDefinition } from '../roles/types.ts';
import type { PersonalityModel } from '../personality/model.ts';

import { LLMManager } from '../llm/manager.ts';
import { AnthropicProvider } from '../llm/anthropic.ts';
import { OpenAIProvider } from '../llm/openai.ts';
import { GroqProvider } from '../llm/groq.ts';
import { GeminiProvider } from '../llm/gemini.ts';
import { OllamaProvider } from '../llm/ollama.ts';
import { OpenRouterProvider } from '../llm/openrouter.ts';
import { AgentOrchestrator } from '../agents/orchestrator.ts';
import { loadRole } from '../roles/loader.ts';
import { ToolRegistry, isToolResult, type ToolDefinition } from '../actions/tools/registry.ts';
import { BUILTIN_TOOLS, browser, toolDefToLLMTool } from '../actions/tools/builtin.ts';
import { createDelegateTool, type DelegateToolDeps } from '../actions/tools/delegate.ts';
import { createManageAgentsTool, type AgentToolDeps } from '../actions/tools/agents.ts';
import { contentPipelineTool } from '../actions/tools/content.ts';
import { commitmentsTool } from '../actions/tools/commitments.ts';
import { researchQueueTool } from '../actions/tools/research.ts';
import { documentTool } from '../actions/tools/documents.ts';
import { AgentTaskManager } from '../agents/task-manager.ts';
import { discoverSpecialists, formatSpecialistList } from '../agents/role-discovery.ts';
import { buildSystemPrompt, type PromptContext } from '../roles/prompt-builder.ts';
import type { ProgressCallback } from '../agents/sub-agent-runner.ts';
import {
  getPersonality,
  savePersonality,
} from '../personality/model.ts';
import {
  getChannelPersonality,
  personalityToPrompt,
} from '../personality/adapter.ts';
import {
  extractSignals,
  applySignals,
  recordInteraction,
} from '../personality/learner.ts';
import { getDueCommitments, getUpcoming } from '../vault/commitments.ts';
import { findContent } from '../vault/content-pipeline.ts';
import { getRecentObservations } from '../vault/observations.ts';
import { getRecentConversation } from '../vault/conversations.ts';
import { extractAndStore } from '../vault/extractor.ts';
import { getKnowledgeForMessage } from '../vault/retrieval.ts';
import { formatUserProfileForPrompt } from '../user/profile.ts';
import { getUserProfile } from '../vault/user-profile.ts';
import { getWebappInstructionsForMessage } from '../vault/webapp-templates.ts';
import type { ResearchQueue } from './research-queue.ts';
import type { IAgentService } from './agent-service-interface.ts';
import type { AuthorityEngine } from '../authority/engine.ts';
import { getSidecarManager } from '../actions/tools/sidecar-route.ts';

type FastModeReplyResult = {
  kind: 'reply';
  response: string;
};

export type FastModeApprovalRequest =
  | {
      kind: 'tool';
      requestText: string;
      toolName: string;
      reason: string;
      promptText: string;
    }
  | {
      kind: 'delegate';
      requestText: string;
      toolName: 'delegate_task';
      specialistName: string;
      delegatedTask: string;
      reason: string;
      promptText: string;
    };

type FastModeDecision = FastModeReplyResult | {
  kind: 'approval';
  request: FastModeApprovalRequest;
};

export class AgentService implements Service, IAgentService {
  name = 'agent';
  private _status: ServiceStatus = 'stopped';
  private config: JarvisConfig;
  private llmManager: LLMManager;
  private orchestrator: AgentOrchestrator;
  private role: RoleDefinition | null = null;
  private personality: PersonalityModel | null = null;
  private specialists: Map<string, RoleDefinition> = new Map();
  private specialistListText: string = '';
  private delegationProgressCallback: ProgressCallback | null = null;
  private delegationCallback: ((specialistName: string, task: string) => void) | null = null;
  private researchQueue: ResearchQueue | null = null;
  private taskManager: AgentTaskManager | null = null;
  private authorityEngine: AuthorityEngine | null = null;

  constructor(config: JarvisConfig) {
    this.config = config;
    this.llmManager = new LLMManager();
    this.orchestrator = new AgentOrchestrator();
  }

  /**
   * Set callback for sub-agent progress events (delegation visibility).
   * Typically wired to WebSocket broadcast by the daemon.
   */
  setDelegationProgressCallback(cb: ProgressCallback): void {
    this.delegationProgressCallback = cb;
  }

  /**
   * Set callback fired when the PA delegates a task to a specialist.
   * Used by ws-service to update task board ownership in real time.
   */
  setDelegationCallback(cb: (specialistName: string, task: string) => void): void {
    this.delegationCallback = cb;
  }

  /**
   * Set the research queue for idle-time background research.
   */
  setResearchQueue(queue: ResearchQueue): void {
    this.researchQueue = queue;
  }

  setAuthorityEngine(engine: AuthorityEngine): void {
    this.authorityEngine = engine;
  }


  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  getLLMManager(): LLMManager {
    return this.llmManager;
  }

  getTaskManager(): AgentTaskManager | null {
    return this.taskManager;
  }

  getSpecialists(): Map<string, RoleDefinition> {
    return new Map(this.specialists);
  }

  async start(): Promise<void> {
    this._status = 'starting';

    try {
      // 1. Create LLM providers from config
      this.registerProviders();

      // 2. Load role YAML
      this.role = this.loadActiveRole();

      // 3. Wire LLM manager to orchestrator
      this.orchestrator.setLLMManager(this.llmManager);

      // 4. Discover specialist roles
      this.specialists = discoverSpecialists('roles/specialists');
      if (this.specialists.size > 0) {
        this.specialistListText = formatSpecialistList(this.specialists);
        console.log(`[AgentService] Discovered ${this.specialists.size} specialists: ${Array.from(this.specialists.keys()).join(', ')}`);
      }

      // 5. Register tools (builtin + delegation)
      const toolRegistry = new ToolRegistry();
      for (const tool of BUILTIN_TOOLS) {
        toolRegistry.register(tool);
      }

      // Register content pipeline tool
      toolRegistry.register(contentPipelineTool);

      // Register commitments tool
      toolRegistry.register(commitmentsTool);

      // Register research queue tool
      toolRegistry.register(researchQueueTool);

      // Register document tool (vault-stored documents)
      toolRegistry.register(documentTool);

      // Register delegate_task tool if specialists are available
      if (this.specialists.size > 0) {
        const delegateDeps: DelegateToolDeps = {
          orchestrator: this.orchestrator,
          llmManager: this.llmManager,
          specialists: this.specialists,
          onProgress: (event) => {
            if (this.delegationProgressCallback) {
              this.delegationProgressCallback(event);
            }
          },
          onDelegation: (specialistName, task) => {
            if (this.delegationCallback) {
              this.delegationCallback(specialistName, task);
            }
          },
        };
        const delegateTool = createDelegateTool(delegateDeps);
        toolRegistry.register(delegateTool);
        console.log('[AgentService] Registered delegate_task tool');

        // Register manage_agents tool for persistent/async agents
        this.taskManager = new AgentTaskManager();
        const agentToolDeps: AgentToolDeps = {
          orchestrator: this.orchestrator,
          llmManager: this.llmManager,
          specialists: this.specialists,
          taskManager: this.taskManager,
          onProgress: (event) => {
            if (this.delegationProgressCallback) {
              this.delegationProgressCallback(event);
            }
          },
        };
        const agentTool = createManageAgentsTool(agentToolDeps);
        toolRegistry.register(agentTool);
        console.log('[AgentService] Registered manage_agents tool');
      }

      this.orchestrator.setToolRegistry(toolRegistry);
      console.log(`[AgentService] Registered ${toolRegistry.count()} tools total`);

      // 6. Create primary agent
      this.orchestrator.createPrimary(this.role);

      // 7. Load personality
      this.personality = getPersonality();

      this._status = 'running';
      console.log(`[AgentService] Started with role: ${this.role.name}`);
    } catch (error) {
      this._status = 'error';
      throw error;
    }
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
    const primary = this.orchestrator.getPrimary();
    if (primary) {
      this.orchestrator.terminateAgent(primary.id);
    }

    // Disconnect browser (stops auto-launched Chrome if any)
    if (browser.connected) {
      await browser.disconnect();
    }

    this._status = 'stopped';
    console.log('[AgentService] Stopped');
  }

  status(): ServiceStatus {
    return this._status;
  }

  /**
   * Stream a message through the agent. Returns a stream and an onComplete callback.
   * Optional: override the primary LLM provider or model for this message.
   */
  streamMessage(
    text: string,
    channel: string = 'websocket',
    siteContext?: string,
    llmProviderOverride?: string | null,
    llmModelOverride?: string | null
  ): {
    stream: AsyncIterable<LLMStreamEvent>;
    onComplete: (fullText: string) => Promise<void>;
  } {
    let systemPrompt = this.buildFullSystemPrompt(channel, text);
    if (siteContext) {
      systemPrompt += '\n\n' + siteContext;
    }

    const stream = this.orchestrator.streamMessage(systemPrompt, text, llmProviderOverride, llmModelOverride);

    const onComplete = async (fullText: string): Promise<void> => {
      // Note: orchestrator already adds assistant response to history
      // Run extraction and learning in parallel, wait for both to settle
      await Promise.allSettled([
        this.extractKnowledge(text, fullText).catch((err) =>
          console.error('[AgentService] Extraction error:', err instanceof Error ? err.message : err)
        ),
        this.learnFromInteraction(text, fullText, channel).catch((err) =>
          console.error('[AgentService] Learning error:', err instanceof Error ? err.message : err)
        ),
      ]);
    };

    return { stream, onComplete };
  }

  /**
   * Stream a message directly through the active LLM with no tools,
   * no delegation, and minimal context for low-latency chat.
   */
  streamFastMessage(text: string, channel: string = 'websocket'): {
    stream: AsyncIterable<LLMStreamEvent>;
    onComplete: (fullText: string) => Promise<void>;
  } {
    const systemPrompt = this.buildFastSystemPrompt(channel, text);
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.getRecentChatMessages(channel, text),
    ];

    const stream = this.streamDirectLLM(messages);

    const onComplete = async (fullText: string): Promise<void> => {
      await Promise.allSettled([
        this.extractKnowledge(text, fullText).catch((err) =>
          console.error('[AgentService] Extraction error:', err instanceof Error ? err.message : err)
        ),
        this.learnFromInteraction(text, fullText, channel).catch((err) =>
          console.error('[AgentService] Learning error:', err instanceof Error ? err.message : err)
        ),
      ]);
    };

    return { stream, onComplete };
  }

  getFastModeApprovalRequest(text: string): FastModeApprovalRequest | null {
    return this.classifyFastModeApproval(text);
  }

  async handleFastModeTurn(text: string, channel: string = 'websocket'): Promise<FastModeDecision> {
    const plannerPrompt = this.buildFastPlannerPrompt(channel);
    const messages: LLMMessage[] = [
      { role: 'system', content: plannerPrompt },
      ...this.getRecentChatMessages(channel, text),
    ];

    const response = await this.llmManager.chat(messages);
    const plan = this.parseFastModeDecision(response.content, text);
    if (!plan) {
      return { kind: 'reply', response: response.content };
    }

    if (plan.kind === 'reply') {
      return plan;
    }

    if (plan.kind === 'approval' && plan.request.kind === 'tool') {
      const tool = this.orchestrator.getToolRegistry()?.get(plan.request.toolName);
      if (!tool) {
        return {
          kind: 'reply',
          response: `I can help with that, but the tool \`${plan.request.toolName}\` is not available in this session.`,
        };
      }
    }

    if (plan.kind === 'approval' && plan.request.kind === 'delegate' && !this.specialists.has(plan.request.specialistName)) {
      return {
        kind: 'reply',
        response: `I can help directly, but the specialist \`${plan.request.specialistName}\` is not available right now.`,
      };
    }

    return plan;
  }

  async finalizeFastModeReply(text: string, response: string, channel: string = 'websocket'): Promise<void> {
    await this.finalizeInteraction(text, response, channel);
  }

  streamFastApprovedAction(request: FastModeApprovalRequest, channel: string = 'websocket'): {
    stream: AsyncIterable<LLMStreamEvent>;
    onComplete: (fullText: string) => Promise<void>;
  } {
    const systemPrompt = this.buildFastApprovedSystemPrompt(channel, request);
    const allowedTools = this.getRestrictedFastModeTools(request);
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.getRecentChatMessages(channel, request.requestText),
    ];

    const stream = this.streamRestrictedLLM(messages, allowedTools);

    const onComplete = async (fullText: string): Promise<void> => {
      await this.finalizeInteraction(request.requestText, fullText, channel);
    };

    return { stream, onComplete };
  }

  /**
   * Non-streaming message handler. Returns full response string.
   */
  async handleMessage(text: string, channel: string = 'websocket'): Promise<string> {
    const systemPrompt = this.buildFullSystemPrompt(channel, text);

    const response = await this.orchestrator.processMessage(systemPrompt, text);

    // Run extraction and learning in parallel (non-blocking but tracked)
    Promise.allSettled([
      this.extractKnowledge(text, response).catch((err) =>
        console.error('[AgentService] Extraction error:', err instanceof Error ? err.message : err)
      ),
      this.learnFromInteraction(text, response, channel).catch((err) =>
        console.error('[AgentService] Learning error:', err instanceof Error ? err.message : err)
      ),
    ]);

    return response;
  }

  /**
   * Handle periodic heartbeat with full tool access.
   * Accepts optional coalesced event summary to include in the prompt.
   * Uses processMessage() so the agent can take action (browse, run commands, etc.).
   */
  async handleHeartbeat(coalescedEvents?: string): Promise<string | null> {
    if (!this.role) return null;

    const systemPrompt = this.buildHeartbeatPrompt(coalescedEvents);

    // Build the heartbeat "user message" that triggers the agent
    const parts: string[] = ['[HEARTBEAT] Periodic check-in. Review your responsibilities and take action.'];

    if (coalescedEvents) {
      parts.push('');
      parts.push(coalescedEvents);
    }

    const heartbeatMessage = parts.join('\n');

    try {
      const response = await this.orchestrator.processMessage(systemPrompt, heartbeatMessage);
      if (response && response.trim().length > 0) {
        return response;
      }
      return null;
    } catch (err) {
      console.error('[AgentService] Heartbeat processing error:', err);
      return null;
    }
  }

  // --- Private methods ---

  private registerProviders(): void {
    const { llm } = this.config;
    let hasProvider = false;

    // Register Anthropic
    if (llm.anthropic?.api_key) {
      const provider = new AnthropicProvider(
        llm.anthropic.api_key,
        llm.anthropic.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered Anthropic provider');
    }

    // Register OpenAI
    if (llm.openai?.api_key) {
      const provider = new OpenAIProvider(
        llm.openai.api_key,
        llm.openai.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered OpenAI provider');
    }

    // Register Groq
    if (llm.groq?.api_key) {
      const provider = new GroqProvider(
        llm.groq.api_key,
        llm.groq.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered Groq provider');
    }

    // Register Gemini
    if (llm.gemini?.api_key) {
      const provider = new GeminiProvider(
        llm.gemini.api_key,
        llm.gemini.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered Gemini provider');
    }

    // Register OpenRouter
    if (llm.openrouter?.api_key) {
      const provider = new OpenRouterProvider(
        llm.openrouter.api_key,
        llm.openrouter.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered OpenRouter provider');
    }

    // Register Ollama (always available, no API key needed)
    if (llm.ollama) {
      const provider = new OllamaProvider(
        llm.ollama.base_url,
        llm.ollama.model
      );
      this.llmManager.registerProvider(provider);
      hasProvider = true;
      console.log('[AgentService] Registered Ollama provider');
    }

    if (!hasProvider) {
      console.warn('[AgentService] No LLM providers configured. Responses will be placeholders.');
    }

    // Set primary and fallback chain
    if (hasProvider) {
      try {
        this.llmManager.setPrimary(llm.primary);
      } catch {
        // Primary provider not available, first registered is already primary
      }

      // Set fallback chain (only for providers that were registered)
      const registeredFallbacks = llm.fallback.filter(
        (name) => this.llmManager.getProvider(name) !== undefined
      );
      if (registeredFallbacks.length > 0) {
        this.llmManager.setFallbackChain(registeredFallbacks);
      }
    }
  }

  private loadActiveRole(): RoleDefinition {
    const roleName = this.config.active_role;

    // Try multiple locations for role YAML (package-root-relative for global install)
    const pkgRoot = join(import.meta.dir, '../..');
    const paths = [
      join(pkgRoot, `roles/${roleName}.yaml`),
      join(pkgRoot, `roles/${roleName}.yml`),
      join(pkgRoot, `config/roles/${roleName}.yaml`),
      join(pkgRoot, `config/roles/${roleName}.yml`),
      // Also try CWD-relative for local dev
      `roles/${roleName}.yaml`,
      `roles/${roleName}.yml`,
    ];

    for (const rolePath of paths) {
      try {
        const role = loadRole(rolePath);
        console.log(`[AgentService] Loaded role '${role.name}' from ${rolePath}`);
        return role;
      } catch {
        // Try next path
      }
    }

    // Fatal — cannot start without a role
    throw new Error(
      `[AgentService] Could not load role '${roleName}'. Searched: ${paths.join(', ')}`
    );
  }

  private buildFullSystemPrompt(channel: string, userMessage?: string): string {
    if (!this.role) return '';

    // Build prompt context with live data + vault knowledge
    const context = this.buildPromptContext(userMessage);

    // Build base system prompt from role + context
    const rolePrompt = buildSystemPrompt(this.role, context);

    // Build personality prompt for this channel
    const personality = this.personality ?? getPersonality();
    const channelPersonality = getChannelPersonality(personality, channel);
    const personalityPrompt = personalityToPrompt(channelPersonality);

    return `${rolePrompt}\n\n${personalityPrompt}`;
  }

  private buildFastSystemPrompt(channel: string, userMessage?: string): string {
    if (!this.role) return '';

    const personality = this.personality ?? getPersonality();
    const channelPersonality = getChannelPersonality(personality, channel);
    const personalityPrompt = personalityToPrompt(channelPersonality);
    const context = this.buildPromptContext(userMessage);
    const sections: string[] = [
      `You are ${this.role.name}. ${this.role.description}`,
      '',
      '# Fast Chat Mode',
      'Answer directly and conversationally.',
      'Do not use tools.',
      'Do not delegate to specialists.',
      'Do not plan multi-step actions unless the user explicitly asks.',
      'Prefer a fast, clear answer over exhaustive reasoning.',
      '',
      '# Communication Style',
      `Tone: ${this.role.communication_style.tone}.`,
      `Verbosity: ${this.role.communication_style.verbosity}.`,
      `Formality: ${this.role.communication_style.formality}.`,
    ];

    if (context.userName || context.currentTime || context.knowledgeContext) {
      sections.push('', '# Current Context');
      if (context.userName) sections.push(`User: ${context.userName}`);
      if (context.currentTime) sections.push(`Time: ${context.currentTime}`);
      if (context.knowledgeContext) {
        sections.push('', '## Relevant Knowledge');
        sections.push(context.knowledgeContext);
      }
    }

    sections.push('', personalityPrompt);
    return sections.join('\n');
  }

  private classifyFastModeApproval(text: string): FastModeApprovalRequest | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();

    const delegate = this.classifyFastModeDelegation(trimmed, lower);
    if (delegate) return delegate;

    const toolRequest = this.classifyFastModeTool(trimmed, lower);
    if (toolRequest) return toolRequest;

    return null;
  }

  private classifyFastModeDelegation(text: string, lower: string): FastModeApprovalRequest | null {
    const specialistChecks: Array<{
      specialistName: string;
      reason: string;
      patterns: RegExp[];
    }> = [
      {
        specialistName: 'software-engineer',
        reason: 'This looks like a coding or debugging task that benefits from the software engineer specialist.',
        patterns: [/\b(implement|fix|debug|refactor|write code|edit code|patch|bug|compile|test suite|typescript|javascript|python)\b/i],
      },
      {
        specialistName: 'research-analyst',
        reason: 'This looks like a deeper research task that benefits from the research analyst specialist.',
        patterns: [/\b(research|investigate|look into this deeply|dig into|compare options|find sources)\b/i],
      },
      {
        specialistName: 'data-analyst',
        reason: 'This looks like a data analysis task that benefits from the data analyst specialist.',
        patterns: [/\b(csv|spreadsheet|dataset|analyze data|metrics|chart|dashboard data)\b/i],
      },
      {
        specialistName: 'content-writer',
        reason: 'This looks like a writing task that benefits from the content writer specialist.',
        patterns: [/\b(write a post|draft article|blog post|newsletter|ad copy|landing page copy)\b/i],
      },
    ];

    const explicitlyRequestsDelegation = /\b(delegate|delegation|specialist|hand this off|have someone else do this)\b/i.test(lower);

    for (const candidate of specialistChecks) {
      if (!explicitlyRequestsDelegation && !candidate.patterns.some((pattern) => pattern.test(text))) {
        continue;
      }
      if (!this.specialists.has(candidate.specialistName)) {
        continue;
      }
      return {
        kind: 'delegate',
        requestText: text,
        toolName: 'delegate_task',
        specialistName: candidate.specialistName,
        delegatedTask: text,
        reason: candidate.reason,
        promptText: `This is better handled by specialist \`${candidate.specialistName}\`.\n\nReason: ${candidate.reason}\n\nAllow JARVIS to delegate this task?`,
      };
    }

    return null;
  }

  private classifyFastModeTool(text: string, lower: string): FastModeApprovalRequest | null {
    const checks: Array<{ toolName: string; reason: string; patterns: RegExp[] }> = [
      {
        toolName: 'run_command',
        reason: 'This request needs terminal execution.',
        patterns: [/\b(run|execute|terminal|shell|command|cmd|bash|powershell)\b/i],
      },
      {
        toolName: 'read_file',
        reason: 'This request needs reading a file from disk.',
        patterns: [/\b(read|open|show|view|cat|check)\b.*\b(file|config|log|source|code|path)\b/i],
      },
      {
        toolName: 'write_file',
        reason: 'This request needs editing or creating a file.',
        patterns: [/\b(write|edit|modify|update|change|append|create)\b.*\b(file|config|script|document|code)\b/i],
      },
      {
        toolName: 'list_directory',
        reason: 'This request needs listing a directory or folder.',
        patterns: [/\b(list|show|check)\b.*\b(directory|folder|files|contents)\b/i],
      },
      {
        toolName: 'browser_navigate',
        reason: 'This request needs opening or checking a website.',
        patterns: [/\b(open|visit|navigate|go to|browse)\b.*\b(site|website|page|url|link)\b/i, /\bhttps?:\/\//i, /\bwww\./i],
      },
      {
        toolName: 'capture_screen',
        reason: 'This request needs a screenshot or screen capture.',
        patterns: [/\b(screenshot|screen capture|capture the screen|what is on my screen)\b/i],
      },
      {
        toolName: 'get_system_info',
        reason: 'This request needs live system information.',
        patterns: [/\b(system info|system information|cpu|memory|ram|disk usage|os version|specs)\b/i],
      },
      {
        toolName: 'get_clipboard',
        reason: 'This request needs reading the clipboard.',
        patterns: [/\b(clipboard|copied text|what did i copy)\b/i],
      },
      {
        toolName: 'set_clipboard',
        reason: 'This request needs writing to the clipboard.',
        patterns: [/\b(copy this|put .* clipboard|set clipboard)\b/i],
      },
    ];

    for (const candidate of checks) {
      if (!candidate.patterns.some((pattern) => pattern.test(text))) {
        continue;
      }
      if (!this.orchestrator.getToolRegistry()?.get(candidate.toolName)) {
        continue;
      }
      return {
        kind: 'tool',
        requestText: text,
        toolName: candidate.toolName,
        reason: candidate.reason,
        promptText: `This needs the \`${candidate.toolName}\` tool.\n\nReason: ${candidate.reason}\n\nAllow JARVIS to use \`${candidate.toolName}\` just for this request?`,
      };
    }

    const probablyActionRequest = /\b(check|look up|find|search|inspect|open|show|read|write|edit|run|list|browse|visit|click|type)\b/i.test(lower);
    if (!probablyActionRequest) {
      return null;
    }

    return null;
  }

  private buildFastPlannerPrompt(channel: string): string {
    if (!this.role) return '';

    const personality = this.personality ?? getPersonality();
    const channelPersonality = getChannelPersonality(personality, channel);
    const personalityPrompt = personalityToPrompt(channelPersonality);
    const toolRegistry = this.orchestrator.getToolRegistry();
    const toolList = toolRegistry?.list().map((tool) => `- ${tool.name}: ${tool.description}`).join('\n') ?? '- None';
    const specialistList = this.specialists.size > 0
      ? Array.from(this.specialists.values()).map((role) => `- ${role.id}: ${role.description}`).join('\n')
      : '- None';

    return [
      `You are ${this.role.name}. ${this.role.description}`,
      '',
      '# Fast Chat Router',
      'You are deciding whether fast mode should: reply directly, ask approval for one tool, or ask approval to delegate one specialist task.',
      'Default to a direct reply unless a tool or delegation is clearly necessary to satisfy the user request.',
      'If a tool is needed, request exactly one tool.',
      'If delegation is needed, request exactly one specialist and a concrete delegated task.',
      'Never assume approval has already been granted.',
      'Return valid JSON only. No markdown fences.',
      '',
      '# JSON Schema',
      '{"kind":"reply","response":"..."}',
      '{"kind":"tool","response":"...","toolName":"tool_name","reason":"short reason"}',
      '{"kind":"delegate","response":"...","specialistName":"role-id","task":"delegated task","reason":"short reason"}',
      '',
      '# Available Tools',
      toolList,
      '',
      '# Available Specialists',
      specialistList,
      '',
      '# Communication Style',
      'Keep "response" concise and user-facing.',
      'For tool/delegate decisions, "response" should briefly explain why approval is needed.',
      '',
      personalityPrompt,
    ].join('\n');
  }

  private buildFastApprovedSystemPrompt(channel: string, request: FastModeApprovalRequest): string {
    if (!this.role) return '';

    const personality = this.personality ?? getPersonality();
    const channelPersonality = getChannelPersonality(personality, channel);
    const personalityPrompt = personalityToPrompt(channelPersonality);

    if (request.kind === 'delegate') {
      return [
        `You are ${this.role.name}. ${this.role.description}`,
        '',
        '# Fast Chat Approved Delegation',
        `The user explicitly approved delegating this request to specialist \`${request.specialistName}\`.`,
        'You may use only the `delegate_task` tool for this turn.',
        `Use role_id="${request.specialistName}" and delegate the task: ${request.delegatedTask}`,
        'Do not use any other tools.',
        'Do not ask for approval again.',
        'After the delegated work finishes, answer the user directly with the result.',
        '',
        personalityPrompt,
      ].join('\n');
    }

    return [
      `You are ${this.role.name}. ${this.role.description}`,
      '',
      '# Fast Chat Approved Tool Use',
      `The user explicitly approved using the tool \`${request.toolName}\` for this turn.`,
      `You may use only the tool \`${request.toolName}\`.`,
      'Do not use any other tools.',
      'Do not delegate.',
      'Do not ask for approval again.',
      'If the task can be completed without that tool, answer directly.',
      'After using the tool if needed, give the user the final answer.',
      '',
      personalityPrompt,
    ].join('\n');
  }

  private parseFastModeDecision(content: string, requestText: string): FastModeDecision | null {
    const parsed = this.parseJsonObject(content);
    if (!parsed || typeof parsed.kind !== 'string') {
      return null;
    }

    if (parsed.kind === 'reply' && typeof parsed.response === 'string' && parsed.response.trim()) {
      return {
        kind: 'reply',
        response: parsed.response.trim(),
      };
    }

    if (
      parsed.kind === 'tool' &&
      typeof parsed.toolName === 'string' &&
      parsed.toolName.trim() &&
      typeof parsed.reason === 'string' &&
      parsed.reason.trim()
    ) {
      const toolName = parsed.toolName.trim();
      const reason = parsed.reason.trim();
      return {
        kind: 'approval',
        request: {
          kind: 'tool',
          requestText,
          toolName,
          reason,
          promptText: `This needs the \`${toolName}\` tool.\n\nReason: ${reason}\n\nAllow JARVIS to use \`${toolName}\` just for this request?`,
        },
      };
    }

    if (
      parsed.kind === 'delegate' &&
      typeof parsed.specialistName === 'string' &&
      parsed.specialistName.trim() &&
      typeof parsed.task === 'string' &&
      parsed.task.trim() &&
      typeof parsed.reason === 'string' &&
      parsed.reason.trim()
    ) {
      const specialistName = parsed.specialistName.trim();
      const delegatedTask = parsed.task.trim();
      const reason = parsed.reason.trim();
      return {
        kind: 'approval',
        request: {
          kind: 'delegate',
          requestText,
          toolName: 'delegate_task',
          specialistName,
          delegatedTask,
          reason,
          promptText: `This is better handled by specialist \`${specialistName}\`.\n\nReason: ${reason}\n\nAllow JARVIS to delegate this task?`,
        },
      };
    }

    return null;
  }

  private parseJsonObject(content: string): Record<string, unknown> | null {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1]!.trim() : trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  private buildHeartbeatPrompt(coalescedEvents?: string): string {
    if (!this.role) return '';

    const context = this.buildPromptContext();
    const rolePrompt = buildSystemPrompt(this.role, context);

    const parts = [rolePrompt, '', '# Heartbeat Check', this.role.heartbeat_instructions];

    if (coalescedEvents) {
      parts.push('', '# Recent System Events', coalescedEvents);
    }

    // Inject commitment execution instructions
    parts.push('', '# COMMITMENT EXECUTION');
    parts.push('If any commitments are overdue or due soon, EXECUTE them now using your tools.');
    parts.push('Do not just mention them — actually perform the work. Use browse, terminal, file operations as needed.');

    // Inject background research instructions when idle
    if (this.researchQueue && this.researchQueue.queuedCount() > 0) {
      const next = this.researchQueue.getNext();
      if (next) {
        parts.push('', '# BACKGROUND RESEARCH');
        parts.push(`You have a research topic queued: "${next.topic}"`);
        parts.push(`Reason: ${next.reason}`);
        parts.push(`Research ID: ${next.id}`);
        parts.push('If nothing urgent needs your attention, research this topic now.');
        parts.push('Use your browser and tools to gather information, then use the research_queue tool with action "complete" to save your findings.');
      }
    } else {
      parts.push('', '# IDLE MODE');
      parts.push('No research topics queued. If nothing urgent, you may:');
      parts.push('- Check news or trends relevant to the user');
      parts.push('- Review and organize pending tasks');
      parts.push('- Or simply report "All clear" if nothing needs attention');
    }

    parts.push('', '# Important', 'You have full tool access during this heartbeat. If you need to take action (browse the web, run commands, check files), DO IT. Be proactive and aggressive about helping.');

    return parts.join('\n');
  }

  private buildPromptContext(userMessage?: string): PromptContext {
    // Check if any sidecars are enrolled (cheap DB query, controls tool guide content)
    let hasSidecars = false;
    try {
      const mgr = getSidecarManager();
      if (mgr) hasSidecars = mgr.listSidecars().length > 0;
    } catch { /* ignore */ }

    const context: PromptContext = {
      userName: this.config.user?.name || undefined,
      currentTime: new Date().toISOString(),
      availableSpecialists: this.specialistListText || undefined,
      hasSidecars,
    };

    try {
      const profile = getUserProfile();
      const preferredName = profile?.answers.preferred_name?.trim();
      if (preferredName) {
        context.userName = preferredName;
      }

      const profileContext = formatUserProfileForPrompt(profile);
      if (profileContext) {
        context.userProfile = profileContext;
      }
    } catch (err) {
      console.error('[AgentService] Error loading user profile:', err);
    }

    // Retrieve relevant knowledge from vault based on user message
    if (userMessage) {
      try {
        const knowledge = getKnowledgeForMessage(userMessage);
        if (knowledge) {
          context.knowledgeContext = knowledge;
        }
      } catch (err) {
        console.error('[AgentService] Error retrieving knowledge:', err);
      }

      // Retrieve webapp-specific browser instructions if message mentions a known app
      try {
        const webappInstructions = getWebappInstructionsForMessage(userMessage);
        if (webappInstructions) {
          context.webappInstructions = webappInstructions;
        }
      } catch (err) {
        console.error('[AgentService] Error retrieving webapp instructions:', err);
      }
    }

    // Get due commitments
    try {
      const due = getDueCommitments();
      const upcoming = getUpcoming(5);
      const allCommitments = [...due, ...upcoming];

      if (allCommitments.length > 0) {
        context.activeCommitments = allCommitments.map((c) => {
          const dueStr = c.when_due
            ? ` (due: ${new Date(c.when_due).toLocaleString()})`
            : '';
          return `[${c.priority}] ${c.what}${dueStr} — ${c.status}`;
        });
      }
    } catch (err) {
      console.error('[AgentService] Error loading commitments:', err);
    }

    // Get active content pipeline items (not published)
    try {
      const activeContent = findContent({}).filter(
        (c) => c.stage !== 'published'
      ).slice(0, 10);
      if (activeContent.length > 0) {
        context.contentPipeline = activeContent.map((c) => {
          const tags = c.tags.length > 0 ? ` [${c.tags.join(', ')}]` : '';
          return `"${c.title}" (${c.content_type}) — ${c.stage}${tags}`;
        });
      }
    } catch (err) {
      console.error('[AgentService] Error loading content pipeline:', err);
    }

    // Get recent observations
    try {
      const observations = getRecentObservations(undefined, 10);
      if (observations.length > 0) {
        context.recentObservations = observations.map((o) => {
          const time = new Date(o.created_at).toLocaleTimeString();
          return `[${time}] ${o.type}: ${JSON.stringify(o.data).slice(0, 200)}`;
        });
      }
    } catch (err) {
      console.error('[AgentService] Error loading observations:', err);
    }

    // Active goals context for the system prompt
    try {
      const { getActiveGoalsSummary } = require('../vault/retrieval.ts');
      const goalsSummary = getActiveGoalsSummary();
      if (goalsSummary) {
        context.activeGoals = goalsSummary;
      }
    } catch {
      // Goals module may not be available — ignore
    }

    // Authority rules for the system prompt
    if (this.authorityEngine && this.role) {
      try {
        context.authorityRules = this.authorityEngine.describeRulesForAgent(
          this.role.authority_level,
          this.role.id
        );
        const configLevel = this.authorityEngine.getConfig().default_level;
        context.effectiveAuthorityLevel = Math.max(this.role.authority_level, configLevel);
      } catch (err) {
        console.error('[AgentService] Error building authority rules:', err);
      }
    }

    return context;
  }

  private getRecentChatMessages(channel: string, currentText: string): LLMMessage[] {
    try {
      const recent = getRecentConversation(channel);
      if (!recent) {
        return [{ role: 'user', content: currentText }];
      }

      const history = recent.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-12) as LLMMessage[];

      if (
        history.length === 0 ||
        history[history.length - 1]?.role !== 'user' ||
        history[history.length - 1]?.content !== currentText
      ) {
        history.push({ role: 'user', content: currentText });
      }

      return history;
    } catch (err) {
      console.error('[AgentService] Error loading fast chat history:', err);
      return [{ role: 'user', content: currentText }];
    }
  }

  private getRestrictedFastModeTools(request: FastModeApprovalRequest): ToolDefinition[] {
    const toolRegistry = this.orchestrator.getToolRegistry();
    if (!toolRegistry) {
      throw new Error('No tool registry configured');
    }

    const tool = toolRegistry.get(request.toolName);
    if (!tool) {
      throw new Error(`Tool '${request.toolName}' is not available`);
    }

    return [tool];
  }

  private async *streamRestrictedLLM(
    messages: LLMMessage[],
    allowedTools: ToolDefinition[],
  ): AsyncIterable<LLMStreamEvent> {
    const restrictedRegistry = new ToolRegistry();
    for (const tool of allowedTools) {
      restrictedRegistry.register(tool);
    }

    const llmTools: LLMTool[] | undefined =
      allowedTools.length > 0 ? allowedTools.map(toolDefToLLMTool) : undefined;

    const totalUsage = { input_tokens: 0, output_tokens: 0 };
    let finalText = '';
    let responseModel = this.llmManager.getPrimary() || 'unknown';

    for (let iteration = 0; iteration < 6; iteration++) {
      let accumulatedText = '';
      const toolCalls: LLMToolCall[] = [];
      let doneResponse: LLMResponse | null = null;

      for await (const event of this.llmManager.stream(messages, { tools: llmTools })) {
        if (event.type === 'text') {
          accumulatedText += event.text;
          yield event;
        } else if (event.type === 'tool_call') {
          toolCalls.push(event.tool_call);
          yield event;
        } else if (event.type === 'done') {
          doneResponse = event.response;
          totalUsage.input_tokens += event.response.usage.input_tokens;
          totalUsage.output_tokens += event.response.usage.output_tokens;
          responseModel = event.response.model;
        } else if (event.type === 'error') {
          yield event;
          return;
        }
      }

      doneResponse ??= {
        content: accumulatedText,
        tool_calls: toolCalls,
        usage: { input_tokens: 0, output_tokens: 0 },
        model: responseModel,
        finish_reason: 'stop',
      };

      if (doneResponse.finish_reason === 'tool_use' && doneResponse.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: doneResponse.content,
          tool_calls: doneResponse.tool_calls,
        });

        for (const toolCall of doneResponse.tool_calls) {
          const result = await this.executeRestrictedToolCall(restrictedRegistry, toolCall);
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
        }

        continue;
      }

      finalText = doneResponse.content || accumulatedText;
      yield {
        type: 'done',
        response: {
          content: finalText,
          tool_calls: [],
          usage: totalUsage,
          model: responseModel,
          finish_reason: doneResponse.finish_reason ?? 'stop',
        },
      };
      return;
    }

    yield {
      type: 'done',
      response: {
        content: finalText,
        tool_calls: [],
        usage: totalUsage,
        model: responseModel,
        finish_reason: 'stop',
      },
    };
  }

  private async executeRestrictedToolCall(
    registry: ToolRegistry,
    toolCall: LLMToolCall,
  ): Promise<string | ContentBlock[]> {
    try {
      const raw = await registry.execute(toolCall.name, toolCall.arguments);
      if (isToolResult(raw)) {
        return raw.content;
      }
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch (err) {
      return `Error executing ${toolCall.name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async *streamDirectLLM(messages: LLMMessage[]): AsyncIterable<LLMStreamEvent> {
    let accumulatedText = '';
    let doneResponse: LLMResponse | null = null;

    for await (const event of this.llmManager.stream(messages)) {
      if (event.type === 'text') {
        accumulatedText += event.text;
        yield event;
      } else if (event.type === 'done') {
        doneResponse = event.response;
      } else if (event.type === 'error') {
        yield event;
        return;
      }
    }

    const finalResponse = doneResponse ?? {
      content: accumulatedText,
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      model: this.llmManager.getPrimary() || 'unknown',
      finish_reason: 'stop' as const,
    };

    yield {
      type: 'done',
      response: {
        ...finalResponse,
        content: accumulatedText || finalResponse.content,
        tool_calls: [],
      },
    };
  }

  private async finalizeInteraction(userMessage: string, assistantResponse: string, channel: string): Promise<void> {
    await Promise.allSettled([
      this.extractKnowledge(userMessage, assistantResponse).catch((err) =>
        console.error('[AgentService] Extraction error:', err instanceof Error ? err.message : err)
      ),
      this.learnFromInteraction(userMessage, assistantResponse, channel).catch((err) =>
        console.error('[AgentService] Learning error:', err instanceof Error ? err.message : err)
      ),
    ]);
  }

  private async extractKnowledge(userMessage: string, assistantResponse: string): Promise<void> {
    // Get the primary provider for extraction
    const provider = this.llmManager.getProvider(this.config.llm.primary)
      ?? this.llmManager.getProvider('anthropic')
      ?? this.llmManager.getProvider('openai');

    await extractAndStore(userMessage, assistantResponse, provider);
  }

  private async learnFromInteraction(
    userMessage: string,
    assistantResponse: string,
    _channel: string
  ): Promise<void> {
    let personality = this.personality ?? getPersonality();

    // Extract signals from the interaction
    const signals = extractSignals(userMessage, assistantResponse);

    // Apply signals if any
    if (signals.length > 0) {
      personality = applySignals(personality, signals);
    }

    // Record the interaction (increments message count, adjusts trust)
    personality = recordInteraction(personality);

    // Save updated personality
    savePersonality(personality);
    this.personality = personality;
  }
}
