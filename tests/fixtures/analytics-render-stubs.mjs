// Existing presentation regressions render without installing a tracking client.
import { analyticsItem } from '../../lib/analytics/client.ts';
export const analyticsRenderStubs = {
  '@/components/analytics-view': { AnalyticsView: () => null },
  '@/lib/analytics/client': { analyticsItem, track: () => false, trackCreatedOrder: async () => {} },
};
