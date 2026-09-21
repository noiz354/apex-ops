import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { ingestSensorReading, listRecentSensorReadings } from '@/lib/services/telemetry-service';

const IngestSchema = z.object({
  assetCode: z.string().min(3),
  sensorType: z.enum(['VIBRATION', 'TEMPERATURE', 'REFRIGERANT_PPM', 'VOLTAGE_KV', 'PRESSURE_PSI']),
  value: z.union([z.number(), z.string()]),
  unit: z.string().min(1),
  recordedAt: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'telemetry.readings.list', method: 'GET', permission: 'assets.read' }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const assetCode = searchParams.get('assetCode') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const readings = await listRecentSensorReadings(getDb(), ctx!, assetCode, limit);
    return { data: readings };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'telemetry.ingest', method: 'POST', permission: 'wo.create' }, req, async (ctx) => {
    const body = await req.json();
    const input = IngestSchema.parse(body);

    const reading = await ingestSensorReading(getDb(), ctx!, input);
    return { status: 201, data: reading };
  });
}
