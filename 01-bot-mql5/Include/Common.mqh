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

#endif // COMMON_MQH
