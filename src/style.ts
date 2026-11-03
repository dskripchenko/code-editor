/**
 * The editor's look. Colours are custom properties, so a page themes the
 * editor without touching its rules; light and dark follow `data-theme` on
 * an ancestor or the system.
 */
import { THEME_CSS } from '@dskripchenko/syntax'

const LIGHT = `
  --dsk-code-editor-bg: #ffffff;
  --dsk-code-editor-fg: #1f2328;
  --dsk-code-editor-gutter-fg: #8c959f;
  --dsk-code-editor-gutter-active-fg: #1f2328;
  --dsk-code-editor-cursor: #1f2328;
  --dsk-code-editor-selection: rgba(84, 174, 255, 0.2);
  --dsk-code-editor-selection-focused: rgba(84, 174, 255, 0.4);
  --dsk-code-editor-active-line: rgba(234, 238, 242, 0.5);
  --dsk-code-editor-folded-bg: rgba(175, 184, 193, 0.3);
  --dsk-code-editor-error: #cf222e;
  --dsk-code-editor-warning: #9a6700;
  --dsk-code-editor-info: #0969da;
  --dsk-code-editor-match: rgba(255, 196, 0, 0.35);
  --dsk-code-editor-match-current: rgba(255, 150, 0, 0.6);
  --dsk-code-editor-bracket: rgba(9, 105, 218, 0.18);
  --dsk-code-editor-popup-bg: #ffffff;
  --dsk-code-editor-popup-border: #d0d7de;
  --dsk-code-editor-popup-active: rgba(9, 105, 218, 0.14);`
const DARK = `
  --dsk-code-editor-bg: #0d1117;
  --dsk-code-editor-fg: #e6edf3;
  --dsk-code-editor-gutter-fg: #6e7681;
  --dsk-code-editor-gutter-active-fg: #e6edf3;
  --dsk-code-editor-cursor: #e6edf3;
  --dsk-code-editor-selection: rgba(56, 139, 253, 0.2);
  --dsk-code-editor-selection-focused: rgba(56, 139, 253, 0.4);
  --dsk-code-editor-active-line: rgba(110, 118, 129, 0.12);
  --dsk-code-editor-folded-bg: rgba(110, 118, 129, 0.4);
  --dsk-code-editor-error: #ff7b72;
  --dsk-code-editor-warning: #e3b341;
  --dsk-code-editor-info: #58a6ff;
  --dsk-code-editor-match: rgba(187, 128, 9, 0.4);
  --dsk-code-editor-match-current: rgba(227, 179, 65, 0.6);
  --dsk-code-editor-bracket: rgba(56, 139, 253, 0.25);
  --dsk-code-editor-popup-bg: #161b22;
  --dsk-code-editor-popup-border: #30363d;
  --dsk-code-editor-popup-active: rgba(56, 139, 253, 0.25);`

/** A squiggle under a diagnostic: a wave the background colour shows through. */
const WAVE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='6' height='4'><path d='M0 3 1.5 1 3 3 4.5 1 6 3' fill='none' stroke='black'/></svg>",
)}")`

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
.dsk-code-editor__gutter-lines { position: absolute; top: 0; left: 0; right: 0; padding: 0 18px 0 8px; }
.dsk-code-editor__gutter-lines > .dsk-code-editor__line { position: relative; }
.dsk-code-editor__gutter-lines > .dsk-code-editor__line--error { color: var(--dsk-code-editor-error); }
.dsk-code-editor__gutter-lines > .dsk-code-editor__line--warning { color: var(--dsk-code-editor-warning); }
.dsk-code-editor__fold {
  position: absolute;
  top: 0;
  right: -16px;
  width: 14px;
  height: 100%;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.dsk-code-editor__fold::before { content: '\\25BE'; }
.dsk-code-editor__fold--folded::before { content: '\\25B8'; }
.dsk-code-editor__gutter:hover .dsk-code-editor__fold, .dsk-code-editor__fold--folded { opacity: 1; }
.dsk-code-editor__line--folded::after {
  content: '\\22EF';
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--dsk-code-editor-folded-bg);
  color: var(--dsk-code-editor-gutter-fg);
  cursor: pointer;
}
.dsk-code-editor__diagnostic {
  position: absolute;
  -webkit-mask: ${WAVE} repeat-x left center / 6px 4px;
  mask: ${WAVE} repeat-x left center / 6px 4px;
}
.dsk-code-editor__match { position: absolute; background: var(--dsk-code-editor-match); border-radius: 2px; }
.dsk-code-editor__match--current { background: var(--dsk-code-editor-match-current); }
.dsk-code-editor__bracket {
  position: absolute;
  box-sizing: border-box;
  background: var(--dsk-code-editor-bracket);
  outline: 1px solid var(--dsk-code-editor-bracket);
}
.dsk-code-editor__completion {
  position: absolute;
  z-index: 6;
  min-width: 160px;
  max-width: 420px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px 0;
  background: var(--dsk-code-editor-popup-bg);
  border: 1px solid var(--dsk-code-editor-popup-border);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
}
.dsk-code-editor__completion-item { display: flex; gap: 12px; padding: 0 8px; cursor: pointer; white-space: pre; }
.dsk-code-editor__completion-item--active { background: var(--dsk-code-editor-popup-active); }
.dsk-code-editor__completion-detail { margin-left: auto; color: var(--dsk-code-editor-gutter-fg); overflow: hidden; text-overflow: ellipsis; }
.dsk-code-editor__panel { position: sticky; top: 0; left: 0; z-index: 7; height: 0; }
.dsk-code-editor__panel-input {
  position: absolute;
  top: 6px;
  right: 16px;
  width: 220px;
  padding: 4px 8px;
  font: inherit;
  color: inherit;
  background: var(--dsk-code-editor-popup-bg);
  border: 1px solid var(--dsk-code-editor-popup-border);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
  outline: none;
}
.dsk-code-editor__diagnostic--error { background: var(--dsk-code-editor-error); }
.dsk-code-editor__diagnostic--warning { background: var(--dsk-code-editor-warning); }
.dsk-code-editor__diagnostic--info { background: var(--dsk-code-editor-info); }
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
  // The tokens' colours: custom properties on the document (on the shadow root's host inside one).
  const theme =
    target instanceof ShadowRoot
      ? THEME_CSS.replace(/:root:not\(([^)]*)\)/g, ':host(:not($1))').replaceAll(':root', ':host')
      : THEME_CSS
  style.textContent = CODE_EDITOR_CSS + theme
  if (target instanceof ShadowRoot) target.prepend(style)
  else target.head.prepend(style)
}
