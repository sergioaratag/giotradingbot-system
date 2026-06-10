//+------------------------------------------------------------------+
//| CandleReporter.mqh - Fase 6: envia velas OHLC al journal          |
//|                                                                  |
//| POST https://.../api/bot/candles. Idempotente por                |
//| (pair, timeframe, timestamp). Estrategia backfill + incremental: |
//|   - Primer tick: 200 velas por (par x TF) para llenar el chart.  |
//|   - Cada 60s: las ultimas 3 (la que se forma + 2 cerradas).      |
//|                                                                  |
//| Reusa Journal_PostJson (ya trae la api key). Convierte la hora   |
//| del servidor MT5 a UTC usando TimeCurrent()-TimeGMT() (robusto   |
//| a DST, sin hardcodear GMT+3).                                    |
//|                                                                  |
//| NO toca la estrategia: solo lee velas con CopyRates y las postea.|
//+------------------------------------------------------------------+
#ifndef CANDLEREPORTER_MQH
#define CANDLEREPORTER_MQH

#include <Common.mqh>
#include <Journal.mqh>

datetime g_last_candle_report   = 0;
bool     g_candle_backfill_done = false;

string CandleReporter_TFStr(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M3:  return "M3";
      case PERIOD_M5:  return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_H1:  return "H1";
      case PERIOD_H4:  return "H4";
   }
   return "UNKNOWN";
}

// ISO 8601 UTC desde un datetime en hora del servidor MT5.
string CandleReporter_IsoUtc(datetime serverTime)
{
   int srvOffset = (int)(TimeCurrent() - TimeGMT()); // segundos server - UTC
   datetime utc  = serverTime - srvOffset;
   MqlDateTime d;
   TimeToStruct(utc, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

// Reporta las ultimas `count` velas de UN (symbol, tf). Fire-and-forget.
bool CandleReporter_ReportOne(string symbol, ENUM_TIMEFRAMES tf, int count)
{
   MqlRates rates[];
   int copied = CopyRates(symbol, tf, 0, count, rates);
   if(copied <= 0) return false;

   ArraySetAsSeries(rates, false); // mas viejo primero

   string arr = "";
   for(int i = 0; i < copied; i++)
   {
      if(StringLen(arr) > 0) arr += ",";
      arr += StringFormat(
         "{\"timestamp\":\"%s\",\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%d}",
         CandleReporter_IsoUtc(rates[i].time),
         rates[i].open, rates[i].high, rates[i].low, rates[i].close,
         (int)rates[i].tick_volume);
   }

   string payload = StringFormat(
      "{\"pair\":\"%s\",\"timeframe\":\"%s\",\"candles\":[%s]}",
      symbol, CandleReporter_TFStr(tf), arr);

   return Journal_PostJson(CANDLES_API_ENDPOINT, payload, "CANDLES");
}

// Reporta los 2 simbolos x 6 timeframes con `count` velas cada uno.
void CandleReporter_ReportAll(int count)
{
   string         symbols[] = {"EURUSD", "GBPUSD"};
   ENUM_TIMEFRAMES tfs[]    = {PERIOD_M1, PERIOD_M3, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4};

   for(int s = 0; s < ArraySize(symbols); s++)
      for(int t = 0; t < ArraySize(tfs); t++)
         CandleReporter_ReportOne(symbols[s], tfs[t], count);
}

// Llamar en cada OnTick. Backfill en el primer tick, luego incremental cada 60s.
void CandleReporter_Tick()
{
   if(!g_candle_backfill_done)
   {
      CandleReporter_ReportAll(CANDLES_BACKFILL_COUNT);
      g_candle_backfill_done = true;
      g_last_candle_report   = TimeCurrent();
      Print("[CANDLES] Backfill inicial enviado (", CANDLES_BACKFILL_COUNT, " velas x 12 combos).");
      return;
   }

   if(TimeCurrent() - g_last_candle_report < CANDLES_REPORT_INTERVAL_SECONDS) return;
   g_last_candle_report = TimeCurrent();
   CandleReporter_ReportAll(CANDLES_INCREMENTAL_COUNT);
}

#endif // CANDLEREPORTER_MQH
