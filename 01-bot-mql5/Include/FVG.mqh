//+------------------------------------------------------------------+
//| FVG.mqh - Modulo 3: deteccion de Fair Value Gaps e IFVGs (ICT)   |
//|                                                                  |
//| Un FVG es un desbalance de 3 velas donde la mecha de la vela 1   |
//| no se solapa con la mecha de la vela 3. Cuando un FVG se cierra  |
//| del lado opuesto se invalida y se convierte en IFVG (zona        |
//| inversa). Este modulo NO opera, solo detecta y trackea estados.  |
//+------------------------------------------------------------------+
#ifndef FVG_MQH
#define FVG_MQH

#include <Common.mqh>

//============================ PARAMETROS ============================
#define FVG_MIN_SIZE_PIPS    1.5    // Gaps mas pequenos = ruido
#define FVG_MAX_AGE_BARS     50     // Expira despues de N barras del TF
#define FVG_MIN_DISPLACEMENT 0.5    // Body vela 2 vs promedio circundante (factor multiplicativo)
#define FVG_SCAN_BARS        20     // Cuantas velas escanear cada call

//============================ STORAGE ===============================
// Storage global: contiene FVGs en TODOS los estados (Fresh + Mitigated + Invalidated).
// Los Invalidated se mantienen porque siguen siendo utiles como IFVG.
FVGZone s_fvgs[];

//============================ HELPERS ===============================

ENUM_TIMEFRAMES FVGMqlTimeframe(ENUM_FVG_TIMEFRAME tf)
{
   switch(tf)
   {
      case FVG_TF_H1:  return PERIOD_H1;
      case FVG_TF_M15: return PERIOD_M15;
      case FVG_TF_M5:  return PERIOD_M5;
      case FVG_TF_M3:  return PERIOD_M3;
      case FVG_TF_M1:  return PERIOD_M1;
   }
   return PERIOD_H1;
}

string FVGTimeframeToString(ENUM_FVG_TIMEFRAME tf)
{
   switch(tf)
   {
      case FVG_TF_H1:  return "H1";
      case FVG_TF_M15: return "M15";
      case FVG_TF_M5:  return "M5";
      case FVG_TF_M3:  return "M3";
      case FVG_TF_M1:  return "M1";
   }
   return "?";
}

string FVGStateToString(ENUM_FVG_STATE s)
{
   switch(s)
   {
      case FVG_FRESH:       return "FRESH";
      case FVG_MITIGATED:   return "MITIG";
      case FVG_INVALIDATED: return "INVAL";
   }
   return "?";
}

int FVGTimeframeBonus(ENUM_FVG_TIMEFRAME tf)
{
   switch(tf)
   {
      case FVG_TF_H1:  return 3;
      case FVG_TF_M15: return 2;
      case FVG_TF_M5:  return 1;
      case FVG_TF_M3:  return 1;
      case FVG_TF_M1:  return 0;
   }
   return 0;
}

// Quality 1-10. v2BodyRatio = bodyV2 / avgBody (lo necesario para el bonus de displacement).
int CalculateFVGQuality(FVGZone &fvg, double v2BodyRatio)
{
   double score = 0.0;

   // 1) Tamano del gap
   if(fvg.sizePips >= 1.5 && fvg.sizePips <  3.0)       score += 2.0;
   else if(fvg.sizePips >= 3.0 && fvg.sizePips <  7.0)  score += 3.0;
   else if(fvg.sizePips >= 7.0 && fvg.sizePips <= 15.0) score += 4.0;
   else if(fvg.sizePips > 15.0)                          score += 2.0;

   // 2) Displacement: body de vela 2 al menos 2x el promedio = +2
   if(v2BodyRatio > 2.0) score += 2.0;

   // 3) Timeframe
   score += FVGTimeframeBonus(fvg.timeframe);

   // 4) Estado
   if(fvg.state == FVG_FRESH)          score += 1.0;
   else if(fvg.state == FVG_MITIGATED) score -= 1.0;

   int q = (int)MathRound(score);
   if(q < 1)  q = 1;
   if(q > 10) q = 10;
   return q;
}

// Dedup: existe ya un FVG con misma key (symbol+TF+type+formedAt)?
bool FVGAlreadyExists(string symbol, ENUM_FVG_TIMEFRAME tf, ENUM_FVG_TYPE type, datetime formedAt)
{
   int n = ArraySize(s_fvgs);
   for(int i = 0; i < n; i++)
   {
      if(s_fvgs[i].symbol    == symbol  &&
         s_fvgs[i].timeframe == tf      &&
         s_fvgs[i].type      == type    &&
         s_fvgs[i].formedAt  == formedAt)
         return true;
   }
   return false;
}

//============================ API PUBLICA ===========================

void FVG_Init()
{
   ArrayResize(s_fvgs, 0);
}

bool FVG_IsPriceInside(FVGZone &fvg, double price)
{
   return (price >= fvg.bottom && price <= fvg.top);
}

