import AppKit
import SwiftUI

// MARK: - IDE-style code editor: line numbers, JS syntax highlighting,
//         auto-indent, find bar (⌘F)

struct CodeEditor: NSViewRepresentable {
    @Binding var text: String
    var variables: [String] = []

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        let tv = scroll.documentView as! NSTextView

        tv.font = Theme.font
        tv.isRichText = false
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isGrammarCheckingEnabled = false
        tv.isContinuousSpellCheckingEnabled = false
        tv.allowsUndo = true
        tv.usesFindBar = true
        tv.isIncrementalSearchingEnabled = true
        tv.textContainerInset = NSSize(width: 6, height: 10)
        tv.backgroundColor = Theme.background
        tv.insertionPointColor = .controlAccentColor
        tv.selectedTextAttributes = [.backgroundColor: NSColor.selectedTextBackgroundColor]
        tv.delegate = context.coordinator
        tv.string = text

        // Line number gutter
        let ruler = LineNumberRuler(textView: tv)
        scroll.verticalRulerView = ruler
        scroll.hasVerticalRuler = true
        scroll.rulersVisible = true
        context.coordinator.ruler = ruler

        // Redraw gutter while scrolling
        scroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.scrolled),
            name: NSView.boundsDidChangeNotification,
            object: scroll.contentView
        )

        JSHighlighter.highlight(tv)
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let tv = scroll.documentView as? NSTextView else { return }
        if tv.string != text, !context.coordinator.isEditing {
            tv.string = text
            JSHighlighter.highlight(tv)
            context.coordinator.ruler?.needsDisplay = true
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: CodeEditor
        var isEditing = false
        weak var ruler: LineNumberRuler?

        init(_ parent: CodeEditor) { self.parent = parent }

        @objc func scrolled() { ruler?.needsDisplay = true }

        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            isEditing = true
            parent.text = tv.string
            isEditing = false
            JSHighlighter.highlight(tv)
            ruler?.needsDisplay = true
            maybeShowVariableMenu(tv)
        }

        /// When the user has just typed `{{`, pop a menu of container variables
        /// at the caret; picking one inserts `name}}`.
        private func maybeShowVariableMenu(_ tv: NSTextView) {
            guard !parent.variables.isEmpty else { return }
            let s = tv.string as NSString
            let loc = tv.selectedRange().location
            guard loc >= 2, loc <= s.length,
                  s.substring(with: NSRange(location: loc - 2, length: 2)) == "{{" else { return }

            let menu = NSMenu()
            menu.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
            for name in parent.variables.sorted() {
                let item = NSMenuItem(title: "{{\(name)}}", action: #selector(insertVariable(_:)), keyEquivalent: "")
                item.representedObject = name
                item.target = self
                menu.addItem(item)
            }

            // Anchor the menu at the caret
            guard let lm = tv.layoutManager, let tc = tv.textContainer else { return }
            let glyph = lm.glyphIndexForCharacter(at: max(0, loc - 1))
            var rect = lm.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: tc)
            rect.origin.x += tv.textContainerInset.width
            rect.origin.y += tv.textContainerInset.height
            pendingTextView = tv
            menu.popUp(positioning: nil,
                       at: NSPoint(x: rect.maxX, y: rect.maxY + 4),
                       in: tv)
        }

        private weak var pendingTextView: NSTextView?

        @objc private func insertVariable(_ sender: NSMenuItem) {
            guard let tv = pendingTextView, let name = sender.representedObject as? String else { return }
            let sel = tv.selectedRange()
            tv.insertText("\(name)}}", replacementRange: sel)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            ruler?.needsDisplay = true
        }

        // Auto-indent on newline; 2-space soft tabs
        func textView(_ tv: NSTextView, doCommandBy selector: Selector) -> Bool {
            if selector == #selector(NSResponder.insertNewline(_:)) {
                let s = tv.string as NSString
                let sel = tv.selectedRange()
                let lineRange = s.lineRange(for: NSRange(location: min(sel.location, s.length), length: 0))
                let line = s.substring(with: lineRange)
                let indent = line.prefix { $0 == " " || $0 == "\t" }
                var insert = "\n" + indent
                if sel.location > 0 {
                    let prev = s.substring(with: NSRange(location: sel.location - 1, length: 1))
                    if ["{", "(", "["].contains(prev) { insert += "  " }
                }
                tv.insertText(insert, replacementRange: sel)
                return true
            }
            if selector == #selector(NSResponder.insertTab(_:)) {
                tv.insertText("  ", replacementRange: tv.selectedRange())
                return true
            }
            return false
        }
    }
}

