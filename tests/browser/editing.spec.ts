import { expect, test } from '@playwright/test'
import {
  clickLine,
  expectValue,
  focus,
  line,
  load,
  make,
  MOD,
  selection,
  value,
  WORD,
} from './helpers'

for (const input of ['auto', 'textarea'] as const) {
  test.describe(`input: ${input}`, () => {
    test.beforeEach(async ({ page, browserName }) => {
      test.skip(
        input === 'auto' && browserName !== 'chromium',
        'the same textarea path as the other run',
      )
      await load(page)
    })

    test('typing, Enter with the indent, Backspace and Delete', async ({ page }) => {
      await make(page, { value: '', input })
      await focus(page)
      await page.keyboard.type('function f() {')
      await page.keyboard.press('Enter')
      await page.keyboard.type('    return 1')
      await page.keyboard.press('Enter')
      await page.keyboard.type('x')
      await expectValue(page, 'function f() {\n    return 1\n    x')
      await page.keyboard.press('Backspace')
      // Home on a line of spaces: to its start (the indent is where the cursor already is).
      await page.keyboard.press('Home')
      await page.keyboard.press('Delete')
      await expectValue(page, 'function f() {\n    return 1\n   ')
    })

    test('the line breaks of the file are kept', async ({ page }) => {
      await make(page, { value: 'a\r\nb\r\n', input })
      await focus(page)
      await page.keyboard.press(`${MOD}+End`)
      await page.keyboard.type('c')
      await page.keyboard.press('Enter')
      await expectValue(page, 'a\r\nb\r\nc\r\n')
    })

    test('arrows, words, line ends', async ({ page }) => {
      await make(page, { value: 'alpha beta\ngamma', input })
      await focus(page)
      await page.keyboard.press(`${WORD}+ArrowRight`)
      await page.keyboard.type('1')
      await page.keyboard.press('End')
      await page.keyboard.type('2')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.type('3')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Home')
      await page.keyboard.type('4')
      await expectValue(page, '4alpha1 beta2\ngamma3')
    })

    test('undo and redo, typing undone as one step', async ({ page }) => {
      await make(page, { value: 'x', input })
      await focus(page)
      await page.keyboard.press('End')
      await page.keyboard.type('abc')
      await page.keyboard.press(`${MOD}+z`)
      await expectValue(page, 'x')
      expect(await selection(page)).toEqual([{ anchor: 1, head: 1 }])
      await page.keyboard.press(`${MOD}+Shift+z`)
      await expectValue(page, 'xabc')
    })

    test('a click puts the cursor; past the end of a line, at its end', async ({ page }) => {
      await make(page, { value: 'first line\nsecond line', input })
      await clickLine(page, 1, 1)
      await page.keyboard.type('>')
      await clickLine(page, 0, 500)
      await page.keyboard.type('!')
      await expectValue(page, 'first line!\n>second line')
    })

    test('a drag selects, Shift+click extends, a double click takes the word', async ({ page }) => {
      await make(page, { value: 'first line\nsecond line\nthird', input })
      const a = await line(page, 0).boundingBox()
      const b = await line(page, 1).boundingBox()
      await page.mouse.move(a!.x + 1, a!.y + 5)
      await page.mouse.down()
      await page.mouse.move(b!.x + 300, b!.y + 5, { steps: 4 })
      await page.mouse.up()
      expect(await selection(page)).toEqual([{ anchor: 0, head: 22 }])
      await clickLine(page, 2, 300, { modifiers: ['Shift'] })
      expect(await selection(page)).toEqual([{ anchor: 0, head: 28 }])
      await clickLine(page, 1, 20, { clickCount: 2 })
      await page.keyboard.type('2nd')
      await expectValue(page, 'first line\n2nd line\nthird')
    })

    test('copy, cut and paste', async ({ page }) => {
      await make(page, { value: 'one two', input })
      await focus(page)
      await page.keyboard.press(`${WORD}+Shift+ArrowRight`)
      const run = (type: string, data?: string) =>
        page.evaluate(
          ([type, data]) => {
            const dt = new DataTransfer()
            if (data) dt.setData('text/plain', data)
            document.activeElement!.dispatchEvent(
              new ClipboardEvent(type!, { clipboardData: dt, bubbles: true, cancelable: true }),
            )
            return dt.getData('text/plain')
          },
          [type, data],
        )
      expect(await run('copy')).toBe('one')
      expect(await run('cut')).toBe('one')
      await expectValue(page, ' two')
      await page.keyboard.press('End')
      await run('paste', ' three\r\nfour')
      await expectValue(page, ' two three\nfour')
    })

    test('IME composition: the text as composed, one undo step', async ({ page, browserName }) => {
      test.skip(
        browserName !== 'chromium',
        'composition is driven through the Chrome DevTools Protocol',
      )
      await make(page, { value: 'ab', input })
      await focus(page)
      await page.keyboard.press('ArrowRight')
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
      await cdp.send('Input.imeSetComposition', {
        text: 'にほ',
        selectionStart: 2,
        selectionEnd: 2,
      })
      await cdp.send('Input.imeSetComposition', {
        text: '日本',
        selectionStart: 2,
        selectionEnd: 2,
      })
      await cdp.send('Input.insertText', { text: '日本' })
      await expectValue(page, 'a日本b')
      expect(await selection(page)).toEqual([{ anchor: 3, head: 3 }])
      await page.keyboard.type('!')
      await expectValue(page, 'a日本!b')
      await page.keyboard.press(`${MOD}+z`)
      await page.keyboard.press(`${MOD}+z`)
      await expectValue(page, 'ab')
    })

    test('read-only: moves and selects, does not change', async ({ page }) => {
      await make(page, { value: 'fixed', input, readOnly: true })
      await focus(page)
      await page.keyboard.type('x')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Shift+End')
      expect(await value(page)).toBe('fixed')
      expect(await selection(page)).toEqual([{ anchor: 0, head: 5 }])
    })
  })
}

test('the system clipboard, by keys', async ({ page, browserName, context }) => {
  test.skip(
    browserName !== 'chromium' || process.platform === 'darwin',
    'headless Chromium copies by keys on Linux and Windows',
  )
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await load(page)
  await make(page, { value: 'copy me' })
  await focus(page)
  await page.keyboard.press(`${MOD}+a`)
  await page.keyboard.press(`${MOD}+c`)
  await page.keyboard.press('End')
  await page.keyboard.press(`${MOD}+v`)
  await expectValue(page, 'copy mecopy me')
})
