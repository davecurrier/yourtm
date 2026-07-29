import AppKit
import Foundation
import UniformTypeIdentifiers

/// Opens container source files in an external editor.
///
/// The catch: macOS registers `.ts` as `public.mpeg-2-transport-stream` — an
/// MPEG-2 video format, which does *not* conform to `public.text`. So the
/// system default handler for a tag file is quite legitimately allowed to be a
/// video player; on a test machine `urlsForApplications(toOpen:)` returned VLC,
/// QuickTime Player and WhatsApp alongside the real editors. Calling
/// `NSWorkspace.open(_:)` and trusting the default would eventually launch one
/// of those.
///
/// So candidates are filtered rather than trusted: an app qualifies only if it
/// also claims plain text or source code. That rejects the video players
/// without hardcoding a list of blessed bundle identifiers, which would go
/// stale every time a new editor ships.
enum EditorService {

    struct Editor: Identifiable, Hashable {
        var url: URL
        var name: String
        var id: String { url.path }

        init(url: URL) {
            self.url = url
            self.name = url.deletingPathExtension().lastPathComponent
        }
    }

    private static let preferenceKey = "externalEditorPath"

    /// Editors that can plausibly open a TypeScript file, best-guess first.
    ///
    /// - Parameter fileURL: a real `.ts` file to resolve handlers against.
    ///   `urlsForApplications(toOpen:)` returns an empty array for a path that
    ///   does not exist, so probing with a made-up path silently yields no
    ///   candidates — which then looks like "no editors installed". When no file
    ///   is to hand (the Settings picker), a genuine temporary file is created
    ///   for the query and removed again.
    static func available(for fileURL: URL? = nil) -> [Editor] {
        var probe = fileURL
        var temporary: URL?
        if probe == nil {
            let url = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("ytm-editor-probe-\(ProcessInfo.processInfo.processIdentifier).ts")
            if (try? Data("export {}\n".utf8).write(to: url)) != nil {
                probe = url
                temporary = url
            }
        }
        defer { if let temporary { try? FileManager.default.removeItem(at: temporary) } }

        guard let probe else { return [] }

        let claimants = NSWorkspace.shared.urlsForApplications(toOpen: probe)
        let textCapable = Set(NSWorkspace.shared.urlsForApplications(toOpen: UTType.plainText))
        let sourceCapable = Set(NSWorkspace.shared.urlsForApplications(toOpen: UTType.sourceCode))

        // Deliberately no fallback: querying plainText/sourceCode directly
        // returns Numbers, Pages, Word and Excel, which are worse suggestions
        // than an honest empty list beside a working "Reveal in Finder".
        return claimants
            .filter { textCapable.contains($0) || sourceCapable.contains($0) }
            .map(Editor.init)
    }

    /// The editor the user picked, if it is still installed.
    static var preferred: Editor? {
        get {
            guard let path = UserDefaults.standard.string(forKey: preferenceKey),
                  FileManager.default.fileExists(atPath: path) else { return nil }
            return Editor(url: URL(fileURLWithPath: path))
        }
        set { UserDefaults.standard.set(newValue?.url.path, forKey: preferenceKey) }
    }

    /// Editor used when the user has not chosen one: first filtered candidate.
    static func effective(for fileURL: URL? = nil) -> Editor? {
        preferred ?? available(for: fileURL).first
    }

    /// Absolute path of an asset's source file, or nil if the engine did not
    /// report one (`sourcePath` is project-relative, e.g. `yourtm/tags/x.ts`).
    static func fileURL(for asset: Asset, projectPath: String) -> URL? {
        guard let relative = asset.sourcePath, !relative.isEmpty, !projectPath.isEmpty else { return nil }
        let url = URL(fileURLWithPath: projectPath).appendingPathComponent(relative)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Open a file in the chosen editor. Returns false if nothing suitable exists.
    @discardableResult
    static func open(_ fileURL: URL, using editor: Editor? = nil) -> Bool {
        guard let target = editor ?? effective(for: fileURL) else { return false }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        NSWorkspace.shared.open([fileURL], withApplicationAt: target.url, configuration: config)
        return true
    }

    /// Always-safe fallback — cannot open the file in the wrong kind of app.
    static func revealInFinder(_ fileURL: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([fileURL])
    }
}
