import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { ASSISTANT_MODEL } from "./config";
import type { ConversationMessage } from "./conversation";

// Une réponse de l'assistant : Claude consulte les outils (lecture seule) autant
// que nécessaire, dans une limite d'itérations, et la réponse est transmise au
// fil de l'eau. L'historique ne contient que les textes échangés : aucun
// raisonnement interne n'est rejoué d'une question à l'autre.

export type AssistantEvent =
  | { t: "status"; label: string }
  | { t: "text"; v: string }
  | { t: "refused" }
  | { t: "done" }
  | { t: "error"; message: string };

export type RunSummary = { status: "ok" | "refused" | "error"; inputTokens: number; outputTokens: number; toolCalls: number };

/** Libellés (outils de tools.ts) montrés pendant que l'assistant consulte les données. */
export const TOOL_LABELS: Record<string, string> = {
  tableau_de_bord: "Lecture du tableau de bord",
  serie_indicateur: "Calcul d'une tendance",
  liste_documents: "Lecture des offres et mémos",
  liste_taches: "Lecture des tâches",
  pipeline: "Lecture du pipeline",
};

/** Au plus 8 allers-retours avec les outils par question : borne le temps et le coût. */
const MAX_ITERATIONS = 8;

class TruncatedToolInput extends Error {}

export async function runAssistant(input: {
  client: Anthropic;
  system: string;
  tools: BetaRunnableTool[];
  messages: ConversationMessage[];
  emit: (event: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<RunSummary> {
  const summary: RunSummary = { status: "ok", inputTokens: 0, outputTokens: 0, toolCalls: 0 };

  const runner = input.client.beta.messages.toolRunner(
    {
      model: ASSISTANT_MODEL,
      max_tokens: 32000,
      max_iterations: MAX_ITERATIONS,
      // Réflexion toujours active sur ce modèle ; « medium » suffit pour répondre à des questions.
      output_config: { effort: "medium" },
      // Si le modèle décline une demande, l'API la confie à un autre modèle (repli côté serveur).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
      tools: input.tools,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    },
    { signal: input.signal },
  );

  let wroteText = false;
  for await (const messageStream of runner) {
    let separated = false;
    for await (const event of messageStream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        summary.toolCalls += 1;
        input.emit({ t: "status", label: TOOL_LABELS[event.content_block.name] ?? "Lecture des données" });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        // Un texte écrit avant un nouvel appel d'outils et celui de la réponse finale restent séparés.
        if (wroteText && !separated) input.emit({ t: "text", v: "\n\n" });
        separated = true;
        wroteText = true;
        input.emit({ t: "text", v: event.delta.text });
      }
    }
    const message = await messageStream.finalMessage();
    summary.inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
    summary.outputTokens += message.usage.output_tokens;
    // Une demande déclinée (même après le repli) : on s'arrête sans exécuter d'outil.
    if (message.stop_reason === "refusal") {
      summary.status = "refused";
      input.emit({ t: "refused" });
      return summary;
    }
    // Un appel d'outil coupé par la limite de longueur peut paraître valide : on ne l'exécute pas.
    if (message.stop_reason === "max_tokens" && message.content.some((b) => b.type === "tool_use")) {
      throw new TruncatedToolInput("Réponse trop longue pendant un appel d'outil.");
    }
  }
  input.emit({ t: "done" });
  return summary;
}

/** Message affichable pour une erreur de l'API ou de la boucle (jamais de détail technique ni de clé). */
export function errorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "Le service d'IA refuse la configuration actuelle : un administrateur doit vérifier la clé d'API.";
  }
  if (error instanceof Anthropic.RateLimitError) return "Le service d'IA est très sollicité : réessayez dans un instant.";
  if (error instanceof Anthropic.APIUserAbortError) return "Question interrompue.";
  if (error instanceof Anthropic.APIError) return "Le service d'IA est momentanément indisponible : réessayez plus tard.";
  if (error instanceof TruncatedToolInput) return "La réponse a dépassé la longueur permise : reformulez la question plus précisément.";
  return "Une erreur est survenue : réessayez.";
}
