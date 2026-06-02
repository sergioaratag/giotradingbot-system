//+------------------------------------------------------------------+
//| Journal.mqh - Modulo 13: POST de eventos del bot al journal      |
//| Vercel via WebRequest.                                           |
//|                                                                  |
//| 4 endpoints (todos POST, x-bot-api-key):                         |
//|   /api/bot/trade            -> TRADE_OPENED (crea Trade row)     |
//|   /api/bot/trade/sl-moved   -> trailing escalonado                |
//|   /api/bot/trade/closed     -> cierre (update Trade + BotEvent)  |
//|   /api/bot/setup-rejected   -> setups CONFIRMED no operados      |
//|                                                                  |
//| Naming: el cliente usa los nombres del journal (pair en vez de   |
//| symbol, positionSize en vez de lots, stopLoss en vez de initialSL)
//| para evitar mapeo server-side. mt5Ticket es la unica clave de    |
//| union entre los eventos (Trade row se matchea por mt5Ticket en   |
//| SL_MOVED y CLOSED).                                              |
//|                                                                  |
//| FIRE-AND-FORGET: si POST falla, log warning, NO reintentar, NO   |
//| cola. El bot sigue operando aunque el journal este caido.        |
//|                                                                  |
//| JSON construido a mano (MQL5 no tiene JSON.stringify). Helpers:  |
//|   - Journal_EscapeStr: escapa " y \ en strings                   |
//|   - Journal_Bool: "true"/"false"                                 |
//|   - Journal_IsoNow: ISO 8601 UTC del momento actual              |
//+------------------------------------------------------------------+
#ifndef JOURNAL_MQH
#define JOURNAL_MQH

#include <Common.mqh>

//============================ STORAGE ===============================
string s_journalApiKey = "";

//============================ HELPERS PRIVADOS ======================

void Journal_SetApiKey(string key) { s_journalApiKey = key; }

// Escapa " y \ para JSON. No cubrimos chars de control (\n, \t, etc.) porque
// los strings que mandamos son cortos y controlados (symbol, comment, etc.).
string Journal_EscapeStr(string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return out;
}

string Journal_Bool(bool b) { return b ? "true" : "false"; }

