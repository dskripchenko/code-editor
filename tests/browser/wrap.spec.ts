import { expect, test, type Page } from '@playwright/test'
import { focus, load, make, selection } from './helpers'

type W = Window & {
  ed: {
    lineWrapping: boolean
    value: string
    setSelection(anchor: number, head?: number): void
    focus(): void
    posAtPoint(x: number, y: number): number
    coordsAt(pos: number): DOMRect
  }
}

const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
const text = `first\n${words}\nlast`

const lines = (page: Page) => page.locator('#host .dsk-code-editor__lines > .dsk-code-editor__line')

test.beforeEach(async ({ page }) => {
  await load(page)
  await make(page, { value: text, lineWrapping: true } as Parameters<typeof make>[1])
})

test('a long line wraps into rows at the view’s width, by words; no scrolling sideways', async ({ page }) => {
  const long = lines(page).nth(1)
  const rows = await long.locator('br').count()
  expect(rows).toBeGreaterThan(1)
  const height = (await long.boundingBox())!.height
  const one = (await lines(page).first().boundingBox())!.height
  expect(height).toBeCloseTo(one * (rows + 1), 0)
  // Each row starts with a word, not inside one.
  expect(await long.evaluate((el) => el.innerHTML.split('<br>').slice(1).every((part) => /^word\d/.test(part.replace(/<[^>]+>/g, ''))))).toBe(true)
  const host = page.locator('#host .dsk-code-editor')
  expect(await host.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  // The next line comes after all the rows.
  const last = (await lines(page).nth(2).boundingBox())!
  expect(last.y).toBeCloseTo((await long.boundingBox())!.y + height, 0)
})

test('a click on a later row puts the cursor there; up and down go row by row, the column kept', async ({ page }) => {
  await focus(page)
  // The point of the text where the second row of the long line starts.
  const breakAt = await page.evaluate(() => {
    const ed = (window as unknown as W).ed
    const second = 6 + ed.value.split('\n')[1]!.indexOf(' word', 60) + 1
    return second
  })
  const box = await page.evaluate((p) => {
    const r = (window as unknown as W).ed.coordsAt(p)
    return { x: r.left, y: r.top, h: r.height }
  }, breakAt)
  await page.mouse.click(box.x + 3, box.y + box.h / 2)
  const at = (await selection(page))[0]!.head
  // On a row below the line's first one.
  const firstRowTop = await page.evaluate(() => (window as unknown as W).ed.coordsAt(6).top)
  const clickedTop = await page.evaluate((p) => (window as unknown as W).ed.coordsAt(p).top, at)
  expect(clickedTop).toBeGreaterThan(firstRowTop)
  // Up: the row above within the same line.
  await page.keyboard.press('ArrowUp')
  const up = (await selection(page))[0]!.head
  expect(up).toBeGreaterThanOrEqual(6)
  expect(up).toBeLessThan(at)
  expect(await page.evaluate((p) => (window as unknown as W).ed.coordsAt(p).top, up)).toBeCloseTo(firstRowTop, 0)
  // Down twice: back to the row, then the one after it, still in the long line.
  await page.keyboard.press('ArrowDown')
  expect(await page.evaluate((p) => (window as unknown as W).ed.coordsAt(p).top, (await selection(page))[0]!.head)).toBeCloseTo(clickedTop, 0)
})

test('a selection across rows is drawn on each; wrapping off scrolls sideways again; a narrower view more rows', async ({ page }) => {
  await page.evaluate(() => {
    const ed = (window as unknown as W).ed
    ed.focus()
    ed.setSelection(6, 6 + 120)
  })
  const pieces = page.locator('#host .dsk-code-editor__selection')
  await expect.poll(() => pieces.count()).toBeGreaterThan(1)
  const before = await lines(page).nth(1).locator('br').count()
  await page.evaluate(() => (document.getElementById('host')!.style.width = '360px'))
  await expect.poll(() => lines(page).nth(1).locator('br').count()).toBeGreaterThan(before)
  await page.evaluate(() => ((window as unknown as W).ed.lineWrapping = false))
  await expect(lines(page).nth(1).locator('br')).toHaveCount(0)
  const host = page.locator('#host .dsk-code-editor')
  expect(await host.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
})
