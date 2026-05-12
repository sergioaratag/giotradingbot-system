//+------------------------------------------------------------------+
//| Liquidity.mqh - Modulo 1: deteccion de pools de liquidez ICT     |
//|                                                                  |
//| Este modulo NO opera. Solo detecta y categoriza niveles activos. |
//| Modulos posteriores (Sweep, Trade) consumen su API.              |
//+------------------------------------------------------------------+
#ifndef LIQUIDITY_MQH
#define LIQUIDITY_MQH

#include <Common.mqh>

//============================ STORAGE INTERNO =======================
// Array global de todos los niveles. Se filtra por simbolo en GetActive.
LiquidityLevel s_levels[];

//============================ HELPERS DE TIEMPO =====================

// Retorna el offset NY vs GMT en horas (negativo).
// TODO V2: detectar DST automaticamente (segundo domingo de marzo a
// primer domingo de noviembre = UTC-4 EDT; resto = UTC-5 EST).
// V1: hardcoded UTC-4 (valido marzo-noviembre, cubre fecha actual).
int GetNYOffsetHours(datetime gmt)
{
   return -4; // EDT
}

datetime GMTToNY(datetime gmt) { return gmt + GetNYOffsetHours(gmt) * 3600; }
datetime NYToGMT(datetime ny)  { return ny  - GetNYOffsetHours(ny)  * 3600; }

// Offset del servidor del broker vs GMT (en horas)
int GetServerGMTOffsetHours()
{
   return (int)MathRound(((double)TimeCurrent() - (double)TimeGMT()) / 3600.0);
}

datetime GMTToServer(datetime gmt) { return gmt + GetServerGMTOffsetHours() * 3600; }
datetime ServerToGMT(datetime srv) { return srv - GetServerGMTOffsetHours() * 3600; }
datetime NYToServer(datetime ny)   { return GMTToServer(NYToGMT(ny)); }

// Construye un datetime NY a partir de fecha + hora
datetime BuildNYDateTime(int year, int month, int day, int hour, int minute, int second)
{
   MqlDateTime dt;
   dt.year        = year;
   dt.mon         = month;
   dt.day         = day;
   dt.hour        = hour;
   dt.min         = minute;
   dt.sec         = second;
   dt.day_of_week = 0;
   dt.day_of_year = 0;
   return StructToTime(dt);
}

// GetPipSize() esta en Common.mqh (helper compartido entre modulos).

//============================ HELPERS DE STORAGE ====================

// Compacta el array eliminando niveles para `symbol`.
// Si onlyNonSwept=true, solo borra los NO barridos (preserva swept).
void RemoveLevelsForSymbol(string symbol, bool onlyNonSwept)
{
   int n = ArraySize(s_levels);
   int write = 0;
   for(int i = 0; i < n; i++)
   {
      bool drop = false;
      if(s_levels[i].symbol == symbol)
      {
         if(!onlyNonSwept || !s_levels[i].isSwept) drop = true;
      }
      if(!drop)
      {
         if(write != i) s_levels[write] = s_levels[i];
         write++;
      }
   }
   ArrayResize(s_levels, write);
}

// Borra niveles barridos hace mas de 24h (housekeeping).
void RemoveOldSweptLevels()
{
   datetime cutoff = TimeCurrent() - 24 * 3600;
   int n = ArraySize(s_levels);
   int write = 0;
   for(int i = 0; i < n; i++)
   {
      bool drop = (s_levels[i].isSwept && s_levels[i].sweptAt > 0 && s_levels[i].sweptAt < cutoff);
      if(!drop)
      {
         if(write != i) s_levels[write] = s_levels[i];
         write++;
      }
   }
   ArrayResize(s_levels, write);
}

