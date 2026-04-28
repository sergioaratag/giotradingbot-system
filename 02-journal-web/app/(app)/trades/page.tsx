import { Suspense } from "react";
import { TradesList } from "@/components/TradesList";

export default function TradesPage() {
  return (
    <Suspense fallback={<div className="text-mute text-sm">Cargando…</div>}>
      <TradesList />
    </Suspense>
  );
}
