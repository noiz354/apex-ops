'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Grid2x2,
  ClipboardList,
  Inbox,
  Wrench,
  ListChecks,
  Building2,
  Network,
  Package,
  ReceiptText,
  BadgeCheck,
  BarChart3,
  ShieldCheck,
  BellRing,
  Users,
  Settings,
} from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { cn } from '@/lib/utils';

const GROUPS = [
  {
    label: 'Core Operations',
    items: [
      { path: 'operations-dashboard', href: '/', label: 'Operations Dashboard', Icon: Grid2x2 },
      { path: 'work-orders', href: '/work-orders', label: 'Work Orders', Icon: ClipboardList, badge: '14' },
      { path: 'service-requests', href: '/service-requests', label: 'Service Requests', Icon: Inbox, badge: '5' },
      { path: 'preventive-maintenance', href: '/preventive-maintenance', label: 'Preventive Maintenance', Icon: Wrench },
      { path: 'field-inspections', href: '/field-inspections', label: 'Field Inspections', Icon: ListChecks },
    ],
  },
  {
    label: 'Asset & Resource',
    items: [
      { path: 'asset-registry', href: '/assets', label: 'Asset Registry', Icon: Building2 },
      { path: 'facility-locations', href: '/facilities', label: 'Facility Locations', Icon: Network },
      { path: 'inventory-and-parts-ledger', href: '/inventory', label: 'Inventory & Parts Ledger', Icon: Package },
      { path: 'purchasing-and-pos', href: '/purchasing', label: 'Purchasing & POs', Icon: ReceiptText },
      { path: 'vendors-and-contractors', href: '/vendors', label: 'Vendors & Contractors', Icon: BadgeCheck },
    ],
  },
  {
    label: 'Governance & System',
    items: [
      { path: 'reports-and-analytics', href: '/reports', label: 'Reports & Analytics', Icon: BarChart3 },
      { path: 'audit-trail-and-logs', href: '/audit-trail', label: 'Audit Trail & Logs', Icon: ShieldCheck },
      { path: 'notifications-and-sla-alerts', href: '/notifications', label: 'Notifications & SLA Alerts', Icon: BellRing },
      { path: 'organization-and-rbac', href: '/organization', label: 'Organization & RBAC', Icon: Users },
      { path: 'settings-and-system-config', href: '/settings', label: 'Settings & System Config', Icon: Settings },
    ],
  },
];

export function SideNav({ active }: { active: string }) {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-7 h-[calc(100vh-1.75rem)] w-72 bg-[#213145] z-50 hidden desktop:flex flex-col justify-between overflow-y-auto">
      <div className="flex flex-col">
        <div className="h-16 px-4 flex items-center gap-2">
          <LogoMark />
          <div className="flex flex-col">
            <span className="text-base font-semibold text-[#EAF1FF] leading-tight tracking-tight">Apex Ops</span>
            <span className="apex-id text-[#BEC6E0] uppercase">Enterprise CMMS</span>
          </div>
        </div>
        <div className="px-3 pt-3 pb-2">
          <div className="px-2 py-1 rounded-lg bg-[#DCE9FF]/10 flex items-center justify-between">
            <span className="apex-id text-[#85F8C4] flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#85F8C4] animate-pulse" />
              Sync: SSE only
            </span>
            <span className="apex-id text-[#BEC6E0]">v4.18-p3</span>
          </div>
        </div>
        <nav className="px-2 py-1 flex flex-col gap-1" aria-label="Primary">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 pt-4 pb-1">
                <span className="apex-label-caps text-[#BEC6E0]">{g.label}</span>
              </div>
              {g.items.map((it) => {
                const isActive = active === it.path || (it.href !== '/' && pathname.startsWith(it.href));
                return (
                  <Link
                    key={it.path}
                    data-path={it.path}
                    href={it.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors',
                      isActive ? 'bg-cobalt-deep text-white font-semibold' : 'text-[#EAF1FF] hover:bg-[#DCE9FF]/20'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <it.Icon size={18} />
                      <span className="text-[13px]">{it.label}</span>
                    </span>
                    {it.badge && (
                      <span className="px-1.5 py-0.5 rounded-full bg-cobalt-deep text-white apex-id font-semibold">
                        {it.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
      <div className="p-4">
        <div className="p-2 rounded-lg bg-[#DCE9FF]/10 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="apex-label-caps text-[#BEC6E0]">Telemetry (demo)</span>
            <span className="apex-id text-[#BEC6E0]">Broker: not configured</span>
          </div>
          <span className="apex-id px-1.5 py-0.5 rounded bg-[#3A4356] text-[#BEC6E0] font-semibold">STANDBY</span>
        </div>
      </div>
    </aside>
  );
}
