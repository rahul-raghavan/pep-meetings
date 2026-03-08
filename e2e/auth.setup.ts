import { test as setup } from '@playwright/test'

const DEV_LOGIN_URL = 'http://localhost:3000/api/auth/dev-login'

type SetupArgs = Parameters<Parameters<typeof setup>[2]>[0]

async function loginAndSaveState(
  request: SetupArgs['request'],
  user: { email: string; name: string; role: string },
  storageStatePath: string
) {
  // Hit the dev-login endpoint (this sets session cookies on the response)
  const loginResponse = await request.post(DEV_LOGIN_URL, { data: user })

  if (!loginResponse.ok()) {
    const body = await loginResponse.text()
    throw new Error(`Dev login failed for ${user.email}: ${loginResponse.status()} ${body}`)
  }

  // Playwright's request API and browser context don't share cookies.
  // Grab cookies from the request context, inject into a browser context, then save.
  const requestState = await request.storageState()

  const browser = await (await import('playwright')).chromium.launch()
  const context = await browser.newContext()
  await context.addCookies(
    requestState.cookies.map((c) => ({
      ...c,
      sameSite: c.sameSite as 'Lax' | 'Strict' | 'None',
    }))
  )
  await context.storageState({ path: storageStatePath })
  await context.close()
  await browser.close()
}

setup('authenticate as super_admin', async ({ request }) => {
  await loginAndSaveState(
    request,
    {
      email: 'test-admin@pepschoolv2.com',
      name: 'Test Admin',
      role: 'super_admin',
    },
    'e2e/auth/storageState.admin.json'
  )
})

setup('authenticate as user', async ({ request }) => {
  await loginAndSaveState(
    request,
    {
      email: 'test-user@pepschoolv2.com',
      name: 'Test User',
      role: 'user',
    },
    'e2e/auth/storageState.user.json'
  )
})
