//+------------------------------------------------------------------+
//| Structure.mqh - Modulo 4: estructura HH/HL/LH/LL, CHoCH y BOS    |
//|                                                                  |
//| Detecta swing points con fractales de 5 barras, los clasifica    |
//| segun el ultimo swing del mismo tipo (high vs low) y mantiene la |
//| estructura dominante. Un CHoCH ocurre cuando el cierre rompe el  |
//| ultimo swing del lado opuesto a la tendencia previa. Un BOS es   |
//| la ruptura a favor de la tendencia (continuacion).               |
//+------------------------------------------------------------------+
#ifndef STRUCTURE_MQH
#define STRUCTURE_MQH

#include <Common.mqh>

//============================ PARAMETROS ============================
#define SWING_LOOKBACK_BARS      50    // Cuantas barras escanear hacia atras
#define SWING_MIN_BARS_BETWEEN    3    // Distancia minima entre swings consecutivos
#define SWING_FRACTAL_PERIOD      2    // Velas a cada lado para confirmar fractal (2 -> 5 velas)

//============================ STORAGE ===============================
// Lista global de eventos CHoCH/BOS confirmados. Dedupea por
// (symbol, tf, eventType, candleTime).
StructureEvent s_structEvents[];

//============================ HELPERS PRIVADOS ======================

ENUM_TIMEFRAMES StructMqlTimeframe(ENUM_STRUCT_TIMEFRAME tf)
{
   switch(tf)
   {
      case STRUCT_TF_D1:  return PERIOD_D1;
      case STRUCT_TF_H4:  return PERIOD_H4;
      case STRUCT_TF_H1:  return PERIOD_H1;
      case STRUCT_TF_M15: return PERIOD_M15;
      case STRUCT_TF_M5:  return PERIOD_M5;
      case STRUCT_TF_M3:  return PERIOD_M3;
      case STRUCT_TF_M1:  return PERIOD_M1;
   }
   return PERIOD_H1;
}

string StructTimeframeToString(ENUM_STRUCT_TIMEFRAME tf)
{
   switch(tf)
   {
      case STRUCT_TF_D1:  return "D1";
      case STRUCT_TF_H4:  return "H4";
      case STRUCT_TF_H1:  return "H1";
      case STRUCT_TF_M15: return "M15";
      case STRUCT_TF_M5:  return "M5";
      case STRUCT_TF_M3:  return "M3";
      case STRUCT_TF_M1:  return "M1";
   }
   return "?";
}

string StructEventToString(ENUM_STRUCT_EVENT e)
{
   switch(e)
   {
      case EVT_CHOCH_BULLISH: return "CHoCH BULL";
      case EVT_CHOCH_BEARISH: return "CHoCH BEAR";
      case EVT_BOS_BULLISH:   return "BOS BULL";
      case EVT_BOS_BEARISH:   return "BOS BEAR";
      case EVT_NONE:          return "NONE";
   }
   return "?";
}

// Dedup contra storage interno
bool StructEventAlreadyExists(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                              ENUM_STRUCT_EVENT type, datetime candleTime)
{
   int n = ArraySize(s_structEvents);
   for(int i = 0; i < n; i++)
   {
      if(s_structEvents[i].symbol     == symbol &&
         s_structEvents[i].timeframe  == tf     &&
         s_structEvents[i].eventType  == type   &&
         s_structEvents[i].candleTime == candleTime)
         return true;
   }
   return false;
}

