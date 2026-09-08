# 04-lab-backtest — El laboratorio de validación

Acá se prueba si una estrategia sirve **antes** de que toque una cuenta.

Este laboratorio existe por una razón concreta: el bot MQL5 anterior operó en
demo el 9 de junio de 2026 **sin haber hecho jamás un backtest**, porque el
código no se podía validar a sí mismo (`WebRequest` no funciona en el Strategy
Tester de MT5 → el módulo de noticias falla → el filtro rechaza el 100 % de las
entradas → un backtest da exactamente cero trades).

La decisión fue no arreglar ese bot todavía. Primero se valida en Python. Sólo
una estrategia que demuestre ventaja acá se lleva a MQL5.

**Este laboratorio no se conecta a ningún bróker, no maneja credenciales y no
puede ejecutar una sola operación real.** Lee archivos de precios y escribe
reportes. Nada más.

---

## Lo mínimo para arrancar

Tres comandos, en orden. Parado en esta carpeta (`04-lab-backtest`).

**1. Preparar el entorno (una sola vez):**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

**2. Bajar los datos históricos** (tarda; se puede cortar y retomar):

```bash
.venv/bin/python scripts/download_data.py --symbols EURUSD GBPUSD --years 3
```

**3. Ver si los datos sirven** — hacer esto siempre antes de creerle a un backtest:

```bash
.venv/bin/python scripts/data_quality_report.py
```

Y para correr un backtest:

```bash
.venv/bin/python scripts/run_backtest.py --strategy demo_ma_cross --symbols EURUSD
```

El reporte queda en `data/reports/`. Es un archivo `.md` que se abre en Obsidian
o en cualquier editor de texto.

**Para verificar que el laboratorio no está roto:**

```bash
.venv/bin/python -m pytest
```

Tienen que pasar los 95. Si falla alguno de `test_no_lookahead.py`, **no le creas
a ningún resultado** hasta arreglarlo.

---

## Qué hay adentro

```
04-lab-backtest/
├── src/giolab/
│   ├── types.py          Signal, Position, Trade, Instrument. Lo que cruza entre módulos.
│   ├── clock.py          Sesiones y hora de Nueva York con DST real. El antídoto al bug del offset fijo.
│   ├── resample.py       M1 → M5/M15/H1/H4/D1. Siempre hacia arriba, nunca al revés.
│   ├── context.py        MarketContext: lo único que la estrategia puede ver. Acá vive el anti-lookahead.
│   ├── strategy.py       El contrato que toda estrategia implementa.
│   ├── indicators.py     SMA, EMA, ATR, ADX. Funciones puras sobre arrays.
│   ├── data/
│   │   ├── dukascopy.py  Descarga de ticks (trae spread real).
│   │   ├── histdata.py   Respaldo M1 (no trae spread).
│   │   ├── store.py      Guardado en Parquet.
│   │   └── quality.py    Informe de huecos, spread y zona horaria.
│   ├── engine/
│   │   ├── costs.py      Spread, comisión, slippage, swap.
│   │   ├── risk.py       Sizing y reglas de prop firm.
│   │   ├── account.py    Balance, equity, registro de rechazos.
│   │   ├── broker.py     Ejecución vela por vela, siempre peor caso.
│   │   └── engine.py     El loop.
│   ├── metrics/
│   │   ├── stats.py      Expectancy en R, profit factor, drawdown, histograma.
│   │   ├── regime.py     Etiquetado por régimen de mercado.
│   │   └── report.py     Reporte en markdown + CSVs.
│   └── strategies/
│       └── demo_ma_cross.py   SOLO PRUEBA. No operar.
├── scripts/              Los tres comandos de arriba.
├── tests/                95 tests.
└── data/                 Datos y reportes. No va al repo.
```

---

## Las cuatro decisiones que hacen que esto sirva

### 1. La estrategia no puede ver el futuro

Es el pecado capital del backtesting. Si la estrategia ve, aunque sea de refilón,
un dato que en vivo todavía no existía, el backtest da una curva hermosa y la
cuenta real pierde plata. Y no hay forma de darse cuenta mirando el resultado.