// ISO 8601 UTC: "2026-06-02T13:30:00Z"
string Journal_IsoNow()
{
   datetime t = TimeGMT();
   MqlDateTime d;
   TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

string Journal_DirStr(ENUM_DIRECTION d)
{
   return (d == DIR_BULLISH ? "LONG" : "SHORT");
}

string Journal_QualityStr(ENUM_SETUP_QUALITY q)
{
   if(q == SETUP_QUALITY_HIGH)   return "HIGH";
   if(q == SETUP_QUALITY_MEDIUM) return "MEDIUM";
   return "LOW";
}

string Journal_BiasStr(ENUM_BIAS b)
{
   if(b == BIAS_BULLISH) return "BULLISH";
   if(b == BIAS_BEARISH) return "BEARISH";
   return "NEUTRAL";
}

string Journal_KillzoneStr(ENUM_KILLZONE_STATUS kz)
{
   // Mapeo al string que la UI muestra. SessionType enum del journal acepta
   // LONDON, LONDON_KZ, NY_AM, NY_LUNCH, NY_PM, OUTSIDE. Aqui guardamos en el
   // campo "killzone" (String libre), no en el enum, asi que cualquier valor
   // descriptivo va bien.
   if(kz == IN_KILLZONE)
   {
      datetime nowNY = GMTToNY(TimeGMT());
      MqlDateTime dt;
      TimeToStruct(nowNY, dt);
      int minOfDay = dt.hour * 60 + dt.min;
      if(minOfDay >= 120 && minOfDay < 300) return "LONDON_KZ";
      if(minOfDay >= 420 && minOfDay < 600) return "NY_AM";
      if(minOfDay >= 660 && minOfDay < 750) return "NY_LUNCH";
      return "KZ";
   }
   if(kz == IN_SESSION_NO_KZ) return "SESSION_NO_KZ";
   return "OUTSIDE";
}

string Journal_CloseReasonStr(ENUM_CLOSE_REASON r)
{
   switch(r)
   {
      case CLOSE_REASON_SL_HIT:         return "SL_HIT";
      case CLOSE_REASON_CHOCH_CONTRARY: return "CHOCH_CONTRARY";
      case CLOSE_REASON_NEWS_HIGH:      return "NEWS_HIGH";
      case CLOSE_REASON_KILL_SWITCH:    return "KILL_SWITCH";
      case CLOSE_REASON_MANUAL:         return "MANUAL";
      // FRIDAY_FORCE no esta en el enum (Filters cierra directo); el caller
      // que viene de Filters pasa CLOSE_REASON_KILL_SWITCH como aproximacion
      // o un valor especial. Documentado en Filters.
   }
   return "SL_HIT";
}

string Journal_FvgTfStr(ENUM_FVG_TIMEFRAME tf)
{
   switch(tf)
   {
      case FVG_TF_H1: return "H1";
      case FVG_TF_M15: return "M15";
      case FVG_TF_M5: return "M5";
      case FVG_TF_M3: return "M3";
      case FVG_TF_M1: return "M1";
   }
   return "?";
}

string Journal_StructTfStr(ENUM_STRUCT_TIMEFRAME tf)
{
   switch(tf)
   {
      case STRUCT_TF_D1: return "D1";
      case STRUCT_TF_H4: return "H4";
      case STRUCT_TF_H1: return "H1";
      case STRUCT_TF_M15: return "M15";
      case STRUCT_TF_M5: return "M5";
      case STRUCT_TF_M3: return "M3";
      case STRUCT_TF_M1: return "M1";
   }
   return "?";
}

string Journal_SweepTfStr(ENUM_SWEEP_TIMEFRAME tf)
{
   switch(tf)
   {
      case SWEEP_TF_H4: return "H4";
      case SWEEP_TF_H1: return "H1";
      case SWEEP_TF_M15: return "M15";
      case SWEEP_TF_M5: return "M5";
   }
   return "?";
}

//============================ TRANSPORTE ============================

// POST generico fire-and-forget. Retorna true si HTTP 2xx.
bool Journal_PostJson(string url, string jsonBody, string tag)
{
   if(StringLen(s_journalApiKey) == 0)
   {
      Print("[JOURNAL] ", tag, " abortado: BotApiKey no configurado");
      return false;
   }

   string headers = "x-bot-api-key: " + s_journalApiKey + "\r\n" +
                    "Content-Type: application/json\r\n";

   char post[];
   int  bytes = StringToCharArray(jsonBody, post, 0, StringLen(jsonBody), CP_UTF8);
   if(bytes > 0) ArrayResize(post, bytes);   // remover null terminator si lo hay

   char   result[];
   string resHeaders;

   ResetLastError();
   int code = WebRequest("POST", url, headers, JOURNAL_TIMEOUT_MS,
                         post, result, resHeaders);

   if(code == -1)
   {
      int err = GetLastError();
      string hint = (err == 4060
                     ? " - URL no autorizada en MT5 (Tools > Options > Expert Advisors)"
                     : "");
      Print("[JOURNAL] ", tag, " POST fallo. Error: ", err, hint);
      return false;
   }

   if(code < 200 || code >= 300)
   {
      string body = CharArrayToString(result);
      Print("[JOURNAL] ", tag, " HTTP ", code,
            " | body[0..160]=", StringSubstr(body, 0, 160));
      return false;
   }

   return true;
}

//============================ API PUBLICA ===========================

void Journal_Init()
{
   // Stateless.
}

// TRADE_OPENED: crea Trade row en el journal. Body usa los nombres del schema:
//   pair (no symbol), direction, entryPrice, stopLoss, positionSize, riskPercent,
//   riskUSD, qualityRating, biasHTF, killzone, takeProfit1, takeProfit2,
//   preTradeNotes, mt5Ticket, entryTime, confluences[].
bool Journal_PostTradeOpened(TradeSetup &setup, SizingResult &sizing,
                             TradeOpenResult &exec)
{
   // Confluencias como strings descriptivos (compatibles con el modelo
   // TradeConfluence.conceptKey).
   string conf = "";
   string sweepKey = StringFormat("SWEEP_%s_%s",
                                   Journal_SweepTfStr(setup.sweep.timeframe),
                                   EnumToString(setup.sweep.levelSwept.type));
   conf += "\"" + Journal_EscapeStr(sweepKey) + "\"";
   if(setup.hasFVG)
      conf += ",\"FVG_" + Journal_FvgTfStr(setup.fvg.timeframe) + "\"";
   if(setup.hasCHoCH)
      conf += ",\"CHOCH_" + Journal_StructTfStr(setup.choch.timeframe) + "\"";
   if(sizing.biasAligned) conf += ",\"BIAS_ALIGNED\"";

   string body = "{";
   body += "\"mt5Ticket\":" + IntegerToString((long)exec.ticket) + ",";
   body += "\"pair\":\"" + Journal_EscapeStr(setup.symbol) + "\",";
   body += "\"direction\":\"" + Journal_DirStr(setup.direction) + "\",";
   body += "\"entryPrice\":" + DoubleToString(sizing.entryPrice, 5) + ",";
   body += "\"stopLoss\":" + DoubleToString(sizing.slPrice, 5) + ",";
   body += "\"positionSize\":" + DoubleToString(exec.lots, 2) + ",";
   body += "\"riskPercent\":" + DoubleToString(sizing.riskEffectivePct, 2) + ",";
   body += "\"riskUSD\":" + DoubleToString(sizing.riskUSD, 2) + ",";
   body += "\"qualityRating\":\"" + Journal_QualityStr(setup.quality) + "\",";
   body += "\"biasHTF\":\"" + Journal_BiasStr(setup.bias.bias) + "\",";
   body += "\"killzone\":\"" + Journal_KillzoneStr(sizing.killzoneStatus) + "\",";
   body += "\"entryTime\":\"" + Journal_IsoNow() + "\",";
   body += "\"preTradeNotes\":\"" + Journal_EscapeStr(exec.comment) + "\",";
   body += "\"confluences\":[" + conf + "]";
   body += "}";

   bool ok = Journal_PostJson(JOURNAL_URL_TRADE_OPENED, body, "TRADE_OPENED");
   if(ok)
      Print("[JOURNAL] TRADE_OPENED enviado | Ticket: ", exec.ticket, " | ", setup.symbol);
   return ok;
}

// SETUP_REJECTED: el setup paso a CONFIRMED en Setup.mqh pero algun gate lo
// rechazo (filtros / daily loss / risk cap / kill switch / etc).
bool Journal_PostSetupRejected(TradeSetup &setup, SizingResult &sizing,
                               string rejectionReason)
{
   string body = "{";
   body += "\"pair\":\"" + Journal_EscapeStr(setup.symbol) + "\",";
   body += "\"direction\":\"" + Journal_DirStr(setup.direction) + "\",";
   body += "\"qualityRating\":\"" + Journal_QualityStr(setup.quality) + "\",";
   body += "\"qualityScore\":" + IntegerToString(setup.qualityScore) + ",";
   body += "\"biasHTF\":\"" + Journal_BiasStr(setup.bias.bias) + "\",";
   body += "\"biasAligned\":" + Journal_Bool(sizing.biasAligned) + ",";
   body += "\"killzone\":\"" + Journal_KillzoneStr(sizing.killzoneStatus) + "\",";
   body += "\"sweepTimeframe\":\"" + Journal_SweepTfStr(setup.sweep.timeframe) + "\",";
   body += "\"sweepLevel\":\"" + EnumToString(setup.sweep.levelSwept.type) + "\",";
   body += "\"hasFVG\":" + Journal_Bool(setup.hasFVG) + ",";
   body += "\"hasCHoCH\":" + Journal_Bool(setup.hasCHoCH) + ",";
   body += "\"riskEffectivePct\":" + DoubleToString(sizing.riskEffectivePct, 2) + ",";
   body += "\"slPips\":" + DoubleToString(sizing.slPips, 1) + ",";
   body += "\"rejectionReason\":\"" + Journal_EscapeStr(rejectionReason) + "\",";
   body += "\"timestamp\":\"" + Journal_IsoNow() + "\"";
   body += "}";

   bool ok = Journal_PostJson(JOURNAL_URL_SETUP_REJECTED, body, "SETUP_REJECTED");
   if(ok)
      Print("[JOURNAL] SETUP_REJECTED enviado | ", setup.symbol,
            " | Razon: ", rejectionReason);
   return ok;
}

// SL_MOVED: trailing escalonado movio el SL.
bool Journal_PostSLMoved(ulong ticket, string symbol, double newSL,
                         int rLevelReached)
{
   string body = "{";
   body += "\"mt5Ticket\":" + IntegerToString((long)ticket) + ",";
   body += "\"pair\":\"" + Journal_EscapeStr(symbol) + "\",";
   body += "\"newSL\":" + DoubleToString(newSL, 5) + ",";
   body += "\"rLevelReached\":" + IntegerToString(rLevelReached) + ",";
   body += "\"timestamp\":\"" + Journal_IsoNow() + "\"";
   body += "}";

   bool ok = Journal_PostJson(JOURNAL_URL_TRADE_SL_MOVED, body, "SL_MOVED");
   if(ok)
      Print("[JOURNAL] SL_MOVED enviado | Ticket: ", ticket,
            " | R=", rLevelReached);
   return ok;
}

// TRADE_CLOSED: el bot cerro o el broker hit SL.
bool Journal_PostTradeClosed(ulong ticket, string symbol,
                             ENUM_CLOSE_REASON reason,
                             double closePrice, double pnlUSD, double rAchieved)
{
   string body = "{";
   body += "\"mt5Ticket\":" + IntegerToString((long)ticket) + ",";
   body += "\"pair\":\"" + Journal_EscapeStr(symbol) + "\",";
   body += "\"closePrice\":" + DoubleToString(closePrice, 5) + ",";
   body += "\"pnlUSD\":" + DoubleToString(pnlUSD, 2) + ",";
   body += "\"rAchieved\":" + DoubleToString(rAchieved, 2) + ",";
   body += "\"closeReason\":\"" + Journal_CloseReasonStr(reason) + "\",";
   body += "\"exitTime\":\"" + Journal_IsoNow() + "\"";
   body += "}";

   bool ok = Journal_PostJson(JOURNAL_URL_TRADE_CLOSED, body, "TRADE_CLOSED");
   if(ok)
      Print("[JOURNAL] TRADE_CLOSED enviado | Ticket: ", ticket,
            " | Reason: ", Journal_CloseReasonStr(reason),
            " | PnL: ", DoubleToString(pnlUSD, 2));
   return ok;
}

// Variante para CLOSE_REASON no en el enum (ej. FRIDAY_FORCE desde Filters).
bool Journal_PostTradeClosedRaw(ulong ticket, string symbol,
                                string reasonStr,
                                double closePrice, double pnlUSD, double rAchieved)
{
   string body = "{";
   body += "\"mt5Ticket\":" + IntegerToString((long)ticket) + ",";
   body += "\"pair\":\"" + Journal_EscapeStr(symbol) + "\",";
   body += "\"closePrice\":" + DoubleToString(closePrice, 5) + ",";
   body += "\"pnlUSD\":" + DoubleToString(pnlUSD, 2) + ",";
   body += "\"rAchieved\":" + DoubleToString(rAchieved, 2) + ",";
   body += "\"closeReason\":\"" + Journal_EscapeStr(reasonStr) + "\",";
   body += "\"exitTime\":\"" + Journal_IsoNow() + "\"";
   body += "}";

   bool ok = Journal_PostJson(JOURNAL_URL_TRADE_CLOSED, body, "TRADE_CLOSED");
   if(ok)
      Print("[JOURNAL] TRADE_CLOSED enviado | Ticket: ", ticket,
            " | Reason: ", reasonStr,
            " | PnL: ", DoubleToString(pnlUSD, 2));
   return ok;
}

#endif // JOURNAL_MQH
