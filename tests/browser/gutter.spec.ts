import { expect, test } from '@playwright/test'
import { focus, load, make } from './helpers'

type Ed = {
  setGutterMarks(m: object[], s?: string): void
  setAnnotations(a: object[] | null): void
  dom: HTMLElement
}
const ed = (page: import('@playwright/test').Page, fn: (e: Ed) => unknown) =>
  page.evaluate(
    (src) => new Function('e', `return (${src})(e)`)((window as unknown as { ed: Ed }).ed),
    fn.toString(),
  )

test.beforeEach(async ({ page }) => load(page))

test('marks beside lines: drawn, told of on a click, moved by an edit above', async ({ page }) => {
  await make(page, { value: 'a\nb\nc\nd' })
  await ed(page, (e) =>
    e.setGutterMarks([
      { line: 1, kind: 'added', title: 'added' },
      { line: 2, kind: 'modified' },
      { line: 3, kind: 'deleted' },
    ]),
  )
  const marks = page.locator('#host .dsk-code-editor__mark')
  await expect(marks).toHaveCount(3)
  await expect(page.locator('#host .dsk-code-editor__mark--added')).toHaveAttribute(
    'data-line',
    '1',
  )
  const told = page.evaluate(
    () =>
      new Promise<{ line: number; kind: string }>((resolve) =>
        document.addEventListener('dsk:gutter-mark', (e) => resolve((e as CustomEvent).detail)),
      ),
  )
  await page.locator('#host .dsk-code-editor__mark--modified').click({ force: true })
  expect(await told).toMatchObject({ line: 2, kind: 'modified' })
  await focus(page)
  await page.keyboard.press('Enter')
  await expect(page.locator('#host .dsk-code-editor__mark--added')).toHaveAttribute(
    'data-line',
    '2',
  )
})

test('annotations: a column by the numbers, the gutter wider; taken away again', async ({
  page,
}) => {
  await make(page, { value: 'a\nb' })
  const gutter = page.locator('#host .dsk-code-editor__gutter')
  const before = (await gutter.boundingBox())!.width
  await ed(page, (e) =>
    e.setAnnotations([{ line: 0, text: 'Ann · 2 days', title: 'Ann, the 1st' }]),
  )
  await expect(page.locator('#host .dsk-code-editor__annotation')).toHaveText('Ann · 2 days')
  expect((await gutter.boundingBox())!.width).toBeGreaterThan(before + 50)
  await ed(page, (e) => e.setAnnotations(null))
  await expect(page.locator('#host .dsk-code-editor__annotation')).toHaveCount(0)
  expect((await gutter.boundingBox())!.width).toBe(before)
})
