//+------------------------------------------------------------------+
//| KillSwitch.mqh - Modulo 12: dos flags remotos via HTTP polling.  |
//|                                                                  |
//| GET https://giotradingbot-system.vercel.app/api/bot/kill-switch  |
//|     Header: x-bot-api-key                                        |
//|     Resp:   { "killSwitch": bool, "botEnabled": bool }           |
//|                                                                  |
//| Politica (separada por Sergio):                                  |
//|                                                                  |
//|   killSwitch=true  -> EMERGENCIA: cerrar todas las posiciones    |
//|                       + cancelar pendings + bloquear nuevas      |
//|                                                                  |
//|   botEnabled=false -> APAGADO PROGRESIVO: solo bloquear nuevas;  |
//|                       las posiciones abiertas siguen su curso    |
//|                       (trailing, BE, news, CHoCH siguen activos) |
//|                                                                  |
//|   Prioridad: killSwitch manda. Si killSwitch=true, botEnabled se |
//|   ignora porque el cierre forzado cubre todo.                    |
//|                                                                  |
//| FAIL-OPEN: si WebRequest falla (timeout, -1, !=200, JSON mal     |
//| formado), NO cambiar el estado conocido. El bot sigue operando   |
//| con el ultimo estado valido (o defaults si nunca fetch OK).      |
//|                                                                  |
//| Default permisivo: si botEnabled no esta en el JSON -> true.     |
//|                                                                  |
//| Idempotencia: enforcementDone evita cerrar dos veces. Solo aplica|
//| a killSwitch; botEnabled=false no dispara enforcement.           |
//|                                                                  |
//| Logging: solo en transiciones. Polls exitosos sin cambio son     |
//| silenciosos.                                                     |
//+------------------------------------------------------------------+
#ifndef KILLSWITCH_MQH
#define KILLSWITCH_MQH

#include <Common.mqh>
#include <Journal.mqh>
#include <Trade/Trade.mqh>

// Forward decls (definidas en Management.mqh, que se incluye DESPUES de
// KillSwitch.mqh en GioBot.mq5). El call solo se invoca en runtime asi que
// el linker resuelve sin problema.
void Management_MarkCloseReported(ulong ticket, ENUM_CLOSE_REASON reason);
void Management_FetchCloseInfo(ulong positionId, double &closePrice, double &pnlUSD);

//============================ STORAGE ===============================
KillSwitchState s_ks;
string          s_ksApiKey = "";

//============================ API PUBLICA ===========================

void KillSwitch_Init()
{
   s_ks.killSwitchActive      = false;
   s_ks.botEnabled            = true;
   s_ks.lastCheckAt           = 0;
   s_ks.lastSuccessAt         = 0;
   s_ks.killSwitchActivatedAt = 0;
   s_ks.enforcementDone       = false;
}

void KillSwitch_SetApiKey(string key) { s_ksApiKey = key; }

// Emergencia activa? (true = boton rojo apretado)
bool KillSwitch_IsEmergency() { return s_ks.killSwitchActive; }

// Bot habilitado para operar nuevas entradas? (false = emergencia O apagado).
bool KillSwitch_IsBotEnabled()
{
   if(s_ks.killSwitchActive) return false;   // emergencia bloquea todo
   return s_ks.botEnabled;
}

// Consultada por Execution_OpenFromSizing para decidir si abrir nuevas.
bool KillSwitch_AllowsNewEntries() { return KillSwitch_IsBotEnabled(); }

// Alias retrocompatible: cuando alguien hable de "kill switch activo" se
// refiere a la emergencia (no al apagado progresivo).
bool KillSwitch_IsActive() { return KillSwitch_IsEmergency(); }

