# 快速上手

> 0.0.x 是包的骨架：编辑器显示文本并原样返回。编辑功能将在 0.1.0 提供。

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
})

editor.value // 文本，保留传入时的换行符
editor.value = other // 替换文本
editor.language = 'php'
editor.lineCount
editor.destroy() // 从页面移除
```

编辑器会把自己的样式规则放入文档（或其所在的 shadow root）一次；
`CODE_EDITOR_CSS` 是同样的规则，供想自行引入的页面使用。

## 作为元素

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>；defineCodeEditor('my-editor') 使用其他名称
```

```html
<dsk-code-editor language="yaml"><script type="text/plain">key: value
</script></dsk-code-editor>
```

文本从元素内的 `<script type="text/plain">` 读取，其中任何内容都不会被当作标记；
`value` 属性用于读取和替换文本。元素在页面中移动时保留其文本。

## 换行符

编辑器自身使用 `readText` 和 `writeText`：不含换行符的行、文本使用的换行符
（`\n` 或 `\r\n`，以首次出现的为准）以及文本是否以换行结尾。文本会按读入时的样子原样返回。

## 主题

颜色和字体是 `.dsk-code-editor` 上的自定义属性
（`--dsk-code-editor-bg`、`--dsk-code-editor-fg`、`--dsk-code-editor-gutter-fg`、
`--dsk-code-editor-font`、`--dsk-code-editor-font-size`、
`--dsk-code-editor-line-height`）。深色主题跟随祖先元素的 `data-theme="dark"` 或系统设置。

## 浏览器

Chromium 通过 EditContext API 接收输入，WebKit 和 Firefox 通过隐藏的 textarea；
`supportsEditContext()` 可判断浏览器走哪条路径。
