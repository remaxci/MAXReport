import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const LABELS = {
  XOF: "XOF · franc CFA",
  EUR: "EUR · euro",
  USD: "USD · dollar américain",
} as const;

export function CurrencySelect({ id, defaultValue = "XOF" }: { id: string; defaultValue?: string }) {
  return (
    <NativeSelect id={id} name="reportingCurrency" defaultValue={defaultValue} className="w-full">
      {Object.entries(LABELS).map(([code, label]) => (
        <NativeSelectOption key={code} value={code}>
          {label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
