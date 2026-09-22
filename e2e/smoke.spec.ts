import { expect, test, type Page } from '@playwright/test';


const SEED_EMAIL = 'm.vance@apexops.io';
const SEED_PASSWORD = 'demo-pass-4821';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#lf-email', SEED_EMAIL);
  await page.fill('#lf-pass', SEED_PASSWORD);
  await page.getByRole('button', { name: 'Lanjut' }).click();
  const hint = page.getByTestId('dev-hint');
  await expect(hint).toBeVisible();
  const code = (await hint.textContent())?.match(/\b(\d{6})\b/)?.[1];
  expect(code).toBeTruthy();
  await page.fill('#lf-mfa', code!);
  await page.getByRole('button', { name: /Verifikasi|Masuk|Lanjut/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

const SCREENS: Array<{ path: string; marker: RegExp }> = [
  { path: '/', marker: /Operations|Dispatch|Apex/i },
  { path: '/work-orders', marker: /Work Order/i },
  { path: '/inventory', marker: /PART-|Spare|Ledger|Inventory/i },
  { path: '/organization', marker: /Organization|RBAC|Roster|Directory/i },
  { path: '/notifications', marker: /Notification|Alert|SLA/i },
];

test.describe('smoke: 5 critical screens', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const s of SCREENS) {
    test(`screen ${s.path} renders real content`, async () => {
      const res = await page.goto(s.path);
      expect(res?.status(), `${s.path} must return 200`).toBe(200);
      await expect(page.getByText(s.marker).first()).toBeVisible();
    });
  }
});
