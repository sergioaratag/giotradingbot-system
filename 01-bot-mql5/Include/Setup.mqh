//+------------------------------------------------------------------+
//| Setup.mqh - Modulo 6: deteccion de setups (cerebro de la         |
//| estrategia ICT). Orquesta Liquidity + Sweep + FVG + Structure +  |
//| Bias en la cadena completa. NO ejecuta trades: detecta setups y  |
//| loggea "HABRIA OPERADO AQUI".                                    |
//|                                                                  |
//| Cadena:                                                          |
//|   1. Sweep (H4/H1/M15) barre liquidez dentro de sesion Londres/NY|
//|   2. Mientras la sesion siga abierta para ENTRAR, en LTF(M5/M3/M1)|
//|        FVG en la direccion esperada Y/O CHoCH en la direccion    |
//|   3. Direcciones deben coincidir con el sweep                    |
//|   4. Bias HTF pondera (a favor / en contra)                      |
//|   5. Calidad HIGH / MEDIUM / LOW + score 1-10                    |
//|                                                                  |
//| Diseno: este modulo es el UNICO consumidor de Sweep_Detect y     |
//| Structure_DetectEvents (ambos consumen/dedupean internamente).   |
//| Por eso recolecta los eventos una sola vez por tick y los empareja|
//| contra todos los setups en seguimiento, en vez de re-escanear    |
//| por cada setup.                                                  |
//+------------------------------------------------------------------+
#ifndef SETUP_MQH
#define SETUP_MQH

#include <Common.mqh>
#include <Liquidity.mqh>
#include <Sweep.mqh>
#include <FVG.mqh>
#include <Structure.mqh>
#include <Bias.mqh>

//============================ PARAMETROS ============================
#define SETUP_MAX_ACTIVE         10    // Maximo de setups WAITING en seguimiento
#define SETUP_KEEP_TERMINAL_SECS 3600  // Housekeeping: retener terminales 1h

// Ventanas de ENTRADA por sesion (hora NY, minutos desde 00:00).
// El bot solo ABRE posiciones en estas ventanas; puede entrar hasta 15 min
// antes del cierre de cada sesion (limite duro).
//   Londres: 02:00 (120) -> cierre 07:00; limite de entrada 06:45 (405)
//   NY:      07:00 (420) -> cierre 12:30; limite de entrada 12:15 (735)
// NOTA: posiciones YA ABIERTAS no se cierran al terminar la sesion; su gestion
// fuera de horario (BE, parciales, SL/TP) es responsabilidad del Modulo 9.
// Este modulo solo gobierna ENTRADAS.
#define SESS_LONDON_START_MIN 120   // 02:00 NY
#define SESS_LONDON_LIMIT_MIN 405   // 06:45 NY (15 min antes del cierre 07:00)
#define SESS_NY_START_MIN     420   // 07:00 NY
#define SESS_NY_LIMIT_MIN     735   // 12:15 NY (15 min antes del cierre 12:30)

//============================ STORAGE ===============================
// Memoria del bot: setups en seguimiento a lo largo del tiempo.
// A diferencia de Bias (stateless), Setup mantiene estado.
TradeSetup s_setups[];

// Logging verboso opcional (lo setea GioBot desde el input).
bool g_setupVerbose = false;

void Setup_SetVerbose(bool v) { g_setupVerbose = v; }

//============================ SESIONES DE ENTRADA ===================
// Reutiliza la conversion a hora NY de Liquidity.mqh (GMTToNY), que ya
// encapsula el offset NY/DST. No duplicamos esa logica aqui.

// Sesion de entrada activa para un datetime NY dado. SESSION_NONE si esta
// fuera de las ventanas de entrada (incluye fin de semana y post-limite).
ENUM_SESSION GetCurrentEntrySession(datetime nowNY)
{
   MqlDateTime dt;
   TimeToStruct(nowNY, dt);

   // Fin de semana: sin entradas (0 = domingo, 6 = sabado).
   if(dt.day_of_week == 0 || dt.day_of_week == 6) return SESSION_NONE;

   int mins = dt.hour * 60 + dt.min;
   if(mins >= SESS_LONDON_START_MIN && mins <= SESS_LONDON_LIMIT_MIN) return SESSION_LONDON;
   if(mins >= SESS_NY_START_MIN     && mins <= SESS_NY_LIMIT_MIN)     return SESSION_NY;
   // El viernes despues de 12:15 NY queda cubierto: mins > 735 -> SESSION_NONE.
   return SESSION_NONE;
}

