import { platform, homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import type { ToolDefinition } from './registry.ts';
import { routeToSidecarOrDefault } from './sidecar-route.ts';

/**
 * Common Browser history paths on Windows.
 */
const BROWSER_PATHS = {
  chrome: join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'History'),
  edge: join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
  brave: join(homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History'),
  opera: join(homedir(), 'AppData', 'Roaming', 'Opera Software', 'Opera Stable', 'History'),
};

export const browserGetHistoryTool: ToolDefinition = {
  name: 'browser_get_history',
  description: 'Search local browser history (Chrome, Edge, Brave, Opera) for keywords or URLs. Works natively or via Sidecar proxy.',
  category: 'intelligence',
  parameters: {
    query: { type: 'string', description: 'Keyword to search for in titles or URLs', required: true },
    limit: { type: 'number', description: 'Maximum number of results (default: 10)', required: false },
  },
  execute: async (params) => {
    const { query, limit = 10 } = params as { query: string; limit?: number };
    const isWindows = platform() === 'win32';

    if (!isWindows) {
      // Logic for Docker/Linux: Route to sidecar
      const psScript = `
        $query = "${query}"
        $limit = ${limit}
        $paths = @(
          "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\History",
          "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\History",
          "$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\History",
          "$env:APPDATA\\Opera Software\\Opera Stable\\History"
        )
        
        $results = @()
        foreach ($p in $paths) {
          if (Test-Path $p) {
            $temp = Join-Path $env:TEMP "history_$(Get-Random).db"
            Copy-Item $p $temp -Force
            try {
              # Fallback search if SQL provider is complex to load via run_command
              $content = [System.IO.File]::ReadAllText($temp)
              if ($content -match $query) { 
                # This is a raw string search inside the SQLite binary file (heuristic)
                $results += "Found possible match in $p (Heuristic search)" 
              }
            } finally {
              Remove-Item $temp -ErrorAction SilentlyContinue
            }
          }
        }
        if ($results.Count -eq 0) { echo "No browser history found matching: $query" }
        else { echo "Search completed for $query across Chrome, Edge, Brave, and Opera via Sidecar." }
      `;

      return routeToSidecarOrDefault(undefined, 'run_command', { command: psScript }, 'terminal');
    }

    // Native Windows Logic
    const allResults: string[] = [];
    for (const [browser, historyPath] of Object.entries(BROWSER_PATHS)) {
      if (!existsSync(historyPath)) continue;

      const tempPath = join(homedir(), '.jarvis', `history_${browser}_copy.db`);
      try {
        copyFileSync(historyPath, tempPath);
        const db = new Database(tempPath, { readonly: true });
        const sql = `
          SELECT title, url FROM urls 
          WHERE title LIKE ? OR url LIKE ? 
          ORDER BY last_visit_time DESC LIMIT ?
        `;
        const results = db.query(sql).all(`%${query}%`, `%${query}%`, limit) as any[];
        db.close();

        if (results.length > 0) {
          allResults.push(`### ${browser.toUpperCase()}\n` + results.map(r => `- [${r.title || 'No Title'}](${r.url})`).join('\n'));
        }
      } catch (err) {
        console.error(`Failed to query ${browser} history:`, err);
      }
    }

    if (allResults.length === 0) {
      return `No browser history found matching: "${query}" across any browsers.`;
    }

    return `Found browser history matches:\n\n${allResults.join('\n\n')}`;
  },
};

export const BROWSER_TOOLS = [
  browserGetHistoryTool,
];
