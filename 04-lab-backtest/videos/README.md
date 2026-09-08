# videos/

Grabaciones de los videos de curso desde los que se extraen las estrategias.

Una carpeta por trader: `trader-01/`, `trader-02/`, `trader-03/`.

## De dónde salen

La estrategia 1 viene de un curso pago en **Skool** de un trader argentino, al que
Cheyo tiene acceso legítimo. Skool no permite descarga, así que los videos entran
como **grabaciones de pantalla** hechas por Cheyo, con audio del sistema.

**Son de uso personal para este proyecto. No se redistribuyen.** No van al repo
(están en `.gitignore`): son archivos pesados y material de un curso pago.

## Qué hace el agente con esto

Los mira con la skill `/watch`, cuadro por cuadro, y produce un **spec exacto**
de la estrategia: contexto de mercado, criterios de entrada uno por uno,
confirmaciones, invalidaciones, stop loss, take profit, timeframes, sesiones y
gestión de riesgo. Cada regla anclada a un timestamp del video y al ejemplo en
TradingView que la muestra, separando lo explícito de lo inferido.

El spec va a `Gio-Vault/GIO-TRADER-ICT/01-Estrategias/`.

**Las reglas se escriben relativas al contexto, no con números absolutos.**
"Mecha ≥ 0,3 × ATR del timeframe", no "mecha ≥ 2 pips". Sesiones con DST real,
nunca con offset fijo. Ésa es la diferencia entre un bot que sirve seis meses y
uno que sirve.
