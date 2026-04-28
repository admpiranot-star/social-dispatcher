/**
 * Email Report Templates
 * HTML templates para relatórios diário, semanal e mensal
 * Sprint 0 - Story 7
 */

export interface DailyReportData {
  date: string;
  totalPosts: number;
  successfulPosts: number;
  failedPosts: number;
  totalReach: number;
  totalEngagement: number;
  engagementRate: number;
  platformBreakdown: Array<{
    platform: string;
    posts: number;
    reach: number;
    engagement: number;
    engagementRate: number;
  }>;
  topPost: {
    title: string;
    platform: string;
    engagement: number;
    link: string;
  } | null;
  issues: string[];
  councilDecisions: number;
  councilAccuracy: number;
}

export interface WeeklyReportData extends DailyReportData {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  trendingCategories: Array<{ category: string; growth: number }>;
  bestTimingWindows: Array<{ hour: number; platform: string; engagementRate: number }>;
  mlInsights: string[];
  actionPlan: string[];
  comparisonVsPreviousWeek: {
    reachChange: number;
    engagementChange: number;
    postsChange: number;
  };
}

export interface MonthlyReportData extends WeeklyReportData {
  month: string;
  year: number;
  growthMetrics: {
    impressionsGrowth: number;
    engagementGrowth: number;
    followersGrowth: number;
  };
  categoryPerformance: Array<{
    category: string;
    posts: number;
    avgEngagement: number;
    trend: 'up' | 'stable' | 'down';
  }>;
  timingOptimizationImpact: number;
  memoryLearningScore: number;
  revenueImpact: {
    estimatedAdRevenue: number;
    timeSaved: number;
    timeSavedValue: number;
  };
  roadmapNextMonth: string[];
  risksIdentified: string[];
}

// =====================================================================
// TEMPLATES
// =====================================================================

const HEADER_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 700px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
`;

const BRAND_GRADIENT = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('pt-BR');
}

function formatPercent(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function metricCard(label: string, value: string, change?: number): string {
  const changeHtml = change !== undefined
    ? `<div style="font-size: 12px; color: ${change >= 0 ? '#27ae60' : '#e74c3c'}; margin-top: 4px;">${formatPercent(change)}</div>`
    : '';
  return `
    <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; min-width: 120px;">
      <div style="font-size: 24px; font-weight: 700; color: #1a1a2e;">${value}</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px; text-transform: uppercase;">${label}</div>
      ${changeHtml}
    </div>
  `;
}

// =====================================================================
// DAILY TEMPLATE
// =====================================================================

export function renderDailyReport(data: DailyReportData): string {
  const platformRows = data.platformBreakdown.map(p => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${p.platform}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center;">${p.posts}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">${formatNumber(p.reach)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">${formatNumber(p.engagement)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">${p.engagementRate.toFixed(2)}%</td>
    </tr>
  `).join('');

  const topPostHtml = data.topPost ? `
    <div style="background: #e8f5e9; border-left: 4px solid #27ae60; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <strong>Top Post:</strong> ${data.topPost.title}<br>
      <small>${data.topPost.platform} | ${formatNumber(data.topPost.engagement)} interacoes</small>
    </div>
  ` : '';

  const issuesHtml = data.issues.length > 0 ? `
    <div style="background: #fce4ec; border-left: 4px solid #e74c3c; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <strong>Issues:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px;">
        ${data.issues.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  return `
    <div style="${HEADER_STYLE}">
      <div style="background: ${BRAND_GRADIENT}; color: white; padding: 24px 32px;">
        <h1 style="margin: 0; font-size: 20px;">PiraNOT Social Dispatcher</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 14px;">Relatorio Diario - ${data.date}</p>
      </div>

      <div style="padding: 24px 32px;">
        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
          ${metricCard('Posts', `${data.successfulPosts}/${data.totalPosts}`)}
          ${metricCard('Alcance', formatNumber(data.totalReach))}
          ${metricCard('Engajamento', formatNumber(data.totalEngagement))}
          ${metricCard('Taxa Eng.', `${data.engagementRate.toFixed(2)}%`)}
          ${metricCard('Conselho', `${data.councilAccuracy.toFixed(0)}%`)}
        </div>

        <h3 style="color: #1a1a2e; border-bottom: 2px solid #0f3460; padding-bottom: 8px;">Breakdown por Plataforma</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 8px 12px; text-align: left;">Plataforma</th>
              <th style="padding: 8px 12px; text-align: center;">Posts</th>
              <th style="padding: 8px 12px; text-align: right;">Alcance</th>
              <th style="padding: 8px 12px; text-align: right;">Engajamento</th>
              <th style="padding: 8px 12px; text-align: right;">Taxa</th>
            </tr>
          </thead>
          <tbody>${platformRows}</tbody>
        </table>

        ${topPostHtml}
        ${issuesHtml}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
          Gerado automaticamente pelo Social Dispatcher v2.0 | Conselho Pattern (3 especialistas)
        </div>
      </div>
    </div>
  `;
}

// =====================================================================
// WEEKLY TEMPLATE
// =====================================================================

export function renderWeeklyReport(data: WeeklyReportData): string {
  const dailyBase = renderDailyReport(data);

  const trendingHtml = data.trendingCategories.map(t =>
    `<span style="display: inline-block; background: ${t.growth > 0 ? '#e8f5e9' : '#fce4ec'}; 
     padding: 4px 10px; border-radius: 12px; margin: 2px; font-size: 12px;">
     ${t.category} ${formatPercent(t.growth)}</span>`
  ).join('');

  const timingHtml = data.bestTimingWindows.slice(0, 5).map(t =>
    `<tr>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${t.hour}:00</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${t.platform}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: right;">${t.engagementRate.toFixed(2)}%</td>
    </tr>`
  ).join('');

  const actionPlanHtml = data.actionPlan.map((a, i) =>
    `<li style="margin-bottom: 8px;"><strong>${i + 1}.</strong> ${a}</li>`
  ).join('');

  const weeklyExtra = `
    <div style="padding: 0 32px 24px;">
      <h3 style="color: #1a1a2e; border-bottom: 2px solid #e67e22; padding-bottom: 8px;">Analise Semanal (Semana ${data.weekNumber})</h3>
      
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        ${metricCard('Alcance', formatNumber(data.totalReach), data.comparisonVsPreviousWeek.reachChange)}
        ${metricCard('Engajamento', formatNumber(data.totalEngagement), data.comparisonVsPreviousWeek.engagementChange)}
        ${metricCard('Posts', `${data.totalPosts}`, data.comparisonVsPreviousWeek.postsChange)}
      </div>

      <h4>Categorias em Tendencia</h4>
      <div style="margin-bottom: 16px;">${trendingHtml}</div>

      <h4>Melhores Janelas de Timing</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #fff3e0;">
            <th style="padding: 6px 12px; text-align: left;">Horario</th>
            <th style="padding: 6px 12px; text-align: left;">Plataforma</th>
            <th style="padding: 6px 12px; text-align: right;">Taxa Eng.</th>
          </tr>
        </thead>
        <tbody>${timingHtml}</tbody>
      </table>

      ${data.mlInsights.length > 0 ? `
        <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <strong>ML Insights (Conselho):</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            ${data.mlInsights.map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <h4 style="color: #e67e22;">Plano de Acao</h4>
      <ol style="padding-left: 20px;">${actionPlanHtml}</ol>
    </div>
  `;

  // Inject weekly section before the footer
  return dailyBase.replace(
    'Gerado automaticamente pelo Social Dispatcher',
    `</div>${weeklyExtra}<div style="padding: 0 32px 24px;"><div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999;">Gerado automaticamente pelo Social Dispatcher`
  );
}

