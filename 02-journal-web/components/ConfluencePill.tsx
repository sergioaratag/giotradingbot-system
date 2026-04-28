"use client";

import { X } from "lucide-react";
import { ICTIcon } from "./icons/ICTIcon";
import { getConceptByKey } from "@/lib/ict-concepts";

export function ConfluencePill({
  conceptKey,
  size = "sm",
  showLabel = true,
  onRemove,
  title,
}: {
  conceptKey: string;
  size?: "sm" | "md";
  showLabel?: boolean;
  onRemove?: () => void;
  title?: string;
}) {
  const concept = getConceptByKey(conceptKey);
  const iconSize = size === "md" ? 18 : 14;
  const fontSize = size === "md" ? "11px" : "10px";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-graphite px-2 py-1"
      title={title ?? concept?.description ?? conceptKey}
    >
      <ICTIcon conceptKey={conceptKey} size={iconSize} />
      {showLabel && (
        <span
          className="font-mono text-cream"
          style={{ fontSize, letterSpacing: "0.04em" }}
        >
          {conceptKey}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-mute hover:text-rose transition-colors -mr-0.5"
          aria-label={`Remove ${conceptKey}`}
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}