void AddLevel(LiquidityLevel &lev)
{
   // Evitar duplicados: si ya existe un nivel barrido del mismo simbolo/tipo/precio,
   // no recrear una version "fresca". Permite que el sweep no se redispare cada hora.
   double matchTol = GetPipSize(lev.symbol) * 0.5;
   int n = ArraySize(s_levels);
   for(int i = 0; i < n; i++)
   {
      if(s_levels[i].symbol == lev.symbol &&
         s_levels[i].type   == lev.type   &&
         s_levels[i].isSwept &&
         MathAbs(s_levels[i].price - lev.price) <= matchTol)
         return;
   }
   ArrayResize(s_levels, n + 1);
   s_levels[n] = lev;
}

void InitLevel(LiquidityLevel &lev, ENUM_LIQUIDITY_TYPE t, double price, datetime formed,
               int strength, string symbol, bool isHigh)
{
   lev.type     = t;
   lev.price    = price;
   lev.formedAt = formed;
   lev.isSwept  = false;
   lev.sweptAt  = 0;
   lev.strength = strength;
   lev.symbol   = symbol;
   lev.isHigh   = isHigh;
}

//============================ DETECCION =============================

// PDH / PDL: high/low de la vela D1 con shift 1 (dia anterior)
void DetectPDHL(string symbol)
{
   double pdh   = iHigh(symbol, PERIOD_D1, 1);
   double pdl   = iLow (symbol, PERIOD_D1, 1);
   datetime t   = iTime(symbol, PERIOD_D1, 1);
   if(pdh <= 0.0 || pdl <= 0.0) return;

   LiquidityLevel h; InitLevel(h, LIQ_PDH, pdh, t, 9, symbol, true);  AddLevel(h);
   LiquidityLevel l; InitLevel(l, LIQ_PDL, pdl, t, 9, symbol, false); AddLevel(l);
}

// PWH / PWL: high/low de la vela W1 con shift 1 (semana anterior)
void DetectPWHL(string symbol)
{
   double pwh = iHigh(symbol, PERIOD_W1, 1);
   double pwl = iLow (symbol, PERIOD_W1, 1);
   datetime t = iTime(symbol, PERIOD_W1, 1);
   if(pwh <= 0.0 || pwl <= 0.0) return;

   LiquidityLevel h; InitLevel(h, LIQ_PWH, pwh, t, 10, symbol, true);  AddLevel(h);
   LiquidityLevel l; InitLevel(l, LIQ_PWL, pwl, t, 10, symbol, false); AddLevel(l);
}

// Itera velas M15 dentro de [nyStart, nyEnd] y registra max/min con sus timestamps.
void DetectSessionHL(string symbol, ENUM_LIQUIDITY_TYPE typeHigh, ENUM_LIQUIDITY_TYPE typeLow,
                     datetime nyStart, datetime nyEnd, int strength)
{
   datetime srvStart = NYToServer(nyStart);
   datetime srvEnd   = NYToServer(nyEnd);

   int startBar = iBarShift(symbol, PERIOD_M15, srvStart, false); // mas viejo
   int endBar   = iBarShift(symbol, PERIOD_M15, srvEnd,   false); // mas reciente

   if(startBar < 0 || endBar < 0 || startBar < endBar) return;

   double sessHigh = -DBL_MAX;
   double sessLow  =  DBL_MAX;
   datetime formedHigh = 0, formedLow = 0;

   for(int i = endBar; i <= startBar; i++)
   {
      double h   = iHigh(symbol, PERIOD_M15, i);
      double l   = iLow (symbol, PERIOD_M15, i);
      datetime t = iTime(symbol, PERIOD_M15, i);
      if(h <= 0.0 || l <= 0.0) continue;
      if(h > sessHigh) { sessHigh = h; formedHigh = t; }
      if(l < sessLow)  { sessLow  = l; formedLow  = t; }
   }

   if(sessHigh > -DBL_MAX)
   {
      LiquidityLevel h; InitLevel(h, typeHigh, sessHigh, formedHigh, strength, symbol, true);
      AddLevel(h);
   }
   if(sessLow < DBL_MAX)
   {
      LiquidityLevel l; InitLevel(l, typeLow, sessLow, formedLow, strength, symbol, false);
      AddLevel(l);
   }
}

