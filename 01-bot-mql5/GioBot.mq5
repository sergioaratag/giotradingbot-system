//+------------------------------------------------------------------+
//|                                                       GioBot.mq5 |
//|                                  GioTradingBot ICT - v0.1        |
//|                                  Modulo 1: Liquidity only        |
//+------------------------------------------------------------------+
#property copyright "Sergio Arata"
#property link      "https://giotradingbot-system.vercel.app"
#property version   "0.10"
#property strict

#include <Common.mqh>
#include <Liquidity.mqh>
#include <Sweep.mqh>
#include <FVG.mqh>
#include <Structure.mqh>
#include <Bias.mqh>

// Inputs configurables desde MT5 GUI
input string Symbol1 = "EURUSD";
input string Symbol2 = "GBPUSD";
input bool   EnableLogging = true;

// Last update tracker (por simbolo)
datetime lastUpdateH1_S1 = 0;
datetime lastUpdateH1_S2 = 0;

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
   Print("GioBot v0.14 inicializado. Modulos: Liquidity + Sweep + FVG + Structure + Bias.");
   Print("Simbolos: ", Symbol1, ", ", Symbol2);
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
//+------------------------------------------------------------------+
void OnTick()
{
   // Liquidity + Sweep + FVG corren al inicio de cada vela H1
   datetime currentH1_S1 = iTime(Symbol1, PERIOD_H1, 0);
   if(currentH1_S1 != lastUpdateH1_S1)
   {
      Liquidity_Update(Symbol1);
      lastUpdateH1_S1 = currentH1_S1;
      LogLiquidity(Symbol1);
      ScanAndLogSweeps(Symbol1);
      ScanAndLogFVGs(Symbol1);
      ScanAndLogStructure(Symbol1);
      BiasResult biasS1 = Bias_Calculate(Symbol1);
      Bias_LogResult(biasS1);
   }

   datetime currentH1_S2 = iTime(Symbol2, PERIOD_H1, 0);
   if(currentH1_S2 != lastUpdateH1_S2)
   {
      Liquidity_Update(Symbol2);
      lastUpdateH1_S2 = currentH1_S2;
      LogLiquidity(Symbol2);
      ScanAndLogSweeps(Symbol2);
      ScanAndLogFVGs(Symbol2);
      ScanAndLogStructure(Symbol2);
      BiasResult biasS2 = Bias_Calculate(Symbol2);
      Bias_LogResult(biasS2);
   }
}

//+------------------------------------------------------------------+
//| Escanea sweeps en H4 / H1 / M15 y los loggea                     |
//+------------------------------------------------------------------+
void ScanAndLogSweeps(string symbol)
{
   SweepEvent sweeps[];

   int countH4 = Sweep_Detect(symbol, SWEEP_TF_H4, sweeps);
   for(int i = 0; i < countH4; i++) Sweep_LogEvent(sweeps[i]);

   ArrayResize(sweeps, 0);
   int countH1 = Sweep_Detect(symbol, SWEEP_TF_H1, sweeps);
   for(int i = 0; i < countH1; i++) Sweep_LogEvent(sweeps[i]);

   ArrayResize(sweeps, 0);
   int countM15 = Sweep_Detect(symbol, SWEEP_TF_M15, sweeps);
   for(int i = 0; i < countM15; i++) Sweep_LogEvent(sweeps[i]);
}

//+------------------------------------------------------------------+
//| Detecta FVGs nuevos + actualiza estados en H1 / M15 / M5         |
//+------------------------------------------------------------------+
void ScanAndLogFVGs(string symbol)
{
   FVGZone fvgs[];

   // Deteccion de nuevos FVGs (cada call solo retorna los frescos no vistos)
   int countH1 = FVG_Detect(symbol, FVG_TF_H1, fvgs);
   for(int i = 0; i < countH1; i++) FVG_LogEvent(fvgs[i], "NEW");

   ArrayResize(fvgs, 0);
   int countM15 = FVG_Detect(symbol, FVG_TF_M15, fvgs);
   for(int i = 0; i < countM15; i++) FVG_LogEvent(fvgs[i], "NEW");

   ArrayResize(fvgs, 0);
   int countM5 = FVG_Detect(symbol, FVG_TF_M5, fvgs);
   for(int i = 0; i < countM5; i++) FVG_LogEvent(fvgs[i], "NEW");

   // Update estados (transiciones a MITIG/INVAL se loggean dentro)
   FVG_UpdateStates(symbol, FVG_TF_H1);
   FVG_UpdateStates(symbol, FVG_TF_M15);
   FVG_UpdateStates(symbol, FVG_TF_M5);
}

//+------------------------------------------------------------------+
//| Detecta CHoCH/BOS en H1 / M15 / M5 y loggea estructura actual    |
//+------------------------------------------------------------------+
void ScanAndLogStructure(string symbol)
{
   StructureEvent events[];

   int countH1 = Structure_DetectEvents(symbol, STRUCT_TF_H1, events);
   for(int i = 0; i < countH1; i++) Structure_LogEvent(events[i]);

   ArrayResize(events, 0);
   int countM15 = Structure_DetectEvents(symbol, STRUCT_TF_M15, events);
   for(int i = 0; i < countM15; i++) Structure_LogEvent(events[i]);

   ArrayResize(events, 0);
   int countM5 = Structure_DetectEvents(symbol, STRUCT_TF_M5, events);
   for(int i = 0; i < countM5; i++) Structure_LogEvent(events[i]);

   // Resumen de estructura actual por TF
   string s1  = "H1: "  + EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_H1));
   string s15 = "M15: " + EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_M15));
   string s5  = "M5: "  + EnumToString(Structure_GetCurrent(symbol, STRUCT_TF_M5));
   Print("[STRUCT] ", symbol, " | ", s1, " | ", s15, " | ", s5);
}

//+------------------------------------------------------------------+
//| Loggea todos los niveles activos                                 |
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
