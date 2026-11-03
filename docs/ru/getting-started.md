# Начало работы

> 0.1.0: набор (и IME), движение и выделение, отмена и повтор, буфер обмена,
> подсветка при наборе, сворачивание, проверка форматов данных и команды
> правки редактора кода — отступы, скобки, комментарии, строки, несколько
> курсоров, переход к строке, поиск, автодополнение.

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
  closeBrackets: true, // скобки и кавычки закрываются при наборе
  completion: undefined, // предложения страницы (см. «Автодополнение»)
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

Как в VS Code. Mod — Cmd на macOS, Ctrl на остальных.

| Клавиши | Что |
|---|---|
| стрелки, Home, End, Page Up/Down, Mod+Home/End | движение (Alt на macOS, Ctrl на остальных — по словам; Home — к отступу, затем к началу строки); Shift расширяет |
| Enter | новая строка с отступом, на шаг глубже после `{` `(` `[` (и `:` в Python, YAML); между `{}` закрывающая уходит строкой ниже |
| Tab / Shift+Tab, Mod+] / Mod+[ | отступ и обратно (Tab по нескольким строкам сдвигает их) |
| Backspace | в отступе — назад на целый шаг; между `()` или `""` — обе |
| Mod+/ · Shift+Alt+A | строчный комментарий · блочный, туда и обратно |
| Alt+↑/↓ · Shift+Alt+↑/↓ · Mod+Shift+K | перенести строки · скопировать · удалить |
| Mod+Enter · Mod+Shift+Enter | новая строка ниже · выше |
| Mod+L | выделить строку (ещё раз — и следующую) |
| Mod+D · Mod+Shift+L | выделить слово, затем следующее вхождение · все сразу |
| Cmd+Alt+↑/↓ (macOS), Ctrl+Alt+↑/↓ | ещё курсор выше · ниже; Alt+щелчок добавляет; Escape оставляет один |
| Ctrl+G | перейти к строке (на всех системах) |
| Cmd+G / Cmd+Shift+G (macOS), F3 / Shift+F3 | следующее · предыдущее совпадение |
| Ctrl+Space | автодополнение |
| Mod+Shift+\\ | к парной скобке |
| Cmd+Alt+[ / ] (macOS), Ctrl+Shift+[ / ] | свернуть · развернуть |
| Mod+Z · Mod+Shift+Z (Ctrl+Y) · Mod+A | отменить · повторить · выделить всё |

Скобки и кавычки закрываются при наборе (апостроф после буквы остаётся
апострофом), закрывающая перепечатывает такую же после курсора, выделение
оборачивается; `closeBrackets: false` выключает это. Копирование и вырезание
без выделения берут строку целиком; вставленная, она встаёт над строкой
курсора. Сочетания работают в любой раскладке. Свои привязки идут первыми:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Переход к строке, поиск

```ts
editor.goToLine(120, 4) // строка и колонка с 1; строка встаёт в середину видимого
editor.openGoToLine() // поле, которое открывает Ctrl+G: `120` или `120:4`, Enter

editor.setSearch({ search: 'todo', caseSensitive: false, wholeWord: true, regexp: false })
editor.findNext() // выделяет следующее совпадение (по кругу); findPrevious()
editor.searchMatches() // [{ from, to }] — подсчёт читает весь текст
editor.setSearch({ search: '(\\w+)=(\\d+)', regexp: true, replace: '$2=$1' })
editor.replaceNext() // выделенное совпадение, затем выделяется следующее
editor.replaceAll() // сколько; отменяется одним шагом
editor.setSearch(null)
```

Видимые совпадения отмечены, выделенное — ярче. Своей панели поиска у
редактора нет: страница ставит свою поверх и управляет им этими методами;
Cmd+G (F3) без поиска ищет выделенный текст.

## Автодополнение

Набор слова (от двух букв) открывает список того, чем его можно закончить:
сначала предложения страницы, затем слова текста рядом с курсором. Стрелки
двигают, Enter или Tab выбирают, Escape закрывает; Ctrl+Space открывает в
любом месте.

```ts
new CodeEditor(el, {
  completion: async ({ prefix, pos, explicit, state }) => [
    { label: 'console', detail: 'global', kind: 'variable' },
    { label: 'constructor', insert: 'constructor()' },
  ],
  completeWords: true, // и слова текста (по умолчанию)
})
editor.startCompletion()
```

## Отступы и `.editorconfig`

Без `indentUnit` редактор угадывает его по тексту (табы или самый частый
шаг пробелов). Страница, у которой есть файлы, передаёт настройки
`.editorconfig`:

```ts
import { editorConfigFor, indentOptions } from '@dskripchenko/code-editor'

// Файлы .editorconfig по пути к файлу, по их каталогам.
const settings = editorConfigFor('/repo/src/main.ts', {
  '/repo': rootEditorConfigText,
  '/repo/src': srcEditorConfigText,
})
editor.configure(indentOptions(settings)) // { indentUnit: '  ', tabSize: 2 }
settings.endOfLine // 'lf' | 'crlf'; insertFinalNewline, trimTrailingWhitespace — для сохранения
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
