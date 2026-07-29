import Foundation

/// One place an asset is referenced from.
struct Reference: Identifiable, Hashable {
    var assetName: String
    var kind: AssetKind
    /// How it's used, e.g. "trigger", "blocking trigger", "zone", "in code"
    var role: String
    var id: String { "\(kind.rawValue):\(assetName):\(role)" }
}

/// Answers "what would break if I delete this?" by scanning the whole container.
struct ReferenceIndex {
    let project: ProjectData

    /// Everything referencing the given asset.
    func references(to asset: Asset, kind: AssetKind) -> [Reference] {
        switch kind {
        case .triggers: return triggerRefs(asset.name)
        case .zones: return zoneRefs(asset.name)
        case .variables: return variableRefs(asset.name)
        case .tags: return []   // nothing references a tag
        }
    }

    // MARK: Per-kind scans

    private func triggerRefs(_ name: String) -> [Reference] {
        var out: [Reference] = []
        for tag in project.tags {
            if tag.triggers.contains(name) {
                out.append(Reference(assetName: tag.name, kind: .tags, role: "fires on it"))
            }
            if tag.blocking.contains(name) {
                out.append(Reference(assetName: tag.name, kind: .tags, role: "blocked by it"))
            }
        }
        return out
    }

    private func zoneRefs(_ name: String) -> [Reference] {
        project.tags
            .filter { $0.zones.contains(name) }
            .map { Reference(assetName: $0.name, kind: .tags, role: "in this zone") }
    }

    private func variableRefs(_ name: String) -> [Reference] {
        let token = "{{\(name)}}"
        var out: [Reference] = []

        for tag in project.tags where (tag.code ?? "").contains(token) {
            out.append(Reference(assetName: tag.name, kind: .tags, role: "used in code"))
        }
        // Variables can reference other variables in their own JS
        for v in project.variables where v.name != name {
            let body = (v.code ?? "") + (v.value ?? "")
            if body.contains(token) {
                out.append(Reference(assetName: v.name, kind: .variables, role: "used in code"))
            }
        }
        // Triggers reference variables by bare name in their conditions:
        // conditions: [{ variable: "page-url", operator: ..., value: ... }]
        for t in project.triggers {
            guard case .array(let conds)? = t.extra["conditions"] else { continue }
            let matches = conds.contains { cond in
                if case .object(let o) = cond, case .string(let v)? = o["variable"] {
                    return v == name
                }
                return false
            }
            if matches {
                out.append(Reference(assetName: t.name, kind: .triggers, role: "in a condition"))
            }
        }
        return out
    }
}
