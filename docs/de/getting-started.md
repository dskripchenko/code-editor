# Erste Schritte

> 0.0.x bearbeitet ohne Hervorhebung: Tippen (auch IME), Bewegen und
> Auswählen mit Tasten und Maus, Rückgängig und Wiederholen, die
> Zwischenablage. Hervorhebung beim Tippen und die üblichen Befehle kommen
> mit 0.1.0.

## Installation

```sh
pnpm add @dskripchenko/code-editor
```

## Auf einem Element

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // eine Sprach-ID aus @dskripchenko/syntax
  lineNumbers: true, // Standard
  readOnly: false,
  tabSize: 4, // Spalten eines Tabs
  indentUnit: '    ', // was Tab einfügt
  onChange: (e) => console.log(e.value.length),
})

editor.value // der Text, mit den Zeilenumbrüchen, mit denen er kam
editor.value = other // ersetzt den Text, leert den Verlauf
editor.selection // [{ anchor, head }] — Offsets; ein Zeilenumbruch ist ein Zeichen
editor.setSelection(0, 5)
editor.undo()
editor.redo()
editor.focus()
editor.readOnly = true
editor.destroy() // nimmt ihn von der Seite
```

**Geben Sie dem Editor eine Höhe** (die des Elternelements oder von
`.dsk-code-editor`): Er scrollt darin und zeichnet nur die sichtbaren Zeilen.
Ohne Höhe wächst er auf den ganzen Text und zeichnet ihn vollständig.

Der Editor legt seine Regeln einmal ins Dokument (oder in die Shadow Root, in
der er steht); `CODE_EDITOR_CSS` sind dieselben Regeln für eine Seite, die
sie selbst einbinden will.

## Den Text aus Code ändern

Jede Änderung ist eine Transaktion — Änderungen am Text davor und die
Cursor danach. Sie landet im Verlauf wie Tippen.

```ts
import { Selection } from '@dskripchenko/code-editor'

editor.dispatch({
  changes: [{ from: 0, to: 0, insert: '// header\n' }],
  selection: Selection.single(10),
})
```

`editor.state` enthält den Text (`state.doc`: `lineAt`, `line`, `slice`,
`lineCount`, `length`) und die Cursor (`state.selection.ranges`). Die
Befehle stehen in `commands` (`insertText`, `deleteCharBackward`,
`cursorWordRight`…): Ein Befehl nimmt den Zustand und gibt eine Transaktion.

## Tasten

Die üblichen Bewegungen und Änderungen: Pfeile, wortweise (Alt auf macOS,
sonst Ctrl), Pos1 (zur Einrückung, dann zum Zeilenanfang), Ende, Bild
auf/ab, Anfang und Ende des Textes; Shift erweitert; Rücktaste und Entf
zeichen-, wortweise oder bis zum Zeilenanfang; Enter behält die Einrückung;
Tab fügt `indentUnit` ein; Cmd/Ctrl+Z rückgängig, Cmd/Ctrl+Shift+Z (Ctrl+Y)
wiederholen; Cmd/Ctrl+A alles auswählen. Kürzel funktionieren in jedem
Tastaturlayout (Cmd+Z ist auch im kyrillischen Rückgängig). Eigene Bindungen
kommen zuerst:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Maus

Ein Klick setzt den Cursor, Ziehen wählt aus (und scrollt über den Rand),
Shift erweitert, ein Doppelklick nimmt das Wort, ein Dreifachklick die Zeile,
Alt+Klick fügt einen Cursor hinzu.

## Als Element

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') für einen anderen Namen
```

```html
<dsk-code-editor language="yaml" style="height: 300px"><script type="text/plain">key: value
</script></dsk-code-editor>
```

Der Text wird aus einem `<script type="text/plain">` im Element gelesen, also
wird nichts darin als Markup verstanden; `value` liest und ersetzt ihn,
`readonly` macht ihn schreibgeschützt. Jede Änderung sendet `dsk:change`
mit dem Text in `detail.source`. Beim Verschieben auf der Seite behält das
Element seinen Text.

## Zeilenumbrüche

Ein Text behält den Umbruch, mit dem er kam (`\n` oder `\r\n`, der erste
gefundene); eingefügter Text bekommt ihn auch. Helfer: `readText`,
`writeText`, `detectLineBreak`.

## Große Dateien

Nur die sichtbaren Zeilen stehen in der Seite, eine Zeile über 10 000
Zeichen nur um die sichtbaren Spalten: Eine Datei mit einer Million Zeilen
(50 MB) öffnet in ein, zwei Sekunden und nimmt einen Tastendruck weit unter
einem Frame an.

## Theme

Farben und Schrift sind Custom Properties auf `.dsk-code-editor`
(`--dsk-code-editor-bg`, `-fg`, `-gutter-fg`, `-gutter-active-fg`,
`-gutter-bg`, `-cursor`, `-selection`, `-selection-focused`, `-active-line`,
`-font`, `-font-size`, `-line-height`). Dunkel folgt `data-theme="dark"` an
einem Vorfahren oder dem System.

## Browser

Chromium bekommt Eingaben über die EditContext-API, WebKit und Firefox über
eine versteckte Textarea am Cursor (sie zeigt auch den gerade per IME
komponierten Text); `supportsEditContext()` sagt, welchen Weg ein Browser
nimmt.
