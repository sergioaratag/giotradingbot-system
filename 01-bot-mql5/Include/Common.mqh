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

#endif // COMMON_MQH
