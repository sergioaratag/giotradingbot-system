//+------------------------------------------------------------------+
//| News.mqh - Modulo 11: cliente HTTP del calendario de noticias.   |
//|                                                                  |
//| Fetch al endpoint del journal Vercel y mantiene una cache en     |
//| memoria. Otros modulos consultan la cache (rapido) y este modulo |
//| la refresca 1 vez por hora desde GioBot.OnTick.                  |
//|                                                                  |
//| Endpoint: https://giotradingbot-system.vercel.app/api/news/bot-today
//|   Auth: header x-bot-api-key contra env var BOT_API_KEY (server) |
//|   Shape: { events: [ { id, title, currency, impact,              |
//|                        scheduledAt(ISO), isActive, isBlocked, ...}],
//|            activeBlock, nextEvent, now, nyDate }                 |
//|                                                                  |
//| El server ya marca cada evento con isActive/isBlocked aplicando  |
//| la ventana +/-30 min y filtrando por currencies bloqueantes      |
//| (USD/EUR/GBP) - lo aprovechamos directamente para el filtro de   |
//| entrada y solo computamos "5 min antes" localmente para el cierre|
//| de posiciones en Management.                                     |
//|                                                                  |
//| Modo conservador: si nunca hubo fetch OK o la cache lleva >12h   |
//| vencida, News_CanQueryReliably() devuelve false y Filters bloquea|
//| nuevas entradas (decision confirmada por Sergio).                |
//|                                                                  |
//| MQL5 setup obligatorio: Tools > Options > Expert Advisors >      |
//| Allow WebRequest for listed URL > agregar                        |
//|   https://giotradingbot-system.vercel.app                        |
//| Sin esto WebRequest devuelve -1 con GetLastError() == 4060.      |
//+------------------------------------------------------------------+
#ifndef NEWS_MQH
#define NEWS_MQH

#include <Common.mqh>

//============================ STORAGE ===============================
NewsEvent s_news[];
datetime  s_newsLastFetchAttempt = 0;
datetime  s_newsLastFetchSuccess = 0;
string    s_newsApiKey = "";                  // Se setea desde GioBot vía News_SetApiKey

//============================ LOGGING ===============================

void News_LogStatus()
{
   string ageStr = (s_newsLastFetchSuccess > 0
                    ? IntegerToString((TimeCurrent() - s_newsLastFetchSuccess) / 60) + " min"
                    : "n/a");
   Print("[NEWS] cache=", ArraySize(s_news), " eventos | ultimo OK hace ",
         ageStr, " | confiable=", (News_CanQueryReliably() ? "SI" : "NO"));
}

//============================ HELPERS PRIVADOS ======================

void News_SetApiKey(string key) { s_newsApiKey = key; }

// Currencies relevantes para el simbolo (devuelve por out[]).
void News_RelevantCurrencies(string symbol, string &out[])
{
   ArrayResize(out, 0);
   if(StringFind(symbol, "EURUSD") >= 0)
   {
      ArrayResize(out, 2); out[0] = "USD"; out[1] = "EUR"; return;
   }
   if(StringFind(symbol, "GBPUSD") >= 0)
   {
      ArrayResize(out, 2); out[0] = "USD"; out[1] = "GBP"; return;
   }
   // Otros pares: ningun bloqueo (todavia no contemplados).
}

bool News_StringInArray(string needle, string &haystack[])
{
   int n = ArraySize(haystack);
   for(int i = 0; i < n; i++)
      if(haystack[i] == needle) return true;
   return false;
}