// Calcula quality 1-10 para un evento de estructura.
// Factores:
//   - Distancia del cierre al nivel roto (en pips)
//   - Cuerpo de la vela del CHoCH vs su rango (vela de fuerza)
//   - Tamano de la vela vs ATR(14)
//   - Cantidad de swings previos claros (3+ = estructura confirmada)
int CalculateStructureQuality(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                              double brokenLevel, double closePrice,
                              int priorSwingCount)
{
   double pip = GetPipSize(symbol);
   if(pip <= 0.0) pip = SymbolInfoDouble(symbol, SYMBOL_POINT);

   ENUM_TIMEFRAMES mtf = StructMqlTimeframe(tf);
   double score = 0.0;

   // 1) Distancia del cierre al nivel roto
   double distPips = MathAbs(closePrice - brokenLevel) / pip;
   if(distPips >= 0.5 && distPips < 2.0)      score += 1.0;
   else if(distPips >= 2.0 && distPips < 5.0) score += 2.0;
   else if(distPips >= 5.0)                   score += 3.0;

   // 2) Vela del CHoCH (vela 1) con cuerpo > 70% del rango
   double o1 = iOpen (symbol, mtf, 1);
   double c1 = iClose(symbol, mtf, 1);
   double h1 = iHigh (symbol, mtf, 1);
   double l1 = iLow  (symbol, mtf, 1);
   double range1 = h1 - l1;
   double body1  = MathAbs(c1 - o1);
   if(range1 > 0.0 && (body1 / range1) > 0.70) score += 2.0;

   // 3) Vela del CHoCH > ATR(14) (calculado a mano, mantiene el modulo sin handles)
   double sumTR = 0.0;
   int    nTR   = 0;
   for(int i = 1; i <= 14; i++)
   {
      double hi = iHigh (symbol, mtf, i);
      double li = iLow  (symbol, mtf, i);
      double pc = iClose(symbol, mtf, i + 1);
      if(hi <= 0.0 || li <= 0.0 || pc <= 0.0) continue;
      double tr = MathMax(hi - li, MathMax(MathAbs(hi - pc), MathAbs(li - pc)));
      sumTR += tr;
      nTR++;
   }
   double atr = (nTR > 0 ? sumTR / nTR : 0.0);
   if(atr > 0.0 && range1 > atr) score += 1.0;

   // 4) Estructura previa clara (3+ swings)
   if(priorSwingCount >= 3) score += 2.0;

   int q = (int)MathRound(score);
   if(q < 1)  q = 1;
   if(q > 10) q = 10;
   return q;
}

// Determina estructura mirando los ultimos N swings (con N=4 idealmente).
// Mira los 2 ultimos highs y los 2 ultimos lows.
ENUM_STRUCTURE DetermineStructureFromSwings(SwingPoint &swings[])
{
   int n = ArraySize(swings);
   if(n < 2) return STRUCT_NEUTRAL;

   // Buscar los 2 ultimos highs (HH o LH) y los 2 ultimos lows (HL o LL)
   ENUM_SWING_TYPE lastHigh = SWING_HH;  bool hasHigh1 = false;
   ENUM_SWING_TYPE prevHigh = SWING_HH;  bool hasHigh2 = false;
   ENUM_SWING_TYPE lastLow  = SWING_HL;  bool hasLow1  = false;
   ENUM_SWING_TYPE prevLow  = SWING_HL;  bool hasLow2  = false;

   for(int i = n - 1; i >= 0; i--)
   {
      ENUM_SWING_TYPE t = swings[i].type;
      bool isHigh = (t == SWING_HH || t == SWING_LH);
      bool isLow  = (t == SWING_HL || t == SWING_LL);

      if(isHigh)
      {
         if(!hasHigh1)      { lastHigh = t; hasHigh1 = true; }
         else if(!hasHigh2) { prevHigh = t; hasHigh2 = true; }
      }
      else if(isLow)
      {
         if(!hasLow1)      { lastLow = t; hasLow1 = true; }
         else if(!hasLow2) { prevLow = t; hasLow2 = true; }
      }
      if(hasHigh1 && hasHigh2 && hasLow1 && hasLow2) break;
   }

   bool bullishHighs = hasHigh1 && hasHigh2 && lastHigh == SWING_HH && prevHigh == SWING_HH;
   bool bullishLows  = hasLow1  && hasLow2  && lastLow  == SWING_HL && prevLow  == SWING_HL;
   bool bearishHighs = hasHigh1 && hasHigh2 && lastHigh == SWING_LH && prevHigh == SWING_LH;
   bool bearishLows  = hasLow1  && hasLow2  && lastLow  == SWING_LL && prevLow  == SWING_LL;

   if(bullishHighs && bullishLows) return STRUCT_BULLISH;
   if(bearishHighs && bearishLows) return STRUCT_BEARISH;

   // Caso suave: dejar que un lado domine si el otro no esta confirmado.
   if(hasHigh1 && lastHigh == SWING_HH && hasLow1 && lastLow == SWING_HL) return STRUCT_BULLISH;
   if(hasHigh1 && lastHigh == SWING_LH && hasLow1 && lastLow == SWING_LL) return STRUCT_BEARISH;

   return STRUCT_NEUTRAL;
}

//============================ API PUBLICA ===========================

void Structure_Init()
{
   ArrayResize(s_structEvents, 0);
}

