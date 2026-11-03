import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/page.html')
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready)
})

test('shows the lines with their numbers', async ({ page }) => {
  const editor = page.locator('#plain .dsk-code-editor')
  await expect(editor.locator('.dsk-code-editor__content .dsk-code-editor__line')).toHaveText([
    'one',
    'two',
    'three',
  ])
  await expect(editor.locator('.dsk-code-editor__gutter .dsk-code-editor__line')).toHaveText([
    '1',
    '2',
    '3',
  ])
})

test('gives the text back with its line breaks', async ({ page }) => {
  const value = await page.evaluate(
    () => (window as unknown as { plain: { value: string } }).plain.value,
  )
  expect(value).toBe('one\r\ntwo\r\nthree\r\n')
})

test('the element takes its text from a script, not as markup', async ({ page }) => {
  const element = page.locator('#element')
  await expect(element.locator('.dsk-code-editor__content .dsk-code-editor__line')).toHaveText([
    "const a = '<b>not markup</b>'",
    'const b = 2',
  ])
  await expect(element.locator('b')).toHaveCount(0)
  await expect(element.locator('.dsk-code-editor')).toHaveAttribute('data-language', 'typescript')
  expect(await element.evaluate((e) => (e as HTMLElement & { value: string }).value)).toBe(
    "const a = '<b>not markup</b>'\nconst b = 2\n",
  )
})

test('the element follows its language attribute and value', async ({ page }) => {
  const element = page.locator('#element')
  await element.evaluate((e) => {
    e.setAttribute('language', 'php')
    ;(e as HTMLElement & { value: string }).value = 'x\ny\nz'
  })
  await expect(element.locator('.dsk-code-editor')).toHaveAttribute('data-language', 'php')
  await expect(element.locator('.dsk-code-editor__gutter .dsk-code-editor__line')).toHaveCount(3)
})

test('keeps its text when moved in the page', async ({ page }) => {
  const value = await page.evaluate(() => {
    const e = document.getElementById('element') as HTMLElement & { value: string }
    e.value = 'kept'
    document.body.append(e)
    return e.value
  })
  expect(value).toBe('kept')
  await expect(page.locator('#element .dsk-code-editor')).toHaveCount(1)
})

test('EditContext where the browser has it', async ({ page, browserName }) => {
  const supported = await page.evaluate(() =>
    (window as unknown as { api: { supportsEditContext(): boolean } }).api.supportsEditContext(),
  )
  expect(supported).toBe(browserName === 'chromium')
})
