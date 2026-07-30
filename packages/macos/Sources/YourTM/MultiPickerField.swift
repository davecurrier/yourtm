import SwiftUI

/// One selectable option in a MultiPickerField.
struct PickOption: Identifiable, Hashable {
    var name: String
    var subtitle: String?
    var id: String { name }
}

/// Token-chip field with a searchable popover picker — scales to hundreds of
/// options (triggers, zones, consent categories).
struct MultiPickerField: View {
    @Binding var selection: [String]
    let options: [PickOption]
    var placeholder = "none"

    @State private var showPicker = false
    @State private var search = ""

    private var filtered: [PickOption] {
        guard !search.isEmpty else { return options }
        return options.filter {
            $0.name.localizedCaseInsensitiveContains(search)
                || ($0.subtitle ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        FlowLayout(spacing: 5) {
            ForEach(selection, id: \.self) { name in
                chip(name)
            }
            addButton
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 3)
    }

    private func chip(_ name: String) -> some View {
        HStack(spacing: 3) {
            Text(name)
                .font(.callout)
            Button {
                selection.removeAll { $0 == name }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(.quaternary.opacity(0.7), in: Capsule())
        .overlay(Capsule().strokeBorder(.quaternary))
    }

    private var addButton: some View {
        Button {
            search = ""
            showPicker = true
        } label: {
            HStack(spacing: 3) {
                Image(systemName: "plus")
                    .font(.system(size: 9, weight: .bold))
                Text(selection.isEmpty ? placeholder : "Add")
                    .font(.callout)
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().strokeBorder(.quaternary, style: StrokeStyle(lineWidth: 1, dash: [3])))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPicker, arrowEdge: .bottom) {
            pickerContent
        }
    }

    private var pickerContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search", text: $search)
                    .textFieldStyle(.plain)
            }
            .padding(10)
            Divider()

            if filtered.isEmpty {
                Text("No matches")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(16)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(filtered) { option in
                            optionRow(option)
                            Divider().opacity(0.4)
                        }
                    }
                }
                .frame(maxHeight: 320)
            }

            Divider()
            HStack {
                Text("\(selection.count) selected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Done") { showPicker = false }
                    .controlSize(.small)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(8)
        }
        .frame(width: 340)
    }

    private func optionRow(_ option: PickOption) -> some View {
        let isSelected = selection.contains(option.name)
        return Button {
            if isSelected {
                selection.removeAll { $0 == option.name }
            } else {
                selection.append(option.name)
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.5))
                VStack(alignment: .leading, spacing: 1) {
                    Text(option.name)
                        .font(.callout.weight(isSelected ? .semibold : .regular))
                    if let sub = option.subtitle, !sub.isEmpty {
                        Text(sub)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Wrapping layout for chips

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                       proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Shared option builders

enum PickOptions {
    static func triggers(_ project: ProjectData) -> [PickOption] {
        project.triggers
            .sorted { $0.name < $1.name }
            .map { t in
                var sub = t.type ?? ""
                if let d = t.description, !d.isEmpty {
                    sub = sub.isEmpty ? d : "\(sub) — \(d)"
                }
                return PickOption(name: t.name, subtitle: sub)
            }
    }

    static func zones(_ project: ProjectData) -> [PickOption] {
        project.zones
            .sorted { $0.name < $1.name }
            .map { PickOption(name: $0.name, subtitle: $0.description) }
    }

    /// Trigger and variable `type` values. Sourced from what the reference
    /// container actually uses — the core TriggerDefinition/VariableDefinition
    /// types have drifted from the files the GTM importer produces, so the
    /// files are the authority here. An unrecognised value is preserved rather
    /// than silently coerced.
    static let triggerTypes = ["pageview", "click", "customEvent", "formSubmit", "init"]
    static let variableTypes = ["datalayer", "javascript", "constant"]

    static let consent: [PickOption] = [
        PickOption(name: "necessary", subtitle: "Always allowed — essential functionality"),
        PickOption(name: "analytics", subtitle: "Measurement and statistics"),
        PickOption(name: "marketing", subtitle: "Advertising and remarketing pixels"),
        PickOption(name: "preferences", subtitle: "Personalization"),
    ]
}
