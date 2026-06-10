// Fase 5.7 — Abre el par en TradingView: deep link en mobile (app), web en
// desktop. En mobile intenta el esquema tradingview:// y cae a la web si la
// app no está instalada.
export function openTradingView(symbol: "EURUSD" | "GBPUSD") {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const webUrl = `https://www.tradingview.com/chart/?symbol=FX%3A${symbol}`;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    const deepLink = `tradingview://chart/?symbol=FX:${symbol}`;
    window.location.href = deepLink;
    window.setTimeout(() => {
      window.location.href = webUrl;
    }, 1200);
  } else {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
}
