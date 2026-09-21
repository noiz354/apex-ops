import { sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  assets, facilities, findings, inspections, organizations, parts, poLineItems, purchaseOrders,
  sequences, serviceRequests, settingsKv, users, vendors, workOrderEvents, workOrders, woTasks,
} from './schema';
import { CANON } from '../lib/canon';
import { hashPassword } from '../lib/auth/password';

export const SEED_PASSWORD = process.env.SEED_USER_PASSWORD || 'demo-pass-4821';
export const SEED_TOTP_SECRET = process.env.SEED_TOTP_SECRET || 'JBSWY3DPEHPK3PXP';

const ORG = CANON.tenant;
const DECOY_ORG = 'APX-GL-9021';

const min = 60_000;
const hour = 3_600_000;

export async function seedAll(db: Db): Promise<void> {
  await db.insert(organizations).values([
    { id: ORG, name: 'Apex Ops — Nusantara East Campus' },
    { id: DECOY_ORG, name: 'Decoy Tenant (isolation fixture)' },
  ]).onConflictDoNothing();

  const year = new Date().getFullYear();
  await db.insert(sequences).values([
    { organizationId: ORG, entity: 'WO', year, nextVal: 910 },
    { organizationId: ORG, entity: 'SR', year, nextVal: 895 },
    { organizationId: ORG, entity: 'PO', year, nextVal: 316 },
    { organizationId: ORG, entity: 'PR', year, nextVal: 316 },
    { organizationId: ORG, entity: 'INS', year, nextVal: 1093 },
    { organizationId: ORG, entity: 'FND', year, nextVal: 189 },
    { organizationId: ORG, entity: 'GRN', year, nextVal: 1 },
    { organizationId: ORG, entity: 'PM', year, nextVal: 1 },
    { organizationId: ORG, entity: 'AK', year, nextVal: 1 },
  ]).onConflictDoNothing();

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const decoyHash = await hashPassword('decoy-pass-9021');
  const people = [
    { organizationId: ORG, email: 'm.vance@apexops.io', name: 'Marcus Vance', initials: 'MV', title: 'VP Operations & Facilities', role: 'Enterprise Admin' },
    { organizationId: ORG, email: 'e.voronova@apexops.io', name: 'Elena Voronova', initials: 'EV', title: 'Senior Field Tech · SCADA', role: 'Senior Field Tech' },
    { organizationId: ORG, email: 'm.kowalski@apexops.io', name: 'Marcus Kowalski', initials: 'MK', title: 'HVAC Lead Specialist', role: 'Senior Field Tech' },
    { organizationId: ORG, email: 'd.chen@apexops.io', name: 'David Chen', initials: 'DC', title: 'Facilities Engineering Manager', role: 'Engineering Lead' },
    { organizationId: ORG, email: 's.almansoor@apexops.io', name: 'Sarah Al-Mansoor', initials: 'SA', title: 'Fire & Suppression Inspector', role: 'Senior Field Tech' },
    { organizationId: ORG, email: 'e.moreno@apexops.io', name: 'Elena Moreno', initials: 'EM', title: 'Facility Director · Helpdesk', role: 'Facility Director' },
    { organizationId: DECOY_ORG, email: 't.user@apexgl.io', name: 'Test User', initials: 'TU', title: 'Enterprise Admin (decoy tenant)', role: 'Enterprise Admin' },
  ];
  const insertedUsers = await db.insert(users).values(
    people.map((p) => ({
      ...p,
      passwordHash: p.organizationId === DECOY_ORG ? decoyHash : passwordHash,
      totpSecret: SEED_TOTP_SECRET,
    })),
  ).onConflictDoNothing().returning({ id: users.id, email: users.email });

  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
  const byEmail = new Map(allUsers.map((u) => [u.email, u.id]));
  const voronova = byEmail.get('e.voronova@apexops.io') ?? null;
  const kowalski = byEmail.get('m.kowalski@apexops.io') ?? null;
  void insertedUsers;

  await db.insert(assets).values([
    { organizationId: ORG, code: CANON.assetSeal, name: 'Central Chiller #04', klass: 'HVAC', location: 'CUP Basement L2', oem: CANON.assetOem, serial: CANON.assetSerial, health: CANON.assetHealth, status: 'DEGRADED', commissionedOn: '2020-10-14' },
    { organizationId: ORG, code: 'AST-HVAC-003', name: 'Central Chiller #03', klass: 'HVAC', location: 'Basement Energy Hub', oem: 'Trane EarthWise CVHE', serial: 'TRA-99103-A', health: 74, status: 'DEGRADED' },
    { organizationId: ORG, code: 'AST-GEN-001', name: 'Generator 2B', klass: 'ELEC', location: 'Outdoor Power Vault', oem: 'Caterpillar DE500', serial: 'CAT-77410-C', health: 81, status: 'OPERATIONAL' },
    { organizationId: ORG, code: 'AST-PUMP-101', name: 'CHW Primary Pump #1', klass: 'HVAC', location: 'CUP Basement L2', oem: 'Grundfos NK 250', serial: 'GRF-31277-B', health: 92, status: 'OPERATIONAL' },
    { organizationId: ORG, code: 'AST-ELEC-012', name: 'Busbar Riser B', klass: 'ELEC', location: 'Substation East Wing', oem: 'Siemens SIVACON', serial: 'SIE-55210-A', health: 88, status: 'OPERATIONAL' },
  ]).onConflictDoNothing();

  await db.insert(parts).values([
    { organizationId: ORG, sku: CANON.sealSku, name: 'Silicon Carbide Mechanical Seal 2.5"', unitPriceCents: 145000, bin: CANON.sealBin, onHand: 2, reserved: 1, minStock: 4 },
    { organizationId: ORG, sku: 'PART-LUB-09', name: 'POE Lubricant ISO 68', unitPriceCents: 19500, bin: 'CRIB-B / Bay 01', onHand: 6, reserved: 1, minStock: 3 },
    { organizationId: ORG, sku: 'PART-BRG-6204', name: 'Bearing 6204-2RS (drive end)', unitPriceCents: 8400, bin: 'CRIB-A / Bay 07', onHand: 4, reserved: 0, minStock: 2 },
    { organizationId: ORG, sku: 'PART-BRG-6205', name: 'Bearing 6205-2RS (non-drive end)', unitPriceCents: 9100, bin: 'CRIB-A / Bay 07', onHand: 3, reserved: 0, minStock: 2 },
    { organizationId: ORG, sku: 'PART-FLTR-401', name: 'MERV 14 Chilled Water Filter', unitPriceCents: 12000, bin: 'CRIB-C / Bay 02', onHand: 12, reserved: 2, minStock: 6 },
  ]).onConflictDoNothing();

  const now = Date.now();
  interface SeedWo {
    number: string; title: string; assetCode: string | null; location: string;
    priority: 'P1' | 'P2' | 'P3'; status: string; holdReason: string | null;
    slaDueAt: Date; assignedTo: string | null;
  }
  const wos: SeedWo[] = [
    { number: CANON.workOrderSeal, title: 'Primary Shaft Mechanical Seal Replacement', assetCode: CANON.assetSeal, location: 'Chiller #04 · CUP Basement L2', priority: 'P1', status: 'IN_PROGRESS', holdReason: null, slaDueAt: new Date(now + 42 * min), assignedTo: voronova },
    { number: 'WO-2024-0892', title: 'Compressor bearing vibration anomaly above 7.8mm/s safety trip', assetCode: 'AST-HVAC-003', location: 'Chiller Unit #03 · Basement Energy Hub', priority: 'P1', status: 'ESCALATED', holdReason: null, slaDueAt: new Date(now - 102 * min - 15_000), assignedTo: null },
    { number: 'WO-2024-0888', title: 'Common-rail fuel pump pressure loss during automated test fire', assetCode: 'AST-GEN-001', location: 'Generator 2B · Outdoor Power Vault', priority: 'P1', status: 'ON_HOLD', holdReason: 'Awaiting parts — common-rail fuel pump (PO-2026-0285 PARTIAL)', slaDueAt: new Date(now - 24 * min - 10_000), assignedTo: null },
    { number: 'WO-2024-0901', title: 'Secondary optical barcode scanner misalignment and belt drift', assetCode: null, location: 'Conveyor Sorter #4 · Logistics Bay 12', priority: 'P2', status: 'IN_PROGRESS', holdReason: null, slaDueAt: new Date(now + 74 * min + 30_000), assignedTo: kowalski },
    { number: 'WO-2024-0904', title: 'Static air pressure differential dropped below 25 Pa certification threshold', assetCode: null, location: 'Level 3 Pharma Lab · Tower A', priority: 'P2', status: 'OPEN', holdReason: null, slaDueAt: new Date(now + 160 * min), assignedTo: null },
    { number: 'WO-2026-0898', title: 'AHU-02 VAV Box Damper Actuator Calibration', assetCode: 'AST-ELEC-012', location: 'Substation East Wing (Roof Level)', priority: 'P2', status: 'DISPATCHED', holdReason: null, slaDueAt: new Date(now + 5 * hour), assignedTo: voronova },
    { number: 'WO-2026-0881', title: 'Semi-Annual Calibration of Pressure Relief Valve', assetCode: null, location: 'AST-VALV-042 · Room #B-204', priority: 'P3', status: 'SCHEDULED', holdReason: null, slaDueAt: new Date(now + 24 * hour), assignedTo: null },
  ];
  await db.insert(workOrders).values(
    wos.map((w) => ({ organizationId: ORG, ...w })),
  ).onConflictDoNothing();
  await db.insert(workOrders).values({
    organizationId: DECOY_ORG, number: 'WO-2026-7777', title: 'Decoy work order — other tenant (isolation fixture)',
    assetCode: null, location: 'Decoy Site', priority: 'P2', status: 'OPEN', holdReason: null,
    slaDueAt: new Date(now + 3 * hour), assignedTo: null,
  }).onConflictDoNothing();

  const existingEvents = await db.select({ id: workOrderEvents.id }).from(workOrderEvents)
    .where(sql`${workOrderEvents.organizationId} = ${ORG} AND ${workOrderEvents.workOrderNumber} = ${CANON.workOrderSeal}`)
    .limit(1);
  if (!existingEvents[0]) {
    await db.insert(workOrderEvents).values([
      { organizationId: ORG, workOrderNumber: CANON.workOrderSeal, actorName: 'System Telemetry Daemon', action: 'CREATE', fromStatus: null, toStatus: 'OPEN', reason: 'Auto-converted from FND-2026-0188 via SR-2026-0894' },
      { organizationId: ORG, workOrderNumber: CANON.workOrderSeal, actorName: 'Marcus Kowalski', action: 'START', fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', reason: null },
    ]);
  }

  await db.insert(woTasks).values([
    { organizationId: ORG, id: 'WOSEAL-T01', workOrderNumber: CANON.workOrderSeal, stepOrder: 1, title: 'LOTO Padlock #4092 applied & zero-energy verified', instruction: 'SOP-MECH-LOTO-04 · photo of applied padlock required', status: 'DONE', requiresPhoto: true, verifiedBy: 'Marcus Kowalski', verifiedAt: new Date(now - 5 * hour) },
    { organizationId: ORG, id: 'WOSEAL-T02', workOrderNumber: CANON.workOrderSeal, stepOrder: 2, title: 'Refrigerant R-134a recovered to holding cylinder', instruction: 'Recover to holding cylinder per EPA 608', status: 'DONE', requiresPhoto: false, verifiedBy: 'Marcus Kowalski', verifiedAt: new Date(now - 4 * hour) },
    { organizationId: ORG, id: 'WOSEAL-T03', workOrderNumber: CANON.workOrderSeal, stepOrder: 3, title: 'Old mechanical seal disassembled & shaft inspected', instruction: 'Inspect shaft for scoring before install', status: 'DONE', requiresPhoto: false, verifiedBy: 'Marcus Kowalski', verifiedAt: new Date(now - 3 * hour) },
    { organizationId: ORG, id: 'WOSEAL-T04', workOrderNumber: CANON.workOrderSeal, stepOrder: 4, title: 'New silicon-carbide seal installed & torqued (85 Nm)', instruction: 'Torque 85 Nm · photo of installed seal required', status: 'DONE', requiresPhoto: true, verifiedBy: 'Elena Voronova', verifiedAt: new Date(now - 2 * hour) },
    { organizationId: ORG, id: 'WOSEAL-T05', workOrderNumber: CANON.workOrderSeal, stepOrder: 5, title: 'Nitrogen pressure test (150 PSI hold for 30m)', instruction: 'Hold 150 PSI for 30 minutes, log reading', status: 'IN_PROGRESS', requiresPhoto: false, verifiedBy: null, verifiedAt: null },
    { organizationId: ORG, id: 'WOSEAL-T06', workOrderNumber: CANON.workOrderSeal, stepOrder: 6, title: 'Evacuation < 500 microns & refrigerant recharge', instruction: 'Evacuate below 500 microns before recharge', status: 'PENDING', requiresPhoto: false, verifiedBy: null, verifiedAt: null },
    { organizationId: ORG, id: 'WOSEAL-T07', workOrderNumber: CANON.workOrderSeal, stepOrder: 7, title: 'Post-repair vibration & temperature baseline run', instruction: 'Record baseline vibration + temperature', status: 'LOCKED', requiresPhoto: false, verifiedBy: null, verifiedAt: null },
  ]).onConflictDoNothing();

  await db.insert(serviceRequests).values([
    { organizationId: ORG, number: CANON.serviceRequest, title: 'Refrigerant smell near Chiller #04 flange', requesterName: CANON.requestor, priority: 'P1', status: 'CONVERTED', assetCode: CANON.assetSeal, slaDueAt: new Date(now - 3 * hour), convertedWoNumber: CANON.workOrderSeal },
    { organizationId: ORG, number: 'SR-2026-0893', title: 'Dock door P1 — hydraulic lift stuck mid-travel', requesterName: 'Front Desk', priority: 'P1', status: 'OPEN', slaDueAt: new Date(now + 88 * min) },
    { organizationId: ORG, number: 'SR-2026-0892', title: 'Autoclave chamber gasket weeping (Pharma L3)', requesterName: 'Lab Ops', priority: 'P2', status: 'TRIAGED', slaDueAt: new Date(now + 74 * min) },
    { organizationId: ORG, number: 'SR-2026-0887', title: 'Freight elevator leveling fault — door reopen', requesterName: 'Logistics', priority: 'P2', status: 'BREACHED', slaDueAt: new Date(now - 24 * min) },
    { organizationId: ORG, number: 'SR-2026-0885', title: 'LED bay lighting flicker — Logistics Bay 12', requesterName: 'Facilities', priority: 'P3', status: 'CLOSED', slaDueAt: new Date(now - 12 * min) },
  ]).onConflictDoNothing();

  await db.insert(inspections).values({
    organizationId: ORG, number: CANON.inspection, title: 'Q2 HVAC Refrigerant Containment Audit', auditorName: 'M. Kowalski', progressPct: CANON.inspectionProgress, status: 'IN_PROGRESS',
  }).onConflictDoNothing();
  await db.insert(findings).values({
    organizationId: ORG, number: CANON.finding, title: 'R-134a weeping at primary shaft seal housing (18.4 ppm)', severity: 'CRITICAL', status: 'CONVERTED', inspectionNumber: CANON.inspection, assetCode: CANON.assetSeal, convertedWoNumber: CANON.workOrderSeal,
  }).onConflictDoNothing();

  const msaTrane = new Date(Date.now() + 312 * 86_400_000).toISOString().slice(0, 10);
  await db.insert(vendors).values([
    { organizationId: ORG, slug: CANON.vendorSlug, name: CANON.vendorName, tier: 'TIER-1', msaNumber: CANON.msa, msaExpiresOn: msaTrane, onTimePct: 97, scope: 'Centrifugal Chillers & R-134a Overhaul', contact: 'Robert Langdon · Sr. Tech Lead', phone: '+62-21-5082-4402', duns: '00-132-9481' },
    { organizationId: ORG, slug: 'abb-grid-power-automation', name: 'ABB Grid & Power Automation', tier: 'TIER-2', msaNumber: 'MSA-2023-ABB-04', msaExpiresOn: '2026-04-30', onTimePct: 91, scope: '13.8kV Switchgear, Transformers, SCADA', contact: 'Elena Voronova · SCADA Lead (liaison)', phone: '+62-21-5082-2000' },
    { organizationId: ORG, slug: 'siemens-building-technologies', name: 'Siemens Building Technologies', tier: 'TIER-1', msaNumber: 'MSA-2025-SBT-11', msaExpiresOn: '2027-01-31', onTimePct: 99, scope: 'Desigo CC BMS & Cleanroom Actuators', contact: 'Marcus Gallagher', phone: '+62-21-2754-3000' },
    { organizationId: ORG, slug: 'johnson-controls-tyco-fire', name: 'Johnson Controls / Tyco Fire', tier: 'TIER-2', msaNumber: 'MSA-2023-JCI-07', msaExpiresOn: '2026-06-30', onTimePct: 94, scope: 'FM-200 Clean Agent & VESDA Aspirating', contact: 'Sarah Al-Mansoor (internal liaison)', phone: '+62-21-2995-5800' },
    { organizationId: ORG, slug: 'grainger-industrial-supply', name: 'Grainger Industrial Supply', tier: 'TIER-3', msaNumber: 'MSA-CATALOG-BLANKET', msaExpiresOn: null, onTimePct: 94, scope: 'MRO Hardware, Fasteners & Consumables', contact: 'B2B Corporate Account Desk', phone: '+62-21-5082-1111' },
    { organizationId: ORG, slug: 'grainger-industrial-supply', name: 'Grainger Industrial Supply', tier: 'TIER-3', msaNumber: null, msaExpiresOn: null, onTimePct: 96 },
  ]).onConflictDoNothing();

  await db.insert(facilities).values([
    { organizationId: ORG, code: 'B2-MECH-204', name: 'Centrifugal Chiller Plant Room #B-204', geojson: null, meta: JSON.stringify({ defects: [], transfers: [] }) },
    { organizationId: DECOY_ORG, code: 'DOCK-QA-01', name: 'Decoy Dock QA Staging Room', geojson: null, meta: JSON.stringify({ defects: [], transfers: [] }) },
  ]).onConflictDoNothing();

  await db.insert(settingsKv).values([
    { organizationId: ORG, key: 'ops.maint_mode', kind: 'value', value: 'false', updatedBy: 'seed' },
  ]).onConflictDoNothing();

  await db.insert(purchaseOrders).values([
    { organizationId: ORG, number: CANON.purchaseOrder, kind: 'PO', title: 'Silicon Carbide Shaft Seal Kit (Trane OEM)', vendorSlug: CANON.vendorSlug, totalCents: 290000, status: 'DISPATCHED', slaDueAt: new Date(now + 6 * hour) },
    { organizationId: ORG, number: CANON.purchaseRequest, kind: 'PR', title: 'Emergency seal kit requisition (CUP Capex)', vendorSlug: CANON.vendorSlug, totalCents: 290000, status: 'APPROVED' },
    { organizationId: ORG, number: 'PO-2026-0302', kind: 'PO', title: 'POE Lubricant ISO 68 — 10 units', vendorSlug: CANON.vendorSlug, totalCents: 195000, status: 'APPROVED' },
    { organizationId: ORG, number: 'PO-2026-0285', kind: 'PO', title: 'Bushing & bearing kit (Generator 2B)', vendorSlug: 'grainger-industrial-supply', totalCents: 2840000, status: 'PARTIAL' },
    { organizationId: ORG, number: 'PO-2026-0315', kind: 'PO', title: 'VAV actuator spares (AHU-02)', vendorSlug: 'siemens-building-technologies', totalCents: 640000, status: 'PENDING_APPROVAL' },
    { organizationId: ORG, number: 'PR-2026-0309', kind: 'PR', title: 'Lube restock request', vendorSlug: CANON.vendorSlug, totalCents: 195000, status: 'APPROVED' },
    { organizationId: ORG, number: 'PR-2026-0295', kind: 'PR', title: 'Non-OEM seal substitute (over VP cap)', vendorSlug: null, totalCents: 85000, status: 'REJECTED' },
  ]).onConflictDoNothing();

  await db.insert(poLineItems).values([
    { organizationId: ORG, id: `${CANON.purchaseOrder}-L1`, documentNumber: CANON.purchaseOrder, sku: CANON.sealSku, description: 'Silicon Carbide Shaft Seal 2.5" Kit', quantity: 2, unitPriceCents: 145000 },
  ]).onConflictDoNothing();
}
