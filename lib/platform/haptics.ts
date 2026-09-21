import { has } from './capability';

export function vibrate(pattern: number | number[]): boolean {
  if (!has.vibration()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export const haptic = {
  pass: (): boolean => vibrate(50),
  fail: (): boolean => vibrate([80, 40, 80]),
  info: (): boolean => vibrate(20),
};
