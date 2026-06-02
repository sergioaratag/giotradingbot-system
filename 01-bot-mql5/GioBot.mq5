//+------------------------------------------------------------------+
//|                                                       GioBot.mq5 |
//|                                  GioTradingBot ICT - v0.1        |
//|                                  Modulo 6: Setup detection       |
//+------------------------------------------------------------------+
#property copyright "Sergio Arata"
#property link      "https://giotradingbot-system.vercel.app"
#property version   "0.21"
#property strict

#include <Common.mqh>
#include <Liquidity.mqh>
#include <Sweep.mqh>
#include <FVG.mqh>
#include <Structure.mqh>
#include <Bias.mqh>
#include <Sizing.mqh>
#include <News.mqh>
#include <KillSwitch.mqh>
#include <Filters.mqh>
#include <Execution.mqh>
#include <Setup.mqh>
#include <Management.mqh>

// Inputs configurables desde MT5 GUI
input string Symbol1        = "EURUSD";
input string Symbol2        = "GBPUSD";
input bool   EnableLogging  = true;   // Resumen de liquidez en modo verbose
input bool   VerboseLogging = false;  // true: logs por modulo. false: solo setups.
input string BotApiKey      = "";     // x-bot-api-key para /api/news/bot-today del journal Vercel

// Last update trackers (por simbolo)
datetime lastUpdateH1_S1 = 0;
datetime lastUpdateH1_S2 = 0;
datetime lastUpdateM1_S1 = 0;
datetime lastUpdateM1_S2 = 0;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   Liquidity_Init();
   Sweep_Init();
   FVG_Init();
   Structure_Init();
   Bias_Init();
   Sizing_Init();
   News_Init();
   News_SetApiKey(BotApiKey);
   KillSwitch_Init();
   KillSwitch_SetApiKey(BotApiKey);
   Filters_Init();
   Execution_Init();
   Setup_Init();
   Setup_SetVerbose(VerboseLogging);
   Management_Init();

   // Fetch inicial de noticias (sincrono). Si falla, Filters bloquea aperturas
   // hasta el siguiente fetch OK (modo conservador).
   News_FetchFromApi();
   // Poll inicial del kill switch (NO bloqueante si falla - fail-open).
   KillSwitch_Poll();
   KillSwitch_EnforceIfActive();

   Print("GioBot v0.21 inicializado. Modulos: Liquidity + Sweep + FVG + Structure + Bias + Sizing + News + KillSwitch + Filters + Execution + Setup + Management.");
   Print("Modulo News cargado. Endpoint: ", NEWS_API_ENDPOINT,
         " | Cache confiable: ", (News_CanQueryReliably() ? "SI" : "NO"));
   Print("Modulo KillSwitch cargado. Polling cada ", KILLSWITCH_POLL_INTERVAL_SECONDS,
         "s | Estado inicial: ", (KillSwitch_IsActive() ? "ACTIVO" : "OFF"));
   if(StringLen(BotApiKey) == 0)
      Print("[WARN] Input BotApiKey vacio - News y KillSwitch fallaran. Configurar antes de operar.");
   Print("Simbolos: ", Symbol1, ", ", Symbol2, " | Verbose: ", (VerboseLogging ? "ON" : "OFF"));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("GioBot detenido. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//|                                                                  |
//| - Liquidity se refresca al cierre de cada vela H1 (alimenta el   |
//|   detector de sweeps).                                           |
//| - Setup_Process corre en cada vela M1 para captar confirmaciones |
//|   LTF rapidas (M5/M3/M1). Es el UNICO consumidor de Sweep_Detect |
//|   y Structure_DetectEvents (que consumen/dedupean internamente), |
//|   por eso NO se llaman scanners individuales en paralelo.        |
//+------------------------------------------------------------------+
void OnTick()
{
   // --- Modulo 12: kill switch (prioridad maxima) ---
   // Poll respeta su propio intervalo (30s); llamarlo en cada tick es safe.
   KillSwitch_Poll();
   KillSwitch_EnforceIfActive();
   if(KillSwitch_IsActive()) return;   // Bot dormido mientras kill switch ON

   // --- Modulo 9: gestion de posiciones (cada tick para reaccion rapida) ---
   Management_Process();

   // --- Refresco de liquidez en cierre H1 ---
   datetime currentH1_S1 = iTime(Symbol1, PERIOD_H1, 0);
   if(currentH1_S1 != lastUpdateH1_S1)
   {
      lastUpdateH1_S1 = currentH1_S1;
      Liquidity_Update(Symbol1);
      if(VerboseLogging) LogVerbose(Symbol1);
   }

   datetime currentH1_S2 = iTime(Symbol2, PERIOD_H1, 0);
   if(currentH1_S2 != lastUpdateH1_S2)
   {
      lastUpdateH1_S2 = currentH1_S2;
      Liquidity_Update(Symbol2);
      if(VerboseLogging) LogVerbose(Symbol2);
   }

   // --- Procesamiento de setups en cierre M1 (la cadena completa) ---
   datetime currentM1_S1 = iTime(Symbol1, PERIOD_M1, 0);
   if(currentM1_S1 != lastUpdateM1_S1)
   {
      lastUpdateM1_S1 = currentM1_S1;
      Setup_Process(Symbol1);
   }

   datetime currentM1_S2 = iTime(Symbol2, PERIOD_M1, 0);
   if(currentM1_S2 != lastUpdateM1_S2)
   {
      lastUpdateM1_S2 = currentM1_S2;
      Setup_Process(Symbol2);
   }

   // --- Tareas periodicas (1 vez por minuto): Modulos 8 + 10 ---
   static datetime lastMinuteTask = 0;
   if(TimeCurrent() - lastMinuteTask >= 60)
   {
      Execution_CancelExpiredLimits();    // M8: limpia pendings vencidos (45 min / fin de sesion)
      Filters_EnforceFridayClosing();     // M10: cierre forzado viernes >= 16:00 NY
      lastMinuteTask = TimeCurrent();
   }

   // --- Tarea periodica (1 vez por hora): Modulo 11 News refresh ---
   // WebRequest es bloqueante; por eso solo 1x/h y nunca en cada tick.
   News_TickUpdate();
}

//+------------------------------------------------------------------+
//| Resumen verboso READ-ONLY (no consume eventos de deteccion).     |
//| El detalle de sweeps/FVG/CHoCH detectados sale de Setup_Process  |
//| via lineas [SETUP] y [SETUP v]. Aqui solo contexto de estado.    |
//+------------------------------------------------------------------+
void LogVerbose(string symbol)
{
   LogLiquidity(symbol);

   // Estructura actual por TF (Structure_GetCurrent recomputa, no consume)
   Print("[STRUCT] ", symbol,
         " | D1: ",  EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_D1)),
         " | H4: ",  EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_H4)),
         " | H1: ",  EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_H1)),
         " | M15: ", EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_M15)),
         " | M5: ",  EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_M5)));

   // Bias HTF
   BiasResult b = Bias_Calculate(symbol);
   Bias_LogResult(b);
}

//+------------------------------------------------------------------+
//| Loggea todos los niveles activos de liquidez                     |
//+------------------------------------------------------------------+
void LogLiquidity(string symbol)
{
   if(!EnableLogging) return;

   LiquidityLevel levels[];
   int count = Liquidity_GetAll(symbol, levels);

   Print("===== Liquidity para ", symbol, " =====");
   Print("Total niveles activos: ", count);

   for(int i = 0; i < count; i++)
   {
      string typeName = EnumToString(levels[i].type);
      Print(typeName, " @ ", DoubleToString(levels[i].price, 5),
            " | Strength: ", levels[i].strength,
            " | Formed: ", TimeToString(levels[i].formedAt),
            " | Swept: ", (levels[i].isSwept ? "YES" : "NO"));
   }
   Print("=========================");
}
