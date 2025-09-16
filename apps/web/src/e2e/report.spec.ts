import { expect, test } from '@playwright/test';

test('app loads and shows title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Focus Proctor')).toBeVisible();
});
