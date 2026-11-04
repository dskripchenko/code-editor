# 快速上手

> 0.1.0：输入（含输入法）、移动和选择、撤销与重做、剪贴板、输入时高亮、折叠、数据格式校验，
> 以及代码编辑器的编辑命令——缩进、括号、注释、行操作、多光标、跳转到行、搜索、自动补全。

## 安装

```sh
pnpm add @dskripchenko/code-editor
```

## 挂载到元素

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // @dskripchenko/syntax 中的语言 id
  lineNumbers: true, // 默认开启
  lineWrapping: false, // 长行按视图宽度折行（见“自动换行”）
  readOnly: false,
  tabSize: 4, // 制表符占用的列数
  indentUnit: '    ', // Tab 键插入的内容
  onChange: (e) => console.log(e.value.length),
  validate: true, // 编辑时校验数据格式
  closeBrackets: true, // 输入时自动闭合括号和引号
  completion: undefined, // 页面提供的建议（见“自动补全”）
})

editor.value // 文本，保留传入时的换行符
editor.value = other // 替换文本，并清空撤销历史
editor.selection // [{ anchor, head }] —— 偏移量；换行符算一个字符
editor.setSelection(0, 5)
editor.undo()
editor.redo()
editor.focus()
editor.readOnly = true
editor.destroy() // 从页面移除
```

**请为编辑器设置高度**（父元素或 `.dsk-code-editor` 的高度）：编辑器在其中滚动，只绘制可见行。
没有高度时它会撑开到整个文本并全部绘制。

编辑器会把自己的样式规则放入文档（或其所在的 shadow root）一次；
`CODE_EDITOR_CSS` 是同样的规则，供想自行引入的页面使用。

## 通过代码修改文本

每次修改都是一个事务：相对修改前文本的变更，以及修改后的光标。它与输入一样进入撤销历史。

```ts
import { Selection } from '@dskripchenko/code-editor'

