//+------------------------------------------------------------------+
//| Execution.mqh - Modulo 8: apertura de ordenes en MT5.            |
//|                                                                  |
//| ESTE ES EL PRIMER MODULO QUE LLAMA OrderSend(). Hasta aqui todo  |
//| era deteccion / calculo. A partir de aqui el bot opera real.     |
//|                                                                  |
//| Responsabilidades:                                               |
//|   - Decidir Market vs Limit (hibrido segun cercania al FVG)      |
//|   - Aplicar cap de riesgo total (1.5% suma de posiciones+pending)|
//|   - Aplicar bloqueo por daily loss (-1.5% PnL del dia)           |
//|   - Cancelar limits que vencen (45 min o fin de ventana sesion)  |
//|                                                                  |
//| Lo que NO hace (otros modulos):                                  |
//|   - Mover SL a BE, parciales, trailing: Modulo 9 (Management)    |
//|   - Filtros spread/ATR/viernes: Modulo 10 (Filters)              |
//|                                                                  |
//| Decisiones (confirmadas por Sergio):                             |
//|   - Hibrido Market/Limit threshold: 5 pips                       |
//|   - Validez del Limit: 45 min                                    |
//|   - Cap riesgo agregado: 1.5%                                    |
//|     Si nuevo setup excede el espacio disponible, reducimos       |
//|     lotaje en vez de rechazar (mientras quede >=0.5% libre).     |
//|   - Daily loss: -1.5% bloquea apertura. Reset 07:00 NY siguiente.|
//+------------------------------------------------------------------+
#ifndef EXECUTION_MQH
#define EXECUTION_MQH

#include <Common.mqh>
#include <Liquidity.mqh>   // GMTToNY / NYToServer / BuildNYDateTime
#include <Sizing.mqh>
#include <Filters.mqh>
#include <KillSwitch.mqh>
#include <Trade/Trade.mqh>

//============================ HELPERS PRIVADOS ======================

// Replica el check de ventana de entrada para no crear dependencia circular
// con Setup.mqh (Setup includes Execution). Si Setup cambia las ventanas,
// hay que sincronizar aqui tambien.
//   Londres: 02:00-06:45 NY -> 120-405
//   NY:      07:00-12:15 NY -> 420-735
bool Execution_IsWithinEntryWindow(datetime nowNY)
{
   MqlDateTime dt;
   TimeToStruct(nowNY, dt);
   if(dt.day_of_week == 0 || dt.day_of_week == 6) return false;

   int mins = dt.hour * 60 + dt.min;
   if(mins >= 120 && mins <= 405) return true;   // Londres
   if(mins >= 420 && mins <= 735) return true;   // NY
   return false;
}

// Timestamp (en hora del servidor) del 07:00 NY de hoy. Si la hora actual
// es antes de 07:00 NY hoy, retorna 07:00 NY de ayer.
// Usado para acotar el calculo de PnL diario.
datetime GetNYDayStart()
{
   datetime nowGMT = TimeGMT();
   datetime nowNY  = GMTToNY(nowGMT);

   MqlDateTime dt;
   TimeToStruct(nowNY, dt);

   datetime sevenAM_NY = BuildNYDateTime(dt.year, dt.mon, dt.day, 7, 0, 0);

   if(nowNY < sevenAM_NY)
   {
      // Antes de las 07:00 NY: el "dia de trading" empezo ayer.
      datetime yesterdayNY = nowNY - 86400;
      MqlDateTime yd;
      TimeToStruct(yesterdayNY, yd);
      sevenAM_NY = BuildNYDateTime(yd.year, yd.mon, yd.day, 7, 0, 0);
   }

   return NYToServer(sevenAM_NY);
}

// Calcula riesgo (USD) implicito en una distancia entry->SL con un lotaje dado.
double RiskUSDFor(string symbol, double entryPrice, double slPrice, double lots)
{
   if(slPrice == 0.0 || lots <= 0.0) return 0.0;

   double pip       = GetPipSize(symbol);
   double slPips    = MathAbs(entryPrice - slPrice) / pip;
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0.0 || tickSize <= 0.0) return 0.0;

   double pipValuePerLot = tickValue * (pip / tickSize);
   return slPips * pipValuePerLot * lots;
}

string TradeResultToString(ENUM_TRADE_RESULT r)
{
   switch(r)
   {
      case TRADE_OPENED:           return "OPENED";
      case TRADE_REJECTED_RISK:    return "REJECTED_RISK";
      case TRADE_REJECTED_DAILY:   return "REJECTED_DAILY_LOSS";
      case TRADE_REJECTED_SPREAD:  return "REJECTED_SPREAD";
      case TRADE_REJECTED_FILTER:  return "REJECTED_FILTER";
      case TRADE_FAILED_SEND:      return "FAILED_SEND";
      case TRADE_INVALID_SIZING:   return "INVALID_SIZING";
   }
   return "?";
}

