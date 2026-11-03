import { expect, test } from '@playwright/test'
import { load } from './helpers'

test.beforeEach(async ({ page }) => load(page))

test('the element takes its text from a script, not as markup', async ({ page }) => {
  const element = page.locator('#element')
  await expect(element.locator('.dsk-code-editor__lines > .dsk-code-editor__line')).toHaveText([
    "const a = '<b>not markup</b>'",
    'const b = 2',
    '',
  ])
  await expect(element.locator('.dsk-code-editor__gutter .dsk-code-editor__line')).toHaveText([
    '1',
    '2',
    '3',
  ])
  await expect(element.locator('b')).toHaveCount(0)
  await expect(element.locator('.dsk-code-editor')).toHaveAttribute('data-language', 'typescript')
  expect(await element.evaluate((e) => (e as HTMLElement & { value: string }).value)).toBe(
    "const a = '<b>not markup</b>'\nconst b = 2\n",
  )
})

test('the element follows its attributes and value', async ({ page }) => {
  const element = page.locator('#element')
  await element.evaluate((e) => {
    e.setAttribute('language', 'php')
    ;(e as HTMLElement & { value: string }).value = 'x\ny\nz'
  })
  await expect(element.locator('.dsk-code-editor')).toHaveAttribute('data-language', 'php')
  await expect(element.locator('.dsk-code-editor__gutter .dsk-code-editor__line')).toHaveCount(3)
})

test('the element keeps its text when moved in the page', async ({ page }) => {
  const kept = await page.evaluate(() => {
    const e = document.getElementById('element') as HTMLElement & { value: string }
    e.value = 'kept'
    document.body.append(e)
    return e.value
  })
  expect(kept).toBe('kept')
  await expect(page.locator('#element .dsk-code-editor')).toHaveCount(1)
})

test('the element tells of changes with the text', async ({ page }) => {
  const element = page.locator('#element')
  await element.evaluate((e) => {
    e.addEventListener(
      'dsk:change',
      (ev) =>
        ((window as unknown as { last: string }).last = (
          ev as CustomEvent<{ source: string }>
        ).detail.source),
    )
  })
  await element.locator('.dsk-code-editor__content').click({ position: { x: 5, y: 5 } })
  await page.keyboard.type('// ')
  expect(await page.evaluate(() => (window as unknown as { last: string }).last)).toBe(
    "// const a = '<b>not markup</b>'\nconst b = 2\n",
  )
})

test('a readonly element shows and selects, but does not change', async ({ page }) => {
  const element = page.locator('#element')
  await element.evaluate((e) => e.setAttribute('readonly', ''))
  await element.locator('.dsk-code-editor__content').click({ position: { x: 5, y: 5 } })
  await page.keyboard.type('nope')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Shift+ArrowRight')
  expect(await element.evaluate((e) => (e as HTMLElement & { value: string }).value)).toBe(
    "const a = '<b>not markup</b>'\nconst b = 2\n",
  )
  await expect(element.locator('.dsk-code-editor__selection')).toHaveCount(1)
})

test('EditContext where the browser has it', async ({ page, browserName }) => {
  const supported = await page.evaluate(() =>
    (window as unknown as { api: { supportsEditContext(): boolean } }).api.supportsEditContext(),
  )
  expect(supported).toBe(browserName === 'chromium')
  await expect(page.locator('#element .dsk-code-editor')).toHaveAttribute(
    'data-input',
    browserName === 'chromium' ? 'editcontext' : 'textarea',
  )
})
