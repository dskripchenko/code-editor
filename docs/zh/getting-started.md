# 快速上手

> 0.0.x 可编辑、高亮、折叠和校验：输入（含输入法）、键盘与鼠标移动和选择、撤销与重做、剪贴板、
> 输入时高亮。常用编辑命令将在 0.1.0 提供。

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
  readOnly: false,
  tabSize: 4, // 制表符占用的列数
  indentUnit: '    ', // Tab 键插入的内容
  onChange: (e) => console.log(e.value.length),
  validate: true, // 编辑时校验数据格式
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

常用的移动与编辑：方向键、按词移动（macOS 上为 Alt，其他系统为 Ctrl）、Home（先到缩进处，再到行首）、
End、Page Up/Down、文本开头和结尾；Shift 扩展选择；Backspace 和 Delete 按字符、按词或删到行首；
Enter 保留缩进；Tab 插入 `indentUnit`；Cmd/Ctrl+Z 撤销，Cmd/Ctrl+Shift+Z（Ctrl+Y）重做；
Cmd/Ctrl+A 全选；折叠与展开见下文。快捷键在任何键盘布局下都可用（西里尔布局下 Cmd+Z 同样是撤销）。自定义绑定优先：

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## 鼠标

单击放置光标，拖动选择（越过边缘时自动滚动），Shift 扩展，双击选中单词，三击选中整行，
Alt+单击添加光标。

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
`value` 属性用于读取和替换文本，`readonly` 使其只读。每次修改都会发送 `dsk:change`，
`detail.source` 为文本。元素在页面中移动时保留其文本。

## 换行符

文本保留传入时的换行符（`\n` 或 `\r\n`，以首次出现的为准）；粘贴的文本也使用它。
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
