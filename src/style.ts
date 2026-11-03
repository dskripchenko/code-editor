/**
 * The editor's look. Colours are custom properties, so a page themes the
 * editor without touching its rules; light and dark follow `data-theme` on
 * an ancestor or the system.
 */
const LIGHT = `
  --dsk-code-editor-bg: #ffffff;
  --dsk-code-editor-fg: #1f2328;
  --dsk-code-editor-gutter-fg: #8c959f;
  --dsk-code-editor-gutter-active-fg: #1f2328;
  --dsk-code-editor-cursor: #1f2328;
  --dsk-code-editor-selection: rgba(84, 174, 255, 0.2);
  --dsk-code-editor-selection-focused: rgba(84, 174, 255, 0.4);
  --dsk-code-editor-active-line: rgba(234, 238, 242, 0.5);`
const DARK = `
  --dsk-code-editor-bg: #0d1117;
  --dsk-code-editor-fg: #e6edf3;
  --dsk-code-editor-gutter-fg: #6e7681;
  --dsk-code-editor-gutter-active-fg: #e6edf3;
  --dsk-code-editor-cursor: #e6edf3;
  --dsk-code-editor-selection: rgba(56, 139, 253, 0.2);
  --dsk-code-editor-selection-focused: rgba(56, 139, 253, 0.4);
  --dsk-code-editor-active-line: rgba(110, 118, 129, 0.12);`

export const CODE_EDITOR_CSS = `
dsk-code-editor { display: block; }
.dsk-code-editor {${LIGHT}
  --dsk-code-editor-gutter-bg: var(--dsk-code-editor-bg);
  --dsk-code-editor-font: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --dsk-code-editor-font-size: 13px;
  --dsk-code-editor-line-height: 20px;
  position: relative;
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  background: var(--dsk-code-editor-bg);
  color: var(--dsk-code-editor-fg);
  font-family: var(--dsk-code-editor-font);
  font-size: var(--dsk-code-editor-font-size);
  line-height: var(--dsk-code-editor-line-height);
  font-variant-ligatures: none;
}
@media (prefers-color-scheme: dark) { .dsk-code-editor {${DARK} } }
:where([data-theme='light']) .dsk-code-editor {${LIGHT} }
:where([data-theme='dark']) .dsk-code-editor {${DARK} }
.dsk-code-editor__sizer { position: relative; display: flex; min-height: 100%; }
.dsk-code-editor__gutter {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  box-sizing: border-box;
  background: var(--dsk-code-editor-gutter-bg);
  color: var(--dsk-code-editor-gutter-fg);
  text-align: right;
  user-select: none;
}
.dsk-code-editor__gutter-lines { position: absolute; top: 0; left: 0; right: 0; padding: 0 12px 0 8px; }
.dsk-code-editor__gutter-lines > .dsk-code-editor__line--active { color: var(--dsk-code-editor-gutter-active-fg); }
.dsk-code-editor__content { position: relative; flex: 1 0 auto; cursor: text; outline: none; }
.dsk-code-editor__lines { position: absolute; top: 0; left: 4px; white-space: pre; z-index: 1; }
.dsk-code-editor__line { height: var(--dsk-code-editor-line-height); }
.dsk-code-editor__selections, .dsk-code-editor__cursors { position: absolute; inset: 0; pointer-events: none; }
.dsk-code-editor__cursors { z-index: 2; }
.dsk-code-editor__selection { position: absolute; background: var(--dsk-code-editor-selection); }
.dsk-code-editor--focused .dsk-code-editor__selection { background: var(--dsk-code-editor-selection-focused); }
.dsk-code-editor__active-line { position: absolute; left: 0; right: 0; background: var(--dsk-code-editor-active-line); }
.dsk-code-editor__cursor {
  position: absolute;
  width: 2px;
  margin-left: -1px;
  background: var(--dsk-code-editor-cursor);
  animation: dsk-code-editor-blink 1.1s steps(1) infinite;
}
.dsk-code-editor:not(.dsk-code-editor--focused) .dsk-code-editor__cursor { visibility: hidden; }
@keyframes dsk-code-editor-blink { 50% { opacity: 0; } }
.dsk-code-editor__composition { position: absolute; border-bottom: 1px solid currentColor; }
.dsk-code-editor__input {
  position: absolute;
  z-index: 0;
  width: 1px;
  height: var(--dsk-code-editor-line-height);
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre;
  font: inherit;
  line-height: inherit;
  color: inherit;
  background: transparent;
  caret-color: transparent;
  opacity: 0;
}
.dsk-code-editor__input--composing {
  z-index: 4;
  min-width: 1ch;
  opacity: 1;
  caret-color: var(--dsk-code-editor-cursor);
  background: var(--dsk-code-editor-bg);
  text-decoration: underline;
}
`

const styled = new WeakSet<Document | ShadowRoot>()

/** The editor's rules, once per document or shadow root the editor is in. */
export function ensureStyle(node: Node): void {
  const root = node.getRootNode()
  const target = root instanceof ShadowRoot ? root : (node.ownerDocument ?? document)
  if (styled.has(target)) return
  styled.add(target)
  const style = (node.ownerDocument ?? document).createElement('style')
  style.dataset.dskCodeEditor = ''
  style.textContent = CODE_EDITOR_CSS
  if (target instanceof ShadowRoot) target.prepend(style)
  else target.head.prepend(style)
}
