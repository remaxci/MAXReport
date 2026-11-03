import Anthropic from "@anthropic-ai/sdk";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { ASSISTANT_MODEL, assistantConfig, startOfDay } from "./config";
import { requestSchema, systemPrompt } from "./conversation";
import { errorMessage, runAssistant, type AssistantEvent, type RunSummary } from "./run";
import { assistantTools } from "./tools";

// Réponse de l'assistant à une question, transmise au fil de l'eau (une ligne
// JSON par événement). Contrôles côté serveur : session, marque lisible, quota
// quotidien de la personne, conversation bien formée. Chaque question est
// consignée (modèle, statut, jetons) pour suivre l'usage et le coût.

/** 10 questions de 4 000 caractères et 10 réponses de 16 000 au plus, avec une marge pour le JSON. */
const MAX_BODY = 250_000;

const json = (message: string, status: number) => Response.json({ error: message }, { status });

export async function respond(request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) return json("Page introuvable.", 404);
  if (!can(ctx.access, "brand.read", brand.id)) return json("Accès refusé.", 403);

  // Requêtes de l'application seulement : un autre site ne peut pas poser de question à la place de la personne.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json("Accès refusé.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json("Requête invalide.", 415);

  const config = assistantConfig(process.env);
  if (!config.enabled) return json("L'assistant n'est pas encore en service.", 503);

  const body = await request.text();
  if (body.length > MAX_BODY) return json("Conversation trop longue : recommencez une nouvelle conversation.", 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json("Requête invalide.", 400);
  }
  const conversation = requestSchema.safeParse(parsed);
  if (!conversation.success) return json(conversation.error.issues[0]?.message ?? "Requête invalide.", 400);

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("assistant_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .gte("created_at", startOfDay());
  if (error) {
    console.error("assistant: quota", error.message);
    return json("Une erreur est survenue : réessayez.", 500);
  }
  if ((count ?? 0) >= config.dailyLimit) {
    return json(`Limite de ${config.dailyLimit} questions par jour atteinte : réessayez demain.`, 429);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Navigateur déjà déconnecté : la question est interrompue par le signal.
        }
      };
      let summary: RunSummary = { status: "error", inputTokens: 0, outputTokens: 0, toolCalls: 0 };
      try {
        const today = todayIso();
        summary = await runAssistant({
          client: new Anthropic({ apiKey: config.apiKey, maxRetries: 2 }),
          system: systemPrompt(brand, today),
          tools: assistantTools({ ctx, brand, today }),
          messages: conversation.data.messages,
          emit,
          signal: request.signal,
        });
      } catch (error) {
        console.error("assistant:", error instanceof Error ? `${error.name} ${error.message}` : error);
        emit({ t: "error", message: errorMessage(error) });
      }
      const logged = await supabase.from("assistant_usage").insert({
        brand_id: brand.id,
        model: ASSISTANT_MODEL,
        status: summary.status,
        input_tokens: summary.inputTokens,
        output_tokens: summary.outputTokens,
        tool_calls: summary.toolCalls,
      });
      if (logged.error) console.error("assistant: journal", logged.error.message);
      try {
        controller.close();
      } catch {
        // Déjà fermé.
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
