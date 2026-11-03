import { expect, test } from '@playwright/test'
import { expectValue, focus, load, MOD } from './helpers'

test.beforeEach(async ({ page }) => load(page))

test('a file of a million lines (~50 MB): opened, scrolled, edited at both ends', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const opened = await page.evaluate(() => {
    const text = Array.from({ length: 1_000_000 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join(
      '\n',
    )
    const start = performance.now()
    ;(window as unknown as { make(o: object): void }).make({ value: text })
    return { ms: performance.now() - start, length: text.length }
  })
  expect(opened.length).toBeGreaterThan(50_000_000)
  expect(opened.ms).toBeLessThan(5000)
  expect(await page.locator('#host .dsk-code-editor__lines > *').count()).toBeLessThan(150)

  await focus(page)
  await page.keyboard.press(`${MOD}+End`)
  await page.keyboard.type('END')
  await expect(
    page.locator('#host .dsk-code-editor__gutter-lines > .dsk-code-editor__line--active'),
  ).toHaveText('1000000')
  await page.keyboard.press(`${MOD}+Home`)
  const typed = await page.evaluate(async () => {
    const ed = (
      window as unknown as {
        ed: { dispatch(s: object): void; state: { selection: { main: { head: number } } } }
      }
    ).ed
    const start = performance.now()
    for (let i = 0; i < 50; i++) {
      const pos = ed.state.selection.main.head
      ed.dispatch({
        changes: { from: pos, to: pos, insert: 'a' },
        selection: (
          window as unknown as { api: { Selection: { single(n: number): object } } }
        ).api.Selection.single(pos + 1),
        userEvent: 'input.type',
      })
    }
    return (performance.now() - start) / 50
  })
  // A key on the first line of the file costs well under a frame.
  expect(typed).toBeLessThan(16)
  const ends = await page.evaluate(() => {
    const v = (window as unknown as { ed: { value: string } }).ed.value
    return [v.slice(0, 52), v.slice(-12)]
  })
  expect(ends).toEqual(['a'.repeat(50) + 'li', 'xxxxxxxxxEND'])
})

test('a long line is drawn around the columns in view', async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as { make(o: object): void }).make({
      value: 'short\n' + 'y'.repeat(200_000) + 'Z',
    }),
  )
  await focus(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  const drawn = await page
    .locator('#host .dsk-code-editor__lines > .dsk-code-editor__line')
    .nth(1)
    .textContent()
  expect(drawn!.length).toBeLessThan(20_000)
  expect(drawn!.endsWith('Z!')).toBe(true)
  await expectValue(page, 'short\n' + 'y'.repeat(200_000) + 'Z!')
})

test('scrolling draws the lines in view, numbers beside them', async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as { make(o: object): void }).make({
      value: Array.from({ length: 5000 }, (_, i) => `row ${i + 1}`).join('\n'),
    }),
  )
  await page.locator('#host .dsk-code-editor').evaluate((e) => (e.scrollTop = 20 * 3000))
  await expect(page.locator('#host .dsk-code-editor__lines')).toContainText('row 3001')
  const first = await page
    .locator('#host .dsk-code-editor__lines > .dsk-code-editor__line')
    .first()
    .textContent()
  const number = await page
    .locator('#host .dsk-code-editor__gutter-lines > .dsk-code-editor__line')
    .first()
    .textContent()
  expect(first).toBe(`row ${number}`)
})
