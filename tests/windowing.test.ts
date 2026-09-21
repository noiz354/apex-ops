import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useWindow } from '../lib/ui/useWindow';

const OPTS = { rowHeight: 76, threshold: 60, initialHeight: 480 } as const;

function renderSlice(n: number): Record<string, string> {
  function Harness() {
    const all = Array.from({ length: n }, (_, i) => i);
    const w = useWindow(all, { ...OPTS });
    return createElement('div', {
      'data-windowed': String(w.windowed),
      'data-count': String(w.items.length),
      'data-offset': String(w.offset),
      'data-top': String(w.topPad),
      'data-bottom': String(w.bottomPad),
      'data-total': String(w.total),
      'data-first': String(w.items[0] ?? -1),
    });
  }
  const html = renderToString(createElement(Harness));
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/data-([a-z]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

test('below threshold renders full list (no windowing)', () => {
  const s = renderSlice(60);
  assert.equal(s.windowed, 'false');
  assert.equal(s.count, '60');
  assert.equal(s.top, '0');
  assert.equal(s.bottom, '0');
});

test('above threshold renders a small window, DOM << dataset', () => {
  const s = renderSlice(200);
  assert.equal(s.windowed, 'true');
  assert.equal(s.count, '23');
  assert.equal(s.offset, '0');
  assert.equal(s.first, '0');
  assert.equal(s.top, '0');
  assert.equal(s.bottom, String((200 - 23) * 76));
  assert.ok(Number(s.count) < 200 / 4, 'rendered DOM must be a fraction of the dataset');
});

test('threshold boundary: 61 items windows, spacer math holds', () => {
  const s = renderSlice(61);
  assert.equal(s.windowed, 'true');
  assert.equal(s.count, '23');
  assert.equal(s.bottom, String((61 - 23) * 76));
});

test('single item and empty list never window', () => {
  assert.equal(renderSlice(1).windowed, 'false');
  assert.equal(renderSlice(1).count, '1');
  assert.equal(renderSlice(0).windowed, 'false');
  assert.equal(renderSlice(0).count, '0');
});
