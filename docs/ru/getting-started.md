# Начало работы

> 0.0.x — каркас пакета: редактор показывает текст и отдаёт его обратно.
> Правка появится в 0.1.0.

## Установка

```sh
pnpm add @dskripchenko/code-editor
```

## На элементе

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // id языка из @dskripchenko/syntax
  lineNumbers: true, // по умолчанию
})

editor.value // текст с теми переводами строк, с какими пришёл
editor.value = other // заменить текст
editor.language = 'php'
editor.lineCount
editor.destroy() // убрать со страницы
```

Редактор один раз кладёт свои правила в документ (или в shadow root, где он
находится); `CODE_EDITOR_CSS` — те же правила для страницы, которая хочет
подключить их сама.

## Как элемент

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') — под другим именем
```

```html
<dsk-code-editor language="yaml"><script type="text/plain">key: value
</script></dsk-code-editor>
```

Текст берётся из `<script type="text/plain">` внутри элемента — ничего в нём
не читается как разметка; свойство `value` читает и заменяет его. При
перемещении по странице элемент сохраняет текст.

## Переводы строк

`readText` и `writeText` — то, чем пользуется редактор: строки без
переводов, перевод строки текста (`\n` или `\r\n`, первый встреченный) и
есть ли он в конце. Текст возвращается ровно таким, каким был прочитан.

## Тема

Цвета и шрифт — пользовательские свойства на `.dsk-code-editor`
(`--dsk-code-editor-bg`, `--dsk-code-editor-fg`, `--dsk-code-editor-gutter-fg`,
`--dsk-code-editor-font`, `--dsk-code-editor-font-size`,
`--dsk-code-editor-line-height`). Тёмная тема — по `data-theme="dark"` у
предка или по системе.

## Браузеры

Chromium получает ввод через EditContext API, WebKit и Firefox — через
скрытую textarea; `supportsEditContext()` говорит, какой путь у браузера.