Acá se hace **estructuralmente imposible**:

- La estrategia nunca recibe la tabla completa de precios. Recibe una vista
  recortada a las velas que ya cerraron.
- El recorte usa la hora de **cierre** de cada vela, no la de apertura. Si son
  las 09:00, la vela de 4 horas que empezó a las 08:00 todavía no existe. Este
  es el error que se cuela en la mayoría de los backtests que miran varios
  marcos temporales a la vez.
- Los caminos de escape dan error en vez de devolver un número.

Y hay un test que lo demuestra de punta a punta: se corre el mismo backtest sobre
30 días y sobre los primeros 15, y los trades del tramo común tienen que ser
**idénticos**. Si el motor filtrara futuro por cualquier rendija, la corrida larga
"sabría" cosas que la corta no y los resultados diferirían.

### 2. Los costos son reales, no decorativos

Spread (variable por sesión, y el **real** de los datos cuando existe), comisión,
slippage siempre en contra, y swap si la posición cruza el rollover — triple los
miércoles. Un backtest sin costos honestos no es un backtest: es un dibujo.

### 3. Cuando hay duda, gana el peor caso

Si en una vela el precio pudo tocar el stop **y** el objetivo, se asume siempre
que pegó el stop. Sin datos de tick no hay forma de saber cuál llegó primero, y
elegir el objetivo infla los resultados de una manera que después no aparece en
la cuenta. Un gap en contra se paga entero; un gap a favor no se cobra.

Una señal decidida al cierre de una vela se ejecuta en la **apertura de la
siguiente**, nunca al cierre de la que acaba de cerrar: en vivo eso no existe.

### 4. El resultado se reporta por régimen de mercado

Ésta es la parte que hace que el reporte sirva para decidir algo.

Cada día queda etiquetado por tendencia o rango (ADX en H4), volatilidad alta,
normal o baja (ATR contra su propio percentil histórico), dirección, y si hubo
noticia de alto impacto. Cada trade queda etiquetado además por sesión (Londres,
Nueva York, solapamiento, Asia) y día de la semana.

> **Una estrategia que gana en tendencia y pierde en rango no es una estrategia
> mala: es una estrategia con un filtro de régimen faltante.**

El número global promedia esas dos cosas y da algo mediocre. El desglose por
régimen muestra que hay algo que rescatar. Antes de tirar una estrategia con
expectancy cercana a cero, mirar si hay un régimen donde gana claramente. Si lo
hay, el trabajo no es cambiar la estrategia: es agregarle el filtro.

---

## Cómo leer un reporte

La métrica que manda es la **expectancy en R**: cuánto gana o pierde la
estrategia, en promedio, por cada unidad de riesgo. Si se arriesga 100 dólares
por trade y la expectancy es +0,3 R, cada trade deja 30 dólares en promedio.

Se mide en R y no en dólares porque R no depende del tamaño de la cuenta: un
backtest sobre 10.000 dice lo mismo que sobre 100.000, y dos estrategias que
arriesgan distinto se pueden comparar.

Lo demás que hay que mirar, en orden:

| Qué | Para qué |
|---|---|
| **Cantidad de trades** | Menos de 30 es anécdota, no estadística. Menos de 100, provisorio. |
| **Distribución de R** | El promedio esconde la forma. Un sistema con muchas ganancias chicas y una pérdida enorme se vive muy distinto de uno parejo, aunque den lo mismo. |
| **Max drawdown** | Cuánto llegó a caer. Si supera el límite de la prop firm, no importa que el total sea positivo: la cuenta ya estaba reprobada. |
| **Racha perdedora más larga** | Lo que hay que poder aguantar sin apagar el robot. |
| **Señales rechazadas** | Si la estrategia generó cientos de señales y el motor rechazó casi todas, el resultado no dice nada sobre la estrategia. Éste es el chequeo que le faltó al bot anterior. |

Un win rate del 70 % con expectancy negativa es una estrategia perdedora con
buena prensa. El win rate solo no significa nada.

