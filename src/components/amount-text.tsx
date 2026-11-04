import { splitAmount } from "@/lib/format";

/** Chiffre d'une tuile : la devise, plus petite, passe à la ligne s'il manque de place. */
export function AmountText({ value }: { value: string }) {
  const { amount, unit } = splitAmount(value);
  if (!unit) return <>{value}</>;
  return (
    <>
      {amount} <span className="text-sm font-medium whitespace-nowrap">{unit}</span>
    </>
  );
}
