//+------------------------------------------------------------------+
//| Sizing.mqh - Modulo 7: calculo de riesgo y lotes por setup.      |
//|                                                                  |
//| NO ejecuta trades. Toma un TradeSetup CONFIRMED y produce un     |
//| SizingResult con entry/SL/TPs/lotes calculados, y loggea         |
//| "HABRIA OPERADO CON X LOTES".                                    |
//|                                                                  |
//| Decisiones de diseno (confirmadas por Sergio):                   |
//|   1. SIN limite duro de SL: se opera todo setup, sin importar    |
//|      pips. Si la math da 0.01 lotes, es valido.                  |
//|   2. Piso de riesgo 0.5%: tras multiplicadores, redondear hacia  |
//|      arriba al piso. Nunca operar con menos.                     |
//|   3. NY Lunch (11:00-12:30 NY) cuenta como killzone (mult 1.0).  |
//|                                                                  |
//| Formula:                                                         |
//|   riesgo_base    = 1.5/1.0/0.5 segun HIGH/MEDIUM/LOW             |
//|   mult_bias      = Bias_GetSizeMultiplier (1.0 a favor / 0.5 ctra)|
//|   mult_kz        = 1.0 dentro KZ, 0.75 sesion sin KZ             |
//|   riesgo_efect%  = MAX(0.5, base x mult_bias x mult_kz)          |
//|   riesgo_usd     = balance x riesgo_efect / 100                  |
//|   sl_pips        = |entry - SL| / pip                            |
//|   valor_pip_lote = TickValue x (pip / TickSize)                  |
//|   lotes_raw      = riesgo_usd / (sl_pips x valor_pip_lote)       |
//|   lotes_final    = floor(lotes_raw / VOLUME_STEP) x VOLUME_STEP  |
//|                    clamp(VOLUME_MIN, VOLUME_MAX)                 |
//+------------------------------------------------------------------+
#ifndef SIZING_MQH
#define SIZING_MQH

#include <Common.mqh>
#include <Liquidity.mqh>   // GMTToNY
#include <Bias.mqh>

//============================ PARAMETROS ============================
#define SIZING_SL_BUFFER_PIPS    3.0    // Buffer detras del wick del sweep
#define SIZING_TP1_RR            1.5    // R:R del primer parcial (50%)
#define SIZING_TP2_RR            3.0    // R:R del segundo parcial (30%)
#define SIZING_MIN_RISK_PCT      0.5    // Piso de riesgo efectivo
#define SIZING_RISK_HIGH         1.5
#define SIZING_RISK_MEDIUM       1.0
#define SIZING_RISK_LOW          0.5
#define SIZING_MULT_KILLZONE     1.0
#define SIZING_MULT_NO_KILLZONE  0.75
#define SIZING_MULT_BIAS_AGAINST 0.5    // Informativo; el factor real lo da Bias_GetSizeMultiplier

//============================ API PUBLICA ===========================

void Sizing_Init()
{
   // Stateless: existe por simetria con los demas modulos.
}

// Killzone status para un datetime ya en hora NY.
// London KZ: 02:00-05:00 (120-300)
// NY AM:     07:00-10:00 (420-600)
// NY Lunch:  11:00-12:30 (660-750) -- cuenta como killzone (decision Sergio)
// IN_SESSION_NO_KZ cubre el hueco 05:00-07:00 (Londres tardio) y 10:00-11:00
// (NY pre-lunch). El cierre de NY es 12:30 (750).
ENUM_KILLZONE_STATUS Sizing_GetKillzoneStatus(datetime nowNY)
{
   MqlDateTime dt;
   TimeToStruct(nowNY, dt);
   int minOfDay = dt.hour * 60 + dt.min;

   // Killzones
   if(minOfDay >= 120 && minOfDay < 300) return IN_KILLZONE;   // London KZ
   if(minOfDay >= 420 && minOfDay < 600) return IN_KILLZONE;   // NY AM
   if(minOfDay >= 660 && minOfDay < 750) return IN_KILLZONE;   // NY Lunch

   // En sesion (Londres 02:00-07:00 / NY 07:00-12:30) pero fuera de KZ
   if(minOfDay >= 120 && minOfDay < 750) return IN_SESSION_NO_KZ;

   return OUTSIDE_SESSION;
}

string KillzoneStatusToString(ENUM_KILLZONE_STATUS s)
{
   switch(s)
   {
      case IN_KILLZONE:      return "KZ";
      case IN_SESSION_NO_KZ: return "SESION-NO-KZ";
      case OUTSIDE_SESSION:  return "FUERA";
   }
   return "?";
}

