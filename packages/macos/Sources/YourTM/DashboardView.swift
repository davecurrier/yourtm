import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                statGrid
                if !state.project.errors.isEmpty || !state.project.warnings.isEmpty {
                    issuesSection
                }
                tagsByTrigger
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Dashboard")
        .toolbar {
            Button {
                Task { await state.refresh() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(state.containerName).font(.largeTitle).bold()
            HStack(spacing: 8) {
                Text(state.containerId)
                    .font(.callout.monospaced())
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 5))
                Text(state.projectPath)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }

    private var statGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: 4), spacing: 14) {
            StatTile(title: "Tags", value: state.project.tags.count, symbol: "tag", tint: .purple)
            StatTile(title: "Triggers", value: state.project.triggers.count, symbol: "bolt", tint: .orange)
            StatTile(title: "Variables", value: state.project.variables.count, symbol: "curlybraces", tint: .teal)
            StatTile(title: "Zones", value: state.project.zones.count, symbol: "square.grid.2x2", tint: .indigo)
        }
    }

    private var issuesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Issues").font(.title3).bold()
            ForEach(Array(state.project.errors.enumerated()), id: \.offset) { _, e in
                Label(e.displayString, systemImage: "xmark.octagon.fill")
                    .foregroundStyle(.red)
            }
            ForEach(Array(state.project.warnings.enumerated()), id: \.offset) { _, w in
                Label(w.displayString, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private var tagsByTrigger: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tags by Trigger").font(.title3).bold()
            let groups = Dictionary(grouping: state.project.tags.flatMap { tag in
                tag.triggers.map { ($0, tag.name) }
            }, by: \.0).mapValues { $0.map(\.1) }

            ForEach(groups.keys.sorted(), id: \.self) { trigger in
                DisclosureGroup {
                    ForEach(groups[trigger] ?? [], id: \.self) { tag in
                        Label(tag, systemImage: "tag")
                            .font(.callout)
                            .padding(.leading, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } label: {
                    HStack {
                        Label(trigger, systemImage: "bolt").font(.callout.bold())
                        Spacer()
                        Text("\(groups[trigger]?.count ?? 0) tags")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct StatTile: View {
    let title: String
    let value: Int
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(tint)
            Text("\(value)")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}
