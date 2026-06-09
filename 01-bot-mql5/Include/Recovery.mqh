//+------------------------------------------------------------------+
//| Recovery.mqh - Fase 1.5: reconciliacion de posiciones abiertas   |
//|                                                                  |
//| Problema: si el POST /api/bot/trade falla al abrir (key mala,    |
//| URL no autorizada en MT5, journal caido), la posicion queda en   |
//| MT5 pero NUNCA en el journal. Este modulo, llamado una vez en    |
//| OnInit, escanea las posiciones abiertas del bot (magic           |
//| BOT_MAGIC_NUMBER) y re-postea cada una a /api/bot/trade.         |
//|                                                                  |
//| Idempotente: el endpoint matchea por mt5Ticket (unique) y        |
//| responde { alreadyExists: true } sin duplicar. Por eso es safe   |
//| correrlo en CADA arranque.                                       |
//|                                                                  |
//| NO recupera trades CERRADOS (ya no estan en PositionsTotal); esos|
//| se reconcilian manual desde el journal. Solo cubre lo ABIERTO.   |
//|                                                                  |
//| NO toca la estrategia. Solo lee posiciones y postea.             |
//+------------------------------------------------------------------+
#ifndef RECOVERY_MQH
#define RECOVERY_MQH

#include <Common.mqh>
#include <Journal.mqh>

// ISO 8601 desde un datetime dado. POSITION_TIME es hora del servidor; la
// tratamos como UTC. La hora exacta no es critica para un trade recuperado
// (es una marca aproximada de la apertura real); lo importante es el mt5Ticket.
string Recovery_IsoFromTime(datetime t)
{
   MqlDateTime d;
   TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

// Escanea posiciones abiertas del bot y re-postea cada una a TRADE_OPENED.
// Retorna la cantidad de posiciones reconciliadas (HTTP 2xx, incluye
// alreadyExists). Las que fallan se reintentan en el proximo arranque.
int Recovery_ReconcileOpenPositions()
{
   int processed = 0;
   int posTotal  = PositionsTotal();

   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string   sym       = PositionGetString(POSITION_SYMBOL);
      long     posType   = PositionGetInteger(POSITION_TYPE);
      string   dir       = (posType == POSITION_TYPE_BUY ? "LONG" : "SHORT");
      double   openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double   sl        = PositionGetDouble(POSITION_SL);
      double   tp        = PositionGetDouble(POSITION_TP);
      double   lots      = PositionGetDouble(POSITION_VOLUME);
      datetime openT     = (datetime)PositionGetInteger(POSITION_TIME);

      string body = "{";
      body += "\"mt5Ticket\":" + IntegerToString((long)ticket) + ",";
      body += "\"pair\":\"" + Journal_EscapeStr(sym) + "\",";
      body += "\"direction\":\"" + dir + "\",";
      body += "\"entryPrice\":" + DoubleToString(openPrice, 5) + ",";
      body += "\"stopLoss\":" + DoubleToString(sl, 5) + ",";
      if(tp > 0.0)
         body += "\"takeProfit1\":" + DoubleToString(tp, 5) + ",";
      body += "\"positionSize\":" + DoubleToString(lots, 2) + ",";
      body += "\"riskPercent\":0,";
      body += "\"riskUSD\":0,";
      body += "\"entryTime\":\"" + Recovery_IsoFromTime(openT) + "\",";
      body += "\"preTradeNotes\":\"RECOVERED_ON_INIT\",";
      body += "\"confluences\":[]";
      body += "}";

      bool ok = Journal_PostJson(JOURNAL_URL_TRADE_OPENED, body, "RECOVERY");
      if(ok)
      {
         processed++;
         Print("[RECOVERY] Posicion reconciliada | Ticket: ", ticket,
               " | ", sym, " ", dir);
      }
      else
      {
         Print("[RECOVERY] Fallo reconciliar ticket=", ticket, " | ", sym,
               " (journal caido o key mala; se reintenta al proximo arranque)");
      }
   }

   if(processed > 0)
      Print("[RECOVERY] ", processed,
            " posicion(es) abierta(s) del bot reconciliada(s) con el journal.");
   return processed;
}

#endif // RECOVERY_MQH
