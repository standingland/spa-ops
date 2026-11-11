/**
 * One message key per metric. The Thai and English texts (messages/*.json, reports.metrics) restate, word for word, the
 * definitions written at the top of migrations 0017 and 0018, and are shown beside each figure.
 */
export const METRIC_KEYS = [
  'booked', 'collected', 'refunded', 'net', 'avgTransaction', 'cancellationRate', 'noShowRate', 'reschedules', 'returningRate',
  'roomUtilization', 'therapistUtilization', 'turnover', 'peaks', 'byService', 'byTherapist', 'openMinutes',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
