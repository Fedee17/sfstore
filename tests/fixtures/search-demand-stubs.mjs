// Store search pages render without request headers or a database: recorded demand is kept here for assertions.
import * as searchDemand from '../../lib/catalog/search-demand.ts';
export const recordedSearchDemand = [];
export const searchDemandStubs = {
  'next/headers': { headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0 (test browser)' }) },
  'next/server': { connection: async () => {}, after: callback => callback() },
  '@/lib/catalog/search-demand': searchDemand,
  '@/services/search-demand': { recordSearchDemand: async (term, outcome) => { recordedSearchDemand.push([term, outcome]); } },
};