// Extrae el valor (string) asociado a "key" en un fragmento JSON-like.
// Soporta valores entre comillas y valores literales (true/false/null/numero).
// Frágil pero suficiente para el shape conocido del endpoint.
string News_ExtractJsonStr(string obj, string key)
{
   string pattern = "\"" + key + "\"";
   int start = StringFind(obj, pattern);
   if(start < 0) return "";

   int colon = StringFind(obj, ":", start + StringLen(pattern));
   if(colon < 0) return "";

   int p = colon + 1;
   int len = StringLen(obj);
   while(p < len)
   {
      ushort ch = StringGetCharacter(obj, p);
      if(ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n') { p++; continue; }
      break;
   }
   if(p >= len) return "";

   ushort first = StringGetCharacter(obj, p);
   if(first == '"')
   {
      int qStart = p + 1;
      int qEnd   = StringFind(obj, "\"", qStart);
      if(qEnd < 0) return "";
      return StringSubstr(obj, qStart, qEnd - qStart);
   }

   // Literal (true/false/null/number)
   int litStart = p;
   while(p < len)
   {
      ushort ch = StringGetCharacter(obj, p);
      if(ch == ',' || ch == '}' || ch == ']' ||
         ch == ' ' || ch == '\r' || ch == '\n' || ch == '\t') break;
      p++;
   }
   return StringSubstr(obj, litStart, p - litStart);
}

bool News_ExtractJsonBool(string obj, string key, bool defaultVal)
{
   string v = News_ExtractJsonStr(obj, key);
   if(v == "true")  return true;
   if(v == "false") return false;
   return defaultVal;
}

// Parsea ISO "2026-01-05T13:30:00Z" / "...000Z" como UTC.
datetime News_ParseIsoUtc(string iso)
{
   if(StringLen(iso) < 19) return 0;

   int year  = (int)StringToInteger(StringSubstr(iso,  0, 4));
   int month = (int)StringToInteger(StringSubstr(iso,  5, 2));
   int day   = (int)StringToInteger(StringSubstr(iso,  8, 2));
   int hour  = (int)StringToInteger(StringSubstr(iso, 11, 2));
   int mins  = (int)StringToInteger(StringSubstr(iso, 14, 2));
   int secs  = (int)StringToInteger(StringSubstr(iso, 17, 2));

   MqlDateTime dt;
   dt.year = year; dt.mon = month; dt.day = day;
   dt.hour = hour; dt.min = mins;  dt.sec = secs;
   dt.day_of_week = 0; dt.day_of_year = 0;
   return StructToTime(dt);   // tratamos como UTC absoluto
}

// Parser principal. Solo extrae el array "events". El resto del shape
// (activeBlock/nextEvent/now/nyDate) lo ignoramos: nuestros consumidores
// recomputan a partir de events[].
bool News_ParseJson(string json)
{
   ArrayResize(s_news, 0);

   int eventsKey = StringFind(json, "\"events\"");
   if(eventsKey < 0) return false;

   int arrStart = StringFind(json, "[", eventsKey);
   if(arrStart < 0) return false;

   // Buscar el "]" que cierra ESTE array. Como cada item es un objeto
   // {...} sin arrays anidados, basta con seguir niveles de [/].
   int depth = 0, pos = arrStart, len = StringLen(json), arrEnd = -1;
   while(pos < len)
   {
      ushort ch = StringGetCharacter(json, pos);
      if(ch == '[') depth++;
      else if(ch == ']') { depth--; if(depth == 0) { arrEnd = pos; break; } }
      pos++;
   }
   if(arrEnd < 0) return false;

   string arrBody = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);

   // Iterar objetos {...} con tracking de profundidad.
   int p = 0;
   int bodyLen = StringLen(arrBody);
   while(p < bodyLen)
   {
      int objStart = -1;
      while(p < bodyLen)
      {
         ushort ch = StringGetCharacter(arrBody, p);
         if(ch == '{') { objStart = p; break; }
         p++;
      }
      if(objStart < 0) break;

      int braceDepth = 0;
      int q = objStart;
      int objEnd = -1;
      while(q < bodyLen)
      {
         ushort ch = StringGetCharacter(arrBody, q);
         if(ch == '{') braceDepth++;
         else if(ch == '}')
         {
            braceDepth--;
            if(braceDepth == 0) { objEnd = q; break; }
         }
         q++;
      }
      if(objEnd < 0) break;

      string obj = StringSubstr(arrBody, objStart, objEnd - objStart + 1);

      NewsEvent e;
      e.id          = News_ExtractJsonStr(obj, "id");
      e.title       = News_ExtractJsonStr(obj, "title");
      e.currency    = News_ExtractJsonStr(obj, "currency");
      e.impact      = News_ExtractJsonStr(obj, "impact");
      e.scheduledAt = News_ParseIsoUtc(News_ExtractJsonStr(obj, "scheduledAt"));
      e.isActive    = News_ExtractJsonBool(obj, "isActive",    false);
      e.isBlocked   = News_ExtractJsonBool(obj, "isBlocked",   e.isActive);
      e.hasPassed   = News_ExtractJsonBool(obj, "hasPassed",   false);
      e.isUpcoming  = News_ExtractJsonBool(obj, "isUpcoming",  !e.hasPassed);

      if(StringLen(e.id) > 0 && e.scheduledAt > 0)
      {
         int n = ArraySize(s_news);
         ArrayResize(s_news, n + 1);
         s_news[n] = e;
      }

      p = objEnd + 1;
   }

   return true;   // array vacio tambien es exito (no hay eventos hoy)
}

//============================ API PUBLICA ===========================

