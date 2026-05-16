import { test, expect } from '@playwright/test';

test('app loads with upload zone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Drop resume here')).toBeVisible();
  await expect(page.locator('button[type="submit"]', { hasText: /Execute Initial Scan/i })).toBeVisible();
});
