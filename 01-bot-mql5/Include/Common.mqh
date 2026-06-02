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

// Estructura de mercado: swings y eventos (CHoCH / BOS)
enum ENUM_SWING_TYPE
{
   SWING_HH,    // Higher High
   SWING_HL,    // Higher Low
   SWING_LH,    // Lower High
   SWING_LL     // Lower Low
};

enum ENUM_STRUCTURE
{
   STRUCT_BULLISH,    // HH/HL dominante
   STRUCT_BEARISH,    // LH/LL dominante
   STRUCT_NEUTRAL     // Sin estructura clara
};

enum ENUM_STRUCT_EVENT
{
   EVT_CHOCH_BULLISH,  // CHoCH alcista (bajista -> alcista)
   EVT_CHOCH_BEARISH,  // CHoCH bajista (alcista -> bajista)
   EVT_BOS_BULLISH,    // BOS alcista (continuacion)
   EVT_BOS_BEARISH,    // BOS bajista (continuacion)
   EVT_NONE
};

enum ENUM_STRUCT_TIMEFRAME
{
   STRUCT_TF_D1,
   STRUCT_TF_H4,
   STRUCT_TF_H1,
   STRUCT_TF_M15,
   STRUCT_TF_M5,
   STRUCT_TF_M3,
   STRUCT_TF_M1
};

struct SwingPoint
{
   datetime         time;
   double           price;
   ENUM_SWING_TYPE  type;
   int              barShift;        // Cuantas barras atras desde la vela 0
};

struct StructureEvent
{
   datetime              detectedAt;
   datetime              candleTime;
   ENUM_STRUCT_EVENT     eventType;
   ENUM_STRUCT_TIMEFRAME timeframe;
   string                symbol;
   double                brokenLevel;    // Precio del HL/LH/HH/LL que se rompio
   double                closePrice;     // Precio de cierre que confirmo la ruptura
   int                   quality;        // 1-10
};

// Bias HTF
enum ENUM_BIAS
{
   BIAS_BULLISH,
   BIAS_BEARISH,
   BIAS_NEUTRAL
};

enum ENUM_BIAS_CONFIDENCE
{
   BIAS_CONF_NONE,     // 0 - conflicto entre H4/D1
   BIAS_CONF_LOW,      // 1 - ambos neutrales
   BIAS_CONF_MEDIUM,   // 2 - uno define, otro neutral
   BIAS_CONF_HIGH      // 3 - ambos coinciden
};

struct BiasResult
{
   ENUM_BIAS              bias;
   ENUM_BIAS_CONFIDENCE   confidence;
   ENUM_STRUCTURE         structureH4;
   ENUM_STRUCTURE         structureD1;
   datetime               calculatedAt;
   string                 symbol;
};

// Setup completo (Modulo 6): la cadena ICT orquestada.
enum ENUM_SETUP_QUALITY
{
   SETUP_QUALITY_HIGH,     // Sweep + CHoCH + FVG
   SETUP_QUALITY_MEDIUM,   // Sweep + (CHoCH o FVG)
   SETUP_QUALITY_LOW       // Sweep + senal debil
};

enum ENUM_SETUP_STATE
{
   SETUP_WAITING,       // Sweep detectado, esperando confirmacion LTF
   SETUP_CONFIRMED,     // FVG + CHoCH confirmados, setup valido
   SETUP_EXPIRED,       // Paso el limite de entrada de la sesion sin confirmar
   SETUP_INVALIDATED    // Algo invalido el setup (reservado para Execution)
};

struct TradeSetup
{
   datetime              detectedAt;       // Cuando se detecto el sweep inicial
   datetime              confirmedAt;      // Cuando se confirmo (0 si waiting)
   ENUM_SESSION          entrySession;     // Sesion (Londres/NY) en que se detecto el sweep
   ENUM_SETUP_STATE      state;
   ENUM_SETUP_QUALITY    quality;
   ENUM_DIRECTION        direction;        // DIR_BULLISH (long) o DIR_BEARISH (short)
   string                symbol;

