# Erste Schritte

> 0.1.0: Tippen (auch IME), Bewegen und Auswählen, Rückgängig und
> Wiederholen, die Zwischenablage, Hervorhebung beim Tippen, Falten, Prüfen
> von Datenformaten und die Befehle eines Code-Editors — Einrückung,
> Klammern, Kommentare, Zeilen, mehrere Cursor, Gehe zu Zeile, Suche,
> Vervollständigung.

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
  lineWrapping: false, // lange Zeilen umbrechen an der Breite der Ansicht (siehe Umbruch)
  readOnly: false,
  tabSize: 4, // Spalten eines Tabs
  indentUnit: '    ', // was Tab einfügt
  onChange: (e) => console.log(e.value.length),
  validate: true, // Datenformate beim Bearbeiten prüfen
  closeBrackets: true, // Klammern und Anführungszeichen schließen sich beim Tippen
  completion: undefined, // die Vorschläge der Seite (siehe Vervollständigung)
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

Jede Bewegung der Cursor sendet `dsk:selection` (`detail.selection`, für eine Statuszeile). Jede Änderung ist eine Transaktion — Änderungen am Text davor und die
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

Wie in VS Code. Mod ist Cmd auf macOS, sonst Ctrl.

| Tasten | Was |
|---|---|
| Pfeile, Pos1, Ende, Bild auf/ab, Mod+Pos1/Ende | bewegen (Alt auf macOS, sonst Ctrl: wortweise; Pos1: zur Einrückung, dann zum Zeilenanfang); Shift erweitert |
| Enter | neue Zeile mit der Einrückung, eine Stufe tiefer nach `{` `(` `[` (und `:` in Python, YAML); zwischen `{}` rückt die schließende eine Zeile weiter |
| Tab / Shift+Tab, Mod+] / Mod+[ | einrücken und ausrücken (Tab über Zeilen rückt sie ein) |
| Rücktaste | in der Einrückung eine ganze Stufe zurück; zwischen `()` oder `""` beide |
| Mod+/ · Shift+Alt+A | Zeilenkommentar · Blockkommentar, an und aus |
| Alt+↑/↓ · Shift+Alt+↑/↓ · Mod+Shift+K | Zeilen verschieben · kopieren · löschen |
| Mod+Enter · Mod+Shift+Enter | neue Zeile darunter · darüber |
| Mod+L | die Zeile auswählen (nochmal: die nächste dazu) |
| Mod+D · Mod+Shift+L | das Wort auswählen, dann sein nächstes Vorkommen · alle |
| Cmd+Alt+↑/↓ (macOS), Ctrl+Alt+↑/↓ | ein Cursor mehr darüber · darunter; Alt+Klick fügt einen hinzu; Escape lässt einen |
| Ctrl+G | gehe zu Zeile (auf jedem System) |
| Cmd+G / Cmd+Shift+G (macOS), F3 / Shift+F3 | nächster · vorheriger Treffer |
| Ctrl+Leertaste | Vervollständigung |
| Mod+Shift+\\ | zur passenden Klammer |
| Cmd+Alt+[ / ] (macOS), Ctrl+Shift+[ / ] | falten · entfalten |
| Mod+Z · Mod+Shift+Z (Ctrl+Y) · Mod+A | rückgängig · wiederholen · alles auswählen |

Klammern und Anführungszeichen schließen sich beim Tippen (ein Apostroph
nach einem Buchstaben bleibt einer), eine schließende überschreibt dieselbe
nach dem Cursor, und eine Auswahl wird eingeschlossen; `closeBrackets: false`
schaltet das ab. Kopieren und Ausschneiden ohne Auswahl nehmen die ganze
Zeile; eingefügt landet sie über der Zeile des Cursors. Kürzel
funktionieren in jedem Tastaturlayout. Eigene Bindungen kommen zuerst:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Gehe zu Zeile, Suche

```ts
editor.goToLine(120, 4) // Zeile und Spalte ab 1; die Zeile kommt in die Mitte der Ansicht
editor.openGoToLine() // das Feld, das Ctrl+G öffnet: `120` oder `120:4`, Enter

editor.setSearch({ search: 'todo', caseSensitive: false, wholeWord: true, regexp: false })
editor.findNext() // wählt den nächsten Treffer (im Kreis); findPrevious()
editor.searchMatches() // [{ from, to }] — Zählen liest den ganzen Text
editor.setSearch({ search: '(\\w+)=(\\d+)', regexp: true, replace: '$2=$1' })
editor.replaceNext() // der ausgewählte Treffer, dann wird der nächste ausgewählt
editor.replaceAll() // wie viele; ein Schritt zum Rückgängigmachen
editor.setSearch(null)
```

Die sichtbaren Treffer sind markiert, der ausgewählte stärker. Eine eigene
Suchleiste hat der Editor nicht — die Seite legt ihre darüber und steuert
ihn damit; Cmd+G (F3) ohne Suche sucht den ausgewählten Text.

## Vervollständigung

Ein getipptes Wort (ab zwei Buchstaben) öffnet eine Liste dessen, was es
beenden kann: zuerst die Vorschläge der Seite, dann die Wörter des Textes
nahe dem Cursor. Pfeile bewegen, Enter oder Tab wählt, Escape schließt;
Ctrl+Leertaste öffnet sie an jeder Stelle.

```ts
new CodeEditor(el, {
  completion: async ({ prefix, pos, explicit, state }) => [
    { label: 'console', detail: 'global', kind: 'variable' },
    { label: 'constructor', insert: 'constructor()' },
  ],
  completeWords: true, // auch die Wörter des Textes (Standard)
})
editor.startCompletion()
```

## Einrückung und `.editorconfig`

Ohne `indentUnit` rät der Editor sie aus dem Text (Tabs oder die häufigste
Stufe aus Leerzeichen). Die Seite, die die Dateien hat, gibt die
Einstellungen der `.editorconfig`:

```ts
import { editorConfigFor, indentOptions } from '@dskripchenko/code-editor'

// Die .editorconfig-Dateien auf dem Weg zur Datei, nach ihrem Verzeichnis.
const settings = editorConfigFor('/repo/src/main.ts', {
  '/repo': rootEditorConfigText,
  '/repo/src': srcEditorConfigText,
})
editor.configure(indentOptions(settings)) // { indentUnit: '  ', tabSize: 2 }
settings.endOfLine // 'lf' | 'crlf'; insertFinalNewline, trimTrailingWhitespace — fürs Speichern
```

## Maus

Ein Klick setzt den Cursor, Ziehen wählt aus (und scrollt über den Rand),
Shift erweitert, ein Doppelklick nimmt das Wort, ein Dreifachklick die Zeile,
Alt+Klick fügt einen Cursor hinzu.

## Umbruch

`lineWrapping: true` (oder jederzeit `editor.lineWrapping = true`) bricht eine
lange Zeile an der Breite der Ansicht in Reihen um: nach dem letzten Leerzeichen,
das passt, oder wo die Reihe voll ist, für ein Wort, das länger ist; Tabs gehen
bis zu ihrem Stopp, CJK und Emoji nehmen zwei Spalten. Seitlich scrollt dann
nichts. Auf und ab gehen Reihe für Reihe, die Spalte in der Reihe bleibt; ein
Klick landet in der Reihe unter dem Zeiger; Auswahl, Treffer und Diagnosen
werden auf jeder Reihe gezeichnet, die sie berühren. Die Reihen folgen der
Breite der Ansicht beim Größenändern. Zeilen über 10 000 Zeichen bleiben
ungebrochen (teilweise gezeichnet, seitlich gescrollt).

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

## Hover, Parameter, Definitionen, Menüs

Was eine Sprache weiß, kommt von der Seite (etwa einem Language Server); der
Editor zeigt es:

```ts
new CodeEditor(el, {
  hover: async ({ pos }) => describe(pos), // ein Text oder ein Element; null für nichts
  signatureHelp: async ({ pos, explicit }) => parametersAt(pos), // nach ( und , — und mit Mod+Shift+Space
  onModClick: (pos) => (goToDefinition(pos), true), // ein Klick mit Cmd (macOS) oder Strg
  completion: async () => [{ label: 'log', snippet: 'log(${1:message})$0' }], // Stellen, die erste ausgewählt
})
editor.menu([{ label: 'Add import' }, { label: 'Extract', detail: 'function' }]) // der gewählte Index oder null
editor.prompt(from, to) // ein Feld über einem Wort (ein neuer Name): das Getippte oder null
editor.coordsAt(pos) // das Rechteck einer Position auf dem Bildschirm; posAtPoint(x, y) umgekehrt
editor.showTooltip(content, pos) // ein eigener Tooltip der Seite; closeTooltip()
```

Ein ruhender Zeiger zeigt den Hover nach einem Moment; ein Tooltip verschwindet,
wenn sich Text oder Cursor bewegen, oder mit Escape. Ein
Vervollständigungseintrag kann einen eigenen Bereich ersetzen (`from`, `to`).
Jedes `dsk:change` trägt `edits` — die Änderungen als Zeilen- und
Zeichenbereiche (UTF-16), jede gegen den Text, den die vorige ließ (die
inkrementelle Synchronisation eines Language Servers); die einer Transaktion
stehen in `transaction.edits`.

## Marken und Anmerkungen im Rand

```ts
// Neben Zeilen (ab 0), ein Satz je Quelle: ein Diff zum letzten Commit, Haltepunkte …
editor.setGutterMarks([{ line: 4, kind: 'added' }, { line: 9, kind: 'modified', title: 'geändert' }], 'diff')
editor.setGutterMarks([], 'diff') // entfernt
el.addEventListener('dsk:gutter-mark', (e) => peek(e.detail.line, e.detail.rect))

// Eine Spalte kurzer Texte neben den Nummern (wer eine Zeile geändert hat, und wann).
editor.setAnnotations([{ line: 0, text: 'Ann · 2 Tage', title: 'Ann <ann@example.com>, 1. Nov.' }])
el.addEventListener('dsk:annotation', (e) => show(e.detail.line))
editor.setAnnotations(null)
```

`added`, `modified` und `deleted` werden gezeichnet (ein Balken, ein Balken, eine
Kerbe), in `--dsk-code-editor-added`, `-modified`, `-deleted`; eine andere Art
bekommt die Klasse `dsk-code-editor__mark--<kind>`, damit die Seite sie zeichnet.
Marken und Anmerkungen wandern beim Bearbeiten mit ihren Zeilen; die auf einer
ersetzten Zeile verschwinden, bis die Seite sie neu setzt.

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

`editor.lineBreak` ist der verwendete. Ein Text behält den Umbruch, mit dem er kam (`\n` oder `\r\n`, der erste
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
