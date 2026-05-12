//+------------------------------------------------------------------+
//| Sweep.mqh - Modulo 2: deteccion de sweeps de liquidez (ICT)      |
//|                                                                  |
//| Un sweep es una mecha que perfora un nivel de liquidez y la vela |
//| cierra del lado original. NO opera, solo detecta.                |
//+------------------------------------------------------------------+
#ifndef SWEEP_MQH
#define SWEEP_MQH

#include <Common.mqh>
#include <Liquidity.mqh>

//============================ PARAMETROS ============================
#define SWEEP_MIN_PERFORATION_PIPS 1.0    // Minimo de pips para considerar sweep
#define SWEEP_MAX_PERFORATION_PIPS 30.0   // Mas que esto es break exagerado
#define SWEEP_MIN_CLOSE_RATIO      0.30   // Cierre debe estar al menos 30% del rango
#define SWEEP_MIN_QUALITY          5      // Score minimo para considerar sweep valido
#define SWEEP_SCAN_BARS            10     // Cuantas velas cerradas escanear

//============================ HELPERS ===============================

ENUM_TIMEFRAMES MqlTimeframe(ENUM_SWEEP_TIMEFRAME tf)
{
   switch(tf)
   {
      case SWEEP_TF_H4:  return PERIOD_H4;
      case SWEEP_TF_H1:  return PERIOD_H1;
      case SWEEP_TF_M15: return PERIOD_M15;
      case SWEEP_TF_M5:  return PERIOD_M5;
   }
   return PERIOD_H1;
}

string SweepTimeframeToString(ENUM_SWEEP_TIMEFRAME tf)
{
   switch(tf)
   {
      case SWEEP_TF_H4:  return "H4";
      case SWEEP_TF_H1:  return "H1";
      case SWEEP_TF_M15: return "M15";
      case SWEEP_TF_M5:  return "M5";
   }
   return "?";
}

int TimeframeBonus(ENUM_SWEEP_TIMEFRAME tf)
{
   switch(tf)
   {
      case SWEEP_TF_H4:  return 3;
      case SWEEP_TF_H1:  return 2;
      case SWEEP_TF_M15: return 1;
      case SWEEP_TF_M5:  return 0;
   }
   return 0;
}

bool IsMajorLevel(ENUM_LIQUIDITY_TYPE t)
{
   return (t == LIQ_PDH || t == LIQ_PDL || t == LIQ_PWH || t == LIQ_PWL);
}

bool IsEqualLevel(ENUM_LIQUIDITY_TYPE t)
{
   return (t == LIQ_EQH || t == LIQ_EQL);
}

// Calcula score 1-10. closeRatio se pasa porque varia segun direccion.
int CalculateQuality(SweepEvent &ev, double closeRatio)
{
   double score = 0.0;

   // 1) Strength del nivel barrido (peso 30%)
   score += ev.levelSwept.strength * 0.3;

   // 2) Bonus por timeframe
   score += TimeframeBonus(ev.timeframe);

   // 3) Cierre fuerte / debil
   if(closeRatio >= 0.70)
      score += 2.0;
   else if(closeRatio < 0.40)
      score -= 1.0; // cierre debil (rango 0.30-0.40)

   // 4) Perforacion moderada vs excesiva
   if(ev.pipsPerforated >= 3.0 && ev.pipsPerforated <= 15.0)
      score += 1.0;
   if(ev.pipsPerforated > 20.0)
      score -= 2.0;

   // 5) Tipo de nivel
   if(IsMajorLevel(ev.levelSwept.type))
      score += 1.0;
   if(IsEqualLevel(ev.levelSwept.type))
      score += 2.0;

   // 6) Penalizar niveles muy antiguos (>5 dias)
   if(TimeCurrent() - ev.levelSwept.formedAt > 5 * 24 * 3600)
      score -= 1.0;

   int q = (int)MathRound(score);
   if(q < 1)  q = 1;
   if(q > 10) q = 10;
   return q;
}

//============================ API PUBLICA ===========================

void Sweep_Init()
{
   // No global state aun. Reservado para V2 (cache de sweeps detectados).
}

// Devuelve true si el sweep cumple los criterios minimos.
bool Sweep_IsValid(SweepEvent &sweep)
{
   if(sweep.quality < SWEEP_MIN_QUALITY) return false;
   if(sweep.pipsPerforated < SWEEP_MIN_PERFORATION_PIPS) return false;
   if(sweep.pipsPerforated > SWEEP_MAX_PERFORATION_PIPS) return false;
   return true;
}

