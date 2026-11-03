"use client";

import { RotateCcw, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { textareaClass } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MAX_ANSWER_LENGTH, MAX_MESSAGE_LENGTH, trimConversation, type ConversationMessage } from "../conversation";
import type { AssistantEvent } from "../run";

// Conversation avec l'assistant. L'historique reste dans l'onglet (sessionStorage) :
// MAXreport ne conserve ni les questions ni les réponses.

type Message = ConversationMessage & { interrupted?: boolean };

const GENERIC_ERROR = "Une erreur est survenue : réessayez.";

function loadHistory(key: string): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? saved.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, messages: Message[]) {
  try {
    if (messages.length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(messages));
  } catch {
    // Stockage indisponible (navigation privée…) : l'historique ne survit pas au rechargement.
  }
}

/** Texte simple ; seuls les passages **en gras** sont mis en forme. */
function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
  return <>{parts}</>;
}

export function AssistantChat({
  endpoint,
  storageKey,
  examples,
  remaining: initialRemaining,
}: {
  endpoint: string;
  storageKey: string;
  examples: string[];
  remaining: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const pending = answer !== null;

  useEffect(() => {
    // L'historique de l'onglet n'existe que dans le navigateur : lu après le premier rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadHistory(storageKey));
    return () => abort.current?.abort();
  }, [storageKey]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, answer]);

  function update(next: Message[]) {
    setMessages(next);
    saveHistory(storageKey, next);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Question trop longue : ${MAX_MESSAGE_LENGTH} caractères au plus.`);
      return;
    }
    const history: Message[] = [...messages, { role: "user", content: text }];
    update(history);
    setDraft("");
    setError(null);
    setAnswer("");
    setStatus("Réflexion…");
    const controller = new AbortController();
    abort.current = controller;

    let received = "";
    let outcome: "done" | "refused" | "error" | "aborted" = "error";
    let failure = GENERIC_ERROR;
    try {
      const sent = trimConversation(history).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_ANSWER_LENGTH) }));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: sent }),
        signal: controller.signal,
      });
      if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        failure = data?.error ?? (response.redirected ? "Session expirée : reconnectez-vous." : GENERIC_ERROR);
      } else {
        setRemaining((r) => Math.max(0, r - 1));
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as AssistantEvent;
            if (event.t === "status") setStatus(event.label);
            else if (event.t === "text") {
              received += event.v;
              setStatus(null);
              setAnswer(received);
            } else if (event.t === "done") outcome = "done";
            else if (event.t === "refused") outcome = "refused";
            else if (event.t === "error") failure = event.message;
          }
        }
      }
    } catch {
      outcome = controller.signal.aborted ? "aborted" : "error";
    }
    abort.current = null;
    setAnswer(null);
    setStatus(null);

    const kept = received.trim();
    if (outcome === "done" && kept) {
      update([...history, { role: "assistant", content: kept }]);
    } else if (kept && outcome !== "refused") {
      // Réponse partielle (interrompue ou en erreur) : gardée, signalée.
      update([...history, { role: "assistant", content: kept, interrupted: true }]);
      if (outcome !== "aborted") setError(failure);
    } else {
      // Rien de reçu : la question est retirée et remise dans la zone de saisie.
      update(messages);
      setDraft(text);
      setError(
        outcome === "refused"
          ? "L'assistant ne peut pas répondre à cette demande. Reformulez-la autour des données de la marque."
          : outcome === "aborted"
            ? null
            : outcome === "done"
              ? "L'assistant n'a rien répondu : reformulez la question."
              : failure,
      );
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  }

  function reset() {
    update([]);
    setError(null);
    setDraft("");
  }

  const empty = messages.length === 0 && !pending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {empty ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Posez une question sur les données de la marque, par exemple :</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button key={example} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => void ask(example)}>
                  {example}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Conversation">
            {messages.map((m, i) => (
              <li key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[min(42rem,100%)] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <span className="sr-only">{m.role === "user" ? "Vous : " : "Assistant : "}</span>
                  {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                  {m.interrupted && <span className="mt-1 block text-xs text-muted-foreground">Réponse interrompue.</span>}
                </div>
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <div className="max-w-[min(42rem,100%)] whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="sr-only">Assistant : </span>
                  {answer ? <RichText text={answer} /> : null}
                  {status && <span className="block animate-pulse text-xs text-muted-foreground">{status}</span>}
                </div>
              </li>
            )}
          </ol>
        )}
        <div ref={end} />

        <p className="sr-only" aria-live="polite">
          {status ?? ""}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor="assistant-question" className="sr-only">
            Votre question
          </label>
          <textarea
            id="assistant-question"
            className={cn(textareaClass, "resize-y")}
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Votre question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {remaining > 0 ? `${remaining} question(s) restante(s) aujourd'hui.` : "Limite du jour atteinte : réessayez demain."}
            </span>
            <div className="flex flex-wrap gap-2">
              {messages.length > 0 && (
                <Button type="button" variant="outline" onClick={reset} disabled={pending}>
                  <RotateCcw />
                  Nouvelle conversation
                </Button>
              )}
              {pending ? (
                <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>
                  <Square />
                  Arrêter
                </Button>
              ) : (
                <Button type="submit" disabled={!draft.trim() || remaining <= 0}>
                  <Send />
                  Envoyer
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
