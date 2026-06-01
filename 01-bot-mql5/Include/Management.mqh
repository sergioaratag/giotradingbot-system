//+------------------------------------------------------------------+
//| Management.mqh - Modulo 9: gestion de posiciones abiertas.       |
//|                                                                  |
//| Responsabilidades:                                               |
//|   - Trailing escalonado del SL por R-multiples (NR -> SL al      |
//|     (N-1)R + buffer)                                             |
//|   - Cierre por CHoCH contrario en M5                             |
//|   - Cierre por noticia HIGH inminente SI el SL ya esta en BE+    |
//|                                                                  |
//| Lo que NO hace:                                                  |
//|   - Apertura: Modulo 8 (Execution)                               |
//|   - Filtros pre-entrada: Modulo 10                               |
//|   - Calendario de noticias real: Modulo 11 (aqui stub)           |
//|                                                                  |
//| Estado interno: s_positions[] indexado por ticket. Recordamos    |
//| initialSL/slDistance/rLevelReached porque despues del primer     |
//| trail el SL ya no refleja el SL original. Indices, no punteros:  |
//| MQL5 no permite GetPointer sobre structs.                        |
//|                                                                  |
//| Decisiones (confirmadas por Sergio):                             |
//|   - Sin parciales (100% durante toda la vida del trade)          |
//|   - SL nunca retrocede (solo a favor)                            |
//|   - CHoCH solo en M5 (M3/M1 demasiado ruidoso)                   |
//|   - Noticia HIGH: cerrar SOLO si ya hay buffer en BE+; si todavia|
//|     en perdida potencial, dejar correr (ya peor no se puede)     |
//+------------------------------------------------------------------+
#ifndef MANAGEMENT_MQH
#define MANAGEMENT_MQH

#include <Common.mqh>
#include <Structure.mqh>
#include <Trade/Trade.mqh>

//============================ STORAGE ===============================
PositionState s_positions[];

//============================ LOGGING ===============================

void Management_LogAction(ulong ticket, string action, string detail)
{
   Print("[MGMT] ", action, " | Ticket: ", ticket, " | ", detail);
}

//============================ HELPERS PRIVADOS ======================

// Indice del PositionState para el ticket, o -1 si no existe.
int Management_FindIdx(ulong ticket)
{
   int n = ArraySize(s_positions);
   for(int i = 0; i < n; i++)
      if(s_positions[i].ticket == ticket) return i;
   return -1;
}

// Sembra el estado si es la primera vez que vemos este ticket. Asume que la
// posicion ya esta seleccionada (caller hizo PositionGetTicket o
// PositionSelectByTicket).
int Management_FindOrInitIdx(ulong ticket, string symbol,
                             ENUM_DIRECTION direction, double entryPrice)
{
   int idx = Management_FindIdx(ticket);
   if(idx >= 0) return idx;

   int n = ArraySize(s_positions);
   ArrayResize(s_positions, n + 1);
   s_positions[n].ticket        = ticket;
   s_positions[n].symbol        = symbol;
   s_positions[n].direction     = direction;
   s_positions[n].entryPrice    = entryPrice;
   s_positions[n].initialSL     = PositionGetDouble(POSITION_SL);
   s_positions[n].currentSL     = s_positions[n].initialSL;
   s_positions[n].slDistance    = MathAbs(entryPrice - s_positions[n].initialSL);
   s_positions[n].rLevelReached = 0;
   s_positions[n].openedAt      = (datetime)PositionGetInteger(POSITION_TIME);
   s_positions[n].lastSLUpdate  = 0;
   return n;
}

// Elimina del array las posiciones que ya no existen en MT5 (cerradas por
// SL, CHoCH, news, cierre manual, etc).
void Management_PurgeClosedTickets()
{
   int n = ArraySize(s_positions);
   if(n == 0) return;

   PositionState kept[];
   for(int i = 0; i < n; i++)
   {
      if(PositionSelectByTicket(s_positions[i].ticket))
      {
         int kn = ArraySize(kept);
         ArrayResize(kept, kn + 1);
         kept[kn] = s_positions[i];
      }
      else
      {
         Management_LogAction(s_positions[i].ticket, "CLOSED",
                              "Posicion ya no existe (SL hit / cierre externo)");
      }
   }

   ArrayResize(s_positions, ArraySize(kept));
   for(int i = 0; i < ArraySize(kept); i++) s_positions[i] = kept[i];
}

//============================ API PUBLICA ===========================

void Management_Init()
{
   ArrayResize(s_positions, 0);
}

// STUB hasta que Modulo 11 (filtro de noticias) este implementado.
// Cuando Modulo 11 exista, retornara:
//   return News_IsHighImpactSoon(symbol, MGMT_NEWS_BEFORE_MINUTES);
// teniendo en cuenta las divisas relevantes al par (USD+EUR para EURUSD,
// USD+GBP para GBPUSD, etc).
bool Management_ShouldCloseByNews(string symbol)
{
   // TODO Modulo 11: conectar con calendario de noticias real.
   return false;
}

// Retorna el estado actual de las posiciones gestionadas.
int Management_GetActivePositions(PositionState &out[])
{
   int n = ArraySize(s_positions);
   ArrayResize(out, n);
   for(int i = 0; i < n; i++) out[i] = s_positions[i];
   return n;
}

