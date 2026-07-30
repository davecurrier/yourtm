import SwiftUI

/// Editor for a trigger's or zone's firing conditions.
///
/// Conditions are the substance of a trigger the way `code` is the substance of
/// a tag — everything else on the screen is metadata. They were previously shown
/// as read-only grey text, which made triggers look editable while the only
/// editable parts were the fields nobody needs.
///
/// Both vocabularies are closed and known, so both are pickers rather than free
/// text: operators come from `TriggerCondition` in the runtime, and variables
/// from the container plus the built-ins the runtime resolves.
struct ConditionsEditor: View {
    @Binding var conditions: [AssetCondition]
    let project: ProjectData

    /// Built-ins `builtinVar()` in packages/runtime/src/triggers.ts resolves.
    /// Element-scoped ones only have a value during a click or form submit.
    private static let builtins = [
        "page-url", "page-hostname", "page-path", "referrer",
        "click-element", "click-classes", "click-id", "click-url", "click-text",
        "form-element", "form-classes", "form-id",
    ]

    private var variableNames: [String] {
        let container = project.variables.map(\.id).sorted()
        return Self.builtins + container.filter { !Self.builtins.contains($0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach($conditions) { $condition in
                HStack(spacing: 6) {
                    Picker("", selection: $condition.variable) {
                        // Preserve a name that is neither a built-in nor a
                        // current container variable instead of silently
                        // rewriting the asset to the first entry.
                        if !variableNames.contains(condition.variable) {
                            Text(condition.variable.isEmpty ? "choose variable" : condition.variable)
                                .tag(condition.variable)
                        }
                        ForEach(variableNames, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                    .frame(width: 170)

                    Picker("", selection: $condition.op) {
                        ForEach(AssetCondition.Operator.allCases) { Text($0.label).tag($0) }
                    }
                    .labelsHidden()
                    .frame(width: 130)

                    if condition.op.takesValue {
                        TextField("value", text: $condition.value)
                            .textFieldStyle(.roundedBorder)
                    } else {
                        Text("— no value needed —")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        conditions.removeAll { $0.id == condition.id }
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
                    .help("Remove this condition")
                }
            }

            HStack(spacing: 8) {
                Button {
                    conditions.append(AssetCondition(variable: variableNames.first ?? ""))
                } label: {
                    Label("Add Condition", systemImage: "plus.circle")
                }
                .buttonStyle(.borderless)

                if conditions.count > 1 {
                    Text("all conditions must match")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if conditions.isEmpty {
                Text("No conditions — fires every time its type occurs.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
