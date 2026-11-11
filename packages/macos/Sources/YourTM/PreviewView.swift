import SwiftUI

struct PreviewView: View {
    @EnvironmentObject var state: AppState

    @State private var events: [TelemetryEvent] = []
    @State private var streaming = false
    @State private var streamTask: Task<Void, Never>?
    @State private var filter = ""
    @State private var devServer: DevServerStatus?
    @State private var busy = false

    // Worker source
    @AppStorage("previewSource") private var sourceRaw = TelemetrySource.local.rawValue
    @AppStorage("previewWorkerURL") private var workerURL = ""
    @State private var workerReachable: Bool?
    @State private var sourceError: String?
    @State private var seenIDs = Set<String>()

    private var source: TelemetrySource {
        TelemetrySource(rawValue: sourceRaw) ?? .local
    }

    private var filtered: [TelemetryEvent] {
        guard !filter.isEmpty else { return events }
        return events.filter {
            $0.displayName.localizedCaseInsensitiveContains(filter)
                || ($0.error ?? "").localizedCaseInsensitiveContains(filter)
        }
    }

    /// Nearest-rank percentile — index is ceil(p/100 · n) − 1.
    ///
    /// Must match the worker's `percentile()` exactly, or the same data reads
    /// differently here than in production. The previous `Int(n * 0.95)` form
    /// overshot by one and returned the maximum at the sample sizes preview
    /// actually sees.
    private func percentile(_ sorted: [Double], _ p: Double) -> Double? {
        guard !sorted.isEmpty else { return nil }
        let rank = Int((p / 100 * Double(sorted.count)).rounded(.up))
        return sorted[min(max(rank - 1, 0), sorted.count - 1)]
    }

    /// Blocked tags never executed: they carry no latency and are not failures.
    /// Kept out of the rate and the latency population so the numbers here
    /// agree with the worker's.
    private var stats: (executions: Int, failed: Int, blocked: Int, avg: Double?, p95: Double?) {
        let blocked = events.filter { $0.isBlocked }.count
        let executed = events.filter { !$0.isBlocked }
        let failed = executed.filter { $0.success == false }.count
        let lats = executed.compactMap(\.latency).sorted()
        let avg = lats.isEmpty ? nil : lats.reduce(0, +) / Double(lats.count)
        return (executed.count, failed, blocked, avg, percentile(lats, 95))
    }

    var body: some View {
        VStack(spacing: 0) {
            sourceBar
            Divider()
            summaryBar
            Divider()
            eventTable
        }
        .navigationTitle("Preview")
        .toolbar { toolbarContent }
        .task { await loadInitial() }
        .onDisappear { stopStream() }
        .onChange(of: sourceRaw) { _, _ in
            Task { await switchSource() }
        }
    }

    // MARK: Source selector

