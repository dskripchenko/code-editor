import { expect, test, type Page } from '@playwright/test'
import { expectValue, focus, load, make, MOD, selection } from './helpers'

const mac = process.platform === 'darwin'
type Ed = {
  setSelection(a: number, b?: number): void
  setSearch(q: object | null): void
  replaceAll(): number
  value: string
}
const ed = (page: Page, fn: (e: Ed) => unknown) =>
  page.evaluate(
    (src) => new Function('e', `return (${src})(e)`)((window as unknown as { ed: Ed }).ed),
    fn.toString(),
  )

for (const input of ['auto', 'textarea'] as const) {
  test.describe(`input: ${input}`, () => {
    test.beforeEach(async ({ page, browserName }) => {
      test.skip(
        input === 'auto' && browserName !== 'chromium',
        'the same textarea path as the other run',
      )
      await load(page)
    })

    test('brackets and quotes pair up as they are typed; Enter between them opens a block', async ({
      page,
    }) => {
      await make(page, { value: '', input, language: 'javascript', indentUnit: '  ' })
      await focus(page)
      await page.keyboard.type('f(')
      await expectValue(page, 'f()')
      await page.keyboard.type('"a')
      await expectValue(page, 'f("a")')
      await page.keyboard.type('")')
      await expectValue(page, 'f("a")')
      await page.keyboard.type(' {')
      await page.keyboard.press('Enter')
      await page.keyboard.type('x')
      await expectValue(page, 'f("a") {\n  x\n}')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Backspace')
      await expectValue(page, 'f("a") {\n\n}')
    })

    test('a selection wrapped in a typed bracket', async ({ page }) => {
      await make(page, { value: 'a b c', input, language: 'javascript' })
      await ed(page, (e) => e.setSelection(2, 3))
      await focus(page)
      await page.keyboard.type('[')
      await expectValue(page, 'a [b] c')
      expect(await selection(page)).toEqual([{ anchor: 3, head: 4 }])
    })
  })
}

