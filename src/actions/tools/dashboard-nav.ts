/**
 * Dashboard Navigation Tool
 *
 * Allows JARVIS to navigate its own dashboard via the browser.
 * Uses the existing BrowserController to navigate to specific pages.
 */

import type { ToolDefinition } from './registry.ts';
import { DASHBOARD_DESCRIPTOR } from '../../awareness/dashboard-descriptor-data.ts';

const VALID_PAGES = DASHBOARD_DESCRIPTOR.pages.map(p => p.id);

function getPageUrl(page: string, port: number = 3142): string {
  // Handle settings sub-sections: "settings/llm" → "#/settings/llm"
  if (page.startsWith('settings/') || page === 'settings') {
    return `http://localhost:${port}/#/${page}`;
  }
  return `http://localhost:${port}/#/${page}`;
}

export function createDashboardNavTool(port: number = 3142): ToolDefinition {
  return {
    name: 'dashboard_navigate',
    description: `Navigate the JARVIS dashboard to a specific page. Valid pages: ${VALID_PAGES.join(', ')}. For settings sub-sections use: settings/general, settings/llm, settings/channels, settings/integrations, settings/sidecar.`,
    category: 'browser',
    parameters: {
      page: {
        type: 'string',
        description: 'Page name to navigate to (e.g., "goals", "settings/llm", "chat")',
        required: true,
      },
    },
    execute: async (params) => {
      const page = (params.page as string).toLowerCase().trim();
      const basePage = page.split('/')[0]!;

      if (!VALID_PAGES.includes(basePage)) {
        return `Unknown dashboard page "${page}". Valid pages: ${VALID_PAGES.join(', ')}`;
      }

      const url = getPageUrl(page, port);
      const pageDesc = DASHBOARD_DESCRIPTOR.pages.find(p => p.id === basePage);

      try {
        // Dynamic import to avoid circular dependency with browser controller
        const { browser } = await import('./builtin.ts');
        const snap = await browser.navigate(url);

        const panelInfo = pageDesc
          ? `\nPage: ${pageDesc.label} — ${pageDesc.description}\nPanels: ${pageDesc.panels.map(p => p.label).join(', ')}`
          : '';

        return `Navigated to JARVIS dashboard: ${page}${panelInfo}\n\nPage title: ${snap.title}\nInteractive elements: ${snap.elements?.length ?? 0}`;
      } catch (err) {
        return `Error navigating to dashboard: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