void News_Init()
{
   ArrayResize(s_news, 0);
   s_newsLastFetchAttempt = 0;
   s_newsLastFetchSuccess = 0;
}

// True si tenemos cache fresca o relativamente reciente.
bool News_CanQueryReliably()
{
   if(s_newsLastFetchSuccess == 0) return false;
   if(TimeCurrent() - s_newsLastFetchSuccess > NEWS_CACHE_MAX_AGE_SECONDS) return false;
   return true;
}

// Llama al endpoint, parsea y actualiza cache. Retorna true si OK.
// SINCRONO: bloquea el thread del EA hasta NEWS_WEBREQUEST_TIMEOUT_MS.
// No llamar en cada tick: lo orquesta News_TickUpdate (1 vez por hora).
bool News_FetchFromApi()
{
   s_newsLastFetchAttempt = TimeCurrent();

   if(StringLen(s_newsApiKey) == 0)
   {
      Print("[NEWS] Fetch abortado: BotApiKey no configurado (input vacio).");
      return false;
   }

   string url     = NEWS_API_ENDPOINT;
   string headers = "x-bot-api-key: " + s_newsApiKey + "\r\n" +
                    "Content-Type: application/json\r\n";
   char   post[];
   char   resBuf[];
   string resHeaders;

   ResetLastError();
   int code = WebRequest("GET", url, headers, NEWS_WEBREQUEST_TIMEOUT_MS,
                         post, resBuf, resHeaders);

   if(code == -1)
   {
      int err = GetLastError();
      string hint = (err == 4060
                     ? " - URL no autorizada en MT5 (Tools > Options > Expert Advisors)"
                     : "");
      Print("[NEWS] WebRequest fallo. Error: ", err, hint);
      return false;
   }

   if(code != 200)
   {
      string body = CharArrayToString(resBuf);
      Print("[NEWS] Endpoint retorno HTTP ", code,
            " | body[0..200]=", StringSubstr(body, 0, 200));
      return false;
   }

   string body = CharArrayToString(resBuf);
   if(!News_ParseJson(body))
   {
      Print("[NEWS] Parseo del JSON fallo. Body[0..200]=", StringSubstr(body, 0, 200));
      return false;
   }

   s_newsLastFetchSuccess = TimeCurrent();
   Print("[NEWS] Cache actualizada. ", ArraySize(s_news), " eventos cargados.");
   return true;
}

// Refresca la cache si paso el intervalo. Llamada desde GioBot OnTick.
void News_TickUpdate()
{
   datetime now = TimeCurrent();
   if(s_newsLastFetchAttempt > 0 &&
      now - s_newsLastFetchAttempt < NEWS_FETCH_INTERVAL_SECONDS) return;
   News_FetchFromApi();
}

// True si hay evento HIGH de currency relevante dentro de la ventana
// +/- minutesAround minutos desde ahora.
bool News_HasHighImpactInWindow(string symbol, int minutesAround)
{
   string relevant[];
   News_RelevantCurrencies(symbol, relevant);
   if(ArraySize(relevant) == 0) return false;

   datetime nowUtc = TimeGMT();
   long windowSecs = (long)minutesAround * 60;

   int n = ArraySize(s_news);
   for(int i = 0; i < n; i++)
   {
      if(s_news[i].impact != "HIGH") continue;
      if(!News_StringInArray(s_news[i].currency, relevant)) continue;

      long diff = (long)s_news[i].scheduledAt - (long)nowUtc;
      if(diff >= -windowSecs && diff <= windowSecs) return true;
   }
   return false;
}

// True si hay evento HIGH relevante en los proximos `minutesBefore` minutos
// (solo "antes", no "despues"). Usado por Management para cerrar 5 min antes.
bool News_IsHighImpactSoon(string symbol, int minutesBefore)
{
   string relevant[];
   News_RelevantCurrencies(symbol, relevant);
   if(ArraySize(relevant) == 0) return false;

   datetime nowUtc = TimeGMT();
   long windowSecs = (long)minutesBefore * 60;

   int n = ArraySize(s_news);
   for(int i = 0; i < n; i++)
   {
      if(s_news[i].impact != "HIGH") continue;
      if(!News_StringInArray(s_news[i].currency, relevant)) continue;

      long diff = (long)s_news[i].scheduledAt - (long)nowUtc;
      if(diff >= 0 && diff <= windowSecs) return true;
   }
   return false;
}

// Total de eventos cacheados (util para diagnostico/tests).
int News_GetCachedCount() { return ArraySize(s_news); }

#endif // NEWS_MQH
