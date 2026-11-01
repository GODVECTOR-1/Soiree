import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Fails on any axe violation, of any impact: WCAG 2.2 A and AA rules plus axe best practices. */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  expect(
    violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([])
}

/** Collects CSP violations and page errors so every test can assert zero. */
function watchConsole(page: Page) {
  const problems: string[] = []
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      /Content.Security.Policy|Refused to/i.test(m.text()) &&
      problems.push(m.text()),
  )
  page.on('pageerror', (e) => problems.push(e.message))
  return problems
}

const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10)

/** Walk the wizard with the keyboard only and return the plan URL. */
async function createByKeyboard(page: Page) {
  await page.goto('/create')
  const press = async (name: RegExp | string, key = 'Enter') => {
    await page.getByRole('button', { name }).focus()
    await page.keyboard.press(key)
  }
  await press('Birthday', 'Space')
  await press(/Continue/)
  await page.getByLabel('Celebration name').focus()
  await page.keyboard.type('Asha turns 40')
  await page.getByLabel('City', { exact: true }).focus()
  await page.keyboard.type('Pune')
  await page.getByLabel('Event date').fill(day(60))
  await page.getByLabel('Planning starts').fill(day(0))
  await page.getByLabel('Expected guests').focus()
  await page.keyboard.type('40')
  await page.getByLabel('Total budget').focus()
  await page.keyboard.type('90000')
  await page.keyboard.press('Enter') // submit the step form
  await press('Food and cake', 'Space')
  await press(/Continue/)
  await page.getByLabel('Food needs').focus()
  await page.keyboard.type('Jain')
  await press(/Continue/)
  await expect(page.getByRole('heading', { name: 'Review your plan' })).toBeVisible()
  await press(/Generate my plan/)
  await page.waitForURL(/\/plan\/[A-Za-z0-9_-]{12}$/)
  return page.url()
}

test('landing page is accessible with zero CSP violations', async ({ page }) => {
  const problems = watchConsole(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page)

  // The photo carousel moves on its own, so it must have a way to stop it (WCAG 2.2.2).
  const carousel = page.getByRole('region', { name: /Celebration photos/ })
  await carousel.getByRole('button', { name: 'Pause slideshow' }).click()
  await expect(carousel.getByRole('button', { name: 'Play slideshow' })).toBeVisible()
  // It may have moved on its own before the pause (slow runners), so step on from wherever it stopped, once any
  // move in flight has finished (moves ignore input for 0.6 s).
  await page.waitForTimeout(700)
  const shown = carousel.getByRole('group') // hidden slides are out of the accessibility tree
  const at = Number((await shown.getAttribute('aria-label'))?.split(' ')[0])
  // Next photo is hidden until a keyboard user tabs to it, then shows as a full-size button.
  await carousel.getByRole('button', { name: 'Play slideshow' }).focus()
  await page.keyboard.press('Tab')
  const next = carousel.getByRole('button', { name: 'Next photo' })
  await expect(next).toBeFocused()
  expect((await next.boundingBox())?.width).toBe(40)
  await page.keyboard.press('Enter')
  await expect(shown).toHaveAccessibleName(`${(at % 8) + 1} of 8`)
  expect(problems).toEqual([])
})

test('Ask the planner is a modal dialog: focus moves in, stays in, and returns on Escape', async ({
  page,
}) => {
  await page.goto('/plan/demo-wedding')
  const open = page.getByRole('button', { name: 'Ask the planner' })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Ask the planner' })
  await expect(dialog.getByRole('button', { name: 'Close planner' })).toBeFocused()
  await expectAccessible(page)
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
})

test('wizard by keyboard, overview, what-if apply, and read-only view link', async ({ page }) => {
  const problems = watchConsole(page)
  const url = await createByKeyboard(page)
  expect(url).not.toContain('#edit=') // token stripped from the address bar
  await expect(page.getByRole('heading', { name: 'Asha turns 40' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'What-if' }).click()
  await page.getByRole('button', { name: 'Cut budget 20%' }).click()
  await expect(page.getByText('Draft: Budget down 20%.')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Applied.' })).toBeVisible()

  const slug = new URL(url).pathname.split('/').pop()
  await page.goto(`/s/${slug}`)
  await expect(page.getByText('You are viewing a shared plan. Changes are off.')).toBeVisible()
  await expect(page.getByRole('checkbox').first()).toBeDisabled()
  await expectAccessible(page)
  expect(problems).toEqual([])
})

test('timeline priorities, reminders and run sheet; vendors with quotes', async ({ page }) => {
  const problems = watchConsole(page)
  await createByKeyboard(page)
  const nav = page.getByRole('navigation', { name: 'Plan sections' })

  await nav.getByRole('button', { name: 'Timeline' }).click()
  await expect(page.getByText(/High priority · Your priority: Food and cake/).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /reminders to your calendar/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^soiree-.+\.ics$/)
  await expect(page.getByRole('heading', { name: 'Day-of run sheet' })).toBeVisible()
  await expect(page.getByText(/Label the jain dishes/)).toBeVisible() // from the Jain food need
  await page.getByLabel('Guests arrive at').fill('20:00')
  await expect(page.getByText('8:00 pm')).toBeVisible()
  await expectAccessible(page)

  await nav.getByRole('button', { name: 'Vendors' }).click()
  await page.getByLabel('Name (optional)').fill('Second caterer')
  await page.getByRole('button', { name: 'Add vendor' }).click()
  const added = page.getByRole('article', { name: 'Second caterer' })
  await expect(added).toBeVisible()
  const quote = added.getByLabel('Quote (INR)')
  await quote.fill('999999')
  await quote.blur()
  await expect(page.getByText(/over your planning range/)).toBeVisible()
  await expectAccessible(page)
  expect(problems).toEqual([])
})

test('home page plan picker: your plans and samples, then the loading screen opens the plan', async ({
  page,
}) => {
  const problems = watchConsole(page)
  await createByKeyboard(page) // a plan of our own, remembered in this browser
  await page.goto('/')
  await page.getByRole('button', { name: 'Your plans' }).click()
  const picker = page.getByRole('dialog', { name: 'Your plans' })
  await expect(picker.getByRole('button', { name: /Asha turns 40/ })).toBeVisible()
  await expect(picker.getByRole('button', { name: /Sample/ })).toHaveCount(3)
  await expectAccessible(page)
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()

  await page.getByRole('button', { name: 'Your plans' }).click()
  await picker.getByRole('button', { name: /Lakeview residents/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Opening your plan' })).toBeVisible()
  await page.waitForURL(/\/plan\/demo-community$/)
  await expect(page.getByRole('heading', { name: "Lakeview residents' winter fair" })).toBeVisible()
  expect(problems).toEqual([])
})

test('sample plans are read-only', async ({ page }) => {
  await page.goto('/plan/demo-community')
  await expect(page.getByText('You are viewing a shared plan. Changes are off.')).toBeVisible()
  await expectAccessible(page)
})

test('plans list, wizard errors, missing pages and phone width are accessible', async ({
  page,
}) => {
  for (const path of ['/plans', '/no-such-page', '/plan/no-such-plan']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page)
  }

  await page.goto('/create')
  await expectAccessible(page)
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByLabel('Celebration name')).toBeFocused()
  await expectAccessible(page)

  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/', '/plan/demo-birthday']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page)
  }
})