// MARK: - Theme

enum Theme {
    static let font = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
    static let gutterFont = NSFont.monospacedSystemFont(ofSize: 10.5, weight: .regular)

    private static func dyn(_ light: NSColor, _ dark: NSColor) -> NSColor {
        NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        }
    }

    private static func hex(_ v: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255,
                green: CGFloat((v >> 8) & 0xFF) / 255,
                blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    // Xcode-default-inspired palette, light/dark adaptive
    static let background = dyn(hex(0xFFFFFF), hex(0x1F1F24))
    static let plain      = dyn(hex(0x000000), hex(0xFFFFFF))
    static let keyword    = dyn(hex(0xAD3DA4), hex(0xFC5FA3))
    static let string     = dyn(hex(0xD12F1B), hex(0xFC6A5D))
    static let comment    = dyn(hex(0x707F8C), hex(0x6C7986))
    static let number     = dyn(hex(0x272AD8), hex(0xD0BF69))
    static let call       = dyn(hex(0x326D74), hex(0x67B7A4))
    static let property   = dyn(hex(0x6C36A9), hex(0xB281EB))
    static let global     = dyn(hex(0x0B4F79), hex(0x41A1C0))
    static let ytmVar     = dyn(hex(0xC25A00), hex(0xFFA14F))
    static let ytmVarBg   = dyn(NSColor(srgbRed: 1, green: 0.65, blue: 0, alpha: 0.12),
                                NSColor(srgbRed: 1, green: 0.65, blue: 0.3, alpha: 0.14))
    static let gutterText = dyn(hex(0xA6A6A6), hex(0x5C5C63))
    static let gutterCurrent = dyn(hex(0x333333), hex(0xD8D8DE))
    static let gutterBg   = dyn(hex(0xF7F7F7), hex(0x27272C))
}

// MARK: - JavaScript syntax highlighter (regex-based, small-doc friendly)

enum JSHighlighter {
    private struct Rule {
        let regex: NSRegularExpression
        let color: NSColor
        let background: NSColor?
        let group: Int
        init(_ pattern: String, _ color: NSColor, background: NSColor? = nil,
             group: Int = 0, options: NSRegularExpression.Options = []) {
            regex = try! NSRegularExpression(pattern: pattern, options: options)
            self.color = color
            self.background = background
            self.group = group
        }
    }

