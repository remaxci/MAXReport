import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { RegisterFilters } from "../filters";

type Option = { id: string; label: string };

/** Filtres en paramètres d'URL (GET) : la liste reste partageable et exportable. */
export function FiltersBar({
  action,
  filters,
  statuses,
  owners,
}: {
  action: string;
  filters: RegisterFilters;
  statuses: Option[];
  owners: Option[] | null;
}) {
  return (
    <Form action={action} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="filtre-q">Recherche</Label>
        <Input id="filtre-q" name="q" defaultValue={filters.q} placeholder="Référence, objet ou entreprise" />
      </div>
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
      {owners && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtre-commercial">Commercial</Label>
          <NativeSelect id="filtre-commercial" name="commercial" defaultValue={filters.owner ?? ""} className="w-full">
            <NativeSelectOption value="">Tous</NativeSelectOption>
            {owners.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtre-relance">Relances</Label>
        <NativeSelect
          id="filtre-relance"
          name="relance"
          defaultValue={filters.followUp === "overdue" ? "en_retard" : filters.followUp === "week" ? "semaine" : ""}
          className="w-full"
        >
          <NativeSelectOption value="">Toutes</NativeSelectOption>
          <NativeSelectOption value="en_retard">En retard</NativeSelectOption>
          <NativeSelectOption value="semaine">Dans les 7 jours</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtre-du">Créé du</Label>
        <Input id="filtre-du" name="du" type="date" defaultValue={filters.from} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtre-au">au</Label>
        <Input id="filtre-au" name="au" type="date" defaultValue={filters.to} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="archives" value="1" defaultChecked={filters.archived} className="size-4 accent-primary" />
        Archivés
      </label>
      <div className="flex items-end gap-2 lg:col-span-3">
        <Button type="submit">Filtrer</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={action} />}>
          Réinitialiser
        </Button>
      </div>
    </Form>
  );
}