// Detecta swings (HH/HL/LH/LL) en las ultimas SWING_LOOKBACK_BARS velas.
// Retorna array ORDENADO POR TIEMPO (mas viejo primero).
int Structure_DetectSwings(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                           int lookback, SwingPoint &out[])
{
   ArrayResize(out, 0);
   if(lookback <= 0) return 0;

   ENUM_TIMEFRAMES mtf = StructMqlTimeframe(tf);

   // Recorremos desde el shift mas viejo hacia el mas reciente para que
   // out[] quede ordenado por tiempo ascendente (mas viejo primero).
   // Excluimos las velas extremas que no pueden ser fractal completo y
   // tambien la vela 0 (en formacion).
   int startShift = lookback - SWING_FRACTAL_PERIOD;
   int endShift   = SWING_FRACTAL_PERIOD + 1; // shift >=1 (vela 0 en formacion)

   // Tracking del ultimo swing high y low encontrados (precios) para
   // clasificar el nuevo swing.
   double lastHighPrice = 0.0; bool hasLastHigh = false;
   double lastLowPrice  = 0.0; bool hasLastLow  = false;
   int    lastHighShift = -1;
   int    lastLowShift  = -1;

   for(int shift = startShift; shift >= endShift; shift--)
   {
      double h = iHigh(symbol, mtf, shift);
      double l = iLow (symbol, mtf, shift);
      if(h <= 0.0 || l <= 0.0) continue;

      bool isSwingHigh = true;
      bool isSwingLow  = true;

      for(int j = 1; j <= SWING_FRACTAL_PERIOD; j++)
      {
         double hPrev = iHigh(symbol, mtf, shift + j);
         double hNext = iHigh(symbol, mtf, shift - j);
         double lPrev = iLow (symbol, mtf, shift + j);
         double lNext = iLow (symbol, mtf, shift - j);
         if(hPrev <= 0.0 || hNext <= 0.0 || lPrev <= 0.0 || lNext <= 0.0)
         {
            isSwingHigh = false;
            isSwingLow  = false;
            break;
         }
         if(hPrev >= h || hNext >= h) isSwingHigh = false;
         if(lPrev <= l || lNext <= l) isSwingLow  = false;
      }

      // Filtro de distancia minima entre swings del mismo tipo para evitar
      // ruido (dos fractales pegados sobre el mismo movimiento).
      if(isSwingHigh)
      {
         if(hasLastHigh && (lastHighShift - shift) < SWING_MIN_BARS_BETWEEN)
            isSwingHigh = false;
      }
      if(isSwingLow)
      {
         if(hasLastLow && (lastLowShift - shift) < SWING_MIN_BARS_BETWEEN)
            isSwingLow = false;
      }

      if(isSwingHigh)
      {
         SwingPoint sp;
         sp.time     = iTime(symbol, mtf, shift);
         sp.price    = h;
         sp.barShift = shift;
         if(!hasLastHigh)             sp.type = SWING_HH; // Primero arbitrario; se reclasifica abajo si hace falta
         else if(h > lastHighPrice)   sp.type = SWING_HH;
         else                         sp.type = SWING_LH;

         int sn = ArraySize(out);
         ArrayResize(out, sn + 1);
         out[sn] = sp;

         lastHighPrice = h;
         lastHighShift = shift;
         hasLastHigh   = true;
      }

      if(isSwingLow)
      {
         SwingPoint sp;
         sp.time     = iTime(symbol, mtf, shift);
         sp.price    = l;
         sp.barShift = shift;
         if(!hasLastLow)              sp.type = SWING_HL;
         else if(l > lastLowPrice)    sp.type = SWING_HL;
         else                         sp.type = SWING_LL;

         int sn = ArraySize(out);
         ArrayResize(out, sn + 1);
         out[sn] = sp;

         lastLowPrice = l;
         lastLowShift = shift;
         hasLastLow   = true;
      }
   }

   return ArraySize(out);
}

ENUM_STRUCTURE Structure_GetCurrent(string symbol, ENUM_STRUCT_TIMEFRAME tf)
{
   SwingPoint swings[];
   Structure_DetectSwings(symbol, tf, SWING_LOOKBACK_BARS, swings);
   return DetermineStructureFromSwings(swings);
}

// Retorna el ultimo HL (swing low alcista) encontrado en el stream de
// swings. Util para saber que nivel debe perder un CHoCH bearish.
bool Structure_LastSwingHL(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                           double &outPrice, datetime &outTime)
{
   SwingPoint swings[];
   int n = Structure_DetectSwings(symbol, tf, SWING_LOOKBACK_BARS, swings);
   for(int i = n - 1; i >= 0; i--)
   {
      if(swings[i].type == SWING_HL)
      {
         outPrice = swings[i].price;
         outTime  = swings[i].time;
         return true;
      }
   }
   return false;
}

// Retorna el ultimo LH (swing high bajista). Util para CHoCH bullish.
bool Structure_LastSwingLH(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                           double &outPrice, datetime &outTime)
{
   SwingPoint swings[];
   int n = Structure_DetectSwings(symbol, tf, SWING_LOOKBACK_BARS, swings);
   for(int i = n - 1; i >= 0; i--)
   {
      if(swings[i].type == SWING_LH)
      {
         outPrice = swings[i].price;
         outTime  = swings[i].time;
         return true;
      }
   }
   return false;
}

