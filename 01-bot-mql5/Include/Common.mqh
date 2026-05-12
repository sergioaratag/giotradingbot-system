//+------------------------------------------------------------------+
//| Common.mqh - Tipos compartidos del GioTradingBot ICT             |
//+------------------------------------------------------------------+
#ifndef COMMON_MQH
#define COMMON_MQH

// Categorias de liquidez
enum ENUM_LIQUIDITY_TYPE
{
   LIQ_PDH,           // Previous Day High
   LIQ_PDL,           // Previous Day Low
   LIQ_PWH,           // Previous Week High
   LIQ_PWL,           // Previous Week Low
   LIQ_ASIA_H,        // Asian Session High
   LIQ_ASIA_L,        // Asian Session Low
   LIQ_LONDON_H,      // London Session High
   LIQ_LONDON_L,      // London Session Low
   LIQ_NY_H,          // NY Session High
   LIQ_NY_L,          // NY Session Low
   LIQ_EQH,           // Equal Highs
   LIQ_EQL            // Equal Lows
};

// Direcciones de mercado
enum ENUM_DIRECTION
{
   DIR_BULLISH,
   DIR_BEARISH,
   DIR_NEUTRAL
};

// Sesiones
enum ENUM_SESSION
{
   SESSION_ASIA,
   SESSION_LONDON,
   SESSION_NY,
   SESSION_NONE
};

// Estructura de un nivel de liquidez
struct LiquidityLevel
{
   ENUM_LIQUIDITY_TYPE type;     // Tipo (PDH, PWL, etc)
   double            price;       // Precio exacto del nivel
   datetime          formedAt;    // Cuando se formo este nivel
   bool              isSwept;     // Si ya fue barrido (sweep ocurrio)
   datetime          sweptAt;     // Cuando fue barrido (0 si no)
   int               strength;    // 1-10, fuerza del nivel
   string            symbol;      // EURUSD, GBPUSD
   bool              isHigh;      // true si es resistencia, false si soporte
};

// Helpers de tiempo (hora NY)
// El servidor MT5 usa hora del broker. Necesitamos convertir a NY.
// IMPORTANTE: el offset varia por DST. Usar TimeGMT() y aplicar offset NY (UTC-4 o UTC-5).

// Tamano del pip para el simbolo (10 puntos en pares de 5 decimales).
// Helper compartido por todos los modulos (Liquidity, Sweep, FVG, ...).
double GetPipSize(string symbol)
{
   int digits   = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   if(digits == 5 || digits == 3) return point * 10.0;
   return point;
}

// Deteccion de sweep
enum ENUM_SWEEP_DIRECTION
{
   SWEEP_BULLISH,   // Barrio un low, posible LONG
   SWEEP_BEARISH    // Barrio un high, posible SHORT
};

enum ENUM_SWEEP_TIMEFRAME
{
   SWEEP_TF_H4,
   SWEEP_TF_H1,
   SWEEP_TF_M15,
   SWEEP_TF_M5
};

struct SweepEvent
{
   datetime              detectedAt;     // Cuando se detecto el sweep
   datetime              candleTime;     // Tiempo de apertura de la vela del sweep
   ENUM_SWEEP_DIRECTION  direction;      // Bullish/Bearish
   ENUM_SWEEP_TIMEFRAME  timeframe;      // H4/H1/M15/M5
   string                symbol;         // EURUSD, GBPUSD

   // Datos del nivel barrido
   LiquidityLevel        levelSwept;     // Copia del nivel que se barrio
   double                wickPrice;      // Precio extremo de la mecha (high bearish / low bullish)
   double                closePrice;     // Precio de cierre de la vela
   double                pipsPerforated; // Cuantos pips perforo el nivel

   // Calidad del sweep (1-10)
   int                   quality;        // Score combinando varios factores
};

// FVG (Fair Value Gap)
enum ENUM_FVG_TYPE
{
   FVG_BULLISH,    // Gap a favor de movimiento alcista
   FVG_BEARISH     // Gap a favor de movimiento bajista
};

enum ENUM_FVG_STATE
{
   FVG_FRESH,      // Recien formado, intacto
   FVG_MITIGATED,  // Precio entro al gap pero no lo invalido
   FVG_INVALIDATED // Cerrado del lado opuesto -> ahora es IFVG (o expiro por edad)
};

enum ENUM_FVG_TIMEFRAME
{
   FVG_TF_H1,
   FVG_TF_M15,
   FVG_TF_M5,
   FVG_TF_M3,
   FVG_TF_M1
};

struct FVGZone
{
   datetime              formedAt;       // Tiempo de apertura de la vela 3 (cuando se completo)
   ENUM_FVG_TYPE         type;           // Bullish/Bearish (original)
   ENUM_FVG_STATE        state;          // Fresh/Mitigated/Invalidated
   ENUM_FVG_TIMEFRAME    timeframe;
   string                symbol;

   double                top;            // Top del gap (precio mayor)
   double                bottom;         // Bottom del gap (precio menor)
   double                sizePips;       // Tamano del gap en pips

   datetime              mitigatedAt;    // Cuando entro el precio al gap (0 si no)
   datetime              invalidatedAt;  // Cuando se invalido (0 si no)

   bool                  isIFVG;         // true si ya fue invalidado y actua inverso
   int                   quality;        // 1-10
};

#endif // COMMON_MQH
