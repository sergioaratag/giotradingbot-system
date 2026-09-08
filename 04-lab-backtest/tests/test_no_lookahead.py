"""EL TEST QUE IMPORTA.

Si estos tests pasan, el laboratorio no puede mentir sobre el futuro. Si alguno
falla, todos los resultados que produzca el motor son basura y no hay que creerles
ni un numero. Antes de tocar el motor, correr esto.

Tres capas:
  1. Los caminos directos al futuro estan cerrados (Frame levanta, no devuelve).
  2. El recorte multi-timeframe usa la hora de CIERRE, no la de apertura.
  3. Equivalencia por truncado: correr sobre 40 dias y sobre los primeros 20 tiene
     que producir exactamente los mismos trades en los primeros 20. Este es el
     estandar de oro, porque atrapa cualquier fuga de futuro aunque este escondida
     en el motor y no en el contrato de datos.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from conftest import make_m1
from giolab.context import Frame, LookaheadError, TimeframeData
from giolab.engine.engine import Backtest, EngineConfig, _close_timestamps
from giolab.resample import resample
from giolab.strategies.demo_ma_cross import DemoMACross
from giolab.strategy import BaseStrategy
from giolab.types import Side, Signal, TakeProfit


# --------------------------------------------------------------- capa 1
def _frame(n_total: int = 20, n_visible: int = 10) -> Frame:
    idx = pd.date_range("2025-03-03", periods=n_total, freq="h", tz="UTC")
    df = pd.DataFrame({
        "open": np.arange(n_total, dtype="float64"),
        "high": np.arange(n_total, dtype="float64") + 1,
        "low": np.arange(n_total, dtype="float64") - 1,
        "close": np.arange(n_total, dtype="float64"),
        "volume": np.ones(n_total),
    }, index=idx)
    data = TimeframeData("H1", df, _close_timestamps(df, "H1"))
    return Frame(data, n_visible)


def test_frame_solo_expone_lo_cerrado():
    f = _frame()
    assert len(f) == 10
    assert f.close[-1] == 9.0
    assert len(f.close) == 10  # las otras 10 velas no existen para la estrategia


def test_offset_negativo_es_error_no_dato():
    f = _frame()
    with pytest.raises(LookaheadError):
        f.at(-1)
    with pytest.raises(LookaheadError):
        f.at(-5)


def test_atributos_de_escape_bloqueados():
    f = _frame()
    for name in ("raw", "full", "source", "df", "_all", "future"):
        with pytest.raises(LookaheadError):
            getattr(f, name)


def test_datos_historicos_inmutables():
    """Una estrategia no puede reescribir el pasado para tapar una perdida."""
    f = _frame()
    with pytest.raises(ValueError):
        f.close[0] = 999.0


def test_indice_fuera_de_rango_es_indexerror():
    f = _frame()
    with pytest.raises(IndexError):
        f.at(50)


# --------------------------------------------------------------- capa 2
def test_vela_superior_no_visible_hasta_que_cierra():
    """A las 09:00 UTC la vela H4 de las 08:00 todavia no cerro.

    Este es el lookahead que se cuela en la mayoria de los backtests multi-TF:
    tomar la vela H4 "actual" cuando todavia le faltan tres horas de formarse.
    """
    df_m1 = make_m1(n=60 * 24 * 3, start="2025-04-07 00:00")
    h4 = resample(df_m1, "H4")
    data = TimeframeData("H4", h4, _close_timestamps(h4, "H4"))

    a_las_9 = np.datetime64("2025-04-07T09:00:00")
    n = data.n_closed_at(a_las_9)
    ultima = pd.Timestamp(data.ts_open[n - 1])
    assert ultima == pd.Timestamp("2025-04-07 04:00"), (
        f"A las 09:00 la ultima H4 cerrada es la de las 04:00, no {ultima}"
    )

    a_las_12 = np.datetime64("2025-04-07T12:00:00")
    n2 = data.n_closed_at(a_las_12)
    assert pd.Timestamp(data.ts_open[n2 - 1]) == pd.Timestamp("2025-04-07 08:00")


def test_estrategia_trampa_no_puede_ver_el_futuro():
    """Una estrategia que intenta espiar la vela siguiente se rompe en vez de ganar."""

    class Tramposa(BaseStrategy):
        name = "tramposa"
        required_timeframes = ["M15"]

        def __init__(self):
            self.intentos = 0
            self.exitos = 0

        def on_bar(self, ctx):
            m15 = ctx.tf("M15")
            if len(m15) < 5:
                return None
            self.intentos += 1
            try:
                futura = m15.at(-1)          # la vela que todavia no existe
                self.exitos += 1             # si esto corre, el lab esta roto
                side = Side.BUY if futura.close > m15.close[-1] else Side.SELL
                price = float(m15.close[-1])
                stop = price - 0.0020 * side.sign
                return Signal(side, price, stop,
                              (TakeProfit(price + 0.0040 * side.sign),),
                              reason="trampa")
            except LookaheadError:
                return None

    df = make_m1(n=60 * 24 * 5, start="2025-05-05 00:00")
    strat = Tramposa()
    bt = Backtest(strat, {"EURUSD": df}, EngineConfig(warmup_bars=10))
    bt.run()
    tramposa = bt._states["EURUSD"].strategy
    assert tramposa.intentos > 100, "el test no ejercito el camino"
    assert tramposa.exitos == 0, (
        f"LOOKAHEAD: la estrategia leyo el futuro {tramposa.exitos} veces. "
        "Todos los resultados del laboratorio son invalidos."
    )


# --------------------------------------------------------------- capa 3
def test_equivalencia_por_truncado():
    """El estandar de oro.

    Correr sobre 24 dias y sobre los primeros 12 tiene que dar EXACTAMENTE los
    mismos trades en el tramo comun. Si el motor filtrara futuro por cualquier
    rendija, las dos corridas divergirian: la larga "sabria" cosas que la corta no.
    """
    full = make_m1(n=60 * 24 * 30, start="2025-06-02 00:00", seed=5, mean_revert=True)
    corte = len(full) // 2
    truncado = full.iloc[:corte]
    limite = truncado.index[-1]

    cfg = EngineConfig(warmup_bars=100)
    strat = lambda: DemoMACross(fast=10, slow=25)  # mas sensible: mas cruces, mas trades para comparar
    r_full = Backtest(strat, {"EURUSD": full}, cfg).run()
    r_trunc = Backtest(strat, {"EURUSD": truncado}, cfg).run()

    # se comparan solo los trades que ya habian cerrado antes del corte
    margen = limite - pd.Timedelta(hours=6)  # el ultimo trade abierto se fuerza a cerrar
    a = [t for t in r_full.trades if pd.Timestamp(t.exit_ts) <= margen]
    b = [t for t in r_trunc.trades if pd.Timestamp(t.exit_ts) <= margen]

    assert len(a) >= 15, f"el test necesita trades para comparar, hubo {len(a)}"
    assert len(a) == len(b), (
        f"LOOKAHEAD: la corrida larga produjo {len(a)} trades y la corta {len(b)} "
        "en el mismo tramo. El motor esta usando datos futuros."
    )
    for x, y in zip(a, b):
        assert x.entry_ts == y.entry_ts, f"difiere la entrada: {x.entry_ts} vs {y.entry_ts}"
        assert x.side == y.side
        assert abs(x.entry_price - y.entry_price) < 1e-9
        assert abs(x.exit_price - y.exit_price) < 1e-9
        assert abs(x.r_multiple - y.r_multiple) < 1e-9, (
            f"LOOKAHEAD: mismo trade con distinto resultado "
            f"({x.r_multiple:.6f} vs {y.r_multiple:.6f})"
        )


def test_la_señal_se_ejecuta_en_la_apertura_siguiente():
    """Nadie opera al precio de cierre de la vela que recien cierra."""

    class UnaSolaEntrada(BaseStrategy):
        name = "una_entrada"
        required_timeframes = ["M15"]

        def __init__(self):
            self.emitida = False
            self.close_de_la_señal = None
            self.ts_de_la_señal = None

        def on_bar(self, ctx):
            if self.emitida or len(ctx.tf("M15")) < 20:
                return None
            self.emitida = True
            price = ctx.price
            self.close_de_la_señal = price
            self.ts_de_la_señal = ctx.tf("M15").current.ts
            return Signal(Side.BUY, price, price - 0.0020,
                          (TakeProfit(price + 0.0040),), reason="prueba de timing")

    df = make_m1(n=60 * 24 * 4, start="2025-07-07 00:00")
    bt = Backtest(UnaSolaEntrada(), {"EURUSD": df}, EngineConfig(warmup_bars=15))
    r = bt.run()
    strat = bt._states["EURUSD"].strategy
    assert len(r.trades) == 1
    t = r.trades[0]
    m15 = resample(df, "M15")
    siguiente = m15.index[m15.index.get_loc(pd.Timestamp(strat.ts_de_la_señal)) + 1]
    assert pd.Timestamp(t.entry_ts) == siguiente, (
        f"la entrada quedo en {t.entry_ts}, deberia ser la apertura siguiente {siguiente}"
    )
    assert t.entry_price != strat.close_de_la_señal, (
        "se entro exactamente al cierre de la vela de la señal: eso no existe en vivo"
    )
