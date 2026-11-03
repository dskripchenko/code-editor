# Начало работы

> 0.0.x правит, подсвечивает, сворачивает и проверяет: набор (и IME),
> движение и выделение клавишами и мышью, отмена и повтор, буфер обмена,
> подсветка при наборе. Привычные команды правки — в 0.1.0.

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
  readOnly: false,
  tabSize: 4, // сколько колонок занимает таб
  indentUnit: '    ', // что вставляет Tab
  onChange: (e) => console.log(e.value.length),
  validate: true, // форматы данных проверяются при правке
})

editor.value // текст с теми переводами строк, с какими пришёл
editor.value = other // заменить текст, история отмены очищается
editor.selection // [{ anchor, head }] — смещения; перевод строки — один символ
editor.setSelection(0, 5)
editor.undo()
editor.redo()
editor.focus()
editor.readOnly = true
editor.destroy() // убрать со страницы
```

**Дайте редактору высоту** (высоту родителя или `.dsk-code-editor`): он
прокручивается внутри неё и рисует только видимые строки. Без высоты он
растягивается на весь текст и рисует его целиком.

Редактор один раз кладёт свои правила в документ (или в shadow root, где он
находится); `CODE_EDITOR_CSS` — те же правила для страницы, которая хочет
подключить их сама.

## Изменение текста из кода

Каждое изменение — транзакция: правки относительно текста до неё и курсоры
после. Она попадает в историю отмены, как набор.

```ts
import { Selection } from '@dskripchenko/code-editor'

editor.dispatch({
  changes: [{ from: 0, to: 0, insert: '// header\n' }],
  selection: Selection.single(10),
})
```

`editor.state` — текст (`state.doc`: `lineAt`, `line`, `slice`, `lineCount`,
`length`) и курсоры (`state.selection.ranges`). Команды правки — в
`commands` (`insertText`, `deleteCharBackward`, `cursorWordRight`…): команда
берёт состояние и отдаёт транзакцию.

## Клавиши

Привычные движения и правка: стрелки, по словам (Alt на macOS, Ctrl на
остальных), Home (к отступу, затем к началу строки), End, Page Up/Down, к
началу и концу текста; Shift расширяет выделение; Backspace и Delete — по
символу, слову или до начала строки; Enter сохраняет отступ; Tab вставляет
`indentUnit`; Cmd/Ctrl+Z — отменить, Cmd/Ctrl+Shift+Z (Ctrl+Y) — повторить;
свернуть и развернуть — ниже;
Cmd/Ctrl+A — выделить всё. Сочетания работают в любой раскладке (Cmd+Z —
отмена и в русской). Свои привязки идут первыми:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Мышь

Щелчок ставит курсор, протяжка выделяет (и прокручивает за краем), Shift
расширяет, двойной щелчок берёт слово, тройной — строку, Alt+щелчок
добавляет курсор.

## Подсветка

`language` (id или псевдоним из `@dskripchenko/syntax`: `typescript`, `yml`,
`php`…) раскрашивает текст по мере набора: правка разбирается заново лишь до
места, где текст ниже снова такой, как был, поэтому нажатие стоит нескольких
строк при любой длине файла; остаток длинного файла доводится в простое.
`/*`, набранный в начале большого файла, сразу раскрашивает видимые строки, а
остальные — чуть позже. `editor.language = 'python'` подсвечивает заново;
неизвестный язык оставляет текст простым.

## Сворачивание

Блок сворачивается меткой у номеров строк (видна при наведении), клавишами
Cmd+Alt+[ / Cmd+Alt+] на macOS и Ctrl+Shift+[ / Ctrl+Shift+] на остальных
(блок у курсора) или из кода:

```ts
editor.fold(4) // блок, начинающийся на строке 4 (с нуля), или ближайший охватывающий
editor.unfold(4)
editor.foldAll()
editor.unfoldAll()
editor.folds // [{ start: 4, end: 9 }] — первая строка остаётся видна
```

Что сворачивается, берётся из текста (скобки, теги, отступы, заголовки
Markdown) и перечитывается чуть позже правки. Щелчок по `⋯` свёрнутой строки
разворачивает её, как и курсор, попавший внутрь; движение вверх и вниз
проходит свёрнутое насквозь.

## Диагностики

Форматы данных — JSON, YAML, XML, TOML, CSV, INI, `.env` — проверяются чуть
позже каждой правки: ошибка подчёркнута, номер её строки окрашен, сообщение —
во всплывающей подсказке строки. Страница добавляет свои (линтер, языковой
сервер) диапазонами текста:

```ts
editor.setDiagnostics([{ from: 8, to: 9, message: 'b is not defined', severity: 'warning' }], 'lint')
editor.diagnostics // все: собственные (`source: 'syntax'`) и страницы
el.addEventListener('dsk:diagnostics', (e) => show(e.detail.diagnostics))
```

Диапазоны сдвигаются при правке, пока следующая проверка их не заменит.
Сворачивание и проверка читают весь текст; больше 2 МБ они не работают.

## Как элемент

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') — под другим именем
```

```html
<dsk-code-editor language="yaml" style="height: 300px"><script type="text/plain">key: value
</script></dsk-code-editor>
```

Текст берётся из `<script type="text/plain">` внутри элемента — ничего в нём
не читается как разметка; свойство `value` читает и заменяет его, `readonly`
делает его только для чтения. Каждое изменение шлёт `dsk:change`, в
`detail.source` — текст. При перемещении по странице элемент сохраняет текст.

## Переводы строк

Текст сохраняет перевод строки, с которым пришёл (`\n` или `\r\n`, первый
встреченный); вставленный текст получает его же. Помощники — `readText`,
`writeText`, `detectLineBreak`.

## Большие файлы

На странице только видимые строки, а строка длиннее 10 000 символов — только
вокруг видимых колонок: файл в миллион строк (50 МБ) открывается за секунду-
две и принимает нажатие клавиши много быстрее кадра.

## Тема

Цвета и шрифт — пользовательские свойства на `.dsk-code-editor`
(`--dsk-code-editor-bg`, `-fg`, `-gutter-fg`, `-gutter-active-fg`,
`-gutter-bg`, `-cursor`, `-selection`, `-selection-focused`, `-active-line`,
`-font`, `-font-size`, `-line-height`, `-folded-bg`, `-error`, `-warning`,
`-info`). Цвета токенов — из `@dskripchenko/syntax` (`--sx-keyword`,
`--sx-string`…). Тёмная тема — по `data-theme="dark"` у предка или по системе.

## Браузеры

Chromium получает ввод через EditContext API, WebKit и Firefox — через
скрытую textarea у курсора (она же показывает набираемый в IME текст);
`supportsEditContext()` говорит, какой путь у браузера.