// Detecta high/low de las 3 sesiones (Asia, London, NY) para "hoy" NY.
// Si la sesion aun no empezo, retrocede 1 dia (toma la mas reciente completa).
void DetectSessionsHL(string symbol)
{
   datetime nowGMT = TimeGMT();
   datetime nowNY  = GMTToNY(nowGMT);
   MqlDateTime nyDt;
   TimeToStruct(nowNY, nyDt);

   // --- Asia: 19:00 NY (dia-1) a 02:00 NY (dia actual) ---
   // Si pasaron las 19:00, la nueva sesion ya inicio -> usar end = 02:00 manana
   datetime asiaEndNY = BuildNYDateTime(nyDt.year, nyDt.mon, nyDt.day, 2, 0, 0);
   if(nyDt.hour >= 19) asiaEndNY += 24 * 3600;
   datetime asiaStartNY = asiaEndNY - 7 * 3600; // 19:00 del dia anterior al end
   DetectSessionHL(symbol, LIQ_ASIA_H, LIQ_ASIA_L, asiaStartNY, asiaEndNY, 5);

   // --- London: 02:00 a 07:00 NY ---
   datetime lonStartNY = BuildNYDateTime(nyDt.year, nyDt.mon, nyDt.day, 2, 0, 0);
   datetime lonEndNY   = BuildNYDateTime(nyDt.year, nyDt.mon, nyDt.day, 7, 0, 0);
   if(lonStartNY > nowNY) { lonStartNY -= 24*3600; lonEndNY -= 24*3600; }
   DetectSessionHL(symbol, LIQ_LONDON_H, LIQ_LONDON_L, lonStartNY, lonEndNY, 7);

   // --- NY: 07:00 a 12:30 NY ---
   datetime nyStartNY = BuildNYDateTime(nyDt.year, nyDt.mon, nyDt.day, 7,  0, 0);
   datetime nyEndNY   = BuildNYDateTime(nyDt.year, nyDt.mon, nyDt.day, 12, 30, 0);
   if(nyStartNY > nowNY) { nyStartNY -= 24*3600; nyEndNY -= 24*3600; }
   DetectSessionHL(symbol, LIQ_NY_H, LIQ_NY_L, nyStartNY, nyEndNY, 7);
}

// EQH / EQL: 2+ highs (o lows) al mismo nivel en ultimas 100 velas H1.
// - Tolerancia: 2 pips.
// - Separacion minima entre picos: 5 velas.
void DetectEqualHighsLows(string symbol)
{
   int bars       = 100;
   double pip     = GetPipSize(symbol);
   double tol     = 2.0 * pip;
   int minDist    = 5;

   double   highs[];
   double   lows[];
   datetime times[];
   ArrayResize(highs, bars);
   ArrayResize(lows,  bars);
   ArrayResize(times, bars);

   for(int i = 0; i < bars; i++)
   {
      highs[i] = iHigh(symbol, PERIOD_H1, i);
      lows[i]  = iLow (symbol, PERIOD_H1, i);
      times[i] = iTime(symbol, PERIOD_H1, i);
   }

   // EQH
   double registeredEQH[];
   for(int i = 0; i < bars - minDist; i++)
   {
      for(int j = i + minDist; j < bars; j++)
      {
         if(MathAbs(highs[i] - highs[j]) <= tol)
         {
            double level = MathMax(highs[i], highs[j]);
            bool dup = false;
            int rn = ArraySize(registeredEQH);
            for(int k = 0; k < rn; k++)
               if(MathAbs(registeredEQH[k] - level) <= tol) { dup = true; break; }
            if(!dup)
            {
               ArrayResize(registeredEQH, rn + 1);
               registeredEQH[rn] = level;
               datetime formed = (times[i] > times[j]) ? times[i] : times[j];
               LiquidityLevel h; InitLevel(h, LIQ_EQH, level, formed, 8, symbol, true);
               AddLevel(h);
            }
         }
      }
   }

   // EQL
   double registeredEQL[];
   for(int i = 0; i < bars - minDist; i++)
   {
      for(int j = i + minDist; j < bars; j++)
      {
         if(MathAbs(lows[i] - lows[j]) <= tol)
         {
            double level = MathMin(lows[i], lows[j]);
            bool dup = false;
            int rn = ArraySize(registeredEQL);
            for(int k = 0; k < rn; k++)
               if(MathAbs(registeredEQL[k] - level) <= tol) { dup = true; break; }
            if(!dup)
            {
               ArrayResize(registeredEQL, rn + 1);
               registeredEQL[rn] = level;
               datetime formed = (times[i] > times[j]) ? times[i] : times[j];
               LiquidityLevel l; InitLevel(l, LIQ_EQL, level, formed, 8, symbol, false);
               AddLevel(l);
            }
         }
      }
   }
}

