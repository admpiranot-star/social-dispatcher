/**
 * Email Configuration
 * Integra com Mailcow local para envio de relatórios
 * Sprint 0 - Story 7: Daily Email Report
 */

import { config } from '../config';

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: {
    name: string;
    address: string;
  };
  recipients: {
    daily: string[];
    weekly: string[];
    monthly: string[];
  };
  schedule: {
    dailyHour: number;      // 08:00 BRT
    dailyMinute: number;
    weeklyDay: number;       // 1 = Monday
    weeklyHour: number;      // 09:00 BRT
    monthlyDay: number;      // 1 = first day
    monthlyHour: number;     // 10:00 BRT
  };
  timezone: string;
}

export const emailConfig: EmailConfig = {
  smtp: {
    host: process.env.SMTP_HOST || 'mail.piranot.com.br',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'dispatcher@piranot.com.br',
      pass: process.env.SMTP_PASS || '',
    },
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || 'PiraNOT Social Dispatcher',
    address: process.env.EMAIL_FROM_ADDRESS || 'dispatcher@piranot.com.br',
  },
  recipients: {
    daily: (process.env.EMAIL_DAILY_RECIPIENTS || 'junior@piranot.com.br').split(',').map(s => s.trim()),
    weekly: (process.env.EMAIL_WEEKLY_RECIPIENTS || 'junior@piranot.com.br').split(',').map(s => s.trim()),
    monthly: (process.env.EMAIL_MONTHLY_RECIPIENTS || 'junior@piranot.com.br').split(',').map(s => s.trim()),
  },
  schedule: {
    dailyHour: parseInt(process.env.REPORT_DAILY_HOUR || '8', 10),
    dailyMinute: parseInt(process.env.REPORT_DAILY_MINUTE || '0', 10),
    weeklyDay: parseInt(process.env.REPORT_WEEKLY_DAY || '1', 10),
    weeklyHour: parseInt(process.env.REPORT_WEEKLY_HOUR || '9', 10),
    monthlyDay: parseInt(process.env.REPORT_MONTHLY_DAY || '1', 10),
    monthlyHour: parseInt(process.env.REPORT_MONTHLY_HOUR || '10', 10),
  },
  timezone: config.SCHEDULER_TIMEZONE,
};

export function validateEmailConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!emailConfig.smtp.auth.pass) {
    errors.push('SMTP_PASS not set - email reports will not be sent');
  }
  if (!emailConfig.smtp.auth.user) {
    errors.push('SMTP_USER not set');
  }
  if (emailConfig.recipients.daily.length === 0) {
    errors.push('No daily report recipients configured');
  }

  return { valid: errors.length === 0, errors };
}
