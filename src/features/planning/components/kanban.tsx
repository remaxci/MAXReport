"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatDate } from "@/lib/format";
import { moveTask } from "../actions";
import { PRIORITY_LABELS, type Priority } from "../config";

export type KanbanColumn = { id: string; label: string; color: string | null; isActive: boolean };
export type KanbanCard = {
  id: string;
  statusId: string;
  title: string;
  href: string;
  assignee: string | null;
  project: string | null;
  dueOn: string | null;
  overdue: boolean;
  priority: Priority;
  /** Gestionnaire du planning, ou responsable de la tâche. */
  canMove: boolean;
};

/** Place `card` avant `beforeId` dans la liste (ou après la dernière carte de sa colonne). */
function placed(items: KanbanCard[], card: KanbanCard, beforeId: string | null): KanbanCard[] {
  const rest = items.filter((c) => c.id !== card.id);
  const before = beforeId === null ? -1 : rest.findIndex((c) => c.id === beforeId);
  if (before !== -1) return [...rest.slice(0, before), card, ...rest.slice(before)];
  const lastInColumn = rest.map((c) => c.statusId).lastIndexOf(card.statusId);
  return lastInColumn === -1 ? [...rest, card] : [...rest.slice(0, lastInColumn + 1), card, ...rest.slice(lastInColumn + 1)];
}

export function KanbanBoard({ brandId, columns, cards }: { brandId: string; columns: KanbanColumn[]; cards: KanbanCard[] }) {
  const [items, setItems] = useState(cards);
  const [dragged, setDragged] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const targets = columns.filter((c) => c.isActive);

  function move(cardId: string, statusId: string, beforeId: string | null) {
    const card = items.find((c) => c.id === cardId);
    if (!card || (card.statusId === statusId && beforeId === cardId)) return;
    const previous = items;
    setItems(placed(items, { ...card, statusId }, beforeId));
    startTransition(async () => {
      const result = await moveTask(brandId, cardId, statusId, beforeId);
      if (!result.ok) setItems(previous);
      setMessage(result.ok ? null : result.message);
    });
  }

  const allowDrop = (event: DragEvent) => {
    if (dragged) event.preventDefault();
  };
  const drop = (event: DragEvent, statusId: string, beforeId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragged) move(dragged, statusId, beforeId);
    setDragged(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((column) => {
          const columnCards = items.filter((c) => c.statusId === column.id);
          return (
            <section
              key={column.id}
              aria-label={column.label}
              onDragOver={allowDrop}
              onDrop={(e) => drop(e, column.id, null)}
              className="flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3"
            >
              <header className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: column.color ?? "var(--muted-foreground)" }} />
                  {column.label}
                  {!column.isActive && <span className="text-xs font-normal text-muted-foreground">(désactivé)</span>}
                </h2>
                <Badge variant="outline">{columnCards.length}</Badge>
              </header>
              {columnCards.map((card) => (
                <article
                  key={card.id}
                  draggable={card.canMove}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", card.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragged(card.id);
                  }}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={allowDrop}
                  onDrop={(e) => drop(e, column.id, card.id)}
                  className={`flex flex-col gap-2 rounded-lg border bg-background p-3 ${card.canMove ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === card.id ? "opacity-50" : ""}`}
                >
                  <Link href={card.href} className="text-sm font-medium underline-offset-4 hover:underline">
                    {card.title}
                  </Link>
                  {card.project && <p className="text-xs text-muted-foreground">{card.project}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{card.assignee ?? "Non attribuée"}</span>
                    {card.dueOn && (
                      <span className={card.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                        · {formatDate(card.dueOn)}
                        {card.overdue && " (en retard)"}
                      </span>
                    )}
                    {card.priority !== "normal" && (
                      <Badge variant={card.priority === "urgent" ? "destructive" : "secondary"}>{PRIORITY_LABELS[card.priority]}</Badge>
                    )}
                  </div>
                  {card.canMove && (
                    <NativeSelect
                      size="sm"
                      aria-label={`Déplacer « ${card.title} » vers`}
                      value={card.statusId}
                      onChange={(e) => move(card.id, e.target.value, null)}
                      className="w-full"
                    >
                      {targets.map((t) => (
                        <NativeSelectOption key={t.id} value={t.id}>
                          {t.label}
                        </NativeSelectOption>
                      ))}
                      {!column.isActive && (
                        <NativeSelectOption value={column.id} disabled>
                          {column.label}
                        </NativeSelectOption>
                      )}
                    </NativeSelect>
                  )}
                </article>
              ))}
              {columnCards.length === 0 && <p className="text-xs text-muted-foreground">Aucune tâche.</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