//============================ API PUBLICA ===========================

void Execution_Init()
{
   // Stateless: las posiciones/ordenes viven en MT5, no replicamos estado.
}

// Suma del riesgo (% balance) implicito en posiciones abiertas Y pending del
// bot. Si filterSymbol != "" filtra por simbolo. Si == "" calcula global.
double Execution_GetCurrentRiskExposure(string filterSymbol = "")
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(balance <= 0.0) return 0.0;

   double totalRiskUSD = 0.0;

   // 1) Posiciones abiertas del bot
   int posTotal = PositionsTotal();
   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string sym = PositionGetString(POSITION_SYMBOL);
      if(filterSymbol != "" && sym != filterSymbol) continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl        = PositionGetDouble(POSITION_SL);
      double lots      = PositionGetDouble(POSITION_VOLUME);

      if(sl == 0.0) continue;  // sin SL no hay riesgo definido
      totalRiskUSD += RiskUSDFor(sym, openPrice, sl, lots);
   }

   // 2) Pending orders del bot
   int ordTotal = OrdersTotal();
   for(int i = ordTotal - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if((long)OrderGetInteger(ORDER_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string sym = OrderGetString(ORDER_SYMBOL);
      if(filterSymbol != "" && sym != filterSymbol) continue;

      double price = OrderGetDouble(ORDER_PRICE_OPEN);
      double sl    = OrderGetDouble(ORDER_SL);
      double lots  = OrderGetDouble(ORDER_VOLUME_INITIAL);

      if(sl == 0.0) continue;
      totalRiskUSD += RiskUSDFor(sym, price, sl, lots);
   }

   return (totalRiskUSD / balance) * 100.0;
}

// P&L del dia (USD) = cerrados del bot desde 07:00 NY + flotante actual.
double Execution_GetDailyPnL()
{
   double pnl = 0.0;

   // 1) Deals cerrados hoy
   datetime dayStart = GetNYDayStart();
   if(HistorySelect(dayStart, TimeCurrent()))
   {
      int deals = HistoryDealsTotal();
      for(int i = 0; i < deals; i++)
      {
         ulong dealTicket = HistoryDealGetTicket(i);
         if(dealTicket == 0) continue;
         if((long)HistoryDealGetInteger(dealTicket, DEAL_MAGIC) != BOT_MAGIC_NUMBER) continue;
         if((int)HistoryDealGetInteger(dealTicket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;

         pnl += HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
         pnl += HistoryDealGetDouble(dealTicket, DEAL_SWAP);
         pnl += HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      }
   }

   // 2) Flotante de posiciones abiertas
   int posTotal = PositionsTotal();
   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      pnl += PositionGetDouble(POSITION_PROFIT);
      pnl += PositionGetDouble(POSITION_SWAP);
   }

   return pnl;
}

bool Execution_IsDailyLossExceeded()
{
   double balance      = AccountInfoDouble(ACCOUNT_BALANCE);
   if(balance <= 0.0) return false;
   double thresholdUSD = -(balance * EXECUTION_DAILY_LOSS_PCT / 100.0);
   return (Execution_GetDailyPnL() <= thresholdUSD);
}

// Cancela pending orders del bot con >45 min de antiguedad o pasada la
// ventana de entrada de la sesion. Llamada cada minuto desde OnTick.
void Execution_CancelExpiredLimits()
{
   datetime now            = TimeCurrent();
   datetime nowNY          = GMTToNY(TimeGMT());
   bool     pastEntryLimit = !Execution_IsWithinEntryWindow(nowNY);
   long     validitySecs   = (long)EXECUTION_LIMIT_VALIDITY_MINUTES * 60;

   CTrade trade;
   trade.SetExpertMagicNumber(BOT_MAGIC_NUMBER);

   int ordTotal = OrdersTotal();
   for(int i = ordTotal - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if((long)OrderGetInteger(ORDER_MAGIC) != BOT_MAGIC_NUMBER) continue;

      datetime placed   = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      bool     over45   = (now - placed) >= validitySecs;

      if(over45 || pastEntryLimit)
      {
         if(trade.OrderDelete(ticket))
            Print("[EXECUTION] Limit cancelado ticket=", ticket,
                  " | Razon: ", (over45 ? "45 min vencidos" : "fuera de ventana de entrada"));
         else
            Print("[EXECUTION] No se pudo cancelar ticket=", ticket,
                  " | err=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }
   }
}

// Loggea el resultado de un intento de apertura.
void Execution_LogResult(TradeOpenResult &r)
{
   string dirStr = (r.direction == DIR_BULLISH ? "LONG" : "SHORT");

   if(r.result == TRADE_OPENED)
   {
      string kindStr = (r.orderKind == ORDER_KIND_MARKET ? "MARKET" : "LIMIT");
      Print("======= EXECUTION OK =======");
      Print("[EXECUTION] ", kindStr, " ", dirStr, " | ", r.symbol,
            " | Ticket: ", r.ticket,
            " | Lotes: ", DoubleToString(r.lots, 2));
      if(r.orderKind == ORDER_KIND_MARKET)
         Print("  Precio ejecutado: ", DoubleToString(r.executedPrice, 5));
      else
         Print("  Precio limit: ", DoubleToString(r.requestedPrice, 5),
               " (valido ", EXECUTION_LIMIT_VALIDITY_MINUTES, " min)");
      Print("  SL: ", DoubleToString(r.sl, 5),
            " | TP: sin TP fijo (trailing escalonado Modulo 9)");
      Print("  Comment: ", r.comment, " | Magic: ", r.magicNumber);
      Print("============================");
   }
   else
   {
      Print("[EXECUTION] ", TradeResultToString(r.result),
            " | ", r.symbol, " ", dirStr,
            " | Razon: ", r.rejectionReason);
   }
}

// Apertura principal. Recibe setup + sizing (ya calculado y validado en
// Setup_Process). Decide Market vs Limit, aplica caps, envia la orden.
TradeOpenResult Execution_OpenFromSizing(TradeSetup &setup, SizingResult &sizing)
{
   TradeOpenResult r;
   r.symbol          = setup.symbol;
   r.direction       = setup.direction;
   r.magicNumber     = BOT_MAGIC_NUMBER;
   r.ticket          = 0;
   r.rejectionReason = "";
   r.orderKind       = ORDER_KIND_MARKET;
   r.requestedPrice  = 0.0;
   r.executedPrice   = 0.0;
   r.lots            = 0.0;
   r.sl              = 0.0;
   r.tp              = 0.0;
   r.comment         = "";

   // 0) Modulo 12: kill switch bloquea aperturas (defensa en profundidad;
   // OnTick ya hace early return, pero por si alguien llama esta funcion
   // por otra via).
   if(KillSwitch_IsActive())
   {
      r.result          = TRADE_REJECTED_FILTER;
      r.rejectionReason = StringFormat("Kill switch ACTIVO (%s) - operacion bloqueada",
                                       KillSwitch_GetReason());
      return r;
   }

   // 1) Sizing valido
   if(!sizing.isValid)
   {
      r.result          = TRADE_INVALID_SIZING;
      r.rejectionReason = sizing.rejectionReason;
      return r;
   }

   // 1b) Filtros pre-entrada (Modulo 10: spread / ATR / viernes-tarde)
   FilterCheckResult filterResult = Filters_CheckEntry(setup.symbol);
   if(!filterResult.passed)
   {
      r.result          = TRADE_REJECTED_FILTER;
      r.rejectionReason = filterResult.reason;
      Filters_LogCheck(setup.symbol, filterResult);
      return r;
   }

   // 2) Daily loss bloqueado?
   if(Execution_IsDailyLossExceeded())
   {
      r.result          = TRADE_REJECTED_DAILY;
      r.rejectionReason = "Daily loss -1.5% alcanzado. Bloqueado hasta 07:00 NY del dia siguiente.";
      return r;
   }

   // 3) Cap de riesgo total
   double currentRisk   = Execution_GetCurrentRiskExposure("");
   double remainingRisk = EXECUTION_RISK_CAP_PCT - currentRisk;

   if(remainingRisk < SIZING_MIN_RISK_PCT)
   {
      r.result          = TRADE_REJECTED_RISK;
      r.rejectionReason = StringFormat("Cap riesgo: actual %.2f%%, nuevo necesita %.2f%%, queda %.2f%% (minimo %.2f%%)",
                                       currentRisk, sizing.riskEffectivePct,
                                       remainingRisk, (double)SIZING_MIN_RISK_PCT);
      return r;
   }

   // 4) Si el riesgo solicitado excede el espacio disponible, reducir lotaje
   double effectiveRisk = sizing.riskEffectivePct;
   double effectiveLots = sizing.lotsFinal;
   bool   wasScaled     = false;

   if(effectiveRisk > remainingRisk)
   {
      double ratio = remainingRisk / effectiveRisk;
      effectiveLots = sizing.lotsFinal * ratio;

      double lotStep = SymbolInfoDouble(setup.symbol, SYMBOL_VOLUME_STEP);
      double lotMin  = SymbolInfoDouble(setup.symbol, SYMBOL_VOLUME_MIN);
      if(lotStep <= 0.0) lotStep = 0.01;
      effectiveLots = MathFloor(effectiveLots / lotStep) * lotStep;

      if(effectiveLots < lotMin)
      {
         r.result          = TRADE_REJECTED_RISK;
         r.rejectionReason = StringFormat("Lotaje escalado (%.4f) cae bajo VOLUME_MIN=%.2f", effectiveLots, lotMin);
         return r;
      }
      effectiveRisk = remainingRisk;
      wasScaled     = true;
   }

   r.lots = effectiveLots;
   r.sl   = sizing.slPrice;
   r.tp   = 0.0;   // Sin TP fijo - el cierre lo gestiona Modulo 9 via trailing escalonado.

   // 5) Hibrido Market vs Limit
   double currentPrice = (setup.direction == DIR_BEARISH
                          ? SymbolInfoDouble(setup.symbol, SYMBOL_BID)
                          : SymbolInfoDouble(setup.symbol, SYMBOL_ASK));
   double pip            = GetPipSize(setup.symbol);
   double threshold      = EXECUTION_HYBRID_THRESHOLD_PIPS * pip;

   bool useMarket = false;
   if(setup.hasFVG)
   {
      bool insideFVG = (currentPrice >= setup.fvg.bottom &&
                        currentPrice <= setup.fvg.top);
      bool nearFVG   = (currentPrice >= setup.fvg.bottom - threshold &&
                        currentPrice <= setup.fvg.top    + threshold);
      useMarket = (insideFVG || nearFVG);
   }
   else
   {
      useMarket = true;  // Sin FVG (solo CHoCH) -> entrada inmediata
   }

   r.orderKind      = (useMarket ? ORDER_KIND_MARKET : ORDER_KIND_LIMIT);
   r.requestedPrice = (useMarket ? currentPrice : sizing.entryPrice);

   string qualStr = (setup.quality == SETUP_QUALITY_HIGH   ? "H" :
                     setup.quality == SETUP_QUALITY_MEDIUM ? "M" : "L");
   r.comment = StringFormat("GIO-%s-%s-Q%d%s",
                            qualStr,
                            EnumToString(setup.sweep.timeframe),
                            setup.qualityScore,
                            (wasScaled ? "-RC" : ""));

   // ============= TODO Modulo 10: filtros pre-ejecucion =============
   // - Spread filter (rechazar si spread > N pips)
   // - ATR sanity check (sl_pips razonable vs volatilidad actual)
   // - Viernes tarde / news high-impact
   // Se implementaran como early-return TRADE_REJECTED_SPREAD/etc.
   // =================================================================

   // 6) Enviar orden via CTrade
   CTrade trade;
   trade.SetExpertMagicNumber(BOT_MAGIC_NUMBER);
   trade.SetDeviationInPoints(EXECUTION_SLIPPAGE_POINTS);
   trade.SetTypeFillingBySymbol(setup.symbol);

   bool sent = false;

   // TP siempre 0.0 (sin TP fijo) - Modulo 9 cierra via trailing escalonado.
   if(useMarket)
   {
      if(setup.direction == DIR_BEARISH)
         sent = trade.Sell(effectiveLots, setup.symbol, 0.0, r.sl, 0.0, r.comment);
      else
         sent = trade.Buy (effectiveLots, setup.symbol, 0.0, r.sl, 0.0, r.comment);
   }
   else
   {
      datetime expiration = TimeCurrent() + (datetime)EXECUTION_LIMIT_VALIDITY_MINUTES * 60;
      if(setup.direction == DIR_BEARISH)
         sent = trade.SellLimit(effectiveLots, r.requestedPrice, setup.symbol,
                                r.sl, 0.0, ORDER_TIME_SPECIFIED, expiration, r.comment);
      else
         sent = trade.BuyLimit (effectiveLots, r.requestedPrice, setup.symbol,
                                r.sl, 0.0, ORDER_TIME_SPECIFIED, expiration, r.comment);
   }

   if(!sent)
   {
      r.result          = TRADE_FAILED_SEND;
      r.rejectionReason = StringFormat("OrderSend fallo: code=%d, %s",
                                       trade.ResultRetcode(),
                                       trade.ResultRetcodeDescription());
      return r;
   }

   r.ticket        = trade.ResultOrder();
   r.executedPrice = (useMarket ? trade.ResultPrice() : 0.0);
   r.result        = TRADE_OPENED;
   return r;
}

#endif // EXECUTION_MQH
