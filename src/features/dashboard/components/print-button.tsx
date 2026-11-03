"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Impression du rapport, ou enregistrement en PDF depuis la fenêtre d'impression. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer />
      Imprimer / PDF
    </Button>
  );
}