bool IsWithinEntryWindow(datetime nowNY)
{
   return GetCurrentEntrySession(nowNY) != SESSION_NONE;
}

string SessionToString(ENUM_SESSION s)
{
   switch(s)
   {
      case SESSION_LONDON: return "LONDRES";
      case SESSION_NY:     return "NY";
      case SESSION_ASIA:   return "ASIA";
      case SESSION_NONE:   return "NONE";
   }
   return "?";
}

//============================ HELPERS PRIVADOS ======================

string SetupDirStr(ENUM_DIRECTION d)
{
   return (d == DIR_BULLISH ? "LONG" : "SHORT");
}

string SetupQualityStr(ENUM_SETUP_QUALITY q)
{
   switch(q)
   {
      case SETUP_QUALITY_HIGH:   return "HIGH";
      case SETUP_QUALITY_MEDIUM: return "MEDIUM";
      case SETUP_QUALITY_LOW:    return "LOW";
   }
   return "?";
}

string SweepTfStr(ENUM_SWEEP_TIMEFRAME tf)
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

// Identidad estable de un sweep: symbol + vela + nivel barrido.
// (Sweep_Detect ya marca el nivel como swept, asi que el mismo sweep no
//  se redispara; esto es defensa adicional contra duplicados.)
bool SetupForSweepExists(string symbol, SweepEvent &sweep)
{
   int n = ArraySize(s_setups);
   for(int i = 0; i < n; i++)
   {
      if(s_setups[i].symbol            == symbol &&
         s_setups[i].sweep.candleTime  == sweep.candleTime &&
         s_setups[i].sweep.levelSwept.type  == sweep.levelSwept.type &&
         s_setups[i].sweep.levelSwept.price == sweep.levelSwept.price)
         return true;
   }
   return false;
}

int CountWaiting()
{
   int c = 0;
   int n = ArraySize(s_setups);
   for(int i = 0; i < n; i++)
      if(s_setups[i].state == SETUP_WAITING) c++;
   return c;
}

// Score combinado 1-10 (segun SPEC / estrategia confirmada por Sergio).
int CalcQualityScore(TradeSetup &s)
{
   int score = 0;

   // Base por confluencias
   if(s.hasFVG && s.hasCHoCH)      score += 5;   // HIGH base
   else if(s.hasFVG || s.hasCHoCH) score += 3;   // MEDIUM base
   else                            score += 1;

   // Peso del TF del sweep (H4 > H1 > M15)
   switch(s.sweep.timeframe)
   {
      case SWEEP_TF_H4:  score += 3; break;
      case SWEEP_TF_H1:  score += 2; break;
      case SWEEP_TF_M15: score += 1; break;
      default: break;
   }

   // Calidad del sweep en si
   if(s.sweep.quality >= 8) score += 1;

   // Bias alineado / en contra
   if(s.biasAligned && s.bias.bias != BIAS_NEUTRAL) score += 2;
   else if(!s.biasAligned)                          score -= 2; // contra bias penaliza

   // FVG de calidad
   if(s.hasFVG && s.fvg.quality >= 7) score += 1;

   if(score < 1)  score = 1;
   if(score > 10) score = 10;
   return score;
}

//============================ API PUBLICA ===========================

void Setup_Init()
{
   ArrayResize(s_setups, 0);
}

