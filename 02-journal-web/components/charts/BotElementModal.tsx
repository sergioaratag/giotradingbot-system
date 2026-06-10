"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { BotElement } from "@/lib/ict-modals";
import { modalContent } from "@/lib/ict-modals";

// Modal didáctico para cualquier elemento del bot. Se abre al clickear un FVG,
// sweep, CHoCH, killzone o bias (en el chart o en el panel lateral).
export function BotElementModal({
  element,
  onClose,
}: {
  element: BotElement | null;
  onClose: () => void;
}) {
  const open = !!element;
  const content = element ? modalContent(element) : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6"
          style={{ background: "var(--color-onyx)", border: "0.5px solid var(--color-graphite)" }}
        >
          {content && (
            <>
              <Dialog.Title className="text-xl font-medium text-cream mb-1">
                {content.title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-cream-muted mb-5 leading-relaxed">
                {content.explanation}
              </Dialog.Description>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {content.data.map((item) => (
                  <div
                    key={item.label}
                    className="pl-3"
                    style={{ borderLeft: "2px solid rgba(199,119,151,0.3)" }}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-mute">
                      {item.label}
                    </div>
                    <div className="text-sm font-mono text-cream">{item.value}</div>
                  </div>
                ))}
              </div>

              <div
                className="p-4 rounded-lg"
                style={{ background: "var(--color-coal)", border: "0.5px solid var(--color-graphite)" }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-rose)" }}
                >
                  💡 Tip ICT
                </div>
                <p className="text-sm text-cream-muted leading-relaxed">{content.tip}</p>
              </div>
            </>
          )}

          <Dialog.Close
            className="absolute top-4 right-4 text-mute hover:text-cream transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
