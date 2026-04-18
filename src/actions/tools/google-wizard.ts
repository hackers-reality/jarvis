/**
 * Google OAuth Wizard Tool
 * 
 * Generates authorization links for Google APIs and helps 
 * the user authorize the assistant for Gmail, Calendar, etc.
 */

import { platform } from 'node:os';
import { exec } from 'node:child_process';
import type { ToolDefinition } from './registry.ts';
import { GoogleAuth } from '../../integrations/google-auth.ts';
import { loadConfig } from '../../config/loader.ts';

/**
 * Pre-defined scope packs for ease of use.
 */
const SCOPE_PACKS: Record<string, string[]> = {
  'full': [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  'gmail': [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  'calendar': [
    'https://www.googleapis.com/auth/calendar',
  ],
  'minimal': [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ]
};

export const googleOauthWizardTool: ToolDefinition = {
  name: 'google_oauth_wizard',
  description: 'Generate a Google OAuth authorization link for specific scopes and open it in the browser.',
  category: 'system',
  parameters: {
    scopes: { 
      type: 'string', 
      description: 'Specific scopes (comma separated) or a pack name: full, gmail, calendar, minimal (default: full)', 
      required: false 
    },
  },
  execute: async (params) => {
    const { scopes = 'full' } = params as { scopes?: string };
    
    // Resolve scopes
    let scopeList: string[] = [];
    if (SCOPE_PACKS[scopes.toLowerCase()]) {
      scopeList = SCOPE_PACKS[scopes.toLowerCase()];
    } else {
      scopeList = scopes.split(',').map(s => s.trim());
    }

    try {
      const config = loadConfig();
      if (!config.google?.client_id || !config.google?.client_secret) {
        return 'Error: Google Client ID or Secret not found in config. Please set JARVIS_GOOGLE_CLIENT_ID and JARVIS_GOOGLE_CLIENT_SECRET.';
      }

      const auth = new GoogleAuth(config.google.client_id, config.google.client_secret);
      const url = auth.getAuthUrl(scopeList);

      // Open in system browser
      const openCmd = platform() === 'win32' ? 'start' : platform() === 'darwin' ? 'open' : 'xdg-open';
      exec(`${openCmd} "${url}"`);

      return `Authorization link generated for scopes: ${scopeList.join(', ')}\n\nI have opened the link in your browser. Please click "Allow", and once redirected to the callback URL, I will automatically save your tokens.`;
    } catch (err) {
      return `Error: Failed to generate OAuth wizard. ${err}`;
    }
  },
};

export const GOOGLE_WIZARD_TOOLS = [
  googleOauthWizardTool,
];