void Setup_LogSetup(TradeSetup &setup, string action)
{
   string dirStr  = SetupDirStr(setup.direction);
   string qualStr = SetupQualityStr(setup.quality);

   if(action == "SWEEP_DETECTED")
   {
      Print("[SETUP] ", action, " | ", setup.symbol, " ", dirStr,
            " | Sweep: ", EnumToString(setup.sweep.levelSwept.type),
            " (", SweepTfStr(setup.sweep.timeframe), ")",
            " | Sesion: ", SessionToString(setup.entrySession));
   }
   else if(action == "CONFIRMED")
   {
      string biasStr = (setup.biasAligned ? "a favor" : "EN CONTRA");
      Print("====================================");
      Print("[SETUP CONFIRMADO] ", setup.symbol, " ", dirStr, " | Calidad: ", qualStr,
            " (score ", setup.qualityScore, "/10)");
      Print("  Sesion: ", SessionToString(setup.entrySession));
      Print("  Sweep: ", EnumToString(setup.sweep.levelSwept.type),
            " (", SweepTfStr(setup.sweep.timeframe), ")");
      Print("  FVG: ", (setup.hasFVG ? "SI" : "NO"),
            (setup.hasFVG ? " @ " + DoubleToString(setup.fvg.bottom,5) + "-" + DoubleToString(setup.fvg.top,5) : ""));
      Print("  CHoCH: ", (setup.hasCHoCH ? "SI" : "NO"));
      Print("  Bias: ", EnumToString(setup.bias.bias), " (", biasStr, ")");
      if(setup.hasFVG)
         Print("  >>> HABRIA OPERADO AQUI: entrada en zona ",
               DoubleToString(setup.entryZoneBottom,5), " - ", DoubleToString(setup.entryZoneTop,5));
      else
         Print("  >>> Confirmacion sin FVG: sin zona de entrada definida (solo CHoCH)");
      Print("====================================");
   }
   else if(action == "EXPIRED")
   {
      Print("[SETUP] EXPIRED | ", setup.symbol, " ", dirStr,
            " | Fuera de ventana de entrada de sesion");
   }
}