   // Componentes del setup
   SweepEvent            sweep;            // El sweep que disparo
   bool                  hasFVG;
   FVGZone               fvg;              // El FVG de confirmacion (si hay)
   bool                  hasCHoCH;
   StructureEvent        choch;            // El CHoCH de confirmacion (si hay)
   BiasResult            bias;             // Contexto HTF
   bool                  biasAligned;      // true si setup va a favor del bias

   // Zona de entrada (calculada del FVG)
   double                entryZoneTop;
   double                entryZoneBottom;

   int                   qualityScore;     // 1-10 combinado
};

// Sizing (Modulo 7): calcula riesgo y lotes para un setup CONFIRMED.
// NO ejecuta trades; solo loggea "habria operado con X lotes".
enum ENUM_KILLZONE_STATUS
{
   IN_KILLZONE,          // Dentro de London KZ, NY AM, o NY Lunch
   IN_SESSION_NO_KZ,     // En Londres/NY pero fuera de killzones
   OUTSIDE_SESSION       // Fuera de horario
};

struct SizingResult
{
   string                symbol;
   ENUM_DIRECTION        direction;

   double                entryPrice;       // Centro de la zona FVG
   double                slPrice;
   double                tp1Price;
   double                tp2Price;

   double                slPips;
   double                tp1Pips;
   double                tp2Pips;

   double                riskBasePct;      // 0.5 / 1.0 / 1.5
   double                multBias;
   double                multKillzone;
   double                riskEffectivePct;
   double                riskUSD;

   double                lotsRaw;
   double                lotsFinal;

   ENUM_KILLZONE_STATUS  killzoneStatus;
   bool                  biasAligned;

   bool                  isValid;          // false si algo fundamental impide calcular
   string                rejectionReason;
};

// Execution (Modulo 8): apertura de ordenes reales.
enum ENUM_ORDER_KIND
{
   ORDER_KIND_MARKET,
   ORDER_KIND_LIMIT
};

enum ENUM_TRADE_RESULT
{
   TRADE_OPENED,           // Orden enviada exitosamente
   TRADE_REJECTED_RISK,    // Bloqueada por cap de riesgo total
   TRADE_REJECTED_DAILY,   // Bloqueada por daily loss -1.5%
   TRADE_REJECTED_SPREAD,  // Spread demasiado alto (legacy; ahora cubierto por TRADE_REJECTED_FILTER)
   TRADE_REJECTED_FILTER,  // Bloqueada por Modulo 10 (spread/ATR/viernes-tarde)
   TRADE_FAILED_SEND,      // OrderSend devolvio error
   TRADE_INVALID_SIZING    // SizingResult.isValid = false
};

struct TradeOpenResult
{
   ENUM_TRADE_RESULT  result;
   ulong              ticket;          // Ticket del trade abierto (0 si fallo)
   string             rejectionReason;
   ENUM_ORDER_KIND    orderKind;
   double             requestedPrice;
   double             executedPrice;   // Solo si Market y se ejecuto
   string             symbol;
   ENUM_DIRECTION     direction;
   double             lots;
   double             sl;
   double             tp;              // Siempre 0 en V1: cierre via trailing escalonado (Modulo 9). Campo conservado por compatibilidad.
   int                magicNumber;
   string             comment;
};

// Identificador unico del bot en ordenes (filtro para nuestras propias posiciones)
#define BOT_MAGIC_NUMBER                  871234
#define EXECUTION_HYBRID_THRESHOLD_PIPS   5.0
#define EXECUTION_LIMIT_VALIDITY_MINUTES  45
#define EXECUTION_DAILY_LOSS_PCT          1.5
#define EXECUTION_RISK_CAP_PCT            1.5
#define EXECUTION_SLIPPAGE_POINTS         20    // 2 pips de slippage tolerado en Market

// Management (Modulo 9): trailing escalonado + salida CHoCH + salida noticias.
enum ENUM_CLOSE_REASON
{
   CLOSE_REASON_SL_HIT,            // SL pegado (inicial, BE, o trailed)
   CLOSE_REASON_CHOCH_CONTRARY,    // CHoCH contrario en M5
   CLOSE_REASON_NEWS_HIGH,         // Noticia HIGH inminente con BE/profit
   CLOSE_REASON_MANUAL,            // Cierre manual (futuro)
   CLOSE_REASON_KILL_SWITCH        // Kill switch activado (futuro Modulo 12)
};

