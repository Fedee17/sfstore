// Existing presentation regressions render without installing a tracking client.
import { analyticsItem } from '../../lib/analytics/client.ts';
export const analyticsRenderStubs = {
  './product-card.module.css': { default: {} },
  './cart.module.css': { default: {} },
  '@/components/analytics-view': { AnalyticsView: () => null },
  '@/lib/analytics/client': { analyticsItem, track: () => false, trackCreatedOrder: async () => {} },
};