void FVG_LogEvent(FVGZone &fvg, string action)
{
   string typeStr  = (fvg.type == FVG_BULLISH ? "BULL" : "BEAR");
   string stateStr = FVGStateToString(fvg.state);
   string tfStr    = FVGTimeframeToString(fvg.timeframe);

   Print("[FVG-", tfStr, "] ", action, " | ", typeStr, " | ", fvg.symbol,
         " | State: ", stateStr,
         " | Top: ", DoubleToString(fvg.top, 5),
         " | Bot: ", DoubleToString(fvg.bottom, 5),
         " | Size: ", DoubleToString(fvg.sizePips, 1), " pips",
         " | Q: ", fvg.quality, "/10",
         (fvg.isIFVG ? " | IFVG" : ""));
}

// Detecta FVGs frescos en las ultimas FVG_SCAN_BARS velas cerradas.
// Solo retorna NUEVOS (dedup contra storage interno).
int FVG_Detect(string symbol, ENUM_FVG_TIMEFRAME tf, FVGZone &out[])
{
   ArrayResize(out, 0);

   double pip = GetPipSize(symbol);
   if(pip <= 0.0) return 0;

   ENUM_TIMEFRAMES mtf = FVGMqlTimeframe(tf);

   for(int shift = 1; shift <= FVG_SCAN_BARS; shift++)
   {
      // 3 velas consecutivas cerradas: shift+2 (vela 1, mas vieja), shift+1 (vela 2), shift (vela 3)
      double h1 = iHigh (symbol, mtf, shift + 2);
      double l1 = iLow  (symbol, mtf, shift + 2);
      double o1 = iOpen (symbol, mtf, shift + 2);
      double c1 = iClose(symbol, mtf, shift + 2);

      double o2 = iOpen (symbol, mtf, shift + 1);
      double c2 = iClose(symbol, mtf, shift + 1);

      double h3 = iHigh (symbol, mtf, shift);
      double l3 = iLow  (symbol, mtf, shift);
      double o3 = iOpen (symbol, mtf, shift);
      double c3 = iClose(symbol, mtf, shift);

      if(h1 <= 0.0 || h3 <= 0.0 || l1 <= 0.0 || l3 <= 0.0) continue;

      datetime formed = iTime(symbol, mtf, shift);

      double bodyV1 = MathAbs(c1 - o1);
      double bodyV2 = MathAbs(c2 - o2);
      double bodyV3 = MathAbs(c3 - o3);
      double avgBody = (bodyV1 + bodyV3) / 2.0;

      // Displacement: body de vela 2 vs promedio circundante
      bool displacementOk = (avgBody <= 0.0) ? (bodyV2 > 0.0)
                                             : (bodyV2 > avgBody * FVG_MIN_DISPLACEMENT);
      if(!displacementOk) continue;

      double bodyRatio = (avgBody > 0.0 ? bodyV2 / avgBody : 0.0);

      // BULLISH FVG: low de vela 3 > high de vela 1
      if(l3 > h1)
      {
         double gapTop    = l3;
         double gapBottom = h1;
         double gapSize   = (gapTop - gapBottom) / pip;

         if(gapSize >= FVG_MIN_SIZE_PIPS &&
            !FVGAlreadyExists(symbol, tf, FVG_BULLISH, formed))
         {
            FVGZone fvg;
            fvg.formedAt      = formed;
            fvg.type          = FVG_BULLISH;
            fvg.state         = FVG_FRESH;
            fvg.timeframe     = tf;
            fvg.symbol        = symbol;
            fvg.top           = gapTop;
            fvg.bottom        = gapBottom;
            fvg.sizePips      = gapSize;
            fvg.mitigatedAt   = 0;
            fvg.invalidatedAt = 0;
            fvg.isIFVG        = false;
            fvg.quality       = CalculateFVGQuality(fvg, bodyRatio);

            int sn = ArraySize(s_fvgs);
            ArrayResize(s_fvgs, sn + 1);
            s_fvgs[sn] = fvg;

            int on = ArraySize(out);
            ArrayResize(out, on + 1);
            out[on] = fvg;
         }
      }

      // BEARISH FVG: high de vela 3 < low de vela 1
      if(h3 < l1)
      {
         double gapTop    = l1;
         double gapBottom = h3;
         double gapSize   = (gapTop - gapBottom) / pip;

         if(gapSize >= FVG_MIN_SIZE_PIPS &&
            !FVGAlreadyExists(symbol, tf, FVG_BEARISH, formed))
         {
            FVGZone fvg;
            fvg.formedAt      = formed;
            fvg.type          = FVG_BEARISH;
            fvg.state         = FVG_FRESH;
            fvg.timeframe     = tf;
            fvg.symbol        = symbol;
            fvg.top           = gapTop;
            fvg.bottom        = gapBottom;
            fvg.sizePips      = gapSize;
            fvg.mitigatedAt   = 0;
            fvg.invalidatedAt = 0;
            fvg.isIFVG        = false;
            fvg.quality       = CalculateFVGQuality(fvg, bodyRatio);

            int sn = ArraySize(s_fvgs);
            ArrayResize(s_fvgs, sn + 1);
            s_fvgs[sn] = fvg;

            int on = ArraySize(out);
            ArrayResize(out, on + 1);
            out[on] = fvg;
         }
      }
   }

   return ArraySize(out);
}

