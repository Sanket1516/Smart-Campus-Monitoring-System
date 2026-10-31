import { Chart as ChartJS } from 'chart.js';

/**
 * Global Chart.js look for the Sentinel theme (applies to every existing chart).
 * Uses defaults.set() so it works before the legend/tooltip plugins are registered.
 */
export const applyChartTheme = () => {
  ChartJS.defaults.font.family = 'Inter, system-ui, -apple-system, sans-serif';
  ChartJS.defaults.font.size = 12;
  ChartJS.defaults.color = '#8593a8';
  ChartJS.defaults.borderColor = 'rgba(148, 170, 210, 0.10)';
  ChartJS.defaults.set('plugins.legend', {
    labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true },
  });
  ChartJS.defaults.set('plugins.tooltip', {
    backgroundColor: 'rgba(11, 17, 29, 0.95)',
    borderColor: 'rgba(148, 170, 210, 0.22)',
    borderWidth: 1,
    titleColor: '#eef2f8',
    bodyColor: '#c9d2e0',
    padding: 10,
    cornerRadius: 10,
  });
  ChartJS.defaults.set('elements.bar', { borderRadius: 4 });
  ChartJS.defaults.set('elements.line', { tension: 0.35 });
  ChartJS.defaults.set('elements.point', { radius: 0, hoverRadius: 4 });
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    ChartJS.defaults.animation = false;
  }
};
