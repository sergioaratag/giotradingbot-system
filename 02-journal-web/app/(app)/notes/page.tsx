import { Suspense } from "react";
import { NotesView } from "@/components/NotesView";

export const dynamic = "force-dynamic";

export default function NotesPage() {
  return (
    <div className="-mx-8 -my-8">
      <Suspense
        fallback={
          <div className="px-8 py-6 text-xs text-mute">Cargando…</div>
        }
      >
        <NotesView />
      </Suspense>
    </div>
  );
}
