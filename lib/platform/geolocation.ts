import { has } from './capability';

export interface DeviceCoords {
  lat: number;
  lng: number;
  accuracyM: number;
  at: string;
}

export function getCurrentCoords(opts?: PositionOptions): Promise<DeviceCoords | null> {
  if (!has.geolocation()) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
          at: new Date(pos.timestamp).toISOString(),
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000, ...opts },
    );
  });
}

export function formatCoords(c: DeviceCoords): string {
  const lat = `${Math.abs(c.lat).toFixed(4)}°${c.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(c.lng).toFixed(4)}°${c.lng >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lng} ±${c.accuracyM}m`;
}
