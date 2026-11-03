/** Whether the browser has the EditContext API (Chromium 121+); elsewhere the editor reads input from a hidden textarea. */
export function supportsEditContext(): boolean {
  return typeof globalThis !== 'undefined' && 'EditContext' in globalThis
}
