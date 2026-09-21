import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents, sensorReadings } from '../../db/schema';
import type { AuthContext } from '../auth/session';

export interface IngestReadingInput {
  assetCode: string;
  sensorType: 'VIBRATION' | 'TEMPERATURE' | 'REFRIGERANT_PPM' | 'VOLTAGE_KV' | 'PRESSURE_PSI';
  value: number | string;
  unit: string;
  recordedAt?: string;
}

export interface SensorReadingDto {
  id: number;
  assetCode: string;
  sensorType: string;
  value: string;
  unit: string;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  recordedAt: string;
}

export function evaluateThreshold(
  sensorType: IngestReadingInput['sensorType'],
  numVal: number,
): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  switch (sensorType) {
    case 'REFRIGERANT_PPM':
      if (numVal >= 10.0) return 'CRITICAL';
      if (numVal >= 5.0) return 'WARNING';
      return 'NORMAL';
    case 'VIBRATION':
      if (numVal >= 4.5) return 'CRITICAL';
      if (numVal >= 3.0) return 'WARNING';
      return 'NORMAL';
    case 'TEMPERATURE':
      if (numVal >= 90.0) return 'CRITICAL';
      if (numVal >= 75.0) return 'WARNING';
      return 'NORMAL';
    case 'PRESSURE_PSI':
      if (numVal >= 180.0 || numVal <= 20.0) return 'CRITICAL';
      if (numVal >= 150.0 || numVal <= 35.0) return 'WARNING';
      return 'NORMAL';
    default:
      return 'NORMAL';
  }
}

export async function ingestSensorReading(
  db: Db,
  ctx: AuthContext,
  input: IngestReadingInput,
): Promise<SensorReadingDto> {
  const numVal = typeof input.value === 'number' ? input.value : parseFloat(input.value);
  const status = evaluateThreshold(input.sensorType, isNaN(numVal) ? 0 : numVal);
  const recorded = input.recordedAt ? new Date(input.recordedAt) : new Date();

  const [row] = await db
    .insert(sensorReadings)
    .values({
      organizationId: ctx.orgId,
      assetCode: input.assetCode,
      sensorType: input.sensorType,
      value: String(input.value),
      unit: input.unit,
      status,
      recordedAt: recorded,
    })
    .returning();

  if (status === 'CRITICAL') {
    await db.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorName: 'scada_telemetry_gateway',
      action: 'SCADA_THRESHOLD_BREACH',
      entityType: 'asset',
      entityId: input.assetCode,
      after: {
        sensorType: input.sensorType,
        value: input.value,
        unit: input.unit,
        threshold: 'CRITICAL',
      },
    });
  }

  return {
    id: row.id,
    assetCode: row.assetCode,
    sensorType: row.sensorType,
    value: row.value,
    unit: row.unit,
    status: row.status as SensorReadingDto['status'],
    recordedAt: row.recordedAt.toISOString(),
  };
}

export async function listRecentSensorReadings(
  db: Db,
  ctx: AuthContext,
  assetCode?: string,
  limit = 50,
): Promise<SensorReadingDto[]> {
  const conditions = [eq(sensorReadings.organizationId, ctx.orgId)];
  if (assetCode) {
    conditions.push(eq(sensorReadings.assetCode, assetCode));
  }

  const rows = await db
    .select()
    .from(sensorReadings)
    .where(and(...conditions))
    .orderBy(desc(sensorReadings.recordedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    assetCode: r.assetCode,
    sensorType: r.sensorType,
    value: r.value,
    unit: r.unit,
    status: r.status as SensorReadingDto['status'],
    recordedAt: r.recordedAt.toISOString(),
  }));
}
