import { test, expect } from '@playwright/test'

test('admin can see the meetings page', async ({ page }) => {
  await page.goto('/meetings')
  // Should not redirect to login
  await expect(page).not.toHaveURL(/\/login/)
  // Should see the page heading
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible()
})

test('admin can see the action items page', async ({ page }) => {
  await page.goto('/action-items')
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Action Items' })).toBeVisible()
})

test('admin can access the admin dashboard', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).not.toHaveURL(/\/meetings/)
  await expect(page).not.toHaveURL(/\/login/)
})

test('admin can access the users management page', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Manage Users' })).toBeVisible()
})