// Calcula sizing completo para un setup. Asume setup.state == SETUP_CONFIRMED,
// pero no lo verifica (Setup.mqh es quien decide cuando llamar).
SizingResult Sizing_Calculate(TradeSetup &setup)
{
   SizingResult r;
   r.symbol           = setup.symbol;
   r.direction        = setup.direction;
   r.isValid          = true;
   r.rejectionReason  = "";
   r.entryPrice       = 0.0;
   r.slPrice          = 0.0;
   r.tp1Price         = 0.0;
   r.tp2Price         = 0.0;
   r.slPips           = 0.0;
   r.tp1Pips          = 0.0;
   r.tp2Pips          = 0.0;
   r.riskBasePct      = 0.0;
   r.multBias         = 1.0;
   r.multKillzone     = 0.0;
   r.riskEffectivePct = 0.0;
   r.riskUSD          = 0.0;
   r.lotsRaw          = 0.0;
   r.lotsFinal        = 0.0;
   r.killzoneStatus   = OUTSIDE_SESSION;
   r.biasAligned      = false;

   double pip = GetPipSize(setup.symbol);

   // === Entry: centro de la zona FVG, o precio actual si no hay FVG ===
   if(setup.hasFVG)
   {
      r.entryPrice = (setup.fvg.top + setup.fvg.bottom) / 2.0;
   }
   else
   {
      r.entryPrice = (setup.direction == DIR_BEARISH
                      ? SymbolInfoDouble(setup.symbol, SYMBOL_BID)
                      : SymbolInfoDouble(setup.symbol, SYMBOL_ASK));
   }

   // === SL detras del wick del sweep + buffer ===
   double bufferPrice = SIZING_SL_BUFFER_PIPS * pip;
   if(setup.direction == DIR_BEARISH)
      r.slPrice = setup.sweep.wickPrice + bufferPrice;
   else
      r.slPrice = setup.sweep.wickPrice - bufferPrice;

   // Validar entry vs SL
   if(MathAbs(r.entryPrice - r.slPrice) < pip * 0.5)
   {
      r.isValid         = false;
      r.rejectionReason = "Entry y SL estan demasiado cerca (<0.5 pips)";
      return r;
   }

   // Validar que el SL este del lado correcto. Si el FVG quedo del lado
   // equivocado del wick (caso anomalo), el calculo de R:R seria erroneo.
   if(setup.direction == DIR_BEARISH && r.slPrice <= r.entryPrice)
   {
      r.isValid         = false;
      r.rejectionReason = "SL <= entry en SHORT (geometria invalida)";
      return r;
   }
   if(setup.direction == DIR_BULLISH && r.slPrice >= r.entryPrice)
   {
      r.isValid         = false;
      r.rejectionReason = "SL >= entry en LONG (geometria invalida)";
      return r;
   }

   r.slPips = MathAbs(r.entryPrice - r.slPrice) / pip;

   // === TPs ===
   double slDistance = MathAbs(r.entryPrice - r.slPrice);
   if(setup.direction == DIR_BEARISH)
   {
      r.tp1Price = r.entryPrice - (slDistance * SIZING_TP1_RR);
      r.tp2Price = r.entryPrice - (slDistance * SIZING_TP2_RR);
   }
   else
   {
      r.tp1Price = r.entryPrice + (slDistance * SIZING_TP1_RR);
      r.tp2Price = r.entryPrice + (slDistance * SIZING_TP2_RR);
   }
   r.tp1Pips = r.slPips * SIZING_TP1_RR;
   r.tp2Pips = r.slPips * SIZING_TP2_RR;

   // === Riesgo base por calidad del setup ===
   switch(setup.quality)
   {
      case SETUP_QUALITY_HIGH:   r.riskBasePct = SIZING_RISK_HIGH;   break;
      case SETUP_QUALITY_MEDIUM: r.riskBasePct = SIZING_RISK_MEDIUM; break;
      case SETUP_QUALITY_LOW:    r.riskBasePct = SIZING_RISK_LOW;    break;
      default:                   r.riskBasePct = SIZING_RISK_LOW;    break;
   }

   // === Multiplicador bias (1.0 a favor o neutral, 0.5 contra) ===
   r.multBias     = Bias_GetSizeMultiplier(setup.symbol, setup.direction);
   r.biasAligned  = (r.multBias >= 1.0);

   // === Multiplicador killzone ===
   datetime nowNY = GMTToNY(TimeGMT());
   r.killzoneStatus = Sizing_GetKillzoneStatus(nowNY);
   if(r.killzoneStatus == IN_KILLZONE)
      r.multKillzone = SIZING_MULT_KILLZONE;
   else if(r.killzoneStatus == IN_SESSION_NO_KZ)
      r.multKillzone = SIZING_MULT_NO_KILLZONE;
   else
      r.multKillzone = 0.0;  // No deberia pasar: Setup_Process ya filtra horario

   // === Riesgo efectivo (piso 0.5%) ===
   r.riskEffectivePct = r.riskBasePct * r.multBias * r.multKillzone;
   if(r.riskEffectivePct < SIZING_MIN_RISK_PCT)
      r.riskEffectivePct = SIZING_MIN_RISK_PCT;

   // === Riesgo en USD ===
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   r.riskUSD = balance * (r.riskEffectivePct / 100.0);

   // === Valor de pip y lotes ===
   double tickValue = SymbolInfoDouble(setup.symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(setup.symbol, SYMBOL_TRADE_TICK_SIZE);

   if(tickValue <= 0.0 || tickSize <= 0.0)
   {
      r.isValid         = false;
      r.rejectionReason = "TickValue=0, mercado cerrado o simbolo invalido";
      return r;
   }

   double pipValuePerLot = tickValue * (pip / tickSize);

   if(r.slPips <= 0.0 || pipValuePerLot <= 0.0)
   {
      r.isValid         = false;
      r.rejectionReason = "SL pips o valor del pip invalido";
      return r;
   }

   r.lotsRaw = r.riskUSD / (r.slPips * pipValuePerLot);

   double lotStep = SymbolInfoDouble(setup.symbol, SYMBOL_VOLUME_STEP);
   double lotMin  = SymbolInfoDouble(setup.symbol, SYMBOL_VOLUME_MIN);
   double lotMax  = SymbolInfoDouble(setup.symbol, SYMBOL_VOLUME_MAX);

   if(lotStep <= 0.0) lotStep = 0.01;

   r.lotsFinal = MathFloor(r.lotsRaw / lotStep) * lotStep;

   // Bajo el minimo del broker: ajustar al minimo (informativo, no rechazar).
   // El log marca explicitamente "(ajustado al minimo)".
   if(r.lotsFinal < lotMin) r.lotsFinal = lotMin;
   if(lotMax > 0.0 && r.lotsFinal > lotMax) r.lotsFinal = lotMax;

   return r;
}

void Sizing_LogResult(SizingResult &r)
{
   if(!r.isValid)
   {
      Print("[SIZING] RECHAZADO | ", r.symbol, " | Razon: ", r.rejectionReason);
      return;
   }

   string dirStr = (r.direction == DIR_BULLISH ? "LONG" : "SHORT");
   string kzStr  = KillzoneStatusToString(r.killzoneStatus);
   double lotMin = SymbolInfoDouble(r.symbol, SYMBOL_VOLUME_MIN);
   bool   bumpedToMin = (r.lotsRaw < lotMin);

   Print("======= SIZING =======");
   Print("[SIZING] ", r.symbol, " ", dirStr,
         " | Entry: ", DoubleToString(r.entryPrice, 5),
         " | SL: ", DoubleToString(r.slPrice, 5),
         " (", DoubleToString(r.slPips, 1), " pips)");
   Print("  TP1: ", DoubleToString(r.tp1Price, 5),
         " (", DoubleToString(r.tp1Pips, 1), " pips, 50%)",
         " | TP2: ", DoubleToString(r.tp2Price, 5),
         " (", DoubleToString(r.tp2Pips, 1), " pips, 30%)");
   Print("  Riesgo: ", DoubleToString(r.riskBasePct, 2), "% base x ",
         DoubleToString(r.multBias, 2), " bias x ",
         DoubleToString(r.multKillzone, 2), " kz = ",
         DoubleToString(r.riskEffectivePct, 2), "% (",
         (r.biasAligned ? "a favor" : "CONTRA"), " bias, ", kzStr, ")");
   Print("  Riesgo USD: $", DoubleToString(r.riskUSD, 2),
         " | Lotes: ", DoubleToString(r.lotsFinal, 2),
         (bumpedToMin ? " (ajustado al minimo del broker)" : ""));
   Print("  >>> HABRIA OPERADO CON ", DoubleToString(r.lotsFinal, 2), " LOTES");
   Print("======================");
}

#endif // SIZING_MQH