void Structure_LogEvent(StructureEvent &evt)
{
   string evtStr = StructEventToString(evt.eventType);
   string tfStr  = StructTimeframeToString(evt.timeframe);

   Print("[", evtStr, "-", tfStr, "] ", evt.symbol,
         " | Broken: ", DoubleToString(evt.brokenLevel, 5),
         " | Close: ",  DoubleToString(evt.closePrice,  5),
         " | Q: ", evt.quality, "/10");
}

// Detecta CHoCH y BOS recientes en el TF dado. Retorna solo eventos NUEVOS
// (dedupea contra s_structEvents). El evento se evalua contra el cierre de
// la vela 1 (la ultima cerrada).
int Structure_DetectEvents(string symbol, ENUM_STRUCT_TIMEFRAME tf,
                           StructureEvent &out[])
{
   ArrayResize(out, 0);

   ENUM_TIMEFRAMES mtf = StructMqlTimeframe(tf);
   double closePrice   = iClose(symbol, mtf, 1);
   datetime candleTime = iTime (symbol, mtf, 1);
   if(closePrice <= 0.0) return 0;

   SwingPoint swings[];
   int swCount = Structure_DetectSwings(symbol, tf, SWING_LOOKBACK_BARS, swings);
   if(swCount < 2) return 0;

   // Estructura PREVIA = la formada por los swings que existen antes de la
   // vela 1. Excluimos cualquier swing cuyo bar shift < 2 (la vela 1 no
   // habria podido confirmar el fractal todavia).
   SwingPoint priorSwings[];
   for(int i = 0; i < swCount; i++)
   {
      if(swings[i].barShift >= SWING_FRACTAL_PERIOD + 1)
      {
         int pn = ArraySize(priorSwings);
         ArrayResize(priorSwings, pn + 1);
         priorSwings[pn] = swings[i];
      }
   }
   ENUM_STRUCTURE priorStruct = DetermineStructureFromSwings(priorSwings);

   // Buscamos el ultimo HL y el ultimo HH (para evaluar bullish previa).
   double lastHL = 0.0; bool hasHL = false;
   double lastHH = 0.0; bool hasHH = false;
   double lastLH = 0.0; bool hasLH = false;
   double lastLL = 0.0; bool hasLL = false;

   for(int i = ArraySize(priorSwings) - 1; i >= 0; i--)
   {
      ENUM_SWING_TYPE t = priorSwings[i].type;
      if(!hasHL && t == SWING_HL) { lastHL = priorSwings[i].price; hasHL = true; }
      if(!hasHH && t == SWING_HH) { lastHH = priorSwings[i].price; hasHH = true; }
      if(!hasLH && t == SWING_LH) { lastLH = priorSwings[i].price; hasLH = true; }
      if(!hasLL && t == SWING_LL) { lastLL = priorSwings[i].price; hasLL = true; }
   }

   int  priorSwingCount = ArraySize(priorSwings);
   datetime now = TimeCurrent();

   ENUM_STRUCT_EVENT evtType = EVT_NONE;
   double            broken  = 0.0;

   if(priorStruct == STRUCT_BULLISH)
   {
      if(hasHL && closePrice < lastHL)
      {
         evtType = EVT_CHOCH_BEARISH;
         broken  = lastHL;
      }
      else if(hasHH && closePrice > lastHH)
      {
         evtType = EVT_BOS_BULLISH;
         broken  = lastHH;
      }
   }
   else if(priorStruct == STRUCT_BEARISH)
   {
      if(hasLH && closePrice > lastLH)
      {
         evtType = EVT_CHOCH_BULLISH;
         broken  = lastLH;
      }
      else if(hasLL && closePrice < lastLL)
      {
         evtType = EVT_BOS_BEARISH;
         broken  = lastLL;
      }
   }

   if(evtType == EVT_NONE) return 0;
   if(StructEventAlreadyExists(symbol, tf, evtType, candleTime)) return 0;

   StructureEvent evt;
   evt.detectedAt  = now;
   evt.candleTime  = candleTime;
   evt.eventType   = evtType;
   evt.timeframe   = tf;
   evt.symbol      = symbol;
   evt.brokenLevel = broken;
   evt.closePrice  = closePrice;
   evt.quality     = CalculateStructureQuality(symbol, tf, broken, closePrice, priorSwingCount);

   int sn = ArraySize(s_structEvents);
   ArrayResize(s_structEvents, sn + 1);
   s_structEvents[sn] = evt;

   ArrayResize(out, 1);
   out[0] = evt;
   return 1;
}

#endif // STRUCTURE_MQH