// FVGs activos = Fresh + Mitigated (no Invalidated).
int FVG_GetActive(string symbol, ENUM_FVG_TIMEFRAME tf, FVGZone &out[])
{
   ArrayResize(out, 0);
   int n = ArraySize(s_fvgs);
   int count = 0;
   for(int i = 0; i < n; i++)
   {
      if(s_fvgs[i].symbol    == symbol &&
         s_fvgs[i].timeframe == tf     &&
         s_fvgs[i].state     != FVG_INVALIDATED)
      {
         ArrayResize(out, count + 1);
         out[count] = s_fvgs[i];
         count++;
      }
   }
   return count;
}

// IFVGs = invalidados por cierre del lado opuesto (isIFVG=true).
int FVG_GetIFVGs(string symbol, ENUM_FVG_TIMEFRAME tf, FVGZone &out[])
{
   ArrayResize(out, 0);
   int n = ArraySize(s_fvgs);
   int count = 0;
   for(int i = 0; i < n; i++)
   {
      if(s_fvgs[i].symbol    == symbol &&
         s_fvgs[i].timeframe == tf     &&
         s_fvgs[i].state     == FVG_INVALIDATED &&
         s_fvgs[i].isIFVG)
      {
         ArrayResize(out, count + 1);
         out[count] = s_fvgs[i];
         count++;
      }
   }
   return count;
}

// Revisa FVGs activos del symbol/TF y actualiza estados segun el ultimo cierre.
// Loggea transiciones via FVG_LogEvent.
// NOTA: la calidad NO se recalcula en transiciones (preserva el score original
// del momento de deteccion). El estado actual se consulta por separado.
void FVG_UpdateStates(string symbol, ENUM_FVG_TIMEFRAME tf)
{
   ENUM_TIMEFRAMES mtf = FVGMqlTimeframe(tf);
   double lastClose       = iClose(symbol, mtf, 1);
   datetime lastCloseTime = iTime (symbol, mtf, 1);
   if(lastClose <= 0.0) return;

   int barDurSecs = PeriodSeconds(mtf);
   datetime now   = TimeCurrent();

   int n = ArraySize(s_fvgs);
   for(int i = 0; i < n; i++)
   {
      if(s_fvgs[i].symbol != symbol) continue;
      if(s_fvgs[i].timeframe != tf) continue;
      if(s_fvgs[i].state == FVG_INVALIDATED) continue;

      // Decaimiento por edad (no es IFVG, solo expirado)
      if(barDurSecs > 0)
      {
         int elapsedBars = (int)((now - s_fvgs[i].formedAt) / barDurSecs);
         if(elapsedBars > FVG_MAX_AGE_BARS)
         {
            s_fvgs[i].state         = FVG_INVALIDATED;
            s_fvgs[i].invalidatedAt = lastCloseTime;
            FVG_LogEvent(s_fvgs[i], "EXPIRED");
            continue;
         }
      }

      ENUM_FVG_STATE oldState = s_fvgs[i].state;
      bool changed = false;

      if(s_fvgs[i].type == FVG_BULLISH)
      {
         if(lastClose < s_fvgs[i].bottom)
         {
            s_fvgs[i].state         = FVG_INVALIDATED;
            s_fvgs[i].isIFVG        = true;
            s_fvgs[i].invalidatedAt = lastCloseTime;
            changed = true;
         }
         else if(oldState == FVG_FRESH && FVG_IsPriceInside(s_fvgs[i], lastClose))
         {
            s_fvgs[i].state       = FVG_MITIGATED;
            s_fvgs[i].mitigatedAt = lastCloseTime;
            changed = true;
         }
      }
      else // FVG_BEARISH
      {
         if(lastClose > s_fvgs[i].top)
         {
            s_fvgs[i].state         = FVG_INVALIDATED;
            s_fvgs[i].isIFVG        = true;
            s_fvgs[i].invalidatedAt = lastCloseTime;
            changed = true;
         }
         else if(oldState == FVG_FRESH && FVG_IsPriceInside(s_fvgs[i], lastClose))
         {
            s_fvgs[i].state       = FVG_MITIGATED;
            s_fvgs[i].mitigatedAt = lastCloseTime;
            changed = true;
         }
      }

      if(changed)
         FVG_LogEvent(s_fvgs[i], "UPDATE");
   }
}

#endif // FVG_MQH