// Poll al endpoint si paso el intervalo. Llamado en cada tick desde GioBot;
// internamente respeta el intervalo de 30s asi que es safe llamarlo siempre.
void KillSwitch_Poll()
{
   if(TimeCurrent() - s_ks.lastCheckAt < KILLSWITCH_POLL_INTERVAL_SECONDS) return;
   s_ks.lastCheckAt = TimeCurrent();

   if(StringLen(s_ksApiKey) == 0)
   {
      return;   // sin key, fail-open silencioso (ya advertimos en OnInit)
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
      Print("[KILLSWITCH] WebRequest fallo. Error: ", err, hint,
            " | fail-open: bot sigue operando");
      return;
   }

   if(code != 200)
   {
      string body = CharArrayToString(resBuf);
      Print("[KILLSWITCH] Endpoint retorno HTTP ", code,
            " | body[0..120]=", StringSubstr(body, 0, 120),
            " | fail-open: bot sigue operando");
      return;
   }

   string body = CharArrayToString(resBuf);

   // === Parsear killSwitch (campo critico - sin el no actualizamos nada) ===
   int posKill = StringFind(body, "\"killSwitch\"");
   if(posKill < 0)
   {
      Print("[KILLSWITCH] JSON sin campo killSwitch | body[0..120]=",
            StringSubstr(body, 0, 120), " | fail-open");
      return;
   }
   bool newKillSwitch = false;
   int colonKill = StringFind(body, ":", posKill);
   if(colonKill >= 0)
   {
      string after = StringSubstr(body, colonKill + 1, 16);
      StringTrimLeft(after);
      newKillSwitch = (StringFind(after, "true") == 0);
   }

   // === Parsear botEnabled (default true si no existe - permisivo) ===
   bool newBotEnabled = true;
   int posEnabled = StringFind(body, "\"botEnabled\"");
   if(posEnabled >= 0)
   {
      int colonEn = StringFind(body, ":", posEnabled);
      if(colonEn >= 0)
      {
         string afterEn = StringSubstr(body, colonEn + 1, 16);
         StringTrimLeft(afterEn);
         newBotEnabled = !(StringFind(afterEn, "false") == 0);
      }
   }

   bool wasKS = s_ks.killSwitchActive;
   bool wasBE = s_ks.botEnabled;

   s_ks.killSwitchActive = newKillSwitch;
   s_ks.botEnabled       = newBotEnabled;
   s_ks.lastSuccessAt    = TimeCurrent();

   // === Transiciones del killSwitch (emergencia) ===
   if(newKillSwitch && !wasKS)
   {
      s_ks.killSwitchActivatedAt = TimeCurrent();
      s_ks.enforcementDone       = false;
      Print("==========================================");
      Print("[KILLSWITCH] EMERGENCIA ACTIVADA | cerrando todo (posiciones + pendings)");
      Print("==========================================");
   }
   else if(!newKillSwitch && wasKS)
   {
      s_ks.killSwitchActivatedAt = 0;
      s_ks.enforcementDone       = false;
      Print("[KILLSWITCH] Emergencia desactivada | bot vuelve a operacion normal",
            (!newBotEnabled ? " (botEnabled=false sigue bloqueando nuevas entradas)" : ""));
   }

   // === Transiciones de botEnabled (apagado progresivo) ===
   // Solo loggear si killSwitch NO esta activo (sino su log ya cubre el caso).
   if(!newKillSwitch)
   {
      if(!newBotEnabled && wasBE)
         Print("[KILLSWITCH] Bot DESHABILITADO (apagado progresivo)",
               " | posiciones abiertas siguen gestion normal | no se abriran nuevas");
      else if(newBotEnabled && !wasBE)
         Print("[KILLSWITCH] Bot HABILITADO | nuevas entradas permitidas");
   }
}

// Cierre masivo. Solo dispara con killSwitchActive=true. Idempotente vía
// enforcementDone (reseteado al volver killSwitch a false).
void KillSwitch_EnforceIfActive()
{
   if(!s_ks.killSwitchActive) return;
   if(s_ks.enforcementDone)   return;

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

      // Modulo 13: marcar reportado ANTES del close para que Management no
      // doble-postee al detectar el cierre externo.
      Management_MarkCloseReported(ticket, CLOSE_REASON_KILL_SWITCH);

      if(trade.PositionClose(ticket))
      {
         closed++;
         Print("[KILLSWITCH] Cerrada posicion ticket=", ticket, " | ", sym);

         double cp = 0.0, pnl = 0.0;
         Management_FetchCloseInfo(ticket, cp, pnl);
         // rAchieved no calculable aqui sin slDistance original; mandamos 0.
         Journal_PostTradeClosed(ticket, sym, CLOSE_REASON_KILL_SWITCH,
                                 cp, pnl, 0.0);
      }
      else
      {
         Print("[KILLSWITCH] Fallo cerrar ticket=", ticket,
               " code=", trade.ResultRetcode(), " ",
               trade.ResultRetcodeDescription());
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