    private var sourceBar: some View {
        HStack(spacing: 10) {
            Picker("", selection: $sourceRaw) {
                ForEach(TelemetrySource.allCases) { s in
                    Text(s.title).tag(s.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 260)
            .help(source.help)

            if source == .worker {
                Circle()
                    .fill(workerReachable == true ? .green : (workerReachable == false ? .red : .secondary))
                    .frame(width: 8, height: 8)
                TextField("https://dev.yoursite.com", text: $workerURL)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout.monospaced())
                    .frame(maxWidth: 320)
                    .onSubmit { Task { await switchSource() } }
                Button("Connect") { Task { await switchSource() } }
                    .controlSize(.small)
            } else {
                Text(source.help)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let sourceError {
                Label(sourceError, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.quaternary.opacity(0.3))
    }

    private var summaryBar: some View {
        HStack(spacing: 24) {
            summaryItem("Executions", "\(stats.executions)", .primary)
            summaryItem("Failures", "\(stats.failed)", stats.failed > 0 ? .red : .green)
            summaryItem("Blocked", "\(stats.blocked)", stats.blocked > 0 ? .orange : .secondary)
            summaryItem("Avg Latency", stats.avg.map { String(format: "%.1f ms", $0) } ?? "—", .primary)
            summaryItem("P95", stats.p95.map { String(format: "%.1f ms", $0) } ?? "—",
                        (stats.p95 ?? 0) > 100 ? .orange : .primary)
            Spacer()
            devServerControl
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.bar)
    }

    private func summaryItem(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.title3.bold()).monospacedDigit().foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private var devServerControl: some View {
        HStack(spacing: 8) {
            if let ds = devServer {
                Circle()
                    .fill(ds.running ? .green : .secondary)
                    .frame(width: 8, height: 8)
                Text(ds.running ? "Dev server :\(ds.port ?? 3456)" : "Dev server stopped")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button(ds.running ? "Stop" : "Start") {
                    Task { await toggleDevServer() }
                }
                .controlSize(.small)
                .disabled(busy)
            }
        }
    }

    private var eventTable: some View {
        Table(filtered.reversed()) {
            TableColumn("Time") { e in
                Text(e.date, format: .dateTime.hour().minute().second())
                    .monospacedDigit()
            }
            .width(80)

            TableColumn("Tag") { e in
                HStack(spacing: 6) {
                    Image(systemName: e.success == false ? "xmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(e.success == false ? .red : .green)
                    Text(e.displayName)
                }
            }
            .width(min: 180)

            TableColumn("Latency") { e in
                if let lat = e.latency {
                    Text(String(format: "%.1f ms", lat))
                        .monospacedDigit()
                        .foregroundStyle(lat > 100 ? .orange : .primary)
                } else {
                    Text("—").foregroundStyle(.secondary)
                }
            }
            .width(90)

            TableColumn("Trigger") { e in
                Text(e.trigger ?? "—").foregroundStyle(.secondary)
            }
            .width(140)

            TableColumn("Page / Error") { e in
                if let err = e.error {
                    Text(err).foregroundStyle(.red).lineLimit(1)
                } else {
                    Text(e.pageUrl ?? "").foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .overlay {
            if events.isEmpty {
                ContentUnavailableView {
                    Label("No telemetry yet", systemImage: "dot.radiowaves.left.and.right")
                } description: {
                    Text(source == .local
                         ? "Load a page that beacons to this Mac.\nBrowsers block public HTTPS pages from reaching localhost — for a hosted site, switch to Worker."
                         : "Polling the worker every 5s. Load a page on the site that includes the container script.\nZero events usually means the runtime isn't on the page yet.")
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup {
            TextField("Filter", text: $filter)
                .textFieldStyle(.roundedBorder)
                .frame(width: 160)

            Button {
                streaming ? stopStream() : startStream()
            } label: {
                Label(streaming ? "Stop" : "Go Live",
                      systemImage: streaming ? "stop.circle" : "play.circle")
            }
            .tint(streaming ? .red : .green)

            Button {
                events.removeAll()
                seenIDs.removeAll()
            } label: {
                Label("Clear", systemImage: "trash")
            }
        }
    }

    private func loadInitial() async {
        devServer = state.devServer.status
        if source == .local {
            ingest(state.telemetry.events)
            sourceError = state.telemetry.listenError
        }
        startStream()
    }

    /// Swap data sources: stop whatever is running, clear, restart.
    private func switchSource() async {
        stopStream()
        events.removeAll()
        seenIDs.removeAll()
        sourceError = nil
        workerReachable = nil

        if source == .worker {
            guard !workerURL.trimmingCharacters(in: .whitespaces).isEmpty else {
                sourceError = "Enter the worker URL"
                return
            }
            workerReachable = await WorkerClient(baseURL: workerURL).health()
        } else {
            ingest(state.telemetry.events)
            sourceError = state.telemetry.listenError
        }
        startStream()
    }

    /// Append only events we haven't shown yet (worker polling re-sends the
    /// whole recent window each time).
    private func ingest(_ incoming: [TelemetryEvent]) {
        let fresh = incoming.filter { seenIDs.insert($0.id).inserted }
        guard !fresh.isEmpty else { return }
        events.append(contentsOf: fresh)
        if events.count > 1000 { events.removeFirst(events.count - 1000) }
    }

    private func startStream() {
        guard !streaming else { return }
        streaming = true
        streamTask = source == .local ? localStreamTask() : workerPollTask()
    }

    /// This Mac: events pushed straight from the app's own receiver.
    private func localStreamTask() -> Task<Void, Never> {
        Task {
            for await event in state.telemetry.stream() {
                if Task.isCancelled { break }
                ingest([event])
            }
            streaming = false
        }
    }

    /// Worker: the Durable Object has no push channel, so poll it.
    ///
    /// Every poll is a billable Worker request (and, on a cache miss, a Durable
    /// Object request), so this stays modest: every 5 s, matching the worker's
    /// read cache, and not at all while no YourTM window is on screen. A window
    /// visible behind the browser keeps polling, which is how this is used.
    private func workerPollTask() -> Task<Void, Never> {
        Task {
            let client = WorkerClient(baseURL: workerURL)
            while !Task.isCancelled {
                if !NSApplication.shared.occlusionState.contains(.visible) {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    continue
                }
                do {
                    ingest(try await client.events())
                    workerReachable = true
                    sourceError = nil
                } catch {
                    workerReachable = false
                    sourceError = error.localizedDescription
                }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
            streaming = false
        }
    }

    private func stopStream() {
        streamTask?.cancel()
        streamTask = nil
        streaming = false
    }

    private func toggleDevServer() async {
        busy = true
        defer { busy = false }
        if state.devServer.running {
            state.devServer.stop()
        } else {
            await state.devServer.start(projectPath: state.projectPath,
                                        containerId: state.settings.project?.containerId ?? "")
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        devServer = state.devServer.status
        if let err = state.devServer.lastError { sourceError = err }
    }
}
