/**
 * Sovereign Control Tools — Physical Desktop Mastery
 *
 * Direct mouse and keyboard control via native PowerShell bridges.
 * This allows J.A.R.V.I.S. to interact with legacy apps, games, and media
 * players that lack automation APIs.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type { ToolDefinition } from './registry.ts';
import { SpotifyClient } from '../../integrations/spotify.ts';
import { getSecret } from '../../vault/keychain.ts';


import { routeToSidecarOrDefault } from './sidecar-route.ts';

/**
 * Execute a PowerShell command.
 * If running on Windows, executes locally via child_process.
 * If running on Linux (Docker), routes to a connected sidecar via RPC.
 */
export async function runPowerShell(command: string): Promise<string> {
  const isWindows = platform() === 'win32';
  
  // Base64 encode the command to avoid quoting issues (standard PowerShell practice)
  // PowerShell expects UTF-16LE encoding for -EncodedCommand
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
  const fullCommand = `powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`;

  if (isWindows) {
    try {
      return execSync(fullCommand, { encoding: 'utf-8' });
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Routing to sidecar for Docker/Linux environments
  return routeToSidecarOrDefault(undefined, 'run_command', { 
    command: fullCommand 
  }, 'terminal');
}


/**
 * Get an authenticated SpotifyClient if credentials exist.
 */
async function getSpotifyClient(): Promise<SpotifyClient | null> {
  const clientId = getSecret('spotify.client_id');
  const clientSecret = getSecret('spotify.client_secret');
  const refreshToken = getSecret('spotify.refresh_token');

  if (!clientId || !clientSecret || !refreshToken) return null;
  return new SpotifyClient(clientId, clientSecret, refreshToken);
}


export const desktopMouseMoveTool: ToolDefinition = {
  name: 'desktop_mouse_move',
  description: 'Move the mouse cursor to specific X and Y coordinates on the screen.',
  category: 'desktop',
  parameters: {
    x: { type: 'number', description: 'X coordinate (pixels from left)', required: true },
    y: { type: 'number', description: 'Y coordinate (pixels from top)', required: true },
  },
  execute: async (params) => {
    const { x, y } = params as { x: number; y: number };
    const cmd = `[void][System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
    await runPowerShell(cmd);
    return `Mouse moved to ${x}, ${y}`;

  },
};

export const desktopMouseClickTool: ToolDefinition = {
  name: 'desktop_mouse_click',
  description: 'Perform a mouse click at the current cursor position or at specific coordinates. Buttons: left, right, middle, double.',
  category: 'desktop',
  parameters: {
    button: { type: 'string', description: 'left, right, middle, double (default: left)', required: false },
    x: { type: 'number', description: 'Optional X coordinate to move to before clicking', required: false },
    y: { type: 'number', description: 'Optional Y coordinate to move to before clicking', required: false },
  },
  execute: async (params) => {
    const { button = 'left', x, y } = params as { button?: string; x?: number; y?: number };
    
    let cmd = '';
    if (x !== undefined && y !== undefined) {
      cmd += `[void][System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); `;
    }

    // Load mouse_event from user32.dll
    const dllImport = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Mouse { [DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo); }'; `;
    
    const flags = {
      left_down: 0x0002,
      left_up: 0x0004,
      right_down: 0x0008,
      right_up: 0x0010,
      middle_down: 0x0020,
      middle_up: 0x0040,
    };

    if (button === 'left') {
      cmd += `${dllImport} [Mouse]::mouse_event(${flags.left_down | flags.left_up}, 0, 0, 0, 0)`;
    } else if (button === 'right') {
      cmd += `${dllImport} [Mouse]::mouse_event(${flags.right_down | flags.right_up}, 0, 0, 0, 0)`;
    } else if (button === 'middle') {
      cmd += `${dllImport} [Mouse]::mouse_event(${flags.middle_down | flags.middle_up}, 0, 0, 0, 0)`;
    } else if (button === 'double') {
      cmd += `${dllImport} [Mouse]::mouse_event(${flags.left_down | flags.left_up}, 0, 0, 0, 0); [Mouse]::mouse_event(${flags.left_down | flags.left_up}, 0, 0, 0, 0)`;
    }

    const result = await runPowerShell(cmd);
    return result.includes('Error') ? result : `Performing ${button} click at current position.`;

  },
};

export const desktopKeyboardTypeTool: ToolDefinition = {
  name: 'desktop_keyboard_type',
  description: 'Type text into the focused application as if using a physical keyboard.',
  category: 'desktop',
  parameters: {
    text: { type: 'string', description: 'The text to type', required: true },
  },
  execute: async (params) => {
    const { text } = params as { text: string };
    // Escaping special characters for SendKeys
    const escapedText = text.replace(/([%+^~[\]{}()])/g, '{$1}');
    const cmd = `[System.Windows.Forms.SendKeys]::SendWait('${escapedText}')`;
    await runPowerShell(cmd);
    return `Typed: ${text}`;

  },
};

export const desktopKeyboardHotkeyTool: ToolDefinition = {
  name: 'desktop_keyboard_hotkey',
  description: 'Press a system hotkey or key combination using SendKeys codes. Examples: "^a" (Ctrl+A), "%{F4}" (Alt+F4), "{ENTER}", "{ESC}".',
  category: 'desktop',
  parameters: {
    combo: { type: 'string', description: 'The SendKeys combo (e.g., ^s, %{TAB}, {ENTER})', required: true },
  },
  execute: async (params) => {
    const { combo } = params as { combo: string };
    const cmd = `[System.Windows.Forms.SendKeys]::SendWait('${combo}')`;
    await runPowerShell(cmd);
    return `Pressed hotkey: ${combo}`;

  },
};

export const desktopMediaControlTool: ToolDefinition = {
  name: 'desktop_media_control',
  description: 'Control media playback (Spotify, Netflix, YouTube). Actions: play_pause, next, prev, volume_up, volume_down, mute.',
  category: 'desktop',
  parameters: {
    action: { type: 'string', description: 'play_pause, next, prev, volume_up, volume_down, mute', required: true },
  },
  execute: async (params) => {
    const { action } = params as { action: string };
    
    // Key codes for Media keys
    const codes = {
      play_pause: 0xB3, // VK_MEDIA_PLAY_PAUSE
      next: 0xB0,       // VK_MEDIA_NEXT_TRACK
      prev: 0xB1,       // VK_MEDIA_PREV_TRACK
      volume_up: 0xAF,  // VK_VOLUME_UP
      volume_down: 0xAE, // VK_VOLUME_DOWN
      mute: 0xAD        // VK_VOLUME_MUTE
    };

    const code = codes[action as keyof typeof codes];
    if (!code) return `Error: Unknown media action: ${action}`;

    const cmd = `
      $signature = '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'
      $type = Add-Type -MemberDefinition $signature -Name "Keyboard" -Namespace "Win32" -PassThru
      $type::keybd_event(${code}, 0, 0, 0) # Key down
      $type::keybd_event(${code}, 0, 2, 0) # Key up
    `;

    await runPowerShell(cmd);
    return `Media command executed: ${action}`;

  },
};

export const desktopLaunchLocalAppTool: ToolDefinition = {
  name: 'desktop_launch_local_app',
  description: 'Launch an application on the local computer by name (e.g., "spotify", "chrome", "roblox"). Searches common install paths automatically.',
  category: 'desktop',
  parameters: {
    app_name: { type: 'string', description: 'The name of the application to launch', required: true },
    args: { type: 'string', description: 'Optional command-line arguments', required: false },
  },
  execute: async (params) => {
    const { app_name, args = '' } = params as { app_name: string; args?: string };
    
    // Proactive search script for Windows
    const cmd = `
      $appName = "${app_name}"
      $paths = @(
        "$env:ProgramFiles", 
        "$env:ProgramFiles(x86)", 
        "$env:LocalAppData\\GitHubDesktop",
        "$env:AppData\\Spotify",
        "$env:LocalAppData\\Discord",
        "$env:LocalAppData\\Roblox\\Versions"
      )
      $found = $null
      foreach ($p in $paths) {
        if (Test-Path $p) {
          $found = Get-ChildItem -Path $p -Filter "*$appName*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($found) { break }
        }
      }
      if ($found) {
        Start-Process $found.FullName -ArgumentList "${args}"
        echo "Launched: $($found.FullName)"
      } else {
        # Fallback to shell execution (like Win+R)
        try {
          Start-Process "$appName.exe" -ArgumentList "${args}" -ErrorAction SilentlyContinue
          echo "Launched via shell fallback: $appName"
        } catch {
          echo "Error: Could not find or launch application: $appName"
        }
      }
    `;

    const result = await runPowerShell(cmd);
    return result;

  },
};

export const desktopOpenUriTool: ToolDefinition = {
  name: 'desktop_open_uri',
  description: 'Open a URI or URL using the system default handler (e.g., roblox://, spotify:, https://).',
  category: 'desktop',
  parameters: {
    uri: { type: 'string', description: 'The URI or URL to open', required: true },
  },
  execute: async (params) => {
    const { uri } = params as { uri: string };
    const cmd = `Start-Process "${uri}"`;
    const result = await runPowerShell(cmd);
    return result.includes('Error') ? result : `Opened URI: ${uri}`;

  },
};

export const desktopPlayRobloxTool: ToolDefinition = {
  name: 'desktop_play_roblox',
  description: 'Directly launch a specific Roblox game using its Place ID.',
  category: 'desktop',
  parameters: {
    place_id: { type: 'string', description: 'The Roblox Place ID (e.g., 920587430 for Blox Fruits)', required: true },
  },
  execute: async (params) => {
    const { place_id } = params as { place_id: string };
    const uri = `roblox://placeID=${place_id}`;
    const cmd = `Start-Process "${uri}"`;
    await runPowerShell(cmd);
    return `Launching Roblox game (ID: ${place_id})...`;

  },
};

export const desktopMsStoreSearchTool: ToolDefinition = {
  name: 'desktop_ms_store_search',
  description: 'Open the Microsoft Store and search for an application.',
  category: 'desktop',
  parameters: {
    query: { type: 'string', description: 'The application name to search for', required: true },
  },
  execute: async (params) => {
    const { query } = params as { query: string };
    const uri = `ms-windows-store://search/?query=${encodeURIComponent(query)}`;
    const cmd = `Start-Process "${uri}"`;
    await runPowerShell(cmd);
    return `Searching Microsoft Store for: ${query}`;

  },
};

export const desktopSpotifySearchPlayTool: ToolDefinition = {
  name: 'desktop_spotify_search_play',
  description: 'Search for and play a track or artist on Spotify using the Web API for high-fidelity control.',
  category: 'desktop',
  parameters: {
    query: { type: 'string', description: 'The track or artist to search and play', required: true },
  },
  execute: async (params) => {
    const { query } = params as { query: string };
    
    const client = await getSpotifyClient();
    if (client) {
      try {
        const track = await client.searchTrack(query);
        if (track) {
          await client.play(track.uri);
          return `Playing: "${track.name}" by ${track.artist} on Spotify (API).`;
        }
        return `Could not find any tracks matching "${query}" on Spotify.`;
      } catch (err) {
        console.error('[Spotify API Error]', err);
        // Fallback to URI if UI fails
      }
    }

    // Fallback to URI based launching
    const uri = `spotify:search:${encodeURIComponent(query)}`;
    const cmd = `Start-Process "${uri}"`;
    await runPowerShell(cmd);
    return `Opening Spotify search for: ${query} (Fallback Mode). Please ensure your Spotify credentials are set in Integrations for API control.`;

  },
};

export const spotifyControlTool: ToolDefinition = {
  name: 'spotify_control',
  description: 'Directly control Spotify playback via the Web API (play, pause, next, prev, volume).',
  category: 'desktop',
  parameters: {
    action: { type: 'string', description: 'play, pause, next, prev, volume', required: true },
    value: { type: 'number', description: 'Volume percent (0-100) if action is volume', required: false },
  },
  execute: async (params) => {
    const { action, value } = params as { action: string; value?: number };
    const client = await getSpotifyClient();
    if (!client) return 'Error: Spotify API credentials not configured. Set them in Settings > Integrations.';

    try {
      switch (action) {
        case 'play': await client.play(); break;
        case 'pause': await client.pause(); break;
        case 'next': await client.next(); break;
        case 'prev': await client.previous(); break;
        case 'volume': 
          if (value !== undefined) await client.setVolume(value); 
          break;
        default: return `Error: Unknown Spotify action: ${action}`;
      }
      return `Spotify command executed: ${action}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};


export const SOVEREIGN_CONTROL_TOOLS = [
  desktopMouseMoveTool,
  desktopMouseClickTool,
  desktopKeyboardTypeTool,
  desktopKeyboardHotkeyTool,
  desktopMediaControlTool,
  desktopLaunchLocalAppTool,
  desktopOpenUriTool,
  desktopPlayRobloxTool,
  desktopMsStoreSearchTool,
  desktopSpotifySearchPlayTool,
  spotifyControlTool,
];


