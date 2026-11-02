import { formatDate, formatDateTime } from "@/lib/format";
import type { DocumentEvent } from "../queries";

const FIELD_LABELS: Record<string, string> = {
  subject: "objet",
  company: "entreprise",
  contact: "contact",
  owner: "commercial responsable",
  issued_on: "date",
  amount: "montant",
  valid_until: "validité",
  recipient_response: "réponse du destinataire",
  comments: "commentaires",
  custom: "informations complémentaires",
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function describe(event: DocumentEvent): { title: string; detail?: string } {
  const p = event.payload;
  switch (event.type) {
    case "created":
      return { title: "Création", detail: str(p.status) ? `Statut : ${str(p.status)}` : undefined };
    case "updated": {
      const fields = Array.isArray(p.fields) ? p.fields.map((f) => FIELD_LABELS[str(f)] ?? str(f)) : [];
      return { title: "Modification", detail: fields.length ? fields.join(", ") : undefined };
    }
    case "status_changed":
      return { title: "Changement de statut", detail: `${str(p.from) || "—"} → ${str(p.to) || "—"}` };
    case "sent":
      return { title: `Envoi le ${formatDate(str(p.date))}` };
    case "follow_up_scheduled":
      return { title: `Relance prévue le ${formatDate(str(p.date))}` };
    case "follow_up_done":
      return { title: "Relance effectuée", detail: str(p.note) || undefined };
    case "comment":
      return { title: "Commentaire", detail: str(p.text) };
    case "attachment_added":
      return { title: "Pièce jointe ajoutée", detail: str(p.file_name) };
    case "attachment_removed":
      return { title: "Pièce jointe supprimée", detail: str(p.file_name) };
    case "archived":
      return { title: "Archivé" };
    case "restored":
      return { title: "Restauré" };
    default:
      return { title: event.type };
  }
}

export function Timeline({
  events,
  actorLabels,
}: {
  events: DocumentEvent[];
  actorLabels: Map<string, string>;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun événement.</p>;
  }

  return (
    <ol className="relative flex flex-col gap-4 border-l pl-4">
      {events.map((event) => {
        const { title, detail } = describe(event);
        const actor = event.actorId ? (actorLabels.get(event.actorId) ?? "Un collaborateur") : "MAXreport";
        return (
          <li key={event.id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
            <p className="text-sm font-medium">{title}</p>
            {detail && <p className="text-sm whitespace-pre-line text-muted-foreground">{detail}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(event.occurredAt)} · {actor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
