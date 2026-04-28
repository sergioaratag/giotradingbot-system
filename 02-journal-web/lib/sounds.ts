"use client";

export type SoundType = "tap" | "tick" | "success" | "open" | "close";

const FILE_PATHS: Record<SoundType, string> = {
  tap: "/sounds/tap.mp3",
  tick: "/sounds/tick.mp3",
  success: "/sounds/success.mp3",
  open: "/sounds/open.mp3",
  close: "/sounds/close.mp3",
};

const TONES: Record<SoundType, { freq: number; dur: number; type: OscillatorType }> = {
  tap:     { freq: 880, dur: 0.04, type: "sine" },
  tick:    { freq: 660, dur: 0.05, type: "triangle" },
  success: { freq: 1046, dur: 0.18, type: "sine" },
  open:    { freq: 520, dur: 0.10, type: "sine" },
  close:   { freq: 380, dur: 0.10, type: "sine" },
};

let audioCtx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem("sounds_enabled");
  return v === null ? true : v === "true";
}

function tone(type: SoundType) {
  const ctx = ensureCtx();
  if (!ctx) return;
  const { freq, dur, type: oscType } = TONES[type];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = oscType;
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.13, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playSound(type: SoundType) {
  if (typeof window === "undefined") return;
  if (!isEnabled()) return;
  // Try file first; fall back to tone silently
  try {
    const a = new Audio(FILE_PATHS[type]);
    a.volume = 0.15;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => tone(type));
    }
  } catch {
    tone(type);
  }
}
