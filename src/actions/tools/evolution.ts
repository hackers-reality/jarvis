import { run_command } from './builtin.ts';
import type { ToolDefinition } from './registry.ts';

/**
 * Sovereign Evolution Toolset
 * Enables J.A.R.V.I.S. to manage its own source code and toolkit.
 */

const FEATURE_MAP: Record<string, string[]> = {
  control: ['src/actions/tools/sovereign-control.ts', 'run_jarvis.ps1'],
  vision: ['src/actions/tools/vision.ts', 'VISION.md'],
  intelligence: ['src/actions/tools/email.ts', 'src/actions/tools/social.ts', 'src/actions/tools/iot.ts'],
  evolution: ['src/actions/tools/evolution.ts'],
  system: ['src/actions/tools/system.ts'],
  ux: ['ui/src/components/chat/TypingIndicator.tsx', 'ui/src/components/chat/MessageList.tsx', 'ui/src/pages/ChatPage.tsx', 'ui/src/hooks/useWebSocket.ts', 'ui/src/styles/chat.css']
};

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: 'Check the status of the J.A.R.V.I.S. repository.',
  category: 'evolution',
  parameters: {},
  execute: async () => {
    return run_command({ command: 'git status', wait: true });
  },
};

export const gitCommitTool: ToolDefinition = {
  name: 'git_commit_all',
  description: 'Stage all changes and commit with a message.',
  category: 'evolution',
  parameters: {
    message: { type: 'string', description: 'The commit message', required: true },
  },
  execute: async (params) => {
    const message = params.message as string;
    await run_command({ command: 'git add .', wait: true });
    return run_command({ command: `git commit -m "${message}"`, wait: true });
  },
};

export const ghostPushFeatureTool: ToolDefinition = {
  name: 'ghost_push_feature',
  description: 'Sync a specific feature from the unified branch to its modular PR branch and push it to the remote fork. No branch-toggling required.',
  category: 'evolution',
  parameters: {
    featureId: { type: 'string', description: 'The feature module (control, vision, intelligence, evolution, system, ux)', required: true },
    remote: { type: 'string', description: 'The git remote to push to (default: fork)', required: false }
  },
  execute: async (params) => {
    const featureId = params.featureId as string;
    const remote = params.remote as string || 'fork';
    const files = FEATURE_MAP[featureId as keyof typeof FEATURE_MAP];
    
    if (!files) throw new Error(`Unknown feature: ${featureId}`);
    const branch = `feat/sovereign-${featureId}`;
    const fileList = files.join(' ');

    console.log(`[GhostPush] Commencing background sync for "${featureId}" to remote "${remote}"...`);

    // 1. Sync Logic using a sequential command chain
    // We use a PowerShell sub-shell strategy to ensure state is preserved if Node restarts
    const syncCommand = `git stash ; git checkout ${branch} ; git checkout feat/sovereign-unified -- ${fileList} ; git add . ; git commit -m "feat(${featureId}): background sync from unified master" ; git push ${remote} ${branch} ; git checkout feat/sovereign-unified ; git stash pop`;

    try {
      const result = await run_command({ command: syncCommand, wait: true });
      return { 
        status: 'success', 
        message: `Successfully synchronized and pushed ${featureId} to ${branch} on remote ${remote}.`,
        details: result 
      };
    } catch (error: any) {
      // Emergency recovery: Try to get back to unified if something fails
      await run_command({ command: 'git checkout feat/sovereign-unified ; git stash pop', wait: true });
      throw new Error(`Ghost Push failed: ${error.message}`);
    }
  }
};

export const selfPatchTool: ToolDefinition = {
  name: 'apply_self_patch',
  description: 'Apply a self-improvement patch to J.A.R.V.I.S. source code. This tool is governed by the Authority Gate.',
  category: 'evolution',
  parameters: {
    filePath: { type: 'string', description: 'The path to the file to modify (relative to src/)', required: true },
    targetContent: { type: 'string', description: 'The exact string to replace', required: true },
    replacementContent: { type: 'string', description: 'The replacement string', required: true },
    reasoning: { type: 'string', description: 'Why this change is being made', required: true },
  },
  execute: async (params) => {
    const filePath = params.filePath as string;
    const target = params.targetContent as string;
    const replacement = params.replacementContent as string;
    const reasoning = params.reasoning as string;
    const command = `PowerShell -Command "(Get-Content -Path ${filePath}) -replace [Regex]::Escape('${target}'), '${replacement}' | Set-Content -Path ${filePath}"`;
    await run_command({ command, wait: true });
    return `Patch applied successfully to ${filePath}. Reason: ${reasoning}.`;
  },
};

export const gitMasteryTools = [gitStatusTool, gitCommitTool, ghostPushFeatureTool];
