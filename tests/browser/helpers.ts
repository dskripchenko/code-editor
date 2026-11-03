import { expect, type Page } from '@playwright/test'

/** Cmd on macOS, Ctrl elsewhere (Playwright's own alias). */
export const MOD = 'ControlOrMeta'
/** The modifier that moves by word. */
export const WORD = process.platform === 'darwin' ? 'Alt' : 'Control'

interface Editor {
  value: string
  selection: { anchor: number; head: number }[]
  focus(): void
}

type Win = Window & { ed: Editor; make(options: object): string; ready: boolean; changes: number }

export async function load(page: Page): Promise<void> {
  await page.goto('/tests/browser/page.html')
  await page.waitForFunction(() => (window as unknown as Win).ready)
}

/** A fresh editor in #host; the input kind it got. */
export async function make(
  page: Page,
  options: {
    value?: string
    input?: 'auto' | 'textarea'
    readOnly?: boolean
    language?: string
    indentUnit?: string
  },
): Promise<string> {
  return page.evaluate((o) => (window as unknown as Win).make(o), options)
}

export async function value(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as Win).ed.value)
}

export async function selection(page: Page): Promise<{ anchor: number; head: number }[]> {
  return page.evaluate(() => (window as unknown as Win).ed.selection)
}

export async function focus(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as Win).ed.focus())
}

export function line(page: Page, n: number) {
  return page.locator('#host .dsk-code-editor__lines > .dsk-code-editor__line').nth(n)
}

export async function expectValue(page: Page, expected: string): Promise<void> {
  await expect.poll(() => value(page)).toBe(expected)
}

/** A click at `x` pixels from the start of line `n` (past its end too), with the mouse itself. */
export async function clickLine(
  page: Page,
  n: number,
  x: number,
  options: { modifiers?: ('Shift' | 'Alt')[]; clickCount?: number } = {},
): Promise<void> {
  const box = await line(page, n).boundingBox()
  for (const m of options.modifiers ?? []) await page.keyboard.down(m)
  await page.mouse.click(box!.x + x, box!.y + box!.height / 2, { clickCount: options.clickCount })
  for (const m of options.modifiers ?? []) await page.keyboard.up(m)
}
