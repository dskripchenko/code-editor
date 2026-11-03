# Erste Schritte

> 0.0.x bearbeitet, hebt hervor, faltet und prüft: Tippen (auch IME),
> Bewegen und Auswählen mit Tasten und Maus, Rückgängig und Wiederholen, die
> Zwischenablage, Hervorhebung beim Tippen. Die üblichen Befehle kommen mit
> 0.1.0.

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
  validate: true, // Datenformate beim Bearbeiten prüfen
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
wiederholen; Cmd/Ctrl+A alles auswählen; Falten (unten). Kürzel funktionieren in jedem
Tastaturlayout (Cmd+Z ist auch im kyrillischen Rückgängig). Eigene Bindungen
kommen zuerst:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Maus

Ein Klick setzt den Cursor, Ziehen wählt aus (und scrollt über den Rand),
Shift erweitert, ein Doppelklick nimmt das Wort, ein Dreifachklick die Zeile,
Alt+Klick fügt einen Cursor hinzu.

## Hervorhebung

`language` (eine ID oder ein Alias aus `@dskripchenko/syntax`: `typescript`,
`yml`, `php`…) färbt den Text beim Tippen: eine Änderung wird nur so weit neu
zerlegt, bis der Text darunter wieder ist wie zuvor, ein Tastendruck kostet
also ein paar Zeilen, egal wie lang die Datei ist; der Rest einer langen
Datei wird in Leerlaufzeit geklärt. Ein oben in einer großen Datei getipptes
`/*` färbt die sichtbaren Zeilen sofort und den Rest kurz danach.
`editor.language = 'python'` hebt neu hervor; eine unbekannte Sprache lässt
den Text schlicht.

## Falten

Ein Block faltet sich über seine Marke neben den Zeilennummern (sichtbar beim
Überfahren), mit Cmd+Alt+[ / Cmd+Alt+] auf macOS und Ctrl+Shift+[ /
Ctrl+Shift+] sonst (der Block am Cursor) oder aus Code:

```ts
editor.fold(4) // der Block ab Zeile 4 (ab 0 gezählt) oder der innerste um sie herum
editor.unfold(4)
editor.foldAll()
editor.unfoldAll()
editor.folds // [{ start: 4, end: 9 }] — die erste Zeile bleibt sichtbar
```

Was sich falten lässt, kommt aus dem Text (Klammern, Tags, Einrückung,
Markdown-Überschriften) und wird kurz nach einer Änderung neu gelesen. Ein
Klick auf das `⋯` einer gefalteten Zeile öffnet sie, ebenso ein Cursor, der
hineinwandert; Bewegungen nach oben und unten gehen darüber hinweg.

## Diagnosen

Datenformate — JSON, YAML, XML, TOML, CSV, INI, `.env` — werden kurz nach
jeder Änderung geprüft: ein Fehler wird unterstrichen, seine Zeilennummer
gefärbt, und seine Meldung ist der Tooltip der Zeile. Die Seite fügt eigene
hinzu (ein Linter, ein Language Server), als Bereiche des Textes:

```ts
editor.setDiagnostics([{ from: 8, to: 9, message: 'b is not defined', severity: 'warning' }], 'lint')
editor.diagnostics // alle, die eigenen (`source: 'syntax'`) und die der Seite
el.addEventListener('dsk:diagnostics', (e) => show(e.detail.diagnostics))
```

Die Bereiche wandern mit Änderungen, bis die nächste Prüfung sie ersetzt.
Falten und Prüfen lesen den ganzen Text; über 2 MB läuft beides nicht.

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
`-font`, `-font-size`, `-line-height`, `-folded-bg`, `-error`, `-warning`,
`-info`). Die Farben der Tokens sind die von `@dskripchenko/syntax`
(`--sx-keyword`, `--sx-string`…). Dunkel folgt `data-theme="dark"` an einem
Vorfahren oder dem System.

## Browser

Chromium bekommt Eingaben über die EditContext-API, WebKit und Firefox über
eine versteckte Textarea am Cursor (sie zeigt auch den gerade per IME
komponierten Text); `supportsEditContext()` sagt, welchen Weg ein Browser
nimmt.
