import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import type { ToolDefinition } from './registry.ts';

/**
 * Sovereign Email Toolset
 * Enables J.A.R.V.I.S. to read, send, and manage emails via SMTP/IMAP.
 */

export const emailSendTool: ToolDefinition = {
  name: 'email_send',
  description: 'Send an email via SMTP. Requires SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.',
  category: 'communication',
  parameters: {
    to: { type: 'string', description: 'Recipient email address', required: true },
    subject: { type: 'string', description: 'Email subject line', required: true },
    body: { type: 'string', description: 'Email body text (supports HTML)', required: true },
    isHtml: { type: 'boolean', description: 'Whether the body is HTML', required: false },
  },
  execute: async (params) => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return 'Error: SMTP credentials not configured in environment variables.';
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '465'),
      secure: SMTP_PORT === '465',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    try {
      const info = await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: params.to as string,
        subject: params.subject as string,
        [params.isHtml ? 'html' : 'text']: params.body as string,
      });
      return `Email sent successfully. Message ID: ${info.messageId}`;
    } catch (error: any) {
      return `Failed to send email: ${error.message}`;
    }
  },
};

export const emailListTool: ToolDefinition = {
  name: 'email_list',
  description: 'List recent emails from the inbox via IMAP. Requires IMAP_HOST, IMAP_PORT, IMAP_USER, and IMAP_PASS.',
  category: 'communication',
  parameters: {
    count: { type: 'number', description: 'Number of recent emails to fetch', required: false },
    folder: { type: 'string', description: 'IMAP folder (defaults to INBOX)', required: false },
  },
  execute: async (params) => {
    const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS } = process.env;

    if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
      return 'Error: IMAP credentials not configured in environment variables.';
    }

    const client = new ImapFlow({
      host: IMAP_HOST,
      port: parseInt(IMAP_PORT || '993'),
      secure: true,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(params.folder as string || 'INBOX');
      try {
        const count = params.count as number || 10;
        const messages = [];
        for await (const message of client.fetch({ seq: `:*:${Math.max(1, client.mailbox.exists - count + 1)}` }, { envelope: true })) {
          messages.push({
            uid: message.uid,
            subject: message.envelope.subject,
            from: message.envelope.from[0]?.address,
            date: message.envelope.date,
          });
        }
        return JSON.stringify(messages.reverse(), null, 2);
      } finally {
        lock.release();
      }
    } catch (error: any) {
      return `Failed to list emails: ${error.message}`;
    } finally {
      await client.logout();
    }
  },
};

export const emailReadTool: ToolDefinition = {
  name: 'email_read',
  description: 'Read a specific email by UID.',
  category: 'communication',
  parameters: {
    uid: { type: 'string', description: 'The UID of the email to read', required: true },
    folder: { type: 'string', description: 'IMAP folder (defaults to INBOX)', required: false },
  },
  execute: async (params) => {
    const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS } = process.env;

    if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
      return 'Error: IMAP credentials not configured.';
    }

    const client = new ImapFlow({
      host: IMAP_HOST,
      port: parseInt(IMAP_PORT || '993'),
      secure: true,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(params.folder as string || 'INBOX');
      try {
        const message = await client.fetchOne(params.uid as string, { source: true, envelope: true });
        if (!message) return 'Email not found.';
        return `Subject: ${message.envelope.subject}\nFrom: ${message.envelope.from[0]?.address}\nDate: ${message.envelope.date}\n\n${message.source.toString()}`;
      } finally {
        lock.release();
      }
    } catch (error: any) {
      return `Failed to read email: ${error.message}`;
    } finally {
      await client.logout();
    }
  },
};
