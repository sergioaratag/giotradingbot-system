//+------------------------------------------------------------------+
//| Filters.mqh - Modulo 10: filtros pre-entrada + cierre viernes.   |
//|                                                                  |
//| Rechazos pre-apertura:                                           |
//|   - Spread > maximo por simbolo                                  |
//|   - ATR(14) H1 < minimo por simbolo (mercado muerto)             |
//|   - Viernes >= 12:00 NY (no abrir nuevas posiciones)             |
//|                                                                  |
//| Mantenimiento:                                                   |
//|   - Viernes >= 16:00 NY: cerrar forzado posiciones + cancelar    |
//|     pendings del bot                                             |
//|                                                                  |
//| Diseno: stateless. ATR calculado a mano (TR rolling) sin handles |
//| del indicador, consistente con Structure.mqh.                    |
//|                                                                  |
//| TODO V2: pausa por N perdidas consecutivas (no implementado V1)  |
//+------------------------------------------------------------------+
#ifndef FILTERS_MQH
#define FILTERS_MQH

#include <Common.mqh>
#include <Liquidity.mqh>   // GMTToNY
#include <Trade/Trade.mqh>

//============================ HELPERS PRIVADOS ======================

// Resuelve el spread max segun el simbolo (tolera sufijos del broker tipo
// EURUSD.s, EURUSDecn, EURUSDm, etc.).
double Filters_MaxSpreadPipsFor(string symbol)
{
   if(StringFind(symbol, "EURUSD") >= 0) return FILTER_SPREAD_MAX_EURUSD;
   if(StringFind(symbol, "GBPUSD") >= 0) return FILTER_SPREAD_MAX_GBPUSD;
   return FILTER_SPREAD_MAX_DEFAULT;
}

double Filters_MinATRPipsFor(string symbol)
{
   if(StringFind(symbol, "EURUSD") >= 0) return FILTER_ATR_MIN_EURUSD;
   if(StringFind(symbol, "GBPUSD") >= 0) return FILTER_ATR_MIN_GBPUSD;
   return FILTER_ATR_MIN_DEFAULT;
}

// ATR(period) en precio, calculado a mano sobre las ultimas `period` velas
// cerradas (vela 1 .. period). Sin handles de indicadores.
double Filters_CalculateATR(string symbol, ENUM_TIMEFRAMES tf, int period)
{
   if(period <= 0) return 0.0;
   double sum = 0.0;

   for(int i = 1; i <= period; i++)
   {
      double high      = iHigh (symbol, tf, i);
      double low       = iLow  (symbol, tf, i);
      double prevClose = iClose(symbol, tf, i + 1);
      if(high <= 0.0 || low <= 0.0 || prevClose <= 0.0) return 0.0;

      double tr = high - low;
      double tr2 = MathAbs(high - prevClose);
      double tr3 = MathAbs(low  - prevClose);
      if(tr2 > tr) tr = tr2;
      if(tr3 > tr) tr = tr3;
      sum += tr;
   }

   return sum / period;
}

//============================ API PUBLICA ===========================

void Filters_Init()
{
   // Stateless. Existe por simetria.
}

// True si es viernes >= 12:00 NY (no se abren nuevas posiciones).
bool Filters_IsFridayNoNewEntries()
{
   datetime nowNY = GMTToNY(TimeGMT());
   MqlDateTime dt;
   TimeToStruct(nowNY, dt);
   if(dt.day_of_week != 5) return false;
   return (dt.hour >= FILTER_FRIDAY_NO_ENTRY_HOUR);
}

// True si es viernes >= 16:00 NY (cierre forzado de todo lo del bot).
bool Filters_IsFridayClosingTime()
{
   datetime nowNY = GMTToNY(TimeGMT());
   MqlDateTime dt;
   TimeToStruct(nowNY, dt);
   if(dt.day_of_week != 5) return false;
   return (dt.hour >= FILTER_FRIDAY_FORCE_CLOSE_HOUR);
}

