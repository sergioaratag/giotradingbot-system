import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TradeForm } from "@/components/TradeForm";

export default function NewTradePage() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/trades"
        className="inline-flex items-center gap-1 text-xs text-mute hover:text-cream uppercase mb-3"
        style={{ letterSpacing: "0.16em" }}
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Trades
      </Link>
      <h1
        className="text-cream mb-6"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: "2rem",
          letterSpacing: "-0.01em",
        }}
      >
        Nuevo trade manual
      </h1>
      <TradeForm mode="create" />
    </div>
  );
}
