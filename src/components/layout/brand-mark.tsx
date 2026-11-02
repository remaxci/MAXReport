import { cn } from "@/lib/utils";

export function BrandMark({
  code,
  color,
  className,
}: {
  code: string;
  color: string | null;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground",
        className,
      )}
      style={color ? { backgroundColor: color, color: "#fff" } : undefined}
    >
      {code.slice(0, 2)}
    </div>
  );
}
