// Existing presentation regressions render without installing a tracking client.
import { analyticsItem } from '../../lib/analytics/client.ts';
import * as brandConfig from '../../lib/brand.ts';
import * as cardPhotoFraming from '../../lib/catalog/card-photo-framing.ts';
export const analyticsRenderStubs = {
  '@/lib/brand': brandConfig,
  '@/lib/catalog/card-photo-framing': cardPhotoFraming,
  './product-card.module.css': { default: {} },
  './cart.module.css': { default: {} },
  '@/components/analytics-view': { AnalyticsView: () => null },
  '@/lib/analytics/client': { analyticsItem, track: () => false, trackCreatedOrder: async () => {} },
};