// Funcion principal. Maneja la maquina de estados de los setups.
// Debe correr en cada vela LTF relevante (idealmente cada nueva M1) para
// captar confirmaciones rapidas.
void Setup_Process(string symbol)
{
   datetime now           = TimeCurrent();
   datetime nowNY         = GMTToNY(TimeGMT());          // reutiliza offset NY/DST de Liquidity
   ENUM_SESSION nowSession = GetCurrentEntrySession(nowNY);

   //--- FASE 1: detectar nuevos sweeps -> crear setups WAITING -------
   // Solo creamos setup si el sweep ocurre dentro de una sesion de entrada
   // (Londres/NY y antes del limite). Fuera de horario: se ignora.
   ENUM_SWEEP_TIMEFRAME sweepTFs[3];
   sweepTFs[0] = SWEEP_TF_H4;
   sweepTFs[1] = SWEEP_TF_H1;
   sweepTFs[2] = SWEEP_TF_M15;

   for(int t = 0; t < 3; t++)
   {
      SweepEvent sweeps[];
      int ns = Sweep_Detect(symbol, sweepTFs[t], sweeps);
      for(int i = 0; i < ns; i++)
      {
         if(SetupForSweepExists(symbol, sweeps[i])) continue;

         // Sweep fuera de sesion de entrada -> no se opera, no se crea setup.
         if(nowSession == SESSION_NONE)
         {
            if(g_setupVerbose)
               Print("[SETUP v] ", symbol, " | sweep fuera de ventana de entrada, ignorado");
            continue;
         }

         if(CountWaiting() >= SETUP_MAX_ACTIVE)
         {
            if(g_setupVerbose)
               Print("[SETUP v] ", symbol, " | cap ", SETUP_MAX_ACTIVE,
                     " setups WAITING alcanzado, sweep ignorado");
            continue;
         }

         TradeSetup setup;
         setup.symbol          = symbol;
         setup.detectedAt      = sweeps[i].detectedAt;
         setup.confirmedAt     = 0;
         setup.entrySession    = nowSession;
         setup.state           = SETUP_WAITING;
         setup.quality         = SETUP_QUALITY_LOW;
         setup.direction       = (sweeps[i].direction == SWEEP_BEARISH ? DIR_BEARISH : DIR_BULLISH);
         setup.sweep           = sweeps[i];
         setup.hasFVG          = false;
         setup.hasCHoCH        = false;
         setup.biasAligned     = false;
         setup.entryZoneTop    = 0.0;
         setup.entryZoneBottom = 0.0;
         setup.qualityScore    = 0;

         int sn = ArraySize(s_setups);
         ArrayResize(s_setups, sn + 1);
         s_setups[sn] = setup;
         Setup_LogSetup(s_setups[sn], "SWEEP_DETECTED");
      }
   }

   //--- FASE 2 (prep): refrescar storage de FVG y recolectar CHoCH ---
   // FVG_GetActive lee de s_fvgs, que solo se llena con FVG_Detect; por eso
   // detectamos + actualizamos estados aqui (Setup es el unico consumidor).
   ENUM_FVG_TIMEFRAME fvgTFs[3];
   fvgTFs[0] = FVG_TF_M5;
   fvgTFs[1] = FVG_TF_M3;
   fvgTFs[2] = FVG_TF_M1;

   for(int t = 0; t < 3; t++)
   {
      FVGZone tmp[];
      FVG_Detect(symbol, fvgTFs[t], tmp);      // puebla/dedupea storage
      FVG_UpdateStates(symbol, fvgTFs[t]);     // mantiene estados al dia
   }

   // CHoCH: Structure_DetectEvents CONSUME los eventos (dedup interno), asi que
   // los recolectamos UNA vez por tick en un buffer y luego los emparejamos
   // contra todos los setups WAITING. Llamarlo por-setup perderia eventos.
   StructureEvent chochBuf[];
   ENUM_STRUCT_TIMEFRAME structTFs[3];
   structTFs[0] = STRUCT_TF_M5;
   structTFs[1] = STRUCT_TF_M3;
   structTFs[2] = STRUCT_TF_M1;

   for(int t = 0; t < 3; t++)
   {
      StructureEvent evs[];
      int ne = Structure_DetectEvents(symbol, structTFs[t], evs);
      for(int i = 0; i < ne; i++)
      {
         if(evs[i].eventType != EVT_CHOCH_BULLISH && evs[i].eventType != EVT_CHOCH_BEARISH)
            continue; // los BOS no confirman setups
         int cn = ArraySize(chochBuf);
         ArrayResize(chochBuf, cn + 1);
         chochBuf[cn] = evs[i];
      }
   }

   //--- FASE 3: procesar setups WAITING ------------------------------
   int nSetups = ArraySize(s_setups);
   for(int i = 0; i < nSetups; i++)
   {
      if(s_setups[i].symbol != symbol)         continue;
      if(s_setups[i].state  != SETUP_WAITING)  continue;

      // 3a) Expiracion por horario de sesion. Ya no se puede ENTRAR si:
      //   - paso el limite de entrada (06:45 Londres / 12:15 NY), o
      //   - la sesion actual cambio respecto a la del sweep (sweep de la
      //     sesion anterior).
      // Ambos casos se reducen a: la sesion actual != la sesion del sweep.
      // NOTA: posiciones ya abiertas NO se cierran aqui; eso es Modulo 9.
      if(nowSession != s_setups[i].entrySession)
      {
         s_setups[i].state = SETUP_EXPIRED;
         Setup_LogSetup(s_setups[i], "EXPIRED");
         continue;
      }

      // 3b) Buscar FVG en la direccion esperada, formado DESPUES del sweep
      if(!s_setups[i].hasFVG)
      {
         for(int t = 0; t < 3 && !s_setups[i].hasFVG; t++)
         {
            FVGZone fvgs[];
            int nf = FVG_GetActive(symbol, fvgTFs[t], fvgs);
            for(int k = 0; k < nf; k++)
            {
               bool dirMatch = (s_setups[i].direction == DIR_BEARISH && fvgs[k].type == FVG_BEARISH) ||
                               (s_setups[i].direction == DIR_BULLISH && fvgs[k].type == FVG_BULLISH);
               bool afterSweep = fvgs[k].formedAt > s_setups[i].sweep.detectedAt;
               if(dirMatch && afterSweep)
               {
                  s_setups[i].hasFVG          = true;
                  s_setups[i].fvg             = fvgs[k];
                  s_setups[i].entryZoneTop    = fvgs[k].top;
                  s_setups[i].entryZoneBottom = fvgs[k].bottom;
                  if(g_setupVerbose)
                     Print("[SETUP v] ", symbol, " ", SetupDirStr(s_setups[i].direction),
                           " | FVG match @ ", DoubleToString(fvgs[k].bottom,5), "-",
                           DoubleToString(fvgs[k].top,5));
                  break;
               }
            }
         }
      }

      // 3c) Buscar CHoCH en la direccion esperada, posterior al sweep
      if(!s_setups[i].hasCHoCH)
      {
         int nc = ArraySize(chochBuf);
         for(int k = 0; k < nc; k++)
         {
            bool dirMatch = (s_setups[i].direction == DIR_BEARISH && chochBuf[k].eventType == EVT_CHOCH_BEARISH) ||
                            (s_setups[i].direction == DIR_BULLISH && chochBuf[k].eventType == EVT_CHOCH_BULLISH);
            bool afterSweep = chochBuf[k].candleTime > s_setups[i].sweep.detectedAt;
            if(dirMatch && afterSweep)
            {
               s_setups[i].hasCHoCH = true;
               s_setups[i].choch    = chochBuf[k];
               if(g_setupVerbose)
                  Print("[SETUP v] ", symbol, " ", SetupDirStr(s_setups[i].direction),
                        " | CHoCH match (", StructEventToString(chochBuf[k].eventType), ")");
               break;
            }
         }
      }

      // 3d) Confirmar si hay al menos una confluencia (FVG o CHoCH)
      if(s_setups[i].hasFVG || s_setups[i].hasCHoCH)
      {
         s_setups[i].bias = Bias_Calculate(symbol);
         s_setups[i].biasAligned =
            ((s_setups[i].bias.bias == BIAS_BEARISH && s_setups[i].direction == DIR_BEARISH) ||
             (s_setups[i].bias.bias == BIAS_BULLISH && s_setups[i].direction == DIR_BULLISH) ||
             (s_setups[i].bias.bias == BIAS_NEUTRAL));

         if(s_setups[i].hasFVG && s_setups[i].hasCHoCH)      s_setups[i].quality = SETUP_QUALITY_HIGH;
         else if(s_setups[i].hasFVG || s_setups[i].hasCHoCH) s_setups[i].quality = SETUP_QUALITY_MEDIUM;
         else                                                s_setups[i].quality = SETUP_QUALITY_LOW;

         s_setups[i].qualityScore = CalcQualityScore(s_setups[i]);
         s_setups[i].state        = SETUP_CONFIRMED;
         s_setups[i].confirmedAt  = now;
         Setup_LogSetup(s_setups[i], "CONFIRMED");
      }
   }

   //--- FASE 4: housekeeping -----------------------------------------
   // Eliminar terminales (EXPIRED/INVALIDATED) y CONFIRMED viejos (>1h):
   // ya cumplieron su proposito informativo y mantienen el array acotado.
   TradeSetup kept[];
   int n2 = ArraySize(s_setups);
   for(int i = 0; i < n2; i++)
   {
      bool drop = false;
      if(s_setups[i].state == SETUP_EXPIRED || s_setups[i].state == SETUP_INVALIDATED)
         drop = (now - s_setups[i].detectedAt) > SETUP_KEEP_TERMINAL_SECS;
      else if(s_setups[i].state == SETUP_CONFIRMED)
         drop = (now - s_setups[i].confirmedAt) > SETUP_KEEP_TERMINAL_SECS;

      if(!drop)
      {
         int kn = ArraySize(kept);
         ArrayResize(kept, kn + 1);
         kept[kn] = s_setups[i];
      }
   }
   ArrayResize(s_setups, ArraySize(kept));
   for(int i = 0; i < ArraySize(kept); i++) s_setups[i] = kept[i];
}

// Retorna setups en seguimiento activo (WAITING o CONFIRMED).
int Setup_GetActive(string symbol, TradeSetup &out[])
{
   ArrayResize(out, 0);
   int n = ArraySize(s_setups);
   int count = 0;
   for(int i = 0; i < n; i++)
   {
      if(s_setups[i].symbol == symbol &&
         (s_setups[i].state == SETUP_WAITING || s_setups[i].state == SETUP_CONFIRMED))
      {
         ArrayResize(out, count + 1);
         out[count] = s_setups[i];
         count++;
      }
   }
   return count;
}

#endif // SETUP_MQH
