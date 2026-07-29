import Foundation

/// A complete tag configuration produced (and iteratively refined) by the AI.
struct TagDraft: Codable, Equatable {
    var name: String
    var description: String
    var code: String
    var triggers: [String]
    var zones: [String]
    var consent: [String]

    static let empty = TagDraft(name: "", description: "", code: "", triggers: [], zones: [], consent: [])
}

/// AI client for tag code generation/modification. Raw HTTP (no Swift SDK).
/// Routes by key: Anthropic (claude-opus-5) when an sk-ant key is set,
/// otherwise OpenAI. Anthropic is preferred when both exist.
struct AIService {
    var anthropicKey: String
    var openaiKey: String

    enum AIError: LocalizedError {
        case noKey
        case badKey(String)
        case http(Int, String)
        case refusal(String?)
        case empty

        var errorDescription: String? {
            switch self {
            case .noKey:
                return "No API key configured. Add an Anthropic or OpenAI key in Settings."
            case .badKey(let hint):
                return "The configured key doesn't look like an API key (\(hint)…). Paste the secret key itself, not its name."
            case .http(let code, let body):
                return "AI API error (HTTP \(code)): \(body.prefix(300))"
            case .refusal(let why):
                return "The model declined this request\(why.map { ": \($0)" } ?? ".")"
            case .empty:
                return "The model returned no code."
            }
        }
    }

    private static let systemPrompt = """
    You are the code assistant inside YourTM, a tag management platform. You write and modify \
    JavaScript tag code that runs on customers' websites.

    OUTPUT FORMAT — ABSOLUTE RULES:
    - Output ONLY raw JavaScript code. No markdown fences, no explanations, no commentary, \
    no leading or trailing prose. Your entire response is placed verbatim into a code editor.
    - Wrap the tag in an IIFE: (function() { ... })();
    - Guard against double-loading when injecting third-party scripts (e.g. if (window.gtag) return;).
    - Write ES5-compatible JavaScript (var, function expressions) — tags run on arbitrary sites.
    - Reference YourTM container variables with double-brace syntax, e.g. '{{ga4-stream}}'. \
    Prefer an existing variable from the provided list over hardcoding a value the user gave, \
    ONLY when one clearly matches; otherwise inline the literal value the user supplied.
    - When modifying existing code, return the COMPLETE updated code, not a diff or fragment.
    - Load external scripts asynchronously (script.async = true) and never use document.write.
    """

    /// Sends the user's request plus editor context; returns the new code.
    func generateCode(
        request: String,
        currentCode: String,
        tagName: String,
        triggers: [String],
        variables: [String]
    ) async throws -> String {
        let context = """
        Tag: \(tagName)
        Triggers: \(triggers.isEmpty ? "(none)" : triggers.joined(separator: ", "))
        Available container variables (reference as {{name}}): \(variables.joined(separator: ", "))

        Current code in the editor:
        \(currentCode.isEmpty ? "(empty)" : currentCode)

        Request: \(request)
        """

        let text: String
        if anthropicKey.hasPrefix("sk-ant") {
            text = try await callClaude(context)
        } else if !openaiKey.isEmpty {
            text = try await callOpenAI(context)
        } else if anthropicKey.isEmpty {
            throw AIError.noKey
        } else {
            // Something is in the Anthropic field but it isn't an Anthropic key
            throw AIError.badKey(String(anthropicKey.prefix(10)))
        }

        let code = Self.stripFences(text).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { throw AIError.empty }
        return code
    }

    // MARK: Full tag drafting (structured output)

    private static let draftSystemPrompt = """
    You configure complete tags for YourTM, a tag management platform. Given a user's \
    description, you produce the ENTIRE tag: its name, description, JavaScript code, and \
    which triggers, zones, and consent categories apply.

    You respond with a JSON object only (this is enforced by the output schema):
    {"name", "description", "code", "triggers", "zones", "consent"}

    FIELD RULES:
    - name: short kebab-case identifier (e.g. "hotjar-tracking", "ga4-scroll-event"). \
    If the user's request implies a vendor or purpose, name it accordingly. Keep the \
    current draft's name if it already has a sensible one.
    - description: one concise sentence.
    - triggers: choose ONLY from the provided trigger list — pick the trigger(s) whose \
    firing behavior matches when the user wants the tag to run. If nothing matches well, \
    pick the closest and mention the mismatch in the description.
    - zones: choose ONLY from the provided zone list. Default to "global" unless the \
    user's request clearly matches a more specific zone.
    - consent: choose from: necessary, analytics, marketing, preferences. Advertising/\
    remarketing pixels (Meta, LinkedIn, Microsoft Ads, TikTok…) → ["marketing"]. Pure \
    analytics → ["analytics"] only if the user asks for consent gating; this project \
    leaves analytics ungated by default, so use [] unless clearly marketing.
    - This is an ITERATIVE conversation: a current draft is provided. Apply the user's \
    request as a refinement — keep fields they didn't ask to change.

    CODE RULES:
    - Raw JavaScript, wrapped in an IIFE: (function() { ... })();
    - Guard against double-loading injected scripts (if (window.x) return;).
    - ES5-compatible (var, function expressions).
    - Reference container variables as '{{name}}' ONLY when one from the provided list \
    clearly matches; otherwise inline literal values from the user's request.
    - Load external scripts with script.async = true; never document.write.
    """

