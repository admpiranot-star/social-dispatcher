/**
 * Report Scheduler
 * Agenda e envia relatórios diários, semanais e mensais via cron
 * Sprint 0 - Story 7: Automated Reports
 * 
 * Horários (BRT):
 * - Diário: 08:00
 * - Semanal: Segunda 09:00
 * - Mensal: 1º do mês 10:00
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger';
import { emailConfig } from '../config/email';
import { sendEmail, testEmailConnection } from './email-sender';
import { collectDailyData, collectWeeklyData, collectMonthlyData } from './data-collector';
import { renderDailyReport, renderWeeklyReport, renderMonthlyReport } from './templates';

interface ScheduledReport {
  name: string;
  task: ScheduledTask;
  cronExpression: string;
}

const scheduledTasks: ScheduledReport[] = [];

/**
 * Initialize all report schedulers
 */
export async function initReportScheduler(): Promise<void> {
  logger.info({}, 'Initializing report scheduler...');

  // Test email connection first
  const emailOk = await testEmailConnection();
  if (!emailOk) {
    logger.warn({}, 'Email connection failed - reports will be logged but not sent');
  }

  // Daily report at 08:00 BRT
  const dailyCron = `${emailConfig.schedule.dailyMinute} ${emailConfig.schedule.dailyHour} * * *`;
  const dailyTask = schedule(dailyCron, async () => {
    await sendDailyReport();
  }, {
    timezone: emailConfig.timezone,
  });
  scheduledTasks.push({ name: 'daily-report', task: dailyTask, cronExpression: dailyCron });

  // Weekly report on Monday at 09:00 BRT
  const weeklyCron = `0 ${emailConfig.schedule.weeklyHour} * * ${emailConfig.schedule.weeklyDay}`;
  const weeklyTask = schedule(weeklyCron, async () => {
    await sendWeeklyReport();
  }, {
    timezone: emailConfig.timezone,
  });
  scheduledTasks.push({ name: 'weekly-report', task: weeklyTask, cronExpression: weeklyCron });

  // Monthly report on 1st at 10:00 BRT
  const monthlyCron = `0 ${emailConfig.schedule.monthlyHour} ${emailConfig.schedule.monthlyDay} * *`;
  const monthlyTask = schedule(monthlyCron, async () => {
    await sendMonthlyReport();
  }, {
    timezone: emailConfig.timezone,
  });
  scheduledTasks.push({ name: 'monthly-report', task: monthlyTask, cronExpression: monthlyCron });

  logger.info({
    tasks: scheduledTasks.map(t => ({ name: t.name, cron: t.cronExpression })),
    timezone: emailConfig.timezone,
  }, 'Report scheduler initialized');
}

/**
 * Send daily report
 */
export async function sendDailyReport(date?: Date): Promise<boolean> {
  const reportDate = date || new Date();
  const dateStr = reportDate.toISOString().split('T')[0];

  logger.info({ date: dateStr }, 'Generating daily report...');

  try {
    const data = await collectDailyData(reportDate);
    const html = renderDailyReport(data);

    const result = await sendEmail({
      to: emailConfig.recipients.daily,
      subject: `[PiraNOT] Relatorio Diario - ${dateStr} | ${data.successfulPosts} posts | ${data.engagementRate.toFixed(1)}% eng.`,
      html,
    });

    if (result.success) {
      logger.info({ date: dateStr, messageId: result.messageId }, 'Daily report sent');
    } else {
      logger.error({ date: dateStr, error: result.error }, 'Failed to send daily report');
    }

    return result.success;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, date: dateStr }, 'Daily report generation failed');
    return false;
  }
}

/**
 * Send weekly report
 */
export async function sendWeeklyReport(date?: Date): Promise<boolean> {
  const reportDate = date || new Date();

  logger.info({}, 'Generating weekly report...');

  try {
    const data = await collectWeeklyData(reportDate);
    const html = renderWeeklyReport(data);

    const reachChange = data.comparisonVsPreviousWeek.reachChange;
    const trend = reachChange >= 0 ? `+${reachChange.toFixed(0)}%` : `${reachChange.toFixed(0)}%`;

    const result = await sendEmail({
      to: emailConfig.recipients.weekly,
      subject: `[PiraNOT] Relatorio Semanal ${data.weekNumber} | ${data.totalPosts} posts | Alcance ${trend}`,
      html,
    });

    if (result.success) {
      logger.info({ weekNumber: data.weekNumber, messageId: result.messageId }, 'Weekly report sent');
    } else {
      logger.error({ error: result.error }, 'Failed to send weekly report');
    }

    return result.success;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Weekly report generation failed');
    return false;
  }
}

/**
 * Send monthly report
 */
export async function sendMonthlyReport(date?: Date): Promise<boolean> {
  const reportDate = date || new Date();

  logger.info({}, 'Generating monthly report...');

  try {
    const data = await collectMonthlyData(reportDate);
    const html = renderMonthlyReport(data);

    const result = await sendEmail({
      to: emailConfig.recipients.monthly,
      subject: `[PiraNOT] Relatorio Mensal ${data.month}/${data.year} | ROI R$ ${data.revenueImpact.timeSavedValue.toLocaleString('pt-BR')}`,
      html,
    });

    if (result.success) {
      logger.info({ month: data.month, year: data.year, messageId: result.messageId }, 'Monthly report sent');
    } else {
      logger.error({ error: result.error }, 'Failed to send monthly report');
    }

    return result.success;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Monthly report generation failed');
    return false;
  }
}

/**
 * Trigger manual report (API endpoint)
 */
export async function triggerReport(type: 'daily' | 'weekly' | 'monthly', date?: Date): Promise<boolean> {
  switch (type) {
    case 'daily': return sendDailyReport(date);
    case 'weekly': return sendWeeklyReport(date);
    case 'monthly': return sendMonthlyReport(date);
    default: return false;
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { name: string; cronExpression: string }[] {
  return scheduledTasks.map(t => ({
    name: t.name,
    cronExpression: t.cronExpression,
  }));
}

/**
 * Stop all scheduled tasks
 */
export async function stopReportScheduler(): Promise<void> {
  for (const task of scheduledTasks) {
    await task.task.stop();
    logger.info({ name: task.name }, 'Report scheduler stopped');
  }
  scheduledTasks.length = 0;
}
