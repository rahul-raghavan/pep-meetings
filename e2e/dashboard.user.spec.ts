import { test, expect } from '@playwright/test'

test('regular user can see the meetings page', async ({ page }) => {
  await page.goto('/meetings')
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible()
})

test('regular user gets redirected away from admin', async ({ page }) => {
  await page.goto('/admin')
  // Non-admin users should be redirected to /meetings
  await expect(page).toHaveURL(/\/meetings/)
})

test('regular user can see the new meeting page', async ({ page }) => {
  await page.goto('/meetings/new')
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'New Meeting' })).toBeVisible()
})