test.describe('keys', () => {
  test.beforeEach(async ({ page }) => load(page))

  test('comments, indentation, lines moved, copied and deleted', async ({ page }) => {
    await make(page, { value: 'a\nb\nc', language: 'javascript', indentUnit: '  ' })
    await focus(page)
    await page.keyboard.press(`${MOD}+Slash`)
    await expectValue(page, '// a\nb\nc')
    await page.keyboard.press(`${MOD}+Slash`)
    await expectValue(page, 'a\nb\nc')
    await page.keyboard.press('Alt+ArrowDown')
    await expectValue(page, 'b\na\nc')
    await page.keyboard.press('Shift+Alt+ArrowDown')
    await expectValue(page, 'b\na\na\nc')
    await page.keyboard.press(`${MOD}+Shift+KeyK`)
    await expectValue(page, 'b\na\nc')
    // The cursor went with the copy, and to the next line when it was deleted.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press('Tab')
    await expectValue(page, 'b\n  a\n  c')
    await page.keyboard.press('Shift+Tab')
    await expectValue(page, 'b\na\nc')
  })

  test('several cursors: the next occurrence, a cursor below; typing goes to each', async ({
    page,
  }) => {
    await make(page, { value: 'foo = foo + 1\nbar', language: 'javascript' })
    await focus(page)
    await page.keyboard.press(`${MOD}+KeyD`)
    await page.keyboard.press(`${MOD}+KeyD`)
    await page.keyboard.type('x')
    await expectValue(page, 'x = x + 1\nbar')
    await page.keyboard.press(`${MOD}+Home`)
    await page.keyboard.press(mac ? 'Meta+Alt+ArrowDown' : 'Control+Alt+ArrowDown')
    await page.keyboard.type('>')
    await expectValue(page, '>x = x + 1\n>bar')
  })

  test('go to line: Ctrl+G, a line and column, Enter', async ({ page }) => {
    await make(page, { value: Array.from({ length: 300 }, (_, i) => `row ${i + 1}`).join('\n') })
    await focus(page)
    await page.keyboard.press('Control+KeyG')
    const field = page.locator('#host .dsk-code-editor__panel-input')
    await expect(field).toBeFocused()
    await field.fill('250:3')
    await field.press('Enter')
    await page.keyboard.type('|')
    await expect.poll(() => ed(page, (e) => e.value.split('\n')[249])).toBe('ro|w 250')
    await expect(page.locator('#host .dsk-code-editor__lines')).toContainText('ro|w 250')
  })

  test('search: matches marked, the next one by key, all replaced in one step', async ({
    page,
  }) => {
    await make(page, { value: 'one two one\nthree one' })
    await ed(page, (e) => e.setSearch({ search: 'one', wholeWord: true }))
    await expect(page.locator('#host .dsk-code-editor__match')).toHaveCount(3)
    await focus(page)
    await page.keyboard.press(mac ? 'Meta+KeyG' : 'F3')
    await page.keyboard.press(mac ? 'Meta+KeyG' : 'F3')
    expect(await selection(page)).toEqual([{ anchor: 8, head: 11 }])
    await expect(page.locator('#host .dsk-code-editor__match--current')).toHaveCount(1)
    await page.keyboard.press(mac ? 'Meta+Shift+KeyG' : 'Shift+F3')
    expect(await selection(page)).toEqual([{ anchor: 0, head: 3 }])
    expect(
      await ed(page, (e) => (e.setSearch({ search: 'one', replace: '1' }), e.replaceAll())),
    ).toBe(3)
    await expectValue(page, '1 two 1\nthree 1')
    await page.keyboard.press(`${MOD}+KeyZ`)
    await expectValue(page, 'one two one\nthree one')
  })

  test('completion: the words of the text and the page’s own, picked by keys', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        api: { CodeEditor: new (el: Element, o: object) => unknown }
        ed: unknown
      }
      ;(w.ed as { destroy(): void } | undefined)?.destroy()
      w.ed = new w.api.CodeEditor(document.getElementById('host')!, {
        value: 'console.log(consoleWidth)\n',
        language: 'javascript',
        completion: ({ prefix }: { prefix: string }) =>
          prefix.startsWith('co') ? [{ label: 'const', detail: 'keyword', kind: 'keyword' }] : null,
      })
    })
    await focus(page)
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('cons')
    const list = page.locator('#host .dsk-code-editor__completion')
    await expect(list).toBeVisible()
    await expect(list.locator('.dsk-code-editor__completion-label')).toHaveText([
      'const',
      'console',
      'consoleWidth',
    ])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expectValue(page, 'console.log(consoleWidth)\nconsoleWidth')
    await expect(list).toBeHidden()
    await page.keyboard.type(' co')
    await expect(list).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(list).toBeHidden()
    await page.keyboard.press('Control+Space')
    await expect(list).toBeVisible()
  })

  test('copy without a selection takes the line; pasted, it goes above', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'Firefox gives a constructed paste event no data')
    await make(page, { value: 'first\nsecond' })
    await focus(page)
    await page.keyboard.press('ArrowDown')
    const copied = await page.evaluate(() => {
      const dt = new DataTransfer()
      const e = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })
      document.activeElement!.dispatchEvent(e)
      return e.clipboardData!.getData('text/plain')
    })
    expect(copied).toBe('second\n')
    await page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      document.activeElement!.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    }, copied)
    await expectValue(page, 'first\nsecond\nsecond')
  })

  test('the bracket at the cursor and its pair are marked; the jump goes between them', async ({
    page,
  }) => {
    await make(page, { value: 'f(a, "(", [b])', language: 'javascript' })
    await focus(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#host .dsk-code-editor__bracket')).toHaveCount(2)
    await page.keyboard.press(`${MOD}+Shift+Backslash`)
    expect(await selection(page)).toEqual([{ anchor: 13, head: 13 }])
  })
})