editor.dispatch({
  changes: [{ from: 0, to: 0, insert: '// header\n' }],
  selection: Selection.single(10),
})
```

`editor.state` 包含文本（`state.doc`：`lineAt`、`line`、`slice`、`lineCount`、`length`）
和光标（`state.selection.ranges`）。编辑命令位于 `commands`（`insertText`、
`deleteCharBackward`、`cursorWordRight`……）：命令接收状态并返回事务。

## 按键

与 VS Code 相同。Mod 在 macOS 上是 Cmd，其他系统上是 Ctrl。

| 按键 | 作用 |
|---|---|
| 方向键、Home、End、Page Up/Down、Mod+Home/End | 移动（macOS 上 Alt、其他系统 Ctrl：按词；Home：先到缩进处再到行首）；Shift 扩展选择 |
| Enter | 带缩进的新行，在 `{` `(` `[` 之后（以及 Python、YAML 中的 `:`）再深一级；在 `{}` 之间时，闭括号移到下一行 |
| Tab / Shift+Tab、Mod+] / Mod+[ | 缩进与反缩进（对多行按 Tab 会缩进这些行） |
| Backspace | 在缩进中回退整级；在 `()` 或 `""` 之间则两个一起删除 |
| Mod+/ · Shift+Alt+A | 行注释 · 块注释，切换 |
| Alt+↑/↓ · Shift+Alt+↑/↓ · Mod+Shift+K | 移动行 · 复制行 · 删除行 |
| Mod+Enter · Mod+Shift+Enter | 在下方 · 上方插入新行 |
| Mod+L | 选择当前行（再按：连同下一行） |
| Mod+D · Mod+Shift+L | 选择单词，然后是它的下一个出现 · 全部出现 |
| Cmd+Alt+↑/↓（macOS）、Ctrl+Alt+↑/↓ | 在上方 · 下方添加光标；Alt+点击添加；Escape 只保留一个 |
| Ctrl+G | 跳转到行（所有系统） |
| Cmd+G / Cmd+Shift+G（macOS）、F3 / Shift+F3 | 下一个 · 上一个匹配 |
| Ctrl+Space | 自动补全 |
| Mod+Shift+\\ | 跳到匹配的括号 |
| Cmd+Alt+[ / ]（macOS）、Ctrl+Shift+[ / ] | 折叠 · 展开 |
| Mod+Z · Mod+Shift+Z（Ctrl+Y）· Mod+A | 撤销 · 重做 · 全选 |

括号和引号在输入时自动闭合（字母后的撇号保持为撇号），输入闭合字符时会越过光标后相同的字符，
有选区时则把选区包起来；`closeBrackets: false` 可关闭此功能。没有选区时复制和剪切会取整行；
粘贴时整行插入到光标所在行的上方。快捷键在任何键盘布局下都可用。自定义绑定优先：

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## 跳转到行、搜索

```ts
editor.goToLine(120, 4) // 行和列，从 1 开始；该行移到视图中间
editor.openGoToLine() // Ctrl+G 打开的输入框：`120` 或 `120:4`，回车

editor.setSearch({ search: 'todo', caseSensitive: false, wholeWord: true, regexp: false })
editor.findNext() // 选中下一个匹配（到末尾后回绕）；findPrevious()
editor.searchMatches() // [{ from, to }] —— 计数会读取整个文本
editor.setSearch({ search: '(\\w+)=(\\d+)', regexp: true, replace: '$2=$1' })
editor.replaceNext() // 替换选中的匹配，然后选中下一个
editor.replaceAll() // 替换数量；一步即可撤销
editor.setSearch(null)
```

可见的匹配会被标记，选中的那个更醒目。编辑器没有自己的搜索栏——页面把自己的搜索栏放在上面，
并通过这些方法驱动它；没有搜索时 Cmd+G（F3）会查找选中的文本。

## 自动补全

输入一个单词（两个字母起）会打开一个可补全它的列表：先是页面提供的建议，然后是光标附近文本中的单词。
方向键移动，Enter 或 Tab 选择，Escape 关闭；Ctrl+Space 可在任意位置打开。

```ts
new CodeEditor(el, {
  completion: async ({ prefix, pos, explicit, state }) => [
    { label: 'console', detail: 'global', kind: 'variable' },
    { label: 'constructor', insert: 'constructor()' },
  ],
  completeWords: true, // 也包括文本中的单词（默认）
})
editor.startCompletion()
```

## 缩进与 `.editorconfig`

未给出 `indentUnit` 时，编辑器会从文本中推测（制表符，或最常见的空格级数）。持有文件的页面传入
`.editorconfig` 的设置：

```ts
import { editorConfigFor, indentOptions } from '@dskripchenko/code-editor'

// 通往该文件路径上的 .editorconfig 文件，按其所在目录。
const settings = editorConfigFor('/repo/src/main.ts', {
  '/repo': rootEditorConfigText,
  '/repo/src': srcEditorConfigText,
})
editor.configure(indentOptions(settings)) // { indentUnit: '  ', tabSize: 2 }
settings.endOfLine // 'lf' | 'crlf'；insertFinalNewline、trimTrailingWhitespace —— 用于保存
```

## 鼠标

单击放置光标，拖动选择（越过边缘时自动滚动），Shift 扩展，双击选中单词，三击选中整行，
Alt+单击添加光标。

## 自动换行

`lineWrapping: true`（或随时设置 `editor.lineWrapping = true`）按视图宽度把长行折成多行：在能容纳的最后一个空格之后折行，比一行还长的单词在行满处折断；制表符走到其制表位，中日韩文字和表情符号占两列。此时不会横向滚动。上下方向键按显示行移动，并保持行内列位置；点击落在指针所在的显示行；选区、匹配和诊断在它们覆盖的每一显示行上绘制。调整视图宽度时，折行随之更新。超过 10 000 个字符的行不折行（部分绘制、横向滚动）。

## 高亮

`language`（`@dskripchenko/syntax` 中的 id 或别名：`typescript`、`yml`、`php`……）在输入时为文本着色：
一次编辑只重新分词到下方文本恢复原样为止，因此无论文件多长，一次按键只需处理几行；长文件的其余部分在空闲时完成。
在大文件开头输入的 `/*` 会立即为可见行着色，其余部分稍后完成。`editor.language = 'python'` 重新高亮；
未知的语言让文本保持纯文本。

## 折叠

代码块可通过行号旁的标记折叠（悬停时显示），macOS 上用 Cmd+Alt+[ / Cmd+Alt+]，其他系统用
Ctrl+Shift+[ / Ctrl+Shift+]（光标所在的块），也可以在代码中：

```ts
editor.fold(4) // 从第 4 行（从 0 开始）开始的块，或包含它的最内层块
editor.unfold(4)
editor.foldAll()
editor.unfoldAll()
editor.folds // [{ start: 4, end: 9 }] —— 第一行保持可见
```

可折叠的范围来自文本（括号、标签、缩进、Markdown 标题），在编辑后稍等片刻重新读取。点击折叠行的 `⋯`
即可展开，光标移入其中也会展开；上下移动会越过折叠部分。

## 诊断

数据格式——JSON、YAML、XML、TOML、CSV、INI、`.env`——在每次编辑后稍等片刻进行校验：错误加下划线，
其行号着色，消息显示为该行的提示。页面可以添加自己的诊断（linter、语言服务器），以文本范围表示：

```ts
editor.setDiagnostics([{ from: 8, to: 9, message: 'b is not defined', severity: 'warning' }], 'lint')
editor.diagnostics // 全部：编辑器自己的（`source: 'syntax'`）和页面的
el.addEventListener('dsk:diagnostics', (e) => show(e.detail.diagnostics))
```

范围随编辑移动，直到下一次校验替换它们。折叠和校验读取整个文本；超过 2 MB 时两者都不运行。

## 悬停、参数、定义、菜单

语言的知识由页面提供（例如语言服务器）；编辑器负责显示：

```ts
new CodeEditor(el, {
  hover: async ({ pos }) => describe(pos), // 字符串或元素；null 表示无
  signatureHelp: async ({ pos, explicit }) => parametersAt(pos), // 在 ( 和 , 之后——也可用 Mod+Shift+Space
  onModClick: (pos) => (goToDefinition(pos), true), // 按住 Cmd（macOS）或 Ctrl 点击
  completion: async () => [{ label: 'log', snippet: 'log(${1:message})$0' }], // 占位，选中第一个
})
editor.menu([{ label: 'Add import' }, { label: 'Extract', detail: 'function' }]) // 选中的序号，或 null
editor.prompt(from, to) // 单词上方的输入框（新名称）：输入的内容，或 null
editor.coordsAt(pos) // 位置在屏幕上的矩形；posAtPoint(x, y) 反向换算
editor.showTooltip(content, pos) // 页面自己的提示；closeTooltip()
```

指针停留片刻后显示悬停提示；文本或光标移动、或按 Escape 时提示消失。补全项可以替换自己的范围（`from`、`to`）。
每个 `dsk:change` 都带有 `edits`——以行和字符（UTF-16）范围表示的更改，每项都相对于前一项留下的文本
（语言服务器的增量同步）；事务的更改在 `transaction.edits` 中。

## 行号栏中的标记与注释

```ts
// 行旁的标记（从 0 开始），每个来源一组：与上次提交的差异、断点……
editor.setGutterMarks([{ line: 4, kind: 'added' }, { line: 9, kind: 'modified', title: '已修改' }], 'diff')
editor.setGutterMarks([], 'diff') // 清除
el.addEventListener('dsk:gutter-mark', (e) => peek(e.detail.line, e.detail.rect))

// 行号旁的一列短文本（谁在何时修改了这一行）。
editor.setAnnotations([{ line: 0, text: 'Ann · 2 天', title: 'Ann <ann@example.com>，11 月 1 日' }])
el.addEventListener('dsk:annotation', (e) => show(e.detail.line))
editor.setAnnotations(null)
```

`added`、`modified` 和 `deleted` 会被绘制（竖条、竖条、缺口），颜色为
`--dsk-code-editor-added`、`-modified`、`-deleted`；其他类型会得到类名
`dsk-code-editor__mark--<kind>`，由页面自行绘制。编辑文本时标记和注释随行移动；
被替换的行上的标记会消失，直到页面重新设置。

## 作为元素

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>；defineCodeEditor('my-editor') 使用其他名称
```

```html
<dsk-code-editor language="yaml" style="height: 300px"><script type="text/plain">key: value
</script></dsk-code-editor>
```

文本从元素内的 `<script type="text/plain">` 读取，其中任何内容都不会被当作标记；
`value` 属性用于读取和替换文本，`readonly` 使其只读。光标每次移动都会发送 `dsk:selection`（其 `detail.selection`，供状态栏使用）。每次修改都会发送 `dsk:change`，
`detail.source` 为文本。元素在页面中移动时保留其文本。

## 换行符

`editor.lineBreak` 是当前使用的换行符。文本保留传入时的换行符（`\n` 或 `\r\n`，以首次出现的为准）；粘贴的文本也使用它。
辅助函数：`readText`、`writeText`、`detectLineBreak`。

## 大文件

页面中只有可见行，超过 10 000 个字符的行只绘制可见列附近的部分：
一百万行（50 MB）的文件一两秒即可打开，每次按键的处理时间远低于一帧。

## 主题

颜色和字体是 `.dsk-code-editor` 上的自定义属性
（`--dsk-code-editor-bg`、`-fg`、`-gutter-fg`、`-gutter-active-fg`、`-gutter-bg`、
`-cursor`、`-selection`、`-selection-focused`、`-active-line`、`-font`、`-font-size`、
`-line-height`、`-folded-bg`、`-error`、`-warning`、`-info`）。token 的颜色来自
`@dskripchenko/syntax`（`--sx-keyword`、`--sx-string`……）。深色主题跟随祖先元素的 `data-theme="dark"` 或系统设置。

## 浏览器

Chromium 通过 EditContext API 接收输入，WebKit 和 Firefox 通过光标处的隐藏 textarea
（它也显示输入法正在组合的文本）；`supportsEditContext()` 可判断浏览器走哪条路径。