---

## Agregar una estrategia nueva

Un archivo en `src/giolab/strategies/`. La estrategia dice **dónde entra**,
**dónde está equivocada** (el stop) y **cuánto riesgo sugiere**. El motor traduce
eso a lotes. Separar las dos cosas es lo que hace que el riesgo sea auditable.

```python
from ..strategy import BaseStrategy
from ..types import Side, Signal, TakeProfit

class MiEstrategia(BaseStrategy):
    name = "mi_estrategia"
    required_timeframes = ["M5", "H1", "H4"]   # el primero marca el ritmo

    def on_bar(self, ctx):
        m5 = ctx.tf("M5")          # sólo velas ya cerradas
        h4 = ctx.tf("H4")
        precio = ctx.price
        # ... lógica ...
        return Signal(
            side=Side.BUY, entry=precio, stop_loss=precio - 0.0020,
            take_profits=(TakeProfit(precio + 0.0040),),
            reason="sweep de PDH + FVG M5 confirmado, 08:42 NY",   # OBLIGATORIO
        )

    def manage(self, ctx, pos):
        return None   # trailing, salidas anticipadas, parciales
```

El campo `reason` **no es decorativo y el código no te deja omitirlo**. Es lo que
permite abrir el CSV de trades seis meses después y entender por qué se tomó cada
operación. Sin motivo legible, un trade no se puede auditar.

Después:

```bash
.venv/bin/python scripts/run_backtest.py --strategy mi_estrategia --symbols EURUSD GBPUSD
```

---

## De dónde salen los datos

**Dukascopy** (fuente principal). Entrega ticks con bid y ask separados, así que
da el **spread real** de cada momento. Es lo único que permite modelar costos con
honestidad. Gratis, con años de historia. Contra: hay que bajar un archivo por
hora (unos 26.000 por año y por par) y el servidor corta si se lo apura.

**HistData** (respaldo). Un archivo por mes, mucho más rápido. Contra grande: no
publica spread, hay que estimarlo. Además publica sus horas en un offset fijo de
UTC−5 todo el año, que **no** es la zona horaria de Nueva York — el código lo
maneja explícitamente en `data/histdata.py`.

**Export desde el MT5 de Sergio** (la mejor opción para la validación final).
Refleja las condiciones de *su* bróker: sus spreads, sus horarios, su servidor.
Requiere que él lo exporte a mano desde MetaTrader.

Todo se guarda en **Parquet**, no en CSV: pesa entre 5 y 10 veces menos, carga
mucho más rápido y — esto es lo importante — conserva la zona horaria. Un CSV
devuelve el timestamp como texto, y ahí es exactamente por donde se pierde la
zona horaria y aparecen las sesiones corridas.

**Todo se almacena en UTC.** La hora de Nueva York aparece únicamente en la capa
de sesiones, calculada con `zoneinfo` y DST real. Nunca un offset fijo: Nueva York
es UTC−5 en invierno y UTC−4 en verano, y las fechas de cambio se mueven todos los
años. El bot anterior tenía UTC−4 escrito a mano y de noviembre a marzo corría
todas sus ventanas una hora fuera de lugar.

---

## La estrategia de prueba

`demo_ma_cross.py` es un cruce de medias. **No es una estrategia y no hay que
operarla, ni en demo.** Existe sólo para comprobar que el motor funciona de punta
a punta: que genera señales, dimensiona, ejecuta, cobra costos, cierra y produce
métricas.

Si su reporte da positivo en algún período, eso no significa nada más que "ese
período tuvo tendencia".

---

## Reglas de esta carpeta

- No se toca `01-bot-mql5/` ni `02-journal-web/`. Congelados.
- Nada acá se conecta a un bróker ni maneja credenciales.
- Toda decisión de estrategia se anota en `Gio-Vault/GIO-TRADER-ICT/06-Decisiones/`
  **el mismo día que se toma**. El proyecto anterior murió porque unas catorce
  decisiones quedaron sólo en comentarios de código y nadie las revisó nunca como
  conjunto.
