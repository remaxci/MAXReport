"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes, formatDate } from "@/lib/format";
import type { ActionState } from "@/lib/form";
import { getAttachmentUrl } from "../actions";
import { ACCEPT_ATTRIBUTE } from "../attachments";
import type { DocumentAttachment } from "../queries";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type AttachmentItem = Pick<DocumentAttachment, "id" | "fileName" | "sizeBytes" | "createdAt">;
type GetUrl = (attachmentId: string) => Promise<{ url: string } | { error: string }>;

const textareaClass =
  "min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CommentForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="comment-text" className="sr-only">
        Commentaire
      </Label>
      <textarea id="comment-text" name="text" required maxLength={2000} placeholder="Ajouter un commentaire…" className={textareaClass} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Commenter
        </Button>
        {state && !state.ok && <FormMessage state={state} />}
      </div>
    </form>
  );
}

export function FollowUpForm({
  action,
  suggestedDate,
}: {
  action: FormAction;
  suggestedDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="followup-note">Compte rendu (facultatif)</Label>
        <textarea id="followup-note" name="note" maxLength={2000} placeholder="Ex. appelé, rappeler après validation interne" className={textareaClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="followup-next">Prochaine relance</Label>
        <Input id="followup-next" name="nextDate" type="date" defaultValue={suggestedDate} />
        <p className="text-xs text-muted-foreground">Laissez vide s&apos;il n&apos;y a plus de relance prévue.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Relance effectuée
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Pièces jointes d'un document ou d'une tâche : `getUrl` fournit le lien de téléchargement. */
export function AttachmentsPanel({
  attachments,
  uploadAction,
  deleteActions,
  canManage,
  getUrl = getAttachmentUrl,
}: {
  attachments: AttachmentItem[];
  uploadAction: FormAction;
  deleteActions: Record<string, FormAction>;
  canManage: boolean;
  getUrl?: GetUrl;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, null);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y">
        {attachments.length === 0 && (
          <li className="py-2 text-sm text-muted-foreground">Aucune pièce jointe.</li>
        )}
        {attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            attachment={attachment}
            deleteAction={canManage ? deleteActions[attachment.id] : undefined}
            getUrl={getUrl}
          />
        ))}
      </ul>

      {canManage && (
        <form action={formAction} className="flex flex-col gap-2">
          <Label htmlFor="attachment-file">Ajouter un fichier</Label>
          <Input id="attachment-file" name="file" type="file" required accept={ACCEPT_ATTRIBUTE} />
          <p className="text-xs text-muted-foreground">
            PDF, image, Word, Excel, PowerPoint ou texte · 4 Mo au maximum · stockage privé.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              <Paperclip />
              {pending ? "Envoi…" : "Joindre"}
            </Button>
            <FormMessage state={state} />
          </div>
        </form>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  deleteAction,
  getUrl,
}: {
  attachment: AttachmentItem;
  deleteAction?: FormAction;
  getUrl: GetUrl;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const download = () =>
    startTransition(async () => {
      const result = await getUrl(attachment.id);
      if ("url" in result) {
        setError(null);
        window.location.assign(result.url);
      } else {
        setError(result.error);
      }
    });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Paperclip className="size-4 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{attachment.fileName}</span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(attachment.sizeBytes)} · {formatDate(attachment.createdAt)}
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={download}>
        <Download />
        Télécharger
      </Button>
      {deleteAction && <DeleteAttachmentButton action={deleteAction} />}
    </li>
  );
}

function DeleteAttachmentButton({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end">
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label="Supprimer la pièce jointe">
        <Trash2 />
      </Button>
      {state && !state.ok && <FormMessage state={state} className="text-xs" />}
    </form>
  );
}
