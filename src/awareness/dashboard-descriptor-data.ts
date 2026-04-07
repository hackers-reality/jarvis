/**
 * Dashboard Descriptor — Static registry of all JARVIS dashboard pages,
 * panels, elements, and OCR fingerprints.
 *
 * Updated alongside UI changes. Used by DashboardRecognizer to identify
 * which part of the dashboard is currently visible on screen.
 */

import type { DashboardDescriptor } from './types.ts';

export const DASHBOARD_DESCRIPTOR: DashboardDescriptor = {
  version: '0.2.0',
  baseUrl: 'http://localhost:3142',
  generatedAt: Date.now(),
  pages: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '#/dashboard',
      description: 'System overview with health, agents, goals, and recent activity',
      ocrFingerprints: ['JARVIS Dashboard', 'System Health', 'Vault Entities', 'Agent Summary', 'Workflow Activity'],
      navSelector: 'button[title="Dashboard"]',
      panels: [
        {
          id: 'SystemHealth',
          label: 'System Health',
          description: 'Uptime, memory usage, database stats, and service health',
          elements: [
            { id: 'uptime', type: 'panel', label: 'Uptime', description: 'System uptime display' },
            { id: 'memory', type: 'panel', label: 'Memory', description: 'Memory usage percentage' },
            { id: 'services', type: 'panel', label: 'Services', description: 'Running services status' },
          ],
        },
        {
          id: 'AgentSummary',
          label: 'Agent Summary',
          description: 'Active agents and their current statuses',
          elements: [
            { id: 'agent-count', type: 'panel', label: 'Active Agents', description: 'Count of active agents' },
          ],
        },
        {
          id: 'RecentGoals',
          label: 'Recent Goals',
          description: 'Top active goals with progress scores',
          elements: [],
        },
        {
          id: 'WorkflowActivity',
          label: 'Workflow Activity',
          description: 'Recent workflow executions',
          elements: [],
        },
      ],
    },
    {
      id: 'chat',
      label: 'Chat',
      path: '#/chat',
      description: 'Conversational interface to interact with JARVIS via text or voice',
      ocrFingerprints: ['Type a message', 'Listening', 'Transcribing', 'JARVIS is speaking'],
      navSelector: 'button[title="Chat"]',
      panels: [
        {
          id: 'MessageList',
          label: 'Messages',
          description: 'Conversation history with JARVIS',
          elements: [],
        },
        {
          id: 'ChatInput',
          label: 'Chat Input',
          description: 'Text input area for sending messages',
          elements: [
            { id: 'message-input', type: 'input', label: 'Type a message', description: 'Message input field', selector: 'input[placeholder*="message"]' },
            { id: 'send-btn', type: 'button', label: 'Send', description: 'Send message button' },
          ],
        },
      ],
    },
    {
      id: 'goals',
      label: 'Goals',
      path: '#/goals',
      description: 'OKR goal hierarchy with visual constellation, timeline, and metrics',
      ocrFingerprints: ['Constellation', 'Timeline', 'Metrics', 'New Goal', 'Explore your objectives'],
      navSelector: 'button[title="Goals"]',
      panels: [
        {
          id: 'GoalConstellation',
          label: 'Constellation',
          description: 'Visual goal hierarchy with nodes and connections',
          elements: [
            { id: 'tab-constellation', type: 'tab', label: 'Constellation', description: 'Visual goal graph view' },
          ],
        },
        {
          id: 'GoalTimeline',
          label: 'Timeline',
          description: 'Goal deadlines on a timeline view',
          elements: [
            { id: 'tab-timeline', type: 'tab', label: 'Timeline', description: 'Timeline view of goals' },
          ],
        },
        {
          id: 'GoalMetrics',
          label: 'Metrics',
          description: 'Goal scores and progress tracking',
          elements: [
            { id: 'tab-metrics', type: 'tab', label: 'Metrics', description: 'Goal progress metrics' },
          ],
        },
        {
          id: 'GoalCreate',
          label: 'New Goal',
          description: 'Goal creation form',
          elements: [
            { id: 'new-goal-btn', type: 'button', label: 'New Goal', description: 'Create a new goal' },
          ],
        },
      ],
    },
    {
      id: 'workflows',
      label: 'Workflows',
      path: '#/workflows',
      description: 'Visual workflow automation builder with 50+ node types',
      ocrFingerprints: ['Workflows', 'New Workflow', 'Total Executions', 'Run Now', 'Active', 'Disabled'],
      navSelector: 'button[title="Workflows"]',
      panels: [
        {
          id: 'WorkflowList',
          label: 'Workflow List',
          description: 'List of all workflows with search and filter',
          elements: [
            { id: 'search-workflows', type: 'input', label: 'Search', description: 'Search workflows' },
            { id: 'new-workflow-btn', type: 'button', label: 'New Workflow', description: 'Create a new workflow' },
            { id: 'filter-btn', type: 'button', label: 'Filter', description: 'Filter workflows by status' },
          ],
        },
        {
          id: 'WorkflowCanvas',
          label: 'Workflow Canvas',
          description: 'Visual node-based workflow editor',
          elements: [
            { id: 'run-now-btn', type: 'button', label: 'Run Now', description: 'Execute the workflow immediately' },
            { id: 'pause-btn', type: 'button', label: 'Pause', description: 'Pause or enable the workflow' },
          ],
        },
        {
          id: 'WorkflowStats',
          label: 'Stats',
          description: 'Workflow execution statistics',
          elements: [],
        },
      ],
    },
    {
      id: 'office',
      label: 'Agents',
      path: '#/office',
      description: 'Multi-agent orchestration with 12 specialist roles',
      ocrFingerprints: ['Agents', 'Command Center', 'Orbital', 'Spawn', 'Search agents'],
      navSelector: 'button[title="Agents"]',
      panels: [
        {
          id: 'AgentRoster',
          label: 'Agent Roster',
          description: 'List of all specialist agents with status',
          elements: [
            { id: 'search-agents', type: 'input', label: 'Search agents', description: 'Search agent roster' },
            { id: 'spawn-btn', type: 'button', label: 'Spawn', description: 'Spawn a new agent' },
          ],
        },
        {
          id: 'CommandCenterTab',
          label: 'Command Center',
          description: 'Agent control and status overview',
          elements: [
            { id: 'tab-command', type: 'tab', label: 'Command Center', description: 'Agent command view' },
          ],
        },
        {
          id: 'OrbitalTab',
          label: 'Orbital',
          description: 'Visual orbital agent display',
          elements: [
            { id: 'tab-orbital', type: 'tab', label: 'Orbital', description: 'Visual agent orbit' },
          ],
        },
      ],
    },
    {
      id: 'tasks',
      label: 'Tasks',
      path: '#/tasks',
      description: 'Kanban task board with 5 columns: Pending, Active, Completed, Failed, Escalated',
      ocrFingerprints: ['Tasks', 'Commitments', 'Pending', 'Active', 'Completed', 'Failed', 'Escalated'],
      navSelector: 'button[title="Tasks"]',
      panels: [
        {
          id: 'KanbanBoard',
          label: 'Kanban Board',
          description: 'Task cards organized by status columns',
          elements: [
            { id: 'search-tasks', type: 'input', label: 'Search', description: 'Search tasks' },
            { id: 'create-task-btn', type: 'button', label: 'Create', description: 'Create a new task' },
          ],
        },
      ],
    },
    {
      id: 'authority',
      label: 'Authority',
      path: '#/authority',
      description: 'System governance with approvals, audit log, and authority configuration',
      ocrFingerprints: ['Authority', 'Approvals', 'Audit', 'Configuration', 'Authority Level', 'Emergency'],
      navSelector: 'button[title="Authority"]',
      panels: [
        {
          id: 'ApprovalsTab',
          label: 'Approvals',
          description: 'Pending approval requests with approve/deny actions',
          elements: [
            { id: 'tab-approvals', type: 'tab', label: 'Approvals', description: 'Pending approvals' },
            { id: 'approve-btn', type: 'button', label: 'Approve', description: 'Approve a request' },
            { id: 'deny-btn', type: 'button', label: 'Deny', description: 'Deny a request' },
          ],
        },
        {
          id: 'AuditTab',
          label: 'Audit',
          description: 'Audit log of tool executions and agent actions',
          elements: [
            { id: 'tab-audit', type: 'tab', label: 'Audit', description: 'Audit trail' },
          ],
        },
        {
          id: 'ConfigTab',
          label: 'Configuration',
          description: 'Authority level, category overrides, emergency controls',
          elements: [
            { id: 'tab-config', type: 'tab', label: 'Configuration', description: 'Authority configuration' },
            { id: 'authority-slider', type: 'input', label: 'Authority Level', description: 'Default authority level (1-10)' },
            { id: 'learning-toggle', type: 'toggle', label: 'Learning Mode', description: 'Toggle learning mode' },
            { id: 'emergency-btn', type: 'button', label: 'Emergency', description: 'Emergency state controls' },
          ],
        },
      ],
    },
    {
      id: 'memory',
      label: 'Memory',
      path: '#/memory',
      description: 'Entity constellation and explorer for the knowledge graph',
      ocrFingerprints: ['Memory', 'Constellation', 'Explorer', 'Profile', 'Connections', 'Conversations'],
      navSelector: 'button[title="Memory"]',
      panels: [
        {
          id: 'MemoryConstellation',
          label: 'Constellation',
          description: 'Visual entity graph grouped by type',
          elements: [
            { id: 'view-constellation', type: 'tab', label: 'Constellation', description: 'Visual entity graph' },
          ],
        },
        {
          id: 'MemoryExplorer',
          label: 'Explorer',
          description: 'Detailed entity navigation with facts and relationships',
          elements: [
            { id: 'view-explorer', type: 'tab', label: 'Explorer', description: 'Entity detail explorer' },
          ],
        },
      ],
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      path: '#/pipeline',
      description: 'Content pipeline with 8 stages from Idea to Published',
      ocrFingerprints: ['Content Pipeline', 'Idea', 'Research', 'Outline', 'Draft', 'Assets', 'Review', 'Scheduled', 'Published', 'New Content'],
      navSelector: 'button[title="Pipeline"]',
      panels: [
        {
          id: 'PipelineBoard',
          label: 'Pipeline Board',
          description: 'Content cards organized by production stage',
          elements: [
            { id: 'search-content', type: 'input', label: 'Search content', description: 'Search content items' },
            { id: 'new-content-btn', type: 'button', label: 'New Content', description: 'Create new content item' },
          ],
        },
      ],
    },
    {
      id: 'calendar',
      label: 'Calendar',
      path: '#/calendar',
      description: 'Week view calendar with tasks and content events',
      ocrFingerprints: ['Calendar', 'Today', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      navSelector: 'button[title="Calendar"]',
      panels: [
        {
          id: 'WeekView',
          label: 'Week View',
          description: '7-day calendar grid with events',
          elements: [
            { id: 'prev-week', type: 'button', label: 'Prev', description: 'Previous week' },
            { id: 'today-btn', type: 'button', label: 'Today', description: 'Go to today' },
            { id: 'next-week', type: 'button', label: 'Next', description: 'Next week' },
          ],
        },
      ],
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      path: '#/knowledge',
      description: 'Three-column knowledge browser for entities, facts, and relationships',
      ocrFingerprints: ['Knowledge Browser', 'Entities', 'Facts', 'Relationships', 'Person', 'Project', 'Concept'],
      navSelector: 'button[title="Knowledge"]',
      panels: [
        {
          id: 'EntityList',
          label: 'Entities',
          description: 'Searchable entity list with type filters',
          elements: [
            { id: 'search-entities', type: 'input', label: 'Search', description: 'Search entities' },
            { id: 'type-filter', type: 'button', label: 'All', description: 'Filter by entity type' },
          ],
        },
        {
          id: 'FactsPanel',
          label: 'Facts',
          description: 'Facts about the selected entity',
          elements: [],
        },
        {
          id: 'RelationshipsPanel',
          label: 'Relationships',
          description: 'Related entities and connections',
          elements: [],
        },
      ],
    },
    {
      id: 'command',
      label: 'Command',
      path: '#/command',
      description: 'System command center with health monitoring, agent status, and observations',
      ocrFingerprints: ['Command Center', 'System Status', 'Uptime', 'Memory', 'Database', 'Observations'],
      navSelector: 'button[title="Command"]',
      panels: [
        {
          id: 'SystemStatus',
          label: 'System Status',
          description: 'Overall system health with uptime and memory',
          elements: [],
        },
        {
          id: 'ServicesStatus',
          label: 'Services',
          description: 'Running services with health indicators',
          elements: [],
        },
        {
          id: 'ObservationsPanel',
          label: 'Observations',
          description: 'Live stream of recent system observations',
          elements: [],
        },
      ],
    },
    {
      id: 'awareness',
      label: 'Awareness',
      path: '#/awareness',
      description: 'Screen awareness system with live context, timeline, reports, and trends',
      ocrFingerprints: ['Awareness', 'Live', 'Timeline', 'Reports', 'Trends', 'Captures', 'Suggestions Today'],
      navSelector: 'button[title="Awareness"]',
      panels: [
        {
          id: 'LiveContext',
          label: 'Live',
          description: 'Real-time screen context and active suggestions',
          elements: [
            { id: 'tab-live', type: 'tab', label: 'Live', description: 'Live context tab' },
            { id: 'toggle-awareness', type: 'toggle', label: 'Enable', description: 'Enable/disable awareness' },
          ],
        },
        {
          id: 'ActivityTimeline',
          label: 'Timeline',
          description: 'Activity timeline of sessions and app switches',
          elements: [
            { id: 'tab-timeline', type: 'tab', label: 'Timeline', description: 'Activity timeline tab' },
          ],
        },
        {
          id: 'DailyReport',
          label: 'Reports',
          description: 'Daily productivity reports with AI takeaways',
          elements: [
            { id: 'tab-reports', type: 'tab', label: 'Reports', description: 'Daily reports tab' },
          ],
        },
        {
          id: 'TrendsPanel',
          label: 'Trends',
          description: 'Weekly focus metrics and app usage trends',
          elements: [
            { id: 'tab-trends', type: 'tab', label: 'Trends', description: 'Trends analysis tab' },
          ],
        },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      path: '#/settings',
      description: 'System configuration with general, LLM, channels, integrations, and sidecar settings',
      ocrFingerprints: ['Settings', 'General', 'LLM', 'Channels', 'Integrations', 'Sidecar'],
      navSelector: 'button[title="Settings"]',
      panels: [
        {
          id: 'GeneralSettings',
          label: 'General',
          description: 'Personality, role, and heartbeat configuration',
          elements: [
            { id: 'settings-general', type: 'tab', label: 'General', description: 'General settings section', selector: 'button:has-text("General")' },
          ],
        },
        {
          id: 'LLMSettings',
          label: 'LLM Configuration',
          description: 'AI provider management: Anthropic, OpenAI, Gemini, Ollama, OpenRouter',
          elements: [
            { id: 'settings-llm', type: 'tab', label: 'LLM', description: 'LLM provider settings', selector: 'button:has-text("LLM")' },
            { id: 'primary-provider', type: 'input', label: 'Primary Provider', description: 'Select primary LLM provider' },
            { id: 'test-connection', type: 'button', label: 'Test Connection', description: 'Test LLM provider connection' },
            { id: 'save-config', type: 'button', label: 'Save Configuration', description: 'Save LLM settings' },
          ],
        },
        {
          id: 'ChannelSettings',
          label: 'Channels',
          description: 'Communication channels: Telegram, Discord, voice, TTS',
          elements: [
            { id: 'settings-channels', type: 'tab', label: 'Channels', description: 'Channel settings section', selector: 'button:has-text("Channels")' },
          ],
        },
        {
          id: 'IntegrationSettings',
          label: 'Integrations',
          description: 'Third-party service integrations',
          elements: [
            { id: 'settings-integrations', type: 'tab', label: 'Integrations', description: 'Integration settings section', selector: 'button:has-text("Integrations")' },
          ],
        },
        {
          id: 'SidecarSettings',
          label: 'Sidecar',
          description: 'Remote sidecar machine connections',
          elements: [
            { id: 'settings-sidecar', type: 'tab', label: 'Sidecar', description: 'Sidecar settings section', selector: 'button:has-text("Sidecar")' },
          ],
        },
      ],
    },
  ],
};
