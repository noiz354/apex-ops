import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Apex Ops CMMS',
    short_name: 'Apex Ops',
    description: 'Apex Ops CMMS — maintenance management with field-outbox offline sync.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'id-ID',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Field Audit (run checklist)',
        short_name: 'Run Audit',
        url: '/field/audits',
        description: 'Resume the running field inspection checklist.',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Sync Outbox',
        short_name: 'Sync',
        url: '/field/sync',
        description: 'Review and replay the offline outbox queue.',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Work Orders',
        short_name: 'WOrders',
        url: '/work-orders',
        description: 'Open the work orders dispatch board.',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
