import { run_command } from './builtin.ts';
import type { ToolDefinition } from './registry.ts';

/**
 * Sovereign IoT Toolset
 * Provides a bridge to Smart Home systems (Alexa, etc.).
 */

export const alexaControlTool: ToolDefinition = {
  name: 'alexa_control',
  description: 'Control your smart home via Alexa. Commands are passed to a local Alexa bridge or CLI.',
  category: 'iot',
  parameters: {
    command: { type: 'string', description: 'The smart home command (e.g., "turn off office lights")', required: true },
  },
  execute: async (params) => {
    // For now, we use a CLI bridge (e.g., alexa-remote-control)
    // The user will need to configure the bridge elsewhere.
    const command = params.command as string;

    try {
      // Logic: Execute a CLI command that interfaces with Alexa
      // Example: alexa-remote-account.sh -e "turn off light"
      // Since this is a bridge, we'll try a generic execution or a common bridge CLI.
      const result = await run_command({ 
        command: `alexa-remote-control -e "speak:One moment. ${command}"`, 
        wait: true 
      });
      
      // If the command is about control:
      await run_command({ 
        command: `alexa-remote-control -e "automation:${command}"`, 
        wait: true 
      });

      return `Sent command to Alexa: "${command}"`;
    } catch (error: any) {
      return `Failed to reach Alexa bridge: ${error.message}. Ensure alexa-remote-control is installed and configured.`;
    }
  },
};