    private static let draftSchema: [String: Any] = [
        "type": "object",
        "properties": [
            "name": ["type": "string"],
            "description": ["type": "string"],
            "code": ["type": "string"],
            "triggers": ["type": "array", "items": ["type": "string"]],
            "zones": ["type": "array", "items": ["type": "string"]],
            "consent": ["type": "array", "items": ["type": "string"]],
        ],
        "required": ["name", "description", "code", "triggers", "zones", "consent"],
        "additionalProperties": false,
    ] as [String: Any]

    /// Produce or refine a complete tag draft from a natural-language request.
    func generateTagDraft(
        request: String,
        draft: TagDraft,
        triggerInfo: [String],
        zoneInfo: [String],
        variables: [String]
    ) async throws -> TagDraft {
        let draftJSON = (try? String(data: JSONEncoder().encode(draft), encoding: .utf8)) ?? "{}"
        let context = """
        Available triggers (name — behavior):
        \(triggerInfo.joined(separator: "\n"))

        Available zones:
        \(zoneInfo.joined(separator: "\n"))

        Available container variables (reference as {{name}}): \(variables.joined(separator: ", "))

        Current draft:
        \(draftJSON)

        Request: \(request)
        """

        let text: String
        if anthropicKey.hasPrefix("sk-ant") {
            text = try await callClaude(context,
                                        system: AIService.draftSystemPrompt,
                                        schema: AIService.draftSchema)
        } else if !openaiKey.isEmpty {
            text = try await callOpenAI(context,
                                        system: AIService.draftSystemPrompt,
                                        schema: AIService.draftSchema)
        } else if anthropicKey.isEmpty {
            throw AIError.noKey
        } else {
            throw AIError.badKey(String(anthropicKey.prefix(10)))
        }

        let json = Self.stripFences(text).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = json.data(using: .utf8),
              var result = try? JSONDecoder().decode(TagDraft.self, from: data) else {
            throw AIError.empty
        }
        result.name = result.name
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return result
    }

    // MARK: Anthropic (claude-opus-5)

    private func callClaude(
        _ context: String,
        system: String = AIService.systemPrompt,
        schema: [String: Any]? = nil
    ) async throws -> String {
        var body: [String: Any] = [
            "model": "claude-opus-5",
            "max_tokens": 16000,
            "system": system,
            "messages": [["role": "user", "content": context]],
        ]
        if let schema {
            body["output_config"] = ["format": ["type": "json_schema", "schema": schema]]
        }

        var req = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 600
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anthropicKey, forHTTPHeaderField: "x-api-key")
        req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            throw AIError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }

        struct Response: Codable {
            struct Block: Codable {
                var type: String
                var text: String?
            }
            struct StopDetails: Codable { var explanation: String? }
            var content: [Block]
            var stop_reason: String?
            var stop_details: StopDetails?
        }

        let decoded = try JSONDecoder().decode(Response.self, from: data)

        // Check refusal BEFORE reading content (Claude Opus 5 safety classifiers)
        if decoded.stop_reason == "refusal" {
            throw AIError.refusal(decoded.stop_details?.explanation)
        }

        return decoded.content
            .filter { $0.type == "text" }
            .compactMap(\.text)
            .joined()
    }

    // MARK: OpenAI (chat completions)

    private func callOpenAI(
        _ context: String,
        system: String = AIService.systemPrompt,
        schema: [String: Any]? = nil
    ) async throws -> String {
        // Try the current flagship first; fall back if the account lacks access.
        do {
            return try await openAIRequest(model: "gpt-5", context: context, system: system, schema: schema)
        } catch AIError.http(let code, let body)
            where (code == 404 || code == 400) && body.contains("model") {
            return try await openAIRequest(model: "gpt-4o", context: context, system: system, schema: schema)
        }
    }

    private func openAIRequest(
        model: String,
        context: String,
        system: String,
        schema: [String: Any]?
    ) async throws -> String {
        var body: [String: Any] = [
            "model": model,
            "messages": [
                ["role": "system", "content": system],
                ["role": "user", "content": context],
            ],
        ]
        if let schema {
            body["response_format"] = [
                "type": "json_schema",
                "json_schema": ["name": "tag_draft", "strict": true, "schema": schema],
            ]
        }

        var req = URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 600
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(openaiKey)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            throw AIError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }

        struct Response: Codable {
            struct Choice: Codable {
                struct Message: Codable { var content: String? }
                var message: Message
            }
            var choices: [Choice]
        }

        let decoded = try JSONDecoder().decode(Response.self, from: data)
        return decoded.choices.first?.message.content ?? ""
    }

    /// Defensive: strip markdown fences if the model includes them despite instructions.
    static func stripFences(_ text: String) -> String {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("```") {
            // drop first line (``` or ```javascript)
            if let firstNewline = t.firstIndex(of: "\n") {
                t = String(t[t.index(after: firstNewline)...])
            }
            if let closing = t.range(of: "```", options: .backwards) {
                t = String(t[..<closing.lowerBound])
            }
        }
        return t
    }
}
