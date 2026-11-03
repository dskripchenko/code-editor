import { expect, test, type Page } from '@playwright/test'
import { expectValue, focus, load, make } from './helpers'

test.beforeEach(async ({ page }) => load(page))

const CODE = [
  'function a() {',
  '  const x = 1',
  '  return x',
  '}',
  'function b() {',
  '  return 2',
  '}',
].join('\n')

const FOLD = process.platform === 'darwin' ? 'Meta+Alt+BracketLeft' : 'Control+Shift+BracketLeft'
const UNFOLD =
  process.platform === 'darwin' ? 'Meta+Alt+BracketRight' : 'Control+Shift+BracketRight'

const numbers = (page: Page) =>
  page.locator('#host .dsk-code-editor__gutter-lines > .dsk-code-editor__line').allTextContents()
const marker = (page: Page, line: number) =>
  page.locator(`#host .dsk-code-editor__fold[data-line="${line}"]`)

test('a block folds and opens from its marker beside the line numbers', async ({ page }) => {
  await make(page, { value: CODE, language: 'javascript' })
  await expect(marker(page, 0)).toHaveCount(1)
  await marker(page, 0).click({ force: true })
  await expect.poll(() => numbers(page)).toEqual(['1', '4', '5', '6', '7'])
  await expect(page.locator('#host .dsk-code-editor__line--folded')).toHaveText('function a() {')
  await marker(page, 0).click({ force: true })
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
})

test('by keys: the block at the cursor; moves go over it; typing above moves it', async ({
  page,
}) => {
  await make(page, { value: `// top\n${CODE}`, language: 'javascript' })
  await focus(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press(FOLD)
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '5', '6', '7', '8'])
  // The cursor was inside: now at the end of the folded line, and Down goes past the fold.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('!')
  await expectValue(page, `// top\n${CODE.replace('}\nfunction b', '}!\nfunction b')}`)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '3', '6', '7', '8', '9'])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press(UNFOLD)
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('a click on the placeholder of a folded line opens it', async ({ page }) => {
  await make(page, { value: CODE, language: 'javascript' })
  await page.evaluate(() => (window as unknown as { ed: { fold(n: number): void } }).ed.fold(4))
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '3', '4', '5', '7'])
  const line = page.locator('#host .dsk-code-editor__line--folded')
  const box = await line.boundingBox()
  const text = await line.evaluate((e) => {
    const r = document.createRange()
    r.selectNodeContents(e)
    return r.getBoundingClientRect().right
  })
  await page.mouse.click(text + 14, box!.y + box!.height / 2)
  await expect.poll(() => numbers(page)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
})

test('a data file is checked as it is edited: the error marked, gone once it is fixed', async ({
  page,
}) => {
  await make(page, { value: '{\n  "a": 1,\n}', language: 'json' })
  const squiggle = page.locator('#host .dsk-code-editor__diagnostic--error')
  await expect(squiggle).toHaveCount(1)
  await expect(
    page.locator('#host .dsk-code-editor__gutter-lines > .dsk-code-editor__line--error'),
  ).toHaveText('3')
  await focus(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await expect(squiggle).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as unknown as { ed: { diagnostics: unknown[] } }).ed.diagnostics,
    ),
  ).toEqual([])
})

test("the host's own diagnostics: drawn, told of, moved with edits", async ({ page }) => {
  await make(page, { value: 'let a = b', language: 'javascript' })
  const told = page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        document.addEventListener('dsk:diagnostics', (e) =>
          resolve((e as CustomEvent).detail.diagnostics.length),
        ),
      ),
  )
  await page.evaluate(() =>
    (window as unknown as { ed: { setDiagnostics(l: object[]): void } }).ed.setDiagnostics([
      { from: 8, to: 9, message: 'b is not defined', severity: 'warning' },
    ]),
  )
  const mark = page.locator('#host .dsk-code-editor__diagnostic--warning')
  await expect(mark).toHaveCount(1)
  await expect(
    page.locator('#host .dsk-code-editor__lines > .dsk-code-editor__line').first(),
  ).toHaveAttribute('title', 'b is not defined')
  await focus(page)
  expect(await told).toBe(1)
  await page.keyboard.type('// ')
  const moved = await page.evaluate(
    () =>
      (window as unknown as { ed: { diagnostics: { from: number }[] } }).ed.diagnostics[0]!.from,
  )
  expect(moved).toBe(11)
})
