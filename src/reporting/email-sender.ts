/**
 * Email Sender Service
 * Envia relatórios via Nodemailer usando Mailcow SMTP
 * Sprint 0 - Story 7: Daily Email Report
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../lib/logger';
import { emailConfig, validateEmailConfig } from '../config/email';

let transporter: Transporter | null = null;

/**
 * Initialize SMTP transporter (lazy, singleton)
 */
function getTransporter(): Transporter {
  if (!transporter) {
    const { valid, errors } = validateEmailConfig();
    if (!valid) {
      logger.warn({ errors }, 'Email config incomplete - reports may fail');
    }

    transporter = nodemailer.createTransport({
      host: emailConfig.smtp.host,
      port: emailConfig.smtp.port,
      secure: emailConfig.smtp.secure,
      auth: {
        user: emailConfig.smtp.auth.user,
        pass: emailConfig.smtp.auth.pass,
      },
      tls: {
        // Mailcow local uses self-signed cert on internal network
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

/**
 * Test SMTP connection
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    const t = getTransporter();
    await t.verify();
    logger.info({}, 'SMTP connection verified');
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'SMTP connection failed');
    return false;
  }
}

export interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

/**
 * Send email
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const t = getTransporter();

    const result = await t.sendMail({
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      to: payload.to.join(', '),
      subject: payload.subject,
      html: payload.html,
      text: payload.text || stripHtml(payload.html),
      attachments: payload.attachments,
    });

    logger.info({
      messageId: result.messageId,
      to: payload.to,
      subject: payload.subject,
    }, 'Email sent successfully');

    return { success: true, messageId: result.messageId };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, to: payload.to, subject: payload.subject }, 'Failed to send email');
    return { success: false, error: errMsg };
  }
}

/**
 * Strip HTML for plain text fallback
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Graceful shutdown
 */
export async function closeEmailTransport(): Promise<void> {
  if (transporter) {
    transporter.close();
    transporter = null;
    logger.info({}, 'Email transporter closed');
  }
}
