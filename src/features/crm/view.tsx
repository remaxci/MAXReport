import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { FieldDefinition } from "@/features/custom-fields/types";
import { ActionButton } from "@/features/settings/components/controls";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/form";
import { INTERACTION_LABELS } from "./components/forms";
import type { CrmFilters, InteractionRow } from "./queries";

type Option = { id: string; label: string };

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

/** Filtres d'URL communs (recherche, statut, responsable, archives). */
export function CrmFiltersBar({
  action,
  filters,
  statuses,
  owners,
  searchPlaceholder,
}: {
  action: string;
  filters: CrmFilters;
  statuses?: Option[];
  owners?: Option[] | null;
  searchPlaceholder: string;
}) {
  return (
    <Form action={action} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="filtre-q">Recherche</Label>
        <Input id="filtre-q" name="q" defaultValue={filters.q} placeholder={searchPlaceholder} />
      </div>
      {statuses && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtre-statut">Statut</Label>
          <NativeSelect id="filtre-statut" name="statut" defaultValue={filters.status ?? ""} className="w-full">
            <NativeSelectOption value="">Tous</NativeSelectOption>
            {statuses.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      {owners && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtre-responsable">Responsable</Label>
          <NativeSelect id="filtre-responsable" name="responsable" defaultValue={filters.owner ?? ""} className="w-full">
            <NativeSelectOption value="">Tous</NativeSelectOption>
            {owners.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="archives" value="1" defaultChecked={filters.archived} className="size-4 accent-primary" />
          Archivés
        </label>
        <Button type="submit">Filtrer</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={action} />}>
          Réinitialiser
        </Button>
      </div>
    </Form>
  );
}

export function InteractionList({
  interactions,
  labels,
  userId,
  deleteAction,
}: {
  interactions: InteractionRow[];
  labels: Map<string, string>;
  userId: string;
  deleteAction: (interactionId: string) => (previous: ActionState, formData?: FormData) => Promise<ActionState>;
}) {
  if (interactions.length === 0) return <p className="text-sm text-muted-foreground">Aucun échange enregistré.</p>;
  return (
    <ol className="flex flex-col divide-y">
      {interactions.map((i) => (
        <li key={i.id} className="flex flex-wrap items-start gap-3 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium">
              {INTERACTION_LABELS[i.type] ?? i.type}
              {i.contactName && <span className="font-normal text-muted-foreground"> · {i.contactName}</span>}
            </p>
            <p className="text-sm whitespace-pre-line">{i.summary}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(i.occurredAt)} · {labels.get(i.userId) ?? "Un collaborateur"}
            </p>
          </div>
          {i.userId === userId && (
            <ActionButton action={deleteAction(i.id)} variant="ghost">
              Supprimer
            </ActionButton>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lignes « champ personnalisé : valeur » à ajouter au détail d'une fiche. */
export function customRows(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  labels: Map<string, string>,
): [string, string][] {
  const rows: [string, string][] = [];
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") continue;
    const option = (v: unknown) => field.options.find((o) => o.value === v)?.label ?? String(v);
    let display: string;
    switch (field.type) {
      case "boolean":
        display = value === true ? "Oui" : "Non";
        break;
      case "money": {
        const m = value as { amount?: number; currency?: string };
        display = formatMoney(m.amount ?? null, m.currency ?? null);
        break;
      }
      case "date":
        display = formatDate(String(value));
        break;
      case "select":
        display = option(value);
        break;
      case "multiselect":
        display = Array.isArray(value) ? value.map(option).join(", ") : "—";
        break;
      case "user":
        display = labels.get(String(value)) ?? "—";
        break;
      default:
        display = String(value);
    }
    rows.push([field.label, display]);
  }
  return rows;
}
