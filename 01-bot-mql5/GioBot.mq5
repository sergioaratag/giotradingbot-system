//+------------------------------------------------------------------+
//|                                                       GioBot.mq5 |
//|                                  GioTradingBot ICT - v0.1        |
//|                                  Modulo 6: Setup detection       |
//+------------------------------------------------------------------+
#property copyright "Sergio Arata"
#property link      "https://giotradingbot-system.vercel.app"
#property version   "0.22"
#property strict

#include <Common.mqh>
#include <Liquidity.mqh>
#include <Sweep.mqh>
#include <FVG.mqh>
#include <Structure.mqh>
#include <Bias.mqh>
#include <Sizing.mqh>
#include <Journal.mqh>
#include <Recovery.mqh>
#include <News.mqh>
#include <KillSwitch.mqh>
#include <Filters.mqh>
#include <Execution.mqh>
#include <Setup.mqh>
#include <Management.mqh>
#include <BotState.mqh>   // Fase 5: reporte de estado vivo (incluir DESPUES de Bias/Sizing/Setup)
#include <CandleReporter.mqh>   // Fase 6: envia velas OHLC al journal

// Inputs configurables desde MT5 GUI
input string Symbol1        = "EURUSD";
input string Symbol2        = "GBPUSD";
input bool   EnableLogging  = true;   // Resumen de liquidez en modo verbose
input bool   VerboseLogging = false;  // true: logs por modulo. false: solo setups.
input string BotApiKey      = "";     // x-bot-api-key para /api/news/bot-today del journal Vercel

// Fase 5: throttle del reporte de estado vivo.
datetime lastStateReport = 0;

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
   Journal_Init();
   Journal_SetApiKey(BotApiKey);
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

   // Fase 1.5: reconciliar posiciones abiertas del bot que no llegaron al
   // journal (POST de apertura fallido). Idempotente por mt5Ticket en el
   // endpoint, asi que es safe en cada arranque. Solo si hay key configurada.
   if(StringLen(BotApiKey) > 0)
      Recovery_ReconcileOpenPositions();

   Print("GioBot v0.22 inicializado. Modulos: Liquidity + Sweep + FVG + Structure + Bias + Sizing + Journal + Recovery + News + KillSwitch + Filters + Execution + Setup + Management.");
   Print("Modulo News cargado. Endpoint: ", NEWS_API_ENDPOINT,
         " | Cache confiable: ", (News_CanQueryReliably() ? "SI" : "NO"));
   // Claridad: 'Emergencia' es el kill-switch (OFF = normal). 'Bot habilitado'
   // es si puede abrir nuevas entradas (BotEnabled del journal). No confundir.
   Print("Modulo KillSwitch cargado. Polling cada ", KILLSWITCH_POLL_INTERVAL_SECONDS,
         "s | Emergencia: ", (KillSwitch_IsActive() ? "ACTIVA" : "OFF (normal)"),
         " | Bot habilitado: ", (KillSwitch_IsBotEnabled() ? "SI" : "NO"));
   Print("Modulo Journal cargado. POSTs fire-and-forget a /api/bot/trade, /sl-moved, /closed, /setup-rejected");
   if(StringLen(BotApiKey) == 0)
      Print("[WARN] Input BotApiKey vacio - News, KillSwitch y Journal fallaran. Configurar antes de operar.");
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
   //   - killSwitch=true  -> emergencia: bot dormido completo (early return)
   //   - botEnabled=false -> apagado progresivo: NO early return; Management
   //     sigue gestionando lo abierto. Execution rechazara nuevas entradas.
   KillSwitch_Poll();
   KillSwitch_EnforceIfActive();
   if(KillSwitch_IsEmergency()) return;

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

   // --- Fase 5: reporte de estado vivo al journal (cada ~5s) ---
   // Solo lee estado existente y lo POSTea. Fire-and-forget. Requiere BotApiKey.
   if(StringLen(BotApiKey) > 0 &&
      TimeCurrent() - lastStateReport >= BOTSTATE_REPORT_INTERVAL_SECONDS)
   {
      lastStateReport = TimeCurrent();
      BotState_Report(Symbol1);
      BotState_Report(Symbol2);
   }

   // --- Fase 6: envio de velas OHLC al journal (backfill + cada 60s) ---
   CandleReporter_Tick();

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
