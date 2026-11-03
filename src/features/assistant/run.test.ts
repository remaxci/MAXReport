import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorMessage, runAssistant, type AssistantEvent } from "./run";

// La boucle de l'assistant contre une fausse API (flux SSE au format de l'API
// Messages) : aucun appel réseau, aucune donnée réelle.

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
type Turn = { blocks: Block[]; stop: string; usage?: { input: number; output: number; cacheRead?: number } };

function sse(turn: Turn): string {
  const events: object[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: turn.usage?.input ?? 10, output_tokens: 1, cache_read_input_tokens: turn.usage?.cacheRead ?? 0 },
      },
    },
  ];
  turn.blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else {
      events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: turn.stop, stop_sequence: null }, usage: { output_tokens: turn.usage?.output ?? 5 } });
  events.push({ type: "message_stop" });
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

/** Fausse API : une réponse par appel, dans l'ordre ; garde les requêtes reçues. */
function fakeApi(turns: (Turn | { status: number })[]) {
  const requests: { headers: Headers; body: Record<string, unknown> }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const turn = turns[requests.length - 1];
    if (!turn) throw new Error("Appel inattendu");
    if ("status" in turn) {
      return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Trop de requêtes" } }), {
        status: turn.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(sse(turn), { headers: { "content-type": "text/event-stream" } });
  };
  return { client: new Anthropic({ apiKey: "cle-de-test", fetch, maxRetries: 0 }), requests };
}

function taskTool(calls: unknown[]) {
  return betaZodTool({
    name: "liste_taches",
    description: "Tâches de test.",
    inputSchema: z.object({ filtre: z.enum(["a_faire", "en_retard"]) }),
    run: async (input) => {
      calls.push(input);
      return JSON.stringify({ total: 2 });
    },
  });
}

const question = [{ role: "user" as const, content: "Quelles tâches sont en retard ?" }];

describe("boucle de l'assistant", () => {
  it("consulte un outil, puis transmet la réponse ; requête : modèle, effort, repli, consignes en cache", async () => {
    const { client, requests } = fakeApi([
      { blocks: [{ type: "tool_use", id: "toolu_1", name: "liste_taches", input: { filtre: "en_retard" } }], stop: "tool_use", usage: { input: 100, output: 20, cacheRead: 50 } },
      { blocks: [{ type: "text", text: "Deux tâches sont en retard." }], stop: "end_turn", usage: { input: 130, output: 12 } },
    ]);
    const calls: unknown[] = [];
    const events: AssistantEvent[] = [];
    const summary = await runAssistant({ client, system: "Consignes", tools: [taskTool(calls)], messages: question, emit: (e) => events.push(e) });

    expect(calls).toEqual([{ filtre: "en_retard" }]);
    expect(events).toEqual([
      { t: "status", label: "Lecture des tâches" },
      { t: "text", v: "Deux tâches sont en retard." },
      { t: "done" },
    ]);
    expect(summary).toEqual({ status: "ok", inputTokens: 280, outputTokens: 32, toolCalls: 1 });

    const first = requests[0];
    expect(first.body.model).toBe("claude-opus-5-5");
    expect(first.body.stream).toBe(true);
    expect(first.body.output_config).toEqual({ effort: "medium" });
    expect(first.body.fallbacks).toBe("default");
    expect(first.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(first.body.system).toEqual([{ type: "text", text: "Consignes", cache_control: { type: "ephemeral" } }]);
    expect(first.body.messages).toEqual(question);
    // Le résultat de l'outil revient au modèle au tour suivant.
    expect(JSON.stringify(requests[1].body.messages)).toContain('"tool_use_id":"toolu_1"');
    expect(JSON.stringify(requests[1].body.messages)).toContain('{\\"total\\":2}');
  });

  it("n'exécute pas un outil appelé avec des paramètres invalides : l'erreur est renvoyée au modèle", async () => {
    const { client, requests } = fakeApi([
      { blocks: [{ type: "tool_use", id: "toolu_1", name: "liste_taches", input: { filtre: "supprimer_tout" } }], stop: "tool_use" },
      { blocks: [{ type: "text", text: "Je ne peux pas." }], stop: "end_turn" },
    ]);
    const calls: unknown[] = [];
    await runAssistant({ client, system: "Consignes", tools: [taskTool(calls)], messages: question, emit: () => {} });
    expect(calls).toEqual([]);
    expect(JSON.stringify(requests[1].body.messages)).toContain('"is_error":true');
  });

  it("sépare le texte écrit avant un appel d'outil de la réponse finale", async () => {
    const { client } = fakeApi([
      {
        blocks: [
          { type: "text", text: "Je regarde." },
          { type: "tool_use", id: "toolu_1", name: "liste_taches", input: { filtre: "a_faire" } },
        ],
        stop: "tool_use",
      },
      { blocks: [{ type: "text", text: "Deux tâches." }], stop: "end_turn" },
    ]);
    let text = "";
    await runAssistant({ client, system: "Consignes", tools: [taskTool([])], messages: question, emit: (e) => (text += e.t === "text" ? e.v : "") });
    expect(text).toBe("Je regarde.\n\nDeux tâches.");
  });

  it("demande déclinée : s'arrête, sans exécuter d'outil", async () => {
    const { client, requests } = fakeApi([
      { blocks: [{ type: "tool_use", id: "toolu_1", name: "liste_taches", input: { filtre: "a_faire" } }], stop: "refusal" },
    ]);
    const calls: unknown[] = [];
    const events: AssistantEvent[] = [];
    const summary = await runAssistant({ client, system: "Consignes", tools: [taskTool(calls)], messages: question, emit: (e) => events.push(e) });
    expect(summary.status).toBe("refused");
    expect(events.at(-1)).toEqual({ t: "refused" });
    expect(calls).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("appel d'outil coupé par la limite de longueur : pas exécuté, message clair", async () => {
    const { client } = fakeApi([
      { blocks: [{ type: "tool_use", id: "toolu_1", name: "liste_taches", input: { filtre: "a_faire" } }], stop: "max_tokens" },
    ]);
    const calls: unknown[] = [];
    const error = await runAssistant({ client, system: "Consignes", tools: [taskTool(calls)], messages: question, emit: () => {} }).catch((e) => e);
    expect(calls).toEqual([]);
    expect(errorMessage(error)).toContain("longueur permise");
  });

  it("erreurs de l'API : messages en français, sans détail technique", async () => {
    const { client } = fakeApi([{ status: 429 }]);
    const error = await runAssistant({ client, system: "Consignes", tools: [taskTool([])], messages: question, emit: () => {} }).catch((e) => e);
    expect(errorMessage(error)).toBe("Le service d'IA est très sollicité : réessayez dans un instant.");
    expect(errorMessage(new Error("cle-de-test"))).toBe("Une erreur est survenue : réessayez.");
  });
});
