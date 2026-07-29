import SwiftUI

/// AI side panel: the user describes what they need; Claude's answer is
/// written straight into the code editor binding — the panel never chats back.
struct AIAssistPanel: View {
    @EnvironmentObject var state: AppState

    @Binding var code: String
    let tagName: String
    let triggers: [String]

    @State private var prompt = ""
    @State private var busy = false
    @State private var error: String?
    @State private var history: [HistoryItem] = []
    @State private var preAISnapshot: String?
    @FocusState private var promptFocused: Bool

    struct HistoryItem: Identifiable {
        let id = UUID()
        let prompt: String
        let ok: Bool
    }

    private var anthropicKey: String { state.settings.ai?.anthropicApiKey ?? "" }
    private var openaiKey: String { state.settings.ai?.openaiApiKey ?? "" }
    private var hasKey: Bool { !anthropicKey.isEmpty || !openaiKey.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            historyList
            Divider()
            inputArea
        }
        .background(.quaternary.opacity(0.3))
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles")
                .foregroundStyle(.purple)
            Text("AI Assist").font(.headline)
            Spacer()
            if preAISnapshot != nil {
                Button {
                    if let snap = preAISnapshot {
                        code = snap
                        preAISnapshot = nil
                        state.showToast("AI edit undone")
                    }
                } label: {
                    Label("Undo AI Edit", systemImage: "arrow.uturn.backward")
                        .font(.caption)
                }
                .controlSize(.small)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var historyList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if history.isEmpty && !busy {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Describe what you need — the code editor updates directly.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        Text("**Try:**\n• \"I need a tag for GA4 ID G-ABC123\"\n• \"Add a purchase event using {{data-layer-sales-cycle}}\"\n• \"Guard this so it never runs twice\"")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.top, 4)
                }
                ForEach(history) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: item.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(item.ok ? .green : .red)
                            .font(.caption)
                            .padding(.top, 2)
                        Text(item.prompt)
                            .font(.callout)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(8)
                    .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 6))
                }
                if busy {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Writing code…").font(.callout).foregroundStyle(.secondary)
                    }
                    .padding(.top, 2)
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .textSelection(.enabled)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var inputArea: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !hasKey {
                Label("Add an Anthropic or OpenAI API key in Settings to enable AI Assist.",
                      systemImage: "key")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            TextEditor(text: $prompt)
                .font(.body)
                .focused($promptFocused)
                .frame(minHeight: 54, maxHeight: 110)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(.background, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.quaternary))
                .overlay(alignment: .topLeading) {
                    if prompt.isEmpty {
                        Text("I need a tag for…")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .allowsHitTesting(false)
                    }
                }
            HStack {
                Text("⌘⏎ to send").font(.caption2).foregroundStyle(.tertiary)
                Spacer()
                Button {
                    Task { await run() }
                } label: {
                    Label("Generate", systemImage: "sparkles")
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .disabled(busy || !hasKey
                          || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(12)
    }

    private func run() async {
        let request = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty else { return }
        busy = true
        error = nil
        defer { busy = false }

        let service = AIService(anthropicKey: anthropicKey, openaiKey: openaiKey)
        do {
            let newCode = try await service.generateCode(
                request: request,
                currentCode: code,
                tagName: tagName,
                triggers: triggers,
                variables: state.project.variables.map(\.name)
            )
            preAISnapshot = code
            code = newCode
            history.append(HistoryItem(prompt: request, ok: true))
            prompt = ""
            promptFocused = true
        } catch {
            self.error = error.localizedDescription
            history.append(HistoryItem(prompt: request, ok: false))
        }
    }
}