// Chequea condiciones de mercado para abrir un nuevo trade en el simbolo.
// Spread y ATR del SIMBOLO (Sabado/Domingo ya bloqueado por Setup_Process).
FilterCheckResult Filters_CheckEntry(string symbol)
{
   FilterCheckResult r;
   r.passed        = true;
   r.reason        = "";
   r.currentSpread = 0.0;
   r.currentATR    = 0.0;

   double pip   = GetPipSize(symbol);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   if(pip <= 0.0 || point <= 0.0)
   {
      r.passed = false;
      r.reason = "Pip/point invalido para el simbolo";
      return r;
   }

   // === 1) Spread =====================================================
   long   spreadPoints = SymbolInfoInteger(symbol, SYMBOL_SPREAD);
   double spreadPips   = ((double)spreadPoints * point) / pip;
   r.currentSpread     = spreadPips;

   double spreadMax = Filters_MaxSpreadPipsFor(symbol);
   if(spreadPips > spreadMax)
   {
      r.passed = false;
      r.reason = StringFormat("Spread %.2f pips > maximo %.2f pips", spreadPips, spreadMax);
      return r;
   }

   // === 2) ATR(14) H1 =================================================
   double atr     = Filters_CalculateATR(symbol, PERIOD_H1, FILTER_ATR_PERIOD);
   double atrPips = (pip > 0.0 ? atr / pip : 0.0);
   r.currentATR   = atrPips;

   double atrMin = Filters_MinATRPipsFor(symbol);
   if(atrPips < atrMin)
   {
      r.passed = false;
      r.reason = StringFormat("ATR(%d) H1 = %.2f pips < minimo %.2f pips (mercado muerto)",
                              FILTER_ATR_PERIOD, atrPips, atrMin);
      return r;
   }

   // === 3) Viernes tarde =============================================
   if(Filters_IsFridayNoNewEntries())
   {
      r.passed = false;
      r.reason = "Viernes >= 12:00 NY - no se abren nuevas posiciones";
      return r;
   }

   // TODO V2: pausa por N perdidas consecutivas.

   return r;
}

// Log compacto (usado tras un rechazo y opcionalmente para diagnostico).
void Filters_LogCheck(string symbol, FilterCheckResult &result)
{
   if(result.passed)
      Print("[FILTERS] OK | ", symbol,
            " | Spread: ", DoubleToString(result.currentSpread, 2), " pips",
            " | ATR(14) H1: ", DoubleToString(result.currentATR, 2), " pips");
   else
      Print("[FILTERS] REJECTED | ", symbol, " | ", result.reason,
            " | Spread: ", DoubleToString(result.currentSpread, 2), " pips",
            " | ATR(14) H1: ", DoubleToString(result.currentATR, 2), " pips");
}

// Cierre forzado de viernes 16:00 NY: cierra posiciones del bot a Market y
// cancela pending orders. Idempotente (si ya esta vacio no hace nada).
void Filters_EnforceFridayClosing()
{
   if(!Filters_IsFridayClosingTime()) return;

   CTrade trade;
   trade.SetExpertMagicNumber(BOT_MAGIC_NUMBER);
   trade.SetDeviationInPoints(EXECUTION_SLIPPAGE_POINTS);

   // 1) Cerrar posiciones del bot
   int posTotal = PositionsTotal();
   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string sym = PositionGetString(POSITION_SYMBOL);
      if(trade.PositionClose(ticket))
         Print("[FILTERS] Cierre forzado viernes 16:00 NY | Ticket: ", ticket, " | ", sym);
      else
         Print("[FILTERS] Fallo cierre forzado ticket=", ticket,
               " code=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }

   // 2) Cancelar pendings del bot
   int ordTotal = OrdersTotal();
   for(int i = ordTotal - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if((long)OrderGetInteger(ORDER_MAGIC) != BOT_MAGIC_NUMBER) continue;

      if(trade.OrderDelete(ticket))
         Print("[FILTERS] Pending cancelado viernes 16:00 NY | Ticket: ", ticket);
   }
}

#endif // FILTERS_MQH
