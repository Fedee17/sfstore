// Render-only stand-ins for components/catalog/catalog-frame.tsx (CSS modules and SiteHeader stay out of node tests).
import React from 'react';

export const catalogFrameStubs = {
  '@/components/catalog/catalog-frame': {
    CatalogFrame: ({ children }) => React.createElement('main', null, children),
    CatalogBackLink: ({ href }) => React.createElement('a', { href }, 'Volver a categorías'),
    CatalogEmptyState: ({ title, text, href, action }) => React.createElement('div', null,
      React.createElement('h3', null, title), React.createElement('p', null, text), React.createElement('a', { href }, action)),
    catalogStyles: new Proxy({}, { get: (_, key) => String(key) }),
  },
};
