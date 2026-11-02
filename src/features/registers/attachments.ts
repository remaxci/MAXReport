// Pièces jointes : mêmes règles que le bucket Storage « attachments ».

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_MIME_TYPES).join(",");

export type AttachmentCheck = { ok: true; extension: string } | { ok: false; message: string };

export function checkAttachment(file: { name: string; size: number; type: string }): AttachmentCheck {
  if (file.size === 0) return { ok: false, message: "Le fichier est vide." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, message: "4 Mo au maximum par fichier." };
  const extension = ALLOWED_MIME_TYPES[file.type];
  if (!extension) {
    return { ok: false, message: "Format non accepté : PDF, image, Word, Excel, PowerPoint ou texte." };
  }
  if (file.name.length > 255) return { ok: false, message: "Nom de fichier trop long." };
  return { ok: true, extension };
}
