import { platform, homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import type { ToolDefinition } from './registry.ts';
import { desktopOpenUriTool } from './sovereign-control.ts';

/**
 * Common Browser history paths on Windows.
 */
const BROWSER_PATHS = {
  chrome: join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'History'),
  edge: join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
  brave: join(homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History'),
  opera: join(homedir(), 'AppData', 'Roaming', 'Opera Software', 'Opera Stable', 'History'),
};

export const automationContinueWatchingTool: ToolDefinition = {
  name: 'automation_continue_watching',
  description: 'Proactively search browser history for a show or video title and automatically open the most recent link. Use this when the user says "continue watching X".',
  category: 'automation',
  parameters: {
    query: { type: 'string', description: 'The name of the show, anime, or video (e.g., "Attack on Titan")', required: true },
  },
  execute: async (params) => {
    const { query } = params as { query: string };
    const isWindows = platform() === 'win32';

    if (!isWindows) {
        return 'Error: Automation tools are currently only supported on Windows natively.';
    }

    let mostRecent: { title: string, url: string, time: number } | null = null;

    for (const [browser, historyPath] of Object.entries(BROWSER_PATHS)) {
      if (!existsSync(historyPath)) continue;

      const tempPath = join(homedir(), '.jarvis', `history_${browser}_auto_copy.db`);
      try {
        copyFileSync(historyPath, tempPath);
        const db = new Database(tempPath, { readonly: true });
        const sql = `
          SELECT title, url, last_visit_time FROM urls 
          WHERE (title LIKE ? OR url LIKE ?) 
          ORDER BY last_visit_time DESC LIMIT 1
        `;
        const result = db.query(sql).get(`%${query}%`, `%${query}%`) as any;
        db.close();

        if (result && (!mostRecent || result.last_visit_time > mostRecent.time)) {
          mostRecent = { title: result.title, url: result.url, time: result.last_visit_time };
        }
      } catch (err) {
        console.error(`Failed to query ${browser} history for automation:`, err);
      }
    }

    if (!mostRecent) {
      return `Could not find any recent history matches for "${query}". Please provide the link directly.`;
    }

    // Automatically open the URI using the existing desktop tool
    const openResult = await desktopOpenUriTool.execute({ uri: mostRecent.url });
    return `Found and opened the most recent link for "${query}":\n[${mostRecent.title}](${mostRecent.url})\n\n${openResult}`;
  },
};

export const AUTOMATION_TOOLS = [
    automationContinueWatchingTool,
];