// Loggea detalles del sweep en formato consistente.
void Sweep_LogEvent(SweepEvent &sweep)
{
   string dirStr = (sweep.direction == SWEEP_BULLISH ? "BULL" : "BEAR");
   string tfStr  = SweepTimeframeToString(sweep.timeframe);
   Print("[SWEEP-", tfStr, "] ", dirStr, " | ", sweep.symbol,
         " | Level: ", EnumToString(sweep.levelSwept.type),
         " @ ", DoubleToString(sweep.levelSwept.price, 5),
         " | Wick: ", DoubleToString(sweep.wickPrice, 5),
         " | Close: ", DoubleToString(sweep.closePrice, 5),
         " | Pips perf: ", DoubleToString(sweep.pipsPerforated, 1),
         " | Quality: ", sweep.quality, "/10");
}

// Escanea las ultimas SWEEP_SCAN_BARS velas cerradas (shift 1..N) y detecta sweeps.
// Solo reporta un sweep por nivel (el mas reciente que valida).
// Marca los niveles como swept en Liquidity para que no se redisparen.
int Sweep_Detect(string symbol, ENUM_SWEEP_TIMEFRAME tf, SweepEvent &out[])
{
   ArrayResize(out, 0);

   double pip = GetPipSize(symbol);
   if(pip <= 0.0)
   {
      Print("WARN [Sweep] pipSize<=0 para ", symbol, " - simbolo invalido?");
      return 0;
   }

   ENUM_TIMEFRAMES mtf = MqlTimeframe(tf);

   // Snapshot de niveles activos (no barridos)
   LiquidityLevel levels[];
   int levelCount = Liquidity_GetActive(symbol, levels);
   if(levelCount == 0) return 0;

   // Tracker local para no procesar 2 veces el mismo nivel
   bool handled[];
   ArrayResize(handled, levelCount);
   for(int i = 0; i < levelCount; i++) handled[i] = false;

   // shift 1 = vela mas reciente cerrada; iteramos hacia atras
   for(int shift = 1; shift <= SWEEP_SCAN_BARS; shift++)
   {
      double highP  = iHigh (symbol, mtf, shift);
      double lowP   = iLow  (symbol, mtf, shift);
      double closeP = iClose(symbol, mtf, shift);
      datetime cTime = iTime(symbol, mtf, shift);

      if(highP <= 0.0 || lowP <= 0.0) continue;
      if(highP == lowP) continue; // proteccion div/0

      for(int k = 0; k < levelCount; k++)
      {
         if(handled[k]) continue;
         LiquidityLevel lvl = levels[k];

         // El nivel debe haberse formado ANTES de la vela
         if(cTime <= lvl.formedAt) continue;

         bool sweptOk = false;
         double pipsPerf = 0.0;
         double closeRatio = 0.0;

         if(lvl.isHigh)
         {
            // BEARISH SWEEP: high perfora arriba, close vuelve abajo
            if(highP <= lvl.price) continue;
            if(closeP >= lvl.price) continue;

            pipsPerf = (highP - lvl.price) / pip;
            if(pipsPerf < SWEEP_MIN_PERFORATION_PIPS) continue;
            if(pipsPerf > SWEEP_MAX_PERFORATION_PIPS) continue;

            double denom = highP - closeP;
            if(denom <= 0.0) continue;
            closeRatio = (lvl.price - closeP) / denom;
            if(closeRatio < SWEEP_MIN_CLOSE_RATIO) continue;

            sweptOk = true;
         }
         else
         {
            // BULLISH SWEEP: low perfora abajo, close vuelve arriba
            if(lowP >= lvl.price) continue;
            if(closeP <= lvl.price) continue;

            pipsPerf = (lvl.price - lowP) / pip;
            if(pipsPerf < SWEEP_MIN_PERFORATION_PIPS) continue;
            if(pipsPerf > SWEEP_MAX_PERFORATION_PIPS) continue;

            double denom = closeP - lowP;
            if(denom <= 0.0) continue;
            closeRatio = (closeP - lvl.price) / denom;
            if(closeRatio < SWEEP_MIN_CLOSE_RATIO) continue;

            sweptOk = true;
         }

         if(!sweptOk) continue;

         // Construir SweepEvent
         SweepEvent ev;
         ev.detectedAt     = TimeCurrent();
         ev.candleTime     = cTime;
         ev.direction      = (lvl.isHigh ? SWEEP_BEARISH : SWEEP_BULLISH);
         ev.timeframe      = tf;
         ev.symbol         = symbol;
         ev.levelSwept     = lvl;
         ev.wickPrice      = (lvl.isHigh ? highP : lowP);
         ev.closePrice     = closeP;
         ev.pipsPerforated = pipsPerf;
         ev.quality        = CalculateQuality(ev, closeRatio);

         if(ev.quality < SWEEP_MIN_QUALITY) continue;

         int nOut = ArraySize(out);
         ArrayResize(out, nOut + 1);
         out[nOut] = ev;
         handled[k] = true;
         Liquidity_MarkSwept(lvl, cTime);
      }
   }

   return ArraySize(out);
}

#endif // SWEEP_MQH
