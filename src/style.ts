/**
 * The editor's look. Colours are custom properties, so a page themes the
 * editor without touching its rules; light and dark follow `data-theme` on
 * an ancestor or the system.
 */
export const CODE_EDITOR_CSS = `
.dsk-code-editor {
  --dsk-code-editor-bg: #ffffff;
  --dsk-code-editor-fg: #1f2328;
  --dsk-code-editor-gutter-fg: #8c959f;
  --dsk-code-editor-gutter-bg: transparent;
  --dsk-code-editor-font: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --dsk-code-editor-font-size: 13px;
  --dsk-code-editor-line-height: 20px;
  display: flex;
  overflow: auto;
  background: var(--dsk-code-editor-bg);
  color: var(--dsk-code-editor-fg);
  font-family: var(--dsk-code-editor-font);
  font-size: var(--dsk-code-editor-font-size);
  line-height: var(--dsk-code-editor-line-height);
  tab-size: 4;
}
:where([data-theme='dark']) .dsk-code-editor {
  --dsk-code-editor-bg: #0d1117;
  --dsk-code-editor-fg: #e6edf3;
  --dsk-code-editor-gutter-fg: #6e7681;
}
@media (prefers-color-scheme: dark) {
  :where(:not([data-theme='light'])) > .dsk-code-editor:not(:where([data-theme='light'] *)) {
    --dsk-code-editor-bg: #0d1117;
    --dsk-code-editor-fg: #e6edf3;
    --dsk-code-editor-gutter-fg: #6e7681;
  }
}
.dsk-code-editor__gutter {
  position: sticky;
  left: 0;
  flex: none;
  padding: 0 12px 0 8px;
  text-align: right;
  color: var(--dsk-code-editor-gutter-fg);
  background: var(--dsk-code-editor-gutter-bg);
  user-select: none;
}
.dsk-code-editor__content {
  flex: 1;
  min-width: 0;
  padding-right: 12px;
  white-space: pre;
}
.dsk-code-editor__line {
  height: var(--dsk-code-editor-line-height);
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
