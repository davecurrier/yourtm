import SwiftUI

/// Shown in the detail pane when several assets are selected.
///
/// Deliberately not a bulk-editing surface. This interface is single-asset
/// first: multi-selection exists so a set can be acted on, not so it can be
/// edited in aggregate. The screen states what is selected and offers the one
/// operation that makes sense across a set.
struct MultiSelectionView: View {
    let kind: AssetKind
    let assets: [Asset]
    var onDelete: () -> Void
    var onClear: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("\(assets.count) \(kind.rawValue) selected")
                        .font(.title2.bold())
                    Spacer()
                    Button("Clear Selection", action: onClear)
                        .buttonStyle(.link)
                }

                Text("Shift-click a range or ⌘-click to add and remove. ⌫ deletes the selection.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(assets) { asset in
                            HStack(spacing: 8) {
                                Image(systemName: kind.systemImage)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 16)
                                Text(asset.name).font(.callout.weight(.medium))
                                if let type = asset.type {
                                    Text(type)
                                        .font(.caption2)
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(.quaternary, in: Capsule())
                                }
                                Spacer()
                                Text(asset.sourcePath ?? "yourtm/\(kind.rawValue)/\(asset.id).ts")
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            Divider().opacity(0.35)
                        }
                    }
                }
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            Divider()
            HStack {
                Spacer()
                Button(role: .destructive, action: onDelete) {
                    Label("Delete \(assets.count) \(kind.rawValue)…", systemImage: "trash")
                }
            }
            .padding(12)
            .background(.bar)
        }
    }
}