    // Applied in order — later rules override earlier ones.
    private static let rules: [Rule] = [
        // properties (.foo)
        Rule(#"\.([A-Za-z_$][\w$]*)"#, Theme.property, group: 1),
        // function calls foo(
        Rule(#"\b([A-Za-z_$][\w$]*)\s*\("#, Theme.call, group: 1),
        // numbers
        Rule(#"\b\d+(?:\.\d+)?\b"#, Theme.number),
        // known browser globals
        Rule(#"\b(window|document|console|navigator|location|dataLayer|localStorage|sessionStorage)\b"#, Theme.global),
        // keywords
        Rule(#"\b(function|var|let|const|if|else|return|new|typeof|instanceof|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|delete|in|of|this|async|await|class|extends|super|import|export|void|yield)\b"#, Theme.keyword),
        // literals
        Rule(#"\b(true|false|null|undefined|NaN|Infinity)\b"#, Theme.keyword),
        // YourTM variable refs
        Rule(#"\{\{[^}]+\}\}"#, Theme.ytmVar, background: Theme.ytmVarBg),
        // strings (after identifiers/keywords so they win inside quotes)
        Rule(#"'(?:[^'\\\n]|\\.)*'"#, Theme.string),
        Rule(#""(?:[^"\\\n]|\\.)*""#, Theme.string),
        Rule(#"`(?:[^`\\]|\\.)*`"#, Theme.string),
        // comments last — they beat everything
        Rule(#"//[^\n]*"#, Theme.comment),
        Rule(#"/\*[\s\S]*?\*/"#, Theme.comment),
    ]

    static func highlight(_ tv: NSTextView) {
        guard let storage = tv.textStorage else { return }
        let full = NSRange(location: 0, length: storage.length)
        let text = storage.string

        storage.beginEditing()
        storage.setAttributes([.font: Theme.font, .foregroundColor: Theme.plain], range: full)
        for rule in rules {
            rule.regex.enumerateMatches(in: text, range: full) { match, _, _ in
                guard let match, match.range(at: rule.group).location != NSNotFound else { return }
                let r = match.range(at: rule.group)
                storage.addAttribute(.foregroundColor, value: rule.color, range: r)
                if let bg = rule.background {
                    storage.addAttribute(.backgroundColor, value: bg, range: r)
                }
            }
        }
        storage.endEditing()
    }
}

// MARK: - Line number gutter

final class LineNumberRuler: NSRulerView {
    private weak var textView: NSTextView?

    init(textView: NSTextView) {
        self.textView = textView
        super.init(scrollView: textView.enclosingScrollView, orientation: .verticalRuler)
        clientView = textView
        ruleThickness = 42
    }

    required init(coder: NSCoder) { fatalError() }

    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let tv = textView,
              let lm = tv.layoutManager else { return }

        Theme.gutterBg.setFill()
        bounds.fill()

        let content = tv.string as NSString
        let selectedLine = currentLine(in: content, at: tv.selectedRange().location)

        // Widen gutter for big files
        let digits = max(2, String(max(1, lineStarts(content).count)).count)
        let needed = CGFloat(digits) * 8 + 18
        if abs(ruleThickness - needed) > 1 { ruleThickness = needed }

        let visible = tv.visibleRect
        let inset = tv.textContainerInset.height

        for (i, start) in lineStarts(content).enumerated() {
            let glyph = lm.glyphIndexForCharacter(at: min(start, max(0, content.length - 1)))
            var fragment: NSRect
            if content.length == 0 {
                fragment = lm.extraLineFragmentRect
            } else if start >= content.length {
                fragment = lm.extraLineFragmentRect
                if fragment == .zero { continue }
            } else {
                fragment = lm.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
            }

            let y = fragment.minY + inset - visible.minY
            guard y + fragment.height >= 0, y <= bounds.height else { continue }

            let number = "\(i + 1)"
            let isCurrent = (i == selectedLine)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: isCurrent ? NSFont.monospacedSystemFont(ofSize: 10.5, weight: .semibold) : Theme.gutterFont,
                .foregroundColor: isCurrent ? Theme.gutterCurrent : Theme.gutterText,
            ]
            let size = number.size(withAttributes: attrs)
            let point = NSPoint(
                x: ruleThickness - size.width - 8,
                y: y + (fragment.height - size.height) / 2
            )
            number.draw(at: point, withAttributes: attrs)
        }
    }

    private func lineStarts(_ s: NSString) -> [Int] {
        var starts: [Int] = [0]
        var index = 0
        while index < s.length {
            let lineRange = s.lineRange(for: NSRange(location: index, length: 0))
            index = NSMaxRange(lineRange)
            if index < s.length { starts.append(index) }
        }
        // trailing empty line after final newline
        if s.length > 0, s.character(at: s.length - 1) == 0x0A {
            starts.append(s.length)
        }
        return starts
    }

    private func currentLine(in s: NSString, at location: Int) -> Int {
        let starts = lineStarts(s)
        var line = 0
        for (i, start) in starts.enumerated() where start <= location { line = i }
        return line
    }
}