struct PositionState
{
   ulong              ticket;
   string             symbol;
   ENUM_DIRECTION     direction;
   double             entryPrice;
   double             initialSL;
   double             currentSL;
   double             slDistance;       // |entry - initialSL| en precio (= 1R)
   int                rLevelReached;    // 0 = aun no 1R; 1 = ya 1R; etc.
   datetime           openedAt;
   datetime           lastSLUpdate;
};

#define MGMT_BUFFER_PIPS           1.0     // Buffer al mover SL (en pips, a favor)
#define MGMT_NEWS_BEFORE_MINUTES   5       // Cerrar 5 min antes de noticia HIGH (si BE+)
#define MGMT_CHOCH_TF              STRUCT_TF_M5   // TF para detectar CHoCH contrario

// Filters (Modulo 10): filtros pre-entrada + cierre forzado viernes.
struct FilterCheckResult
{
   bool        passed;
   string      reason;
   double      currentSpread;     // pips
   double      currentATR;        // pips, ATR(14) H1
};

#define FILTER_SPREAD_MAX_EURUSD        1.5
#define FILTER_SPREAD_MAX_GBPUSD        2.0
#define FILTER_SPREAD_MAX_DEFAULT       2.0
#define FILTER_ATR_MIN_EURUSD           8.0
#define FILTER_ATR_MIN_GBPUSD           10.0
#define FILTER_ATR_MIN_DEFAULT          8.0
#define FILTER_ATR_PERIOD               14
#define FILTER_FRIDAY_NO_ENTRY_HOUR     12    // 12:00 NY (no abrir nuevas)
#define FILTER_FRIDAY_FORCE_CLOSE_HOUR  16    // 16:00 NY (cerrar forzado)

// News (Modulo 11): cliente HTTP del journal Vercel.
struct NewsEvent
{
   string    id;
   string    title;
   string    currency;        // USD, EUR, GBP, JPY, ...
   string    impact;          // HIGH, MEDIUM, LOW
   datetime  scheduledAt;     // UTC (parseado de ISO "...Z")
   bool      isActive;        // Server-side: dentro de ventana de bloqueo (+/-30 min)
   bool      isBlocked;       // Server-side: alias de isActive en este endpoint
   bool      hasPassed;
   bool      isUpcoming;
};

#define NEWS_API_ENDPOINT             "https://giotradingbot-system.vercel.app/api/news/bot-today"
#define NEWS_BLOCK_BEFORE_MINUTES     30
#define NEWS_BLOCK_AFTER_MINUTES      30
#define NEWS_FETCH_INTERVAL_SECONDS   3600    // 1 hora
#define NEWS_CACHE_MAX_AGE_SECONDS    43200   // 12 horas (modo conservador si excede)
#define NEWS_WEBREQUEST_TIMEOUT_MS    5000

// Kill Switch (Modulo 12): polling al journal con DOS flags separados:
//   killSwitchActive (emergencia) -> cerrar todo + bloquear nuevas
//   botEnabled (apagado progresivo) -> solo bloquear nuevas (las abiertas siguen)
struct KillSwitchState
{
   bool      killSwitchActive;        // Emergencia (boton rojo)
   bool      botEnabled;              // true = bot habilitado para abrir nuevas
   datetime  lastCheckAt;
   datetime  lastSuccessAt;
   datetime  killSwitchActivatedAt;   // Cuando killSwitch paso a true
   bool      enforcementDone;         // true si ya se ejecuto el cierre masivo
};

#define KILLSWITCH_API_ENDPOINT           "https://giotradingbot-system.vercel.app/api/bot/kill-switch"
#define KILLSWITCH_POLL_INTERVAL_SECONDS  30
#define KILLSWITCH_TIMEOUT_MS             3000   // 3s timeout (fail-open si excede)

#endif // COMMON_MQH
