//+------------------------------------------------------------------+
//| Bias.mqh - Modulo 5: Bias HTF (High Timeframe)                   |
//|                                                                  |
//| Combina la estructura de D1 y H4 (calculada por Structure.mqh)   |
//| para producir un bias direccional usado como FILTRO DE CONTEXTO  |
//| por el modulo de Sizing. NO es senal de entrada y NO opera.      |
//|                                                                  |
//| Diseno: OPCION A puro ICT - solo estructura, sin medias moviles  |
//| ni indicadores tradicionales.                                    |
//+------------------------------------------------------------------+
#ifndef BIAS_MQH
#define BIAS_MQH

#include <Common.mqh>
#include <Structure.mqh>

//============================ HELPERS PRIVADOS ======================

string BiasToString(ENUM_BIAS b)
{
   switch(b)
   {
      case BIAS_BULLISH: return "BULLISH";
      case BIAS_BEARISH: return "BEARISH";
      case BIAS_NEUTRAL: return "NEUTRAL";
   }
   return "?";
}

string BiasConfidenceToString(ENUM_BIAS_CONFIDENCE c)
{
   switch(c)
   {
      case BIAS_CONF_HIGH:   return "HIGH";
      case BIAS_CONF_MEDIUM: return "MEDIUM";
      case BIAS_CONF_LOW:    return "LOW";
      case BIAS_CONF_NONE:   return "CONFLICT";
   }
   return "?";
}

//============================ API PUBLICA ===========================

void Bias_Init()
{
   // El modulo no mantiene estado interno: cada Calculate lee fresh la
   // estructura desde Structure.mqh. Init existe por simetria con los
   // otros modulos.
}

// Calcula el bias HTF combinando estructura D1 y H4 segun la tabla.
BiasResult Bias_Calculate(string symbol)
{
   BiasResult r;
   r.symbol       = symbol;
   r.calculatedAt = TimeCurrent();
   r.structureH4  = Structure_GetCurrent(symbol, STRUCT_TF_H4);
   r.structureD1  = Structure_GetCurrent(symbol, STRUCT_TF_D1);

   bool h4Bull = (r.structureH4 == STRUCT_BULLISH);
   bool h4Bear = (r.structureH4 == STRUCT_BEARISH);
   bool h4Neu  = (r.structureH4 == STRUCT_NEUTRAL);
   bool d1Bull = (r.structureD1 == STRUCT_BULLISH);
   bool d1Bear = (r.structureD1 == STRUCT_BEARISH);
   bool d1Neu  = (r.structureD1 == STRUCT_NEUTRAL);

   if(h4Bull && d1Bull)
   {
      r.bias = BIAS_BULLISH; r.confidence = BIAS_CONF_HIGH;
   }
   else if(h4Bear && d1Bear)
   {
      r.bias = BIAS_BEARISH; r.confidence = BIAS_CONF_HIGH;
   }
   else if((h4Bull && d1Neu) || (h4Neu && d1Bull))
   {
      r.bias = BIAS_BULLISH; r.confidence = BIAS_CONF_MEDIUM;
   }
   else if((h4Bear && d1Neu) || (h4Neu && d1Bear))
   {
      r.bias = BIAS_BEARISH; r.confidence = BIAS_CONF_MEDIUM;
   }
   else if((h4Bull && d1Bear) || (h4Bear && d1Bull))
   {
      r.bias = BIAS_NEUTRAL; r.confidence = BIAS_CONF_NONE;  // conflicto
   }
   else // h4Neu && d1Neu
   {
      r.bias = BIAS_NEUTRAL; r.confidence = BIAS_CONF_LOW;
   }

   return r;
}

ENUM_BIAS Bias_Get(string symbol)
{
   BiasResult r = Bias_Calculate(symbol);
   return r.bias;
}

// Multiplicador de sizing: 1.0 si el trade va a favor del bias o el bias
// es neutral. 0.5 si va en contra.
double Bias_GetSizeMultiplier(string symbol, ENUM_DIRECTION tradeDirection)
{
   ENUM_BIAS bias = Bias_Get(symbol);

   if(bias == BIAS_NEUTRAL) return 1.0;
   if(bias == BIAS_BULLISH && tradeDirection == DIR_BULLISH) return 1.0;
   if(bias == BIAS_BEARISH && tradeDirection == DIR_BEARISH) return 1.0;

   return 0.5;
}

void Bias_LogResult(BiasResult &result)
{
   Print("[BIAS] ", result.symbol, " | ", BiasToString(result.bias),
         " | Confidence: ", BiasConfidenceToString(result.confidence),
         " | H4: ", EnumToString(result.structureH4),
         " | D1: ", EnumToString(result.structureD1));
}

#endif // BIAS_MQH
