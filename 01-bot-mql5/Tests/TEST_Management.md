# TEST - Módulo Management (Módulo 9)

Gestiona posiciones abiertas. Llamado en cada tick desde GioBot.OnTick().

## Qué debería verse en logs

### Trailing escalonado (sucesivos R-levels alcanzados)
```
[MGMT] SL_MOVED | Ticket: 12345 | Alcanzo 1R. SL movido a BE + buffer (1.08439)
[MGMT] SL_MOVED | Ticket: 12345 | Alcanzo 2R. SL movido a 1R + buffer (1.08409)
[MGMT] SL_MOVED | Ticket: 12345 | Alcanzo 3R. SL movido a 2R + buffer (1.08379)
[MGMT] SL_MOVED | Ticket: 12345 | Alcanzo 4R. SL movido a 3R + buffer (1.08349)
```

### Salida por CHoCH contrario en M5
```
[MGMT] CLOSED_BY_CHOCH | Ticket: 12345 | CHoCH contrario detectado en M5
```

### Salida por noticia HIGH inminente (solo si SL en BE+)
```
[MGMT] CLOSED_BY_NEWS | Ticket: 12345 | SL en BE+, cerrado por noticia HIGH inminente
```

### Posición cerrada externamente (SL hit / cierre manual)
```
[MGMT] CLOSED | Ticket: 12345 | Posicion ya no existe (SL hit / cierre externo)
```

## Validaciones

1. **Apertura sin TP** (Módulo 8): posición se abre con TP=0; PositionGetDouble(POSITION_TP) == 0.
2. **Movimiento a BE al 1R**: precio recorre 1R completo desde entry → SL pasa a entry ± 1 pip.
3. **Movimiento a (N-1)R al NR**: precio sigue avanzando → SL escala al R-level anterior + buffer.
4. **SL nunca retrocede**: si después del 2R-trail el precio vuelve a 1.5R, el SL queda en 1R+buffer.
5. **rLevelReached monotónico**: si el R-level efectivo regresa, el contador interno NO baja.
6. **CHoCH solo posterior al open**: un CHoCH formado antes de `POSITION_TIME` no dispara cierre.
7. **CHoCH solo en M5**: CHoCH en M3/M1/H1 no dispara cierre.
8. **CHoCH a favor no dispara**: en LONG, EVT_CHOCH_BULLISH es ignorado (es a favor).
9. **Noticia con SL aún negativo**: NO cierra; deja correr (peor caso = SL inicial).
10. **Noticia con SL en BE+**: cierra inmediato.
11. **Housekeeping**: cerradas las posiciones (por SL/CHoCH/news/manual) → entrada se purga de s_positions al inicio del siguiente tick.

## Caso de prueba completo

Setup HIGH EUR/USD SHORT, entry **1.0844**, SL inicial **1.0859** (15 pips → 1R = 15 pips, slDistance = 0.00150).

| Precio actual | R-multiple | SL esperado    | Acción                    |
|--------------:|-----------:|----------------|---------------------------|
| 1.0844        | 0R         | 1.0859 (init)  | (sin acción)              |
| 1.0834        | 0.67R      | 1.0859         | (sin acción, <1R)         |
| 1.0829        | 1R         | **1.0843**     | SL_MOVED (entry - 1 pip)  |
| 1.0820        | 1.6R       | 1.0843         | (sin acción)              |
| 1.0814        | 2R         | **1.0828**     | SL_MOVED (1R - 1 pip)     |
| 1.0799        | 3R         | **1.0813**     | SL_MOVED (2R - 1 pip)     |
| 1.0784        | 4R         | **1.0798**     | SL_MOVED (3R - 1 pip)     |
| 1.0820 (rev)  | 1.6R       | **1.0798**     | NO retrocede              |

Para LONG el cálculo es simétrico: `newSL = entry + (N-1)*slDistance + buffer`.

## Diseño de estado interno

- Array global `PositionState s_positions[]` indexado linealmente. MQL5 no permite `GetPointer` sobre structs, por eso se accede vía índice (`s_positions[idx]`).
- `slDistance` se **cachea** en el seed: tras el primer trail, el SL real ya no representa el SL original, así que recalcularlo daría 0.
- `rLevelReached` es **monotónico creciente**. Sólo sube; nunca baja aunque el precio retroceda.
- `Management_PurgeClosedTickets()` corre al inicio de cada `Management_Process` y elimina los tickets que ya no existen en MT5 (cerrados por cualquier motivo).
- **Robustez al reinicio del EA**: si el EA arranca con posiciones del bot ya vivas, el primer tick las descubre vía `PositionsTotal` + filtro Magic y reconstruye su `PositionState` con `initialSL = SL actual` (no es el SL original real, pero es el mejor proxy disponible; el `slDistance` cacheado será conservador).

## Intercambio de eventos con Setup

`Structure_DetectEvents` **consume** los eventos (los almacena en `s_structEvents` y dedupea). Como Setup_Process ya los consume en cada cierre M1, Management usa el helper no-consumidor `Structure_HasEventSince(symbol, tf, eventType, sinceTime)` agregado a Structure.mqh, que sólo **consulta** el storage sin modificarlo.

## Stub de noticias

`Management_ShouldCloseByNews(symbol)` actualmente retorna `false` con TODO al Módulo 11. Cuando el Módulo 11 (filtro de noticias) esté listo, esta función debe consultar el calendario para divisas relevantes:
- EURUSD → USD, EUR
- GBPUSD → USD, GBP
- USDJPY → USD, JPY

…y retornar `true` si hay un evento HIGH en los próximos `MGMT_NEWS_BEFORE_MINUTES` (5).
