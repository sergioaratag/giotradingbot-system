//+------------------------------------------------------------------+
//| KillSwitch.mqh - Modulo 12: kill switch remoto via HTTP polling. |
//|                                                                  |
//| Polling cada 30s al journal Vercel:                              |
//|   GET https://giotradingbot-system.vercel.app/api/bot/kill-switch
//|       Header: x-bot-api-key                                      |
//|       Resp:   { "killSwitch": bool, "botEnabled": bool }         |
//|                                                                  |
//| Politica:                                                        |
//|   - killSwitch == true  -> bot dormido (cierre forzado total)    |
//|   - botEnabled == false -> bot dormido (igual que kill switch)   |
//|   - cualquiera de los dos activa el protocolo                    |
//|                                                                  |
//| FAIL-OPEN: si WebRequest falla (timeout, -1, !=200), NO cambiar  |
//| el estado conocido. El bot sigue operando. El kill switch solo   |
//| dispara con una respuesta 200 explicita que lo indique.          |
//|                                                                  |
//| Idempotencia: enforcementDone evita cerrar posiciones multiples  |
//| veces. Se resetea cuando el flag remoto vuelve a false.          |
//|                                                                  |
//| Logging: solo en transiciones (OFF->ON / ON->OFF) y al cierre    |
//| masivo. Polls exitosos OFF son silenciosos.                      |
//+------------------------------------------------------------------+
#ifndef KILLSWITCH_MQH
#define KILLSWITCH_MQH

#include <Common.mqh>
#include <Trade/Trade.mqh>

//============================ STORAGE ===============================
KillSwitchState s_ks;
string          s_ksApiKey = "";

//============================ API PUBLICA ===========================

void KillSwitch_Init()
{
   s_ks.active           = false;
   s_ks.botEnabled       = true;
   s_ks.lastCheckAt      = 0;
   s_ks.lastSuccessAt    = 0;
   s_ks.activatedAt      = 0;
   s_ks.enforcementDone  = false;
   s_ks.activeReason     = "";
}

void KillSwitch_SetApiKey(string key) { s_ksApiKey = key; }

bool KillSwitch_IsActive() { return s_ks.active; }

string KillSwitch_GetReason() { return s_ks.activeReason; }

// Poll al endpoint si paso el intervalo. Llamado en cada tick desde GioBot;
// internamente respeta el intervalo de 30s asi que es safe.
void KillSwitch_Poll()
{
   if(TimeCurrent() - s_ks.lastCheckAt < KILLSWITCH_POLL_INTERVAL_SECONDS) return;
   s_ks.lastCheckAt = TimeCurrent();

   if(StringLen(s_ksApiKey) == 0)
   {
      // Sin key, fail-open silencioso (ya advertimos en OnInit).
      return;
   }

   string url     = KILLSWITCH_API_ENDPOINT;
   string headers = "x-bot-api-key: " + s_ksApiKey + "\r\n";
   char   post[];
   char   resBuf[];
   string resHeaders;

   ResetLastError();
   int code = WebRequest("GET", url, headers, KILLSWITCH_TIMEOUT_MS,
                         post, resBuf, resHeaders);

   if(code == -1)
   {
      int err = GetLastError();
      string hint = (err == 4060
                     ? " - URL no autorizada en MT5 (Tools > Options > Expert Advisors)"
                     : "");
      Print("[KILLSWITCH] WebRequest fallo. Error: ", err, hint, " | fail-open: bot sigue operando");
      return;  // fail-open
   }

   if(code != 200)
   {
      string body = CharArrayToString(resBuf);
      Print("[KILLSWITCH] Endpoint retorno HTTP ", code,
            " | body[0..120]=", StringSubstr(body, 0, 120),
            " | fail-open: bot sigue operando");
      return;  // fail-open
   }

   string body = CharArrayToString(resBuf);

   // Shape: {"killSwitch":bool,"botEnabled":bool}
   bool killOn = false;
   bool botOn  = true;

   int posKill = StringFind(body, "\"killSwitch\"");
   if(posKill < 0)
   {
      Print("[KILLSWITCH] JSON sin campo killSwitch | body[0..120]=", StringSubstr(body, 0, 120),
            " | fail-open");
      return;
   }
   int colonKill = StringFind(body, ":", posKill);
   if(colonKill >= 0)
   {
      string after = StringSubstr(body, colonKill + 1, 16);
      StringTrimLeft(after);
      killOn = (StringFind(after, "true") == 0);
   }

   int posEnabled = StringFind(body, "\"botEnabled\"");
   if(posEnabled >= 0)
   {
      int colonEn = StringFind(body, ":", posEnabled);
      if(colonEn >= 0)
      {
         string afterEn = StringSubstr(body, colonEn + 1, 16);
         StringTrimLeft(afterEn);
         botOn = (StringFind(afterEn, "true") == 0);
      }
   }

   bool wasActive    = s_ks.active;
   bool wasBotEnabled = s_ks.botEnabled;

   s_ks.botEnabled    = botOn;
   s_ks.active        = (killOn || !botOn);
   s_ks.lastSuccessAt = TimeCurrent();
   s_ks.activeReason  = (killOn ? "KILL_SWITCH"
                                : (!botOn ? "BOT_DISABLED" : ""));

   if(s_ks.active && !wasActive)
   {
      s_ks.activatedAt     = TimeCurrent();
      s_ks.enforcementDone = false;  // se ejecutara enforcement en el proximo EnforceIfActive
      Print("==========================================");
      Print("[KILLSWITCH] ACTIVADO REMOTAMENTE | razon=", s_ks.activeReason,
            " | cerrando posiciones y cancelando pendings");
      Print("==========================================");
   }
   else if(!s_ks.active && wasActive)
   {
      Print("[KILLSWITCH] DESACTIVADO | bot vuelve a operacion normal");
      s_ks.enforcementDone = false;  // reset para futura reactivacion
      s_ks.activatedAt     = 0;
   }
}

// Si el kill switch acaba de activarse, cerrar TODO lo del bot. Idempotente.
void KillSwitch_EnforceIfActive()
{
   if(!s_ks.active) return;
   if(s_ks.enforcementDone) return;

   CTrade trade;
   trade.SetExpertMagicNumber(BOT_MAGIC_NUMBER);
   trade.SetDeviationInPoints(EXECUTION_SLIPPAGE_POINTS);

   int closed = 0, cancelled = 0;

   // 1) Cerrar todas las posiciones del bot
   int posTotal = PositionsTotal();
   for(int i = posTotal - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != BOT_MAGIC_NUMBER) continue;

      string sym = PositionGetString(POSITION_SYMBOL);
      if(trade.PositionClose(ticket))
      {
         closed++;
         Print("[KILLSWITCH] Cerrada posicion ticket=", ticket, " | ", sym);
      }
      else
      {
         Print("[KILLSWITCH] Fallo cerrar ticket=", ticket,
               " code=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }
   }

   // 2) Cancelar todos los pendings del bot
   int ordTotal = OrdersTotal();
   for(int i = ordTotal - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if((long)OrderGetInteger(ORDER_MAGIC) != BOT_MAGIC_NUMBER) continue;

      if(trade.OrderDelete(ticket))
      {
         cancelled++;
         Print("[KILLSWITCH] Cancelado pending ticket=", ticket);
      }
   }

   Print("[KILLSWITCH] Protocolo de emergencia ejecutado: ",
         closed, " posiciones cerradas, ", cancelled, " pendings cancelados.");
   s_ks.enforcementDone = true;
}

#endif // KILLSWITCH_MQH
