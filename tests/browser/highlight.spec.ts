import { expect, test } from '@playwright/test'
import { clickLine, expectValue, focus, line, load, make, MOD } from './helpers'

test.beforeEach(async ({ page }) => load(page))

const spans = (page: import('@playwright/test').Page, n: number) =>
  line(page, n).evaluate((el) =>
    [...el.childNodes].map((c) =>
      c.nodeType === Node.TEXT_NODE
        ? c.textContent
        : `${(c as Element).className}:${c.textContent}`,
    ),
  )

test('typed text is highlighted as it is typed', async ({ page }) => {
  await make(page, { value: '', language: 'typescript' })
  await focus(page)
  await page.keyboard.type('const x = "a" // note')
  expect(await spans(page, 0)).toEqual([
    'sx-keyword:const',
    ' x ',
    'sx-operator:=',
    ' ',
    'sx-string:"a"',
    ' ',
    'sx-comment:// note',
  ])
})

test('a comment opened above colours the lines below; closed, they are code again', async ({
  page,
}) => {
  await make(page, { value: 'a\nlet b = 1\nlet c = 2', language: 'javascript' })
  await focus(page)
  await page.keyboard.type('/*')
  expect(await spans(page, 2)).toEqual(['sx-comment:let c = 2'])
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  expect(await spans(page, 2)).toEqual([
    'sx-keyword:let',
    ' c ',
    'sx-operator:=',
    ' ',
    'sx-number:2',
  ])
  // Undone and redone as one: the colours follow.
  await page.keyboard.type('/*')
  await page.keyboard.press(`${MOD}+z`)
  expect((await spans(page, 2))[0]).toBe('sx-keyword:let')
})

test('a click on a highlighted line with letters beyond ASCII lands between the right characters', async ({
  page,
}) => {
  await make(page, { value: 'const жук = "ёж" // ок', language: 'typescript' })
  const el = line(page, 0)
  const at = await el.evaluate((e) => {
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf('ёж')
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i + 1)
      r.setEnd(n, i + 2)
      return r.getBoundingClientRect().left - e.getBoundingClientRect().left + 1
    }
    return 0
  })
  await clickLine(page, 0, at)
  await page.keyboard.type('|')
  await expectValue(page, 'const жук = "ё|ж" // ок')
})

test('the language changes: highlighted again; a language not known leaves the text plain', async ({
  page,
}) => {
  await make(page, { value: 'def f(): pass', language: 'javascript' })
  await page.evaluate(() => {
    ;(window as unknown as { ed: { language: string } }).ed.language = 'python'
  })
  await expect.poll(() => spans(page, 0)).toContain('sx-keyword:def')
  await page.evaluate(() => {
    ;(window as unknown as { ed: { language: string } }).ed.language = 'no-such-language'
  })
  await expect.poll(() => spans(page, 0)).toEqual(['def f(): pass'])
})

test('a long file: the lines far down settle in idle time, as the whole text reads', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.evaluate(() => {
    const body = Array.from({ length: 200_000 }, (_, i) => `let v${i} = ${i}`).join('\n')
    ;(window as unknown as { make(o: object): void }).make({
      value: `/*\n${body}\n*/\nlet after = 1`,
      language: 'javascript',
    })
  })
  await page.locator('#host .dsk-code-editor').evaluate((e) => (e.scrollTop = e.scrollHeight))
  // Settled: still inside the comment opened on the first line, and code after it.
  const last = page.locator('#host .dsk-code-editor__lines > .dsk-code-editor__line').last()
  await expect(last.locator('.sx-keyword')).toHaveText('let', { timeout: 30_000 })
  const before = page.locator('#host .dsk-code-editor__lines > .dsk-code-editor__line', {
    hasText: 'let v199990 ',
  })
  await expect(before.locator('.sx-comment')).toHaveText('let v199990 = 199990', {
    timeout: 30_000,
  })
})

test('the element: highlighted by its language attribute', async ({ page }) => {
  const first = page.locator('#element .dsk-code-editor__lines > .dsk-code-editor__line').first()
  await expect(first.locator('.sx-keyword')).toHaveText('const')
  await expect(first.locator('.sx-string')).toHaveText("'<b>not markup</b>'")
})
