"""Ejecucion y costos.

Los supuestos de ejecucion son donde un backtest se vuelve optimista sin que
nadie lo note. Estos tests fijan los supuestos conservadores por escrito.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from giolab.engine.account import Account
from giolab.engine.broker import Broker, PendingEntry
from giolab.engine.costs import CostConfig
from giolab.types import Bar, EURUSD, ExitReason, Side, TakeProfit

UTC = timezone.utc


def bar(o, h, l, c, hora=10, spread=10.0) -> Bar:
    return Bar(
        ts=datetime(2025, 6, 10, hora, 0, tzinfo=UTC),
        open=o, high=h, low=l, close=c, volume=100.0,
        spread_mean=spread, spread_max=spread * 2,
    )


def broker(costs: CostConfig | None = None) -> Broker:
    return Broker(EURUSD, Account(10_000), costs or CostConfig())


def pending(side=Side.BUY, entry=1.1000, sl=1.0980, tp=1.1040, lots=0.5) -> PendingEntry:
    return PendingEntry(
        side=side, lots=lots, risk_amount_planned=100.0, stop_loss=sl,
        take_profits=(TakeProfit(tp, 1.0),), reason="test", tags={}, signal_entry=entry,
    )


# ------------------------------------------------------------------ costos
def test_la_compra_paga_mas_caro_que_el_medio():
    b = broker()
    pos = b.open_position(pending(), bar(1.1000, 1.1010, 1.0995, 1.1005))
    assert pos.entry_price > 1.1000, "una compra se ejecuta en el ask, no en el bid"


def test_la_venta_recibe_menos_que_el_medio():
    b = broker()
    pos = b.open_position(pending(Side.SELL, sl=1.1020, tp=1.0960),
                          bar(1.1000, 1.1010, 1.0995, 1.1005))
    assert pos.entry_price < 1.1000


def test_el_spread_grande_encarece_la_entrada():
    barato = broker().open_position(pending(), bar(1.1, 1.101, 1.0995, 1.1005, spread=5))
    caro = broker().open_position(pending(), bar(1.1, 1.101, 1.0995, 1.1005, spread=80))
    assert caro.entry_price > barato.entry_price


def test_el_spread_por_sesion_se_usa_cuando_no_hay_dato_real():
    cfg = CostConfig(use_real_spread=True)
    londres = cfg.spread_pips(datetime(2025, 6, 10, 9, 0, tzinfo=UTC), 0.0, EURUSD)
    asia = cfg.spread_pips(datetime(2025, 6, 10, 1, 0, tzinfo=UTC), 0.0, EURUSD)
    assert asia > londres, "el spread de Asia tiene que ser mayor que el de Londres"


def test_el_spread_real_le_gana_al_estimado():
    cfg = CostConfig(use_real_spread=True)
    ts = datetime(2025, 6, 10, 9, 0, tzinfo=UTC)
    assert cfg.spread_pips(ts, 30.0, EURUSD) == pytest.approx(3.0)  # 30 puntos = 3 pips


def test_la_comision_se_cobra_a_la_entrada_y_a_la_salida():
    b = broker(CostConfig(commission_per_lot_round_turn=10.0))
    balance_0 = b.account.balance
    b.open_position(pending(lots=1.0), bar(1.1, 1.101, 1.0995, 1.1005))
    assert b.account.balance == pytest.approx(balance_0 - 10.0)
    b.on_bar(bar(1.1000, 1.1050, 1.0999, 1.1045, hora=11))  # toca el TP
    assert b.account.balance < balance_0 + 400 - 19, "falta la comision de salida"


# --------------------------------------------------------- el peor caso
def test_si_el_stop_y_el_objetivo_entran_en_la_misma_vela_gana_el_stop():
    """EL supuesto que define la honestidad del backtest.

    Sin datos de tick no se puede saber cual toco primero. Elegir el objetivo
    infla los resultados de una forma que no aparece en la cuenta real.
    """
    b = broker()
    b.open_position(pending(sl=1.0980, tp=1.1040), bar(1.1000, 1.1002, 1.0999, 1.1001))
    cerrados = b.on_bar(bar(1.1000, 1.1050, 1.0970, 1.1010, hora=11))  # toca los dos
    assert len(cerrados) == 1
    assert cerrados[0].exit_reason is ExitReason.STOP_LOSS
    assert cerrados[0].r_multiple < 0


def test_el_gap_contra_la_posicion_se_paga_entero():
    """Si la vela abre por debajo del stop, se llena en la apertura: peor."""
    b = broker()
    b.open_position(pending(sl=1.0980), bar(1.1000, 1.1002, 1.0999, 1.1001))
    cerrados = b.on_bar(bar(1.0950, 1.0960, 1.0940, 1.0955, hora=11))
    t = cerrados[0]
    assert t.exit_reason is ExitReason.STOP_LOSS
    assert t.exit_price < 1.0980, "un gap por debajo del stop no se llena en el stop"
    assert t.r_multiple < -1.0, "un gap adverso pierde mas de 1R. Eso es real."


def test_el_gap_a_favor_no_se_regala():
    """Si la vela abre por encima del objetivo, se llena en el objetivo, no mejor."""
    b = broker()
    b.open_position(pending(sl=1.0980, tp=1.1040), bar(1.1000, 1.1002, 1.0999, 1.1001))
    cerrados = b.on_bar(bar(1.1100, 1.1120, 1.1090, 1.1110, hora=11))
    t = cerrados[0]
    assert t.exit_reason is ExitReason.TAKE_PROFIT
    assert t.exit_price < 1.1060, "el gap favorable no se cobra: se llena en el TP"


def test_el_stop_solo_se_mueve_para_proteger():
    b = broker()
    pos = b.open_position(pending(sl=1.0980), bar(1.1000, 1.1002, 1.0999, 1.1001))
    assert b.move_stop(pos, 1.1000) is True
    assert pos.stop_loss == 1.1000
    assert b.move_stop(pos, 1.0950) is False, "alejar el stop es aumentar el riesgo pactado"
    assert pos.stop_loss == 1.1000


def test_un_trade_perdedor_limpio_da_aproximadamente_menos_1r():
    """Sin costos, pegarle al stop tiene que dar exactamente -1R.

    Ojo con el spread: en los datos, spread 0 significa "no hay dato" y el motor
    cae al perfil por sesion. Para anularlo de verdad hay que poner el perfil en
    cero, no la columna. La ambiguedad es a proposito: es preferible que un dato
    faltante se note como costo estimado y no como costo cero.
    """
    from giolab.clock import Session
    sin_costos = CostConfig(
        commission_per_lot_round_turn=0.0, slippage_pips=0.0, slippage_pips_stop=0.0,
        spread_by_session={s: 0.0 for s in Session},
    )
    b = broker(sin_costos)
    b.open_position(pending(sl=1.0980, lots=0.5), bar(1.1000, 1.1002, 1.0999, 1.1001, spread=0))
    cerrados = b.on_bar(bar(1.1000, 1.1001, 1.0975, 1.0985, hora=11, spread=0))
    assert cerrados[0].r_multiple == pytest.approx(-1.0, abs=0.02)


def test_los_costos_se_comen_parte_del_objetivo():
    """Un TP de 2R nunca devuelve 2R limpios: el spread y la comision se cobran."""
    b = broker()
    b.open_position(pending(sl=1.0980, tp=1.1040, lots=0.5), bar(1.1, 1.1002, 1.0999, 1.1001))
    cerrados = b.on_bar(bar(1.1000, 1.1045, 1.0999, 1.1042, hora=11))
    t = cerrados[0]
    assert t.exit_reason is ExitReason.TAKE_PROFIT
    assert 1.5 < t.r_multiple < 2.0, f"un TP de 2R deberia rendir algo menos de 2R, dio {t.r_multiple}"


def test_mae_y_mfe_se_registran():
    b = broker()
    b.open_position(pending(sl=1.0980, tp=1.1040), bar(1.1000, 1.1002, 1.0999, 1.1001))
    b.on_bar(bar(1.1000, 1.1020, 1.0990, 1.1010, hora=11))
    cerrados = b.on_bar(bar(1.1010, 1.1045, 1.1005, 1.1042, hora=12))
    t = cerrados[0]
    assert t.mae_r < 0, "el trade estuvo en contra en algun momento"
    assert t.mfe_r > t.r_multiple, "el maximo a favor tiene que superar el resultado final"


def test_el_swap_se_cobra_al_cruzar_el_rollover():
    b = broker(CostConfig(apply_swap=True, swap_long_pips_per_day=-1.0))
    apertura = bar(1.1000, 1.1002, 1.0999, 1.1001, hora=20)
    b.open_position(pending(lots=1.0), apertura)
    b.on_bar(apertura)                                       # el motor procesa la vela de entrada
    balance_antes = b.account.balance
    b.on_bar(bar(1.1000, 1.1002, 1.0999, 1.1001, hora=23))   # cruza las 17:00 NY (21/22 UTC)
    assert b.account.balance < balance_antes, "una posicion que duerme paga swap"


def test_cierre_parcial_deja_la_posicion_abierta():
    b = broker()
    p = PendingEntry(
        side=Side.BUY, lots=1.0, risk_amount_planned=200.0, stop_loss=1.0980,
        take_profits=(TakeProfit(1.1020, 0.5), TakeProfit(1.1060, 0.5)),
        reason="parciales", tags={}, signal_entry=1.1000,
    )
    pos = b.open_position(p, bar(1.1000, 1.1002, 1.0999, 1.1001))
    cerrados = b.on_bar(bar(1.1000, 1.1025, 1.0999, 1.1020, hora=11))
    assert cerrados == [], "el primer objetivo parcial no cierra el trade"
    assert pos.lots == pytest.approx(0.5)
    assert pos.realized_pnl > 0
    cerrados = b.on_bar(bar(1.1020, 1.1065, 1.1019, 1.1062, hora=12))
    assert len(cerrados) == 1 and cerrados[0].exit_reason is ExitReason.TAKE_PROFIT


# ------------------------------------------------- construccion de estrategias
def test_el_motor_acepta_clase_factory_o_instancia():
    """Las tres formas de pasar una estrategia tienen que funcionar igual.

    Un `hasattr(x, "on_bar")` no distingue una clase de una instancia: la clase
    tambien lo tiene. Confundirlas le pasa la clase al motor en vez de un objeto.
    """
    from conftest import make_m1
    from giolab.engine.engine import Backtest, EngineConfig
    from giolab.strategies.demo_ma_cross import DemoMACross

    df = make_m1(n=60 * 24 * 8, seed=3, mean_revert=True)
    cfg = EngineConfig(warmup_bars=60)
    resultados = [
        Backtest(DemoMACross, {"EURUSD": df}, cfg).run(),           # clase
        Backtest(lambda: DemoMACross(), {"EURUSD": df}, cfg).run(),  # factory
        Backtest(DemoMACross(), {"EURUSD": df}, cfg).run(),          # instancia
    ]
    n = [len(r.trades) for r in resultados]
    assert n[0] > 0, "la corrida no genero trades: el test no prueba nada"
    assert len(set(n)) == 1, f"las tres formas dieron resultados distintos: {n}"


def test_cada_simbolo_recibe_su_propia_estrategia():
    """El estado de una estrategia no puede filtrarse entre pares."""
    from conftest import make_m1
    from giolab.engine.engine import Backtest, EngineConfig
    from giolab.strategies.demo_ma_cross import DemoMACross

    data = {"EURUSD": make_m1(n=60 * 24 * 6, seed=1), "GBPUSD": make_m1(n=60 * 24 * 6, seed=2)}
    bt = Backtest(DemoMACross, data, EngineConfig(warmup_bars=60))
    bt.run()
    a = bt._states["EURUSD"].strategy
    b = bt._states["GBPUSD"].strategy
    assert a is not b, "los dos pares comparten el mismo objeto de estrategia"
