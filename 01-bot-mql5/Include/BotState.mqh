//+------------------------------------------------------------------+
//| BotState.mqh - Fase 5: reporta el estado VIVO del bot al journal  |
//|                                                                  |
//| POST https://.../api/bot/state cada ~5s por simbolo. El journal  |
//| hace polling (GET) cada 3s y muestra el panel live (narracion +  |
//| FVGs activos + sweeps + mini-clase ICT).                         |
//|                                                                  |
//| SOLO LEE estado existente (Bias_Get, Sizing_GetKillzoneStatus,   |
//| Setup_GetActive). NO toca la logica de la estrategia.            |
//|                                                                  |
//| Fire-and-forget (reusa Journal_PostJson). Strings ASCII-safe     |
//| para evitar problemas de encoding en el source MQL5.             |
//|                                                                  |
//| Incluir DESPUES de Bias/Sizing/Setup (al final de GioBot.mq5).   |
//+------------------------------------------------------------------+
#ifndef BOTSTATE_MQH
#define BOTSTATE_MQH

#include <Common.mqh>
#include <Journal.mqh>
#include <Liquidity.mqh>   // GMTToNY
#include <Bias.mqh>
#include <Sizing.mqh>
#include <Setup.mqh>

string BotState_FvgSide(ENUM_FVG_TYPE t) { return (t == FVG_BEARISH ? "BEAR" : "BULL"); }

string BotState_FvgStateStr(FVGZone &f)
{
   if(f.isIFVG)                      return "IFVG";
   if(f.state == FVG_INVALIDATED)    return "IFVG";
   if(f.state == FVG_MITIGATED)      return "MITIGATING";
   return "ACTIVE";
}

// Narracion didactica segun killzone + progreso de los setups. ASCII-safe.
void BotState_BuildNarration(string symbol, ENUM_KILLZONE_STATUS kz, int n,
                             bool hasFvg, bool hasConfirmed,
                             string &action, string &reasoning, string &nextStep)
{
   if(kz != IN_KILLZONE)
   {
      action    = "Aguardando killzone (Londres / NY AM / NY Lunch)...";
      reasoning = "El bot solo opera dentro de killzones, donde la liquidez institucional es maxima.";
      nextStep  = "Al abrir la killzone, empieza a escanear sweeps de liquidez.";
      return;
   }

   if(n <= 0)
   {
      action    = "Escaneando sweeps de liquidez en " + symbol + "...";
      reasoning = "Busca barridos de stops sobre highs/lows clave: manipulacion previa al movimiento real.";
      nextStep  = "Si detecta un sweep, busca un FVG que mitigue el precio.";
      return;
   }

   if(hasConfirmed)
   {
      action    = "Confluencia completa en " + symbol + ". Validando bias HTF antes de operar...";
      reasoning = "Sweep + FVG + CHoCH presentes. Falta confirmar que el setup va a favor del bias H4.";
      nextStep  = "Si el setup esta alineado con el bias, arma la entrada.";
      return;
   }

   if(hasFvg)
   {
      action    = "FVG activo en " + symbol + ". Esperando CHoCH para confirmar la reversion...";
      reasoning = "El FVG marca la zona de mitigacion; el CHoCH confirmaria que el sweep fue manipulacion real.";
      nextStep  = "Si confirma CHoCH, valida el bias y prepara la operacion.";
      return;
   }

   action    = "Sweep detectado en " + symbol + ". Buscando FVG que mitigue el precio...";
   reasoning = "Tras el barrido de liquidez, el bot busca un imbalance (FVG) en LTF para definir la entrada.";
   nextStep  = "Si aparece un FVG valido, espera el CHoCH de confirmacion.";
}

// Reporta el estado de UN simbolo. Fire-and-forget.
void BotState_Report(string symbol)
{
   ENUM_BIAS            bias  = Bias_Get(symbol);
   datetime             nowNY = GMTToNY(TimeGMT());
   ENUM_KILLZONE_STATUS kz    = Sizing_GetKillzoneStatus(nowNY);

   TradeSetup setups[];
   int n = Setup_GetActive(symbol, setups);

   string fvgs = "", sweeps = "";
   bool hasFvg = false, hasConfirmed = false;

   for(int i = 0; i < n; i++)
   {
      // Sweep gatillo
      if(StringLen(sweeps) > 0) sweeps += ",";
      sweeps += "{\"tf\":\"" + Journal_SweepTfStr(setups[i].sweep.timeframe) + "\","
              + "\"level\":\"" + Journal_EscapeStr(EnumToString(setups[i].sweep.levelSwept.type)) + "\","
              + "\"type\":\"" + EnumToString(setups[i].sweep.direction) + "\"}";

      if(setups[i].hasFVG)
      {
         hasFvg = true;
         if(StringLen(fvgs) > 0) fvgs += ",";
         fvgs += "{\"tf\":\"" + Journal_FvgTfStr(setups[i].fvg.timeframe) + "\","
               + "\"side\":\"" + BotState_FvgSide(setups[i].fvg.type) + "\","
               + "\"top\":" + DoubleToString(setups[i].fvg.top, 5) + ","
               + "\"bot\":" + DoubleToString(setups[i].fvg.bottom, 5) + ","
               + "\"quality\":" + IntegerToString(setups[i].fvg.quality) + ","
               + "\"state\":\"" + BotState_FvgStateStr(setups[i].fvg) + "\"}";
      }

      if(setups[i].hasCHoCH || setups[i].state == SETUP_CONFIRMED) hasConfirmed = true;
   }

   string chochState = hasConfirmed ? "CONFIRMED" : (n > 0 ? "PENDING" : "NONE");

   string action, reasoning, nextStep;
   BotState_BuildNarration(symbol, kz, n, hasFvg, hasConfirmed, action, reasoning, nextStep);

   string body = "{";
   body += "\"symbol\":\"" + symbol + "\",";
   body += "\"biasH4\":\"" + Journal_BiasStr(bias) + "\",";
   body += "\"killzone\":\"" + Journal_KillzoneStr(kz) + "\",";
   body += "\"chochState\":\"" + chochState + "\",";
   body += "\"fvgs\":[" + fvgs + "],";
   body += "\"sweeps\":[" + sweeps + "],";
   body += "\"markers\":[],";
   body += "\"currentAction\":\"" + Journal_EscapeStr(action) + "\",";
   body += "\"reasoning\":\"" + Journal_EscapeStr(reasoning) + "\",";
   body += "\"nextStep\":\"" + Journal_EscapeStr(nextStep) + "\"";
   body += "}";

   Journal_PostJson(BOTSTATE_API_ENDPOINT, body, "BOTSTATE");
}

#endif // BOTSTATE_MQH
