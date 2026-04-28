"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function TradeDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!confirm("¿Eliminar este trade? Esta acción no se puede deshacer.")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      router.push("/trades");
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-rose-deep transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      Eliminar trade
    </button>
  );
}
