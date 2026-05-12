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
   Print("GioBot v0.10 inicializado. Modulo: Liquidity only.");
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
   // Actualizar liquidez al inicio de cada vela H1
   datetime currentH1_S1 = iTime(Symbol1, PERIOD_H1, 0);
   if(currentH1_S1 != lastUpdateH1_S1)
   {
      Liquidity_Update(Symbol1);
      lastUpdateH1_S1 = currentH1_S1;
      LogLiquidity(Symbol1);
   }

   datetime currentH1_S2 = iTime(Symbol2, PERIOD_H1, 0);
   if(currentH1_S2 != lastUpdateH1_S2)
   {
      Liquidity_Update(Symbol2);
      lastUpdateH1_S2 = currentH1_S2;
      LogLiquidity(Symbol2);
   }
}

//+------------------------------------------------------------------+
//| Loggea todos los niveles activos                                 |
//+------------------------------------------------------------------+
void LogLiquidity(string symbol)
{
   if(!EnableLogging) return;

   LiquidityLevel levels[];
   int count = Liquidity_GetActive(symbol, levels);

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
