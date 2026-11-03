import { expect, test, type Page } from '@playwright/test'
import { focus, line, load, MOD, selection } from './helpers'

type W = Window & {
  api: { CodeEditor: new (el: Element, o: object) => unknown }
  ed: {
    destroy(): void
    value: string
    menu(items: object[]): Promise<number | null>
    prompt(from: number, to: number): Promise<string | null>
  }
  log: unknown[]
}

/** An editor with the page's language points: hover, parameters, Cmd/Ctrl+click, a snippet. */
async function setup(page: Page, value: string): Promise<void> {
  await page.evaluate((v) => {
    const w = window as unknown as W
    w.ed?.destroy()
    w.log = []
    w.ed = new w.api.CodeEditor(document.getElementById('host')!, {
      value: v,
      hover: ({ pos }: { pos: number }) => `hover at ${pos}`,
      signatureHelp: ({ explicit }: { explicit: boolean }) =>
        explicit ? 'f(a, b) — asked' : 'f(a, b)',
      onModClick: (pos: number) => (w.log.push(['click', pos]), true),
      completion: ({ prefix }: { prefix: string }) =>
        prefix === 'lo' ? [{ label: 'log', snippet: 'log(${1:message})$0' }] : null,
      completeWords: false,
    }) as W['ed']
    ;(w.ed as unknown as { dom: HTMLElement }).dom.addEventListener('dsk:change', (e) =>
      w.log.push(['change', (e as CustomEvent).detail.edits]),
    )
  }, value)
}

test.beforeEach(async ({ page }) => load(page))

test('hover: what is under a resting pointer, in a tooltip; gone off the text', async ({
  page,
}) => {
  await setup(page, 'const value = 1')
  const box = (await line(page, 0).boundingBox())!
  await page.mouse.move(box.x + 60, box.y + box.height / 2)
  const tip = page.locator('#host .dsk-code-editor__hover')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText(/^hover at \d+$/)
  await page.mouse.move(box.x + 500, box.y + box.height / 2)
  await expect(tip).toBeHidden()
})

test('a call’s parameters after ( and , — asked by Mod+Shift+Space too — gone after )', async ({
  page,
}) => {
  await setup(page, '')
  await focus(page)
  const tip = page.locator('#host .dsk-code-editor__signature')
  await page.keyboard.type('f(')
  await expect(tip).toHaveText('f(a, b)')
  await page.keyboard.type('1)')
  await expect(tip).toBeHidden()
  await page.keyboard.press(`${MOD}+Shift+Space`)
  await expect(tip).toHaveText('f(a, b) — asked')
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
})

test('Cmd/Ctrl+click is the page’s; a snippet completion selects its first place; edits told with a change', async ({
  page,
}) => {
  await setup(page, 'abc def')
  const box = (await line(page, 0).boundingBox())!
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control')
  await page.mouse.click(box.x + 40, box.y + box.height / 2)
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control')
  expect(
    ((await page.evaluate(() => (window as unknown as W).log)) as [string, number][]).some(
      ([k]) => k === 'click',
    ),
  ).toBe(true)
  await page.keyboard.press('End')
  await page.keyboard.type(' lo')
  await expect(page.locator('#host .dsk-code-editor__completion-label')).toHaveText(['log'])
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).ed.value))
    .toBe('abc def log(message)')
  expect(await selection(page)).toEqual([{ anchor: 12, head: 19 }])
  const changes = (await page.evaluate(() => (window as unknown as W).log)) as [string, unknown][]
  expect(changes.filter(([k]) => k === 'change').at(-1)![1]).toEqual([
    { from: { line: 0, character: 8 }, to: { line: 0, character: 10 }, text: 'log(message)' },
  ])
})

test('a menu at the cursor and a field over a word, for the page', async ({ page }) => {
  await setup(page, 'rename me')
  await focus(page)
  const chosen = page.evaluate(() =>
    (window as unknown as W).ed.menu([{ label: 'One' }, { label: 'Two', detail: 'second' }]),
  )
  await expect(page.locator('#host .dsk-code-editor__menu')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(await chosen).toBe(1)
  const typed = page.evaluate(() => (window as unknown as W).ed.prompt(0, 6))
  const field = page.locator('#host .dsk-code-editor__prompt')
  await expect(field).toHaveValue('rename')
  await field.fill('renamed')
  await field.press('Enter')
  expect(await typed).toBe('renamed')
})
