/**
 * Reporting Module Index
 * Exports all reporting functionality
 */

export { sendEmail, testEmailConnection, closeEmailTransport } from './email-sender';
export { collectDailyData, collectWeeklyData, collectMonthlyData, closeReportPool } from './data-collector';
export { renderDailyReport, renderWeeklyReport, renderMonthlyReport } from './templates';
export type { DailyReportData, WeeklyReportData, MonthlyReportData } from './templates';
export {
  initReportScheduler,
  stopReportScheduler,
  sendDailyReport,
  sendWeeklyReport,
  sendMonthlyReport,
  triggerReport,
  getSchedulerStatus,
} from './scheduler';