// Loop principal. Llamado en cada tick desde GioBot. Itera todas las
// posiciones del bot y aplica las 3 reglas en orden:
//   1) news close (si SL ya en BE+)
//   2) CHoCH contrario en M5
//   3) trailing escalonado del SL
void Management_Process()
{
   Management_PurgeClosedTickets();

   CTrade trade;
   trade.SetExpertMagicNumber(BOT_MAGIC_NUMBER);
   trade.SetDeviationInPoints(EXECUTION_SLIPPAGE_POINTS);

   int posTotal = PositionsTotal();
   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string             symbol     = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE posType    = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      ENUM_DIRECTION     direction  = (posType == POSITION_TYPE_BUY ? DIR_BULLISH : DIR_BEARISH);
      double             entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double             currentSL  = PositionGetDouble(POSITION_SL);
      double             currentPrice = (direction == DIR_BULLISH
                                         ? SymbolInfoDouble(symbol, SYMBOL_BID)
                                         : SymbolInfoDouble(symbol, SYMBOL_ASK));

      // Si no tiene SL definido (raro - apertura mal hecha), no podemos
      // calcular R-multiple. Saltamos.
      if(currentSL <= 0.0) continue;

      // === Seed/Recover state (despues de PositionGetTicket esta seleccionada) ===
      int idx = Management_FindOrInitIdx(ticket, symbol, direction, entryPrice);
      if(s_positions[idx].slDistance <= 0.0) continue;  // proteccion

      // === 1) Cierre por noticia HIGH (solo si SL ya esta en BE o mejor) ===
      if(Management_ShouldCloseByNews(symbol))
      {
         bool slInProfitOrBE = false;
         if(direction == DIR_BULLISH)
            slInProfitOrBE = (currentSL >= entryPrice);
         else
            slInProfitOrBE = (currentSL <= entryPrice && currentSL > 0.0);

         if(slInProfitOrBE)
         {
            if(trade.PositionClose(ticket))
               Management_LogAction(ticket, "CLOSED_BY_NEWS",
                                    "SL en BE+, cerrado por noticia HIGH inminente");
            else
               Management_LogAction(ticket, "CLOSE_FAILED",
                                    StringFormat("news close: code=%d %s",
                                                 trade.ResultRetcode(),
                                                 trade.ResultRetcodeDescription()));
            continue;
         }
         // Si SL aun en perdida, dejar correr: peor de los casos es el SL inicial.
      }

      // === 2) Cierre por CHoCH contrario en M5 (posterior a la apertura) ===
      ENUM_STRUCT_EVENT contraryEvent = (direction == DIR_BULLISH
                                         ? EVT_CHOCH_BEARISH
                                         : EVT_CHOCH_BULLISH);
      if(Structure_HasEventSince(symbol, MGMT_CHOCH_TF,
                                 contraryEvent, s_positions[idx].openedAt))
      {
         if(trade.PositionClose(ticket))
            Management_LogAction(ticket, "CLOSED_BY_CHOCH",
                                 "CHoCH contrario detectado en M5");
         else
            Management_LogAction(ticket, "CLOSE_FAILED",
                                 StringFormat("choch close: code=%d %s",
                                              trade.ResultRetcode(),
                                              trade.ResultRetcodeDescription()));
         continue;
      }

      // === 3) Trailing escalonado por R-multiples ===
      double pip          = GetPipSize(symbol);
      double bufferPrice  = MGMT_BUFFER_PIPS * pip;
      double slDistance   = s_positions[idx].slDistance;

      double pnlInPrice = (direction == DIR_BULLISH
                           ? currentPrice - entryPrice
                           : entryPrice   - currentPrice);

      // R-multiple actual (puede ser < 0 si va en contra). Floor da 0R/1R/2R..
      double rMultipleNow = pnlInPrice / slDistance;
      int    newRLevel    = (int)MathFloor(rMultipleNow);

      if(newRLevel > s_positions[idx].rLevelReached && newRLevel >= 1)
      {
         // Nuevo SL = (newRLevel - 1)R desde entry + buffer en favor.
         // newRLevel == 1 -> SL en BE + buffer
         double newSL;
         if(direction == DIR_BULLISH)
            newSL = entryPrice + ((newRLevel - 1) * slDistance) + bufferPrice;
         else
            newSL = entryPrice - ((newRLevel - 1) * slDistance) - bufferPrice;

         // Nunca retroceder: solo modificar si mejora.
         bool slImproves = (direction == DIR_BULLISH
                            ? newSL > currentSL
                            : newSL < currentSL);

         if(slImproves)
         {
            double tp = PositionGetDouble(POSITION_TP);   // mantener TP=0
            if(trade.PositionModify(ticket, newSL, tp))
            {
               s_positions[idx].currentSL     = newSL;
               s_positions[idx].rLevelReached = newRLevel;
               s_positions[idx].lastSLUpdate  = TimeCurrent();

               string ref = (newRLevel == 1 ? "BE" : IntegerToString(newRLevel - 1) + "R");
               Management_LogAction(ticket, "SL_MOVED",
                  StringFormat("Alcanzo %dR. SL movido a %s + buffer (%.5f)",
                               newRLevel, ref, newSL));
            }
            else
            {
               Management_LogAction(ticket, "SL_MOVE_FAILED",
                  StringFormat("R=%d code=%d %s",
                               newRLevel, trade.ResultRetcode(),
                               trade.ResultRetcodeDescription()));
            }
         }
         else
         {
            // Si calculamos mismo o peor SL (raro), marcar el R-level alcanzado
            // igualmente para no recalcular en cada tick.
            s_positions[idx].rLevelReached = newRLevel;
         }
      }
   }
}

#endif // MANAGEMENT_MQH
