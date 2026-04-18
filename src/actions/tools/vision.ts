/**
 * Sovereign Vision Tools — Visual Awareness
 *
 * Tools for capturing and analyzing the desktop screen.
 * Returns multi-modal content blocks (images) that allows any
 * vision-capable LLM to 'see' the user's workspace.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { platform } from 'node:os';
import { execSync } from 'node:child_process';
import type { ToolDefinition, ToolResult } from './registry.ts';

/**
 * Capture the screen and return base64 data.
 * Optimized for Windows using PowerShell.
 */
function captureLocalScreen(): string {
  const os = platform();
  const tmp = `jarvis-screenshot-${Date.now()}.png`; // temporary file in current dir
  
  try {
    if (os === 'win32') {
      // High-fidelity capture via GDI+
      execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms, System.Drawing; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${tmp}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); }"`);
    } else if (os === 'darwin') {
      execSync(`screencapture -x ${tmp}`);
    } else {
      execSync(`scrot ${tmp}`);
    }

    const base64 = readFileSync(tmp, 'base64');
    unlinkSync(tmp);
    return base64;
  } catch (err) {
    console.error('[Vision] Screenshot failed:', err);
    throw err;
  }
}

export const visionAnalyzeScreenTool: ToolDefinition = {
  name: 'vision_analyze_screen',
  description: 'Capture a high-resolution screenshot of the primary display and return it to J.A.R.V.I.S. for visual analysis. Use this when the user asks you to "see their screen", "find errors", or "check what is open".',
  category: 'vision',
  parameters: {
    reason: { type: 'string', description: 'Why are you looking at the screen? (e.g. "searching for errors", "reading netflix titles")', required: true },
  },
  execute: async (params) => {
    try {
      const data = captureLocalScreen();
      return {
        content: [
          { type: 'text', text: `Screen captured for: ${params.reason}. Analyzing primary display...` },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }
        ]
      } as ToolResult;
    } catch (err) {
      return `Error: Visual sensor failure - ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const SOVEREIGN_VISION_TOOLS = [
  visionAnalyzeScreenTool,
];