//============================ API PUBLICA ===========================

// Inicializa el storage. Llamar una sola vez desde OnInit.
void Liquidity_Init()
{
   ArrayResize(s_levels, 0);
}

// Recalcula todos los niveles activos para `symbol`.
// Preserva niveles ya barridos (hasta 24h despues del sweep).
// Llamar al inicio de cada vela H1.
void Liquidity_Update(string symbol)
{
   RemoveOldSweptLevels();
   RemoveLevelsForSymbol(symbol, true); // borra solo no-barridos -> se recalculan
   DetectPDHL(symbol);
   DetectPWHL(symbol);
   DetectSessionsHL(symbol);
   DetectEqualHighsLows(symbol);
}

// Llena `out[]` con los niveles activos (no barridos) del simbolo. Retorna count.
int Liquidity_GetActive(string symbol, LiquidityLevel &out[])
{
   ArrayResize(out, 0);
   int n = ArraySize(s_levels);
   int count = 0;
   for(int i = 0; i < n; i++)
   {
      if(s_levels[i].symbol == symbol && !s_levels[i].isSwept)
      {
         ArrayResize(out, count + 1);
         out[count] = s_levels[i];
         count++;
      }
   }
   return count;
}

// Llena `out[]` con TODOS los niveles trackeados del simbolo (swept + activos).
// Util para logging y verificacion visual.
int Liquidity_GetAll(string symbol, LiquidityLevel &out[])
{
   ArrayResize(out, 0);
   int n = ArraySize(s_levels);
   int count = 0;
   for(int i = 0; i < n; i++)
   {
      if(s_levels[i].symbol == symbol)
      {
         ArrayResize(out, count + 1);
         out[count] = s_levels[i];
         count++;
      }
   }
   return count;
}

// Chequea si `price` esta dentro de `pips` de algun nivel activo.
// Si lo encuentra, copia el nivel a outLevel y retorna true.
bool Liquidity_IsNearLevel(string symbol, double price, int pips, LiquidityLevel &outLevel)
{
   double tol = pips * GetPipSize(symbol);
   int n = ArraySize(s_levels);
   for(int i = 0; i < n; i++)
   {
      if(s_levels[i].symbol == symbol && !s_levels[i].isSwept)
      {
         if(MathAbs(s_levels[i].price - price) <= tol)
         {
            outLevel = s_levels[i];
            return true;
         }
      }
   }
   return false;
}

// Marca un nivel como barrido. Hace match por symbol+type+precio (~0.5 pip).
// Actualiza tanto el storage interno como el struct pasado por referencia.
void Liquidity_MarkSwept(LiquidityLevel &level, datetime when)
{
   double matchTol = GetPipSize(level.symbol) * 0.5;
   int n = ArraySize(s_levels);
   for(int i = 0; i < n; i++)
   {
      if(s_levels[i].symbol == level.symbol &&
         s_levels[i].type   == level.type   &&
         MathAbs(s_levels[i].price - level.price) <= matchTol)
      {
         s_levels[i].isSwept = true;
         s_levels[i].sweptAt = when;
         level.isSwept = true;
         level.sweptAt = when;
         return;
      }
   }
}

#endif // LIQUIDITY_MQH
