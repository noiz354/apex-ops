'use client';

import { useEffect } from 'react';
import { initRum } from '@/lib/telemetry/rum';

export function RumInit() {
  useEffect(() => initRum(), []);
  return null;
}
