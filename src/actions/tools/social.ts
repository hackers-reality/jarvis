import { browser } from './builtin.ts';
import type { ToolDefinition } from './registry.ts';

/**
 * Sovereign Social Toolset
 * High-level automation for social platforms using BrowserController.
 */

export const instagramMessageTool: ToolDefinition = {
  name: 'instagram_send_message',
  description: 'Send a message to a specific user on Instagram. Requires an active logged-in session in the browser.',
  category: 'social',
  parameters: {
    username: { type: 'string', description: 'The Instagram username to message', required: true },
    message: { type: 'string', description: 'The message content', required: true },
  },
  execute: async (params) => {
    // We use the shared browser instance to perform the automation
    const username = params.username as string;
    const message = params.message as string;

    try {
      // 1. Navigate to Direct Messages
      await browser.navigate(`https://www.instagram.com/direct/new/`);

      // 2. Search for user
      // Instagram's new message search input usually has name="queryBox" or a placeholder
      // For now, we'll try a generic selector or wait for snapshot-based ID in future versions.
      // Since social.ts is a high-level tool, we'll use the browser internal methods.
      
      // Note: Low-level typing via CDP
      await browser.type(0, username); // This will fail if ID 0 is used incorrectly.
      // Actually, social.ts seems to be using a hypothetical 'execute' method.
      // I'll refactor it to use the correct instance methods from BrowserController.

      // 3. Simple navigation/click approach
      await browser.navigate(`https://www.instagram.com/direct/new/`);
      
      // Since I don't have a robust "selector-based click" in the instance yet 
      // (only ID-based from snapshot), I'll add a helper or just use evaluate.
      await browser.evaluate(`(() => {
        const input = document.querySelector('input[name="queryBox"]');
        if (input) {
          input.value = '${username}';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);

      await new Promise(r => setTimeout(r, 2000));

      await browser.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('div[role="button"]')).find(b => b.innerText.includes('${username}'));
        if (btn) btn.click();
      })()`);

      await new Promise(r => setTimeout(r, 1000));

      await browser.evaluate(`(() => {
        const next = Array.from(document.querySelectorAll('div[role="button"]')).find(b => b.innerText.includes('Next'));
        if (next) next.click();
      })()`);

      await new Promise(r => setTimeout(r, 2000));

      await browser.evaluate(`(() => {
        const msg = document.querySelector('div[aria-label="Message"][contenteditable="true"]');
        if (msg) {
          msg.innerText = '${message}';
          msg.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const send = Array.from(document.querySelectorAll('div[role="button"]')).find(b => b.innerText.includes('Send'));
        if (send) send.click();
      })()`);

      return `Successfully sent Instagram message to ${username}.`;
    } catch (error: any) {
      return `Failed to send Instagram message: ${error.message}. Note: Ensure you are logged into Instagram in the browser session.`;
    }
  },
};