// =====================================================================
// MONTHLY TEMPLATE
// =====================================================================

export function renderMonthlyReport(data: MonthlyReportData): string {
  const weeklyBase = renderWeeklyReport(data);

  const categoryRows = data.categoryPerformance.map(c => {
    const trendIcon = c.trend === 'up' ? '&#9650;' : c.trend === 'down' ? '&#9660;' : '&#9679;';
    const trendColor = c.trend === 'up' ? '#27ae60' : c.trend === 'down' ? '#e74c3c' : '#999';
    return `
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${c.category}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: center;">${c.posts}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: right;">${c.avgEngagement.toFixed(2)}%</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: center; color: ${trendColor};">${trendIcon}</td>
      </tr>
    `;
  }).join('');

  const monthlyExtra = `
    <div style="padding: 0 32px 24px;">
      <h3 style="color: #1a1a2e; border-bottom: 2px solid #9b59b6; padding-bottom: 8px;">Relatorio Executivo Mensal - ${data.month}/${data.year}</h3>

      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        ${metricCard('Impressoes', formatNumber(data.totalReach), data.growthMetrics.impressionsGrowth)}
        ${metricCard('Engajamento', formatNumber(data.totalEngagement), data.growthMetrics.engagementGrowth)}
        ${metricCard('Timing Impact', `${formatPercent(data.timingOptimizationImpact)}`)}
        ${metricCard('Memoria Score', `${data.memoryLearningScore.toFixed(0)}%`)}
      </div>

      <h4>Performance por Categoria</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f3e5f5;">
            <th style="padding: 6px 12px; text-align: left;">Categoria</th>
            <th style="padding: 6px 12px; text-align: center;">Posts</th>
            <th style="padding: 6px 12px; text-align: right;">Eng. Medio</th>
            <th style="padding: 6px 12px; text-align: center;">Tendencia</th>
          </tr>
        </thead>
        <tbody>${categoryRows}</tbody>
      </table>

      <div style="background: #e8eaf6; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h4 style="margin-top: 0;">Impacto Financeiro Estimado</h4>
        <table style="font-size: 14px;">
          <tr><td style="padding: 4px 12px;">Receita Ads (estimada):</td><td style="font-weight: 700;">R$ ${data.revenueImpact.estimatedAdRevenue.toLocaleString('pt-BR')}</td></tr>
          <tr><td style="padding: 4px 12px;">Tempo economizado:</td><td style="font-weight: 700;">${data.revenueImpact.timeSaved}h</td></tr>
          <tr><td style="padding: 4px 12px;">Valor do tempo:</td><td style="font-weight: 700;">R$ ${data.revenueImpact.timeSavedValue.toLocaleString('pt-BR')}</td></tr>
        </table>
      </div>

      <h4 style="color: #9b59b6;">Roadmap Proximo Mes</h4>
      <ol style="padding-left: 20px;">
        ${data.roadmapNextMonth.map((r, i) => `<li style="margin-bottom: 6px;"><strong>${i + 1}.</strong> ${r}</li>`).join('')}
      </ol>

      ${data.risksIdentified.length > 0 ? `
        <div style="background: #fff8e1; border-left: 4px solid #ff9800; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <strong>Riscos Identificados:</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            ${data.risksIdentified.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;

  // Insert monthly section
  return weeklyBase.replace(
    'Analise Semanal',
    `</div>${monthlyExtra}<div style="padding: 0 32px 24px;"><h3 style="color: #1a1a2e; border-bottom: 2px solid #e67e22; padding-bottom: 8px;">Analise Semanal`
  );
}
