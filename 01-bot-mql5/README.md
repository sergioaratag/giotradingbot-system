# 01-bot-mql5 — ICT Expert Advisor

Expert Advisor en MQL5 que opera EUR/USD y GBP/USD con metodología ICT/SMC: detecta sweeps de liquidez, confirma con FVG/IFVG y CHoCH, y gestiona posiciones autónomamente.

## Estructura

```
01-bot-mql5/
├── ICT_Bot.mq5            ← Entry point del EA
├── Include/               ← Módulos (.mqh)
├── Files/
│   ├── config.json        ← Parámetros editables
│   └── news_cache.json    ← Cache de ForexFactory
└── Tests/                 ← Tests unitarios
```

## Instalar el EA en MT5

1. Abrir MetaTrader 5 → menú `Archivo` → `Abrir carpeta de datos`.
2. Copiar `ICT_Bot.mq5` a `MQL5/Experts/CheoTrader/`.
3. Copiar la carpeta `Include/` a `MQL5/Include/CheoTrader/`.
4. Copiar `Files/config.json` a `MQL5/Files/CheoTrader/`.
5. En MT5: `Herramientas` → `Opciones` → `Asesores Expertos`:
   - ✅ Permitir trading algorítmico
   - ✅ Permitir WebRequest para URL del journal (`http://localhost:3000` en dev, dominio Vercel en prod)

## Compilar

1. Abrir MetaEditor (F4 desde MT5).
2. Abrir `ICT_Bot.mq5`.
3. Compilar (F7). El binario `.ex5` queda en `MQL5/Experts/CheoTrader/`.
4. Volver a MT5, refrescar Navigator (F5), arrastrar el EA al gráfico.

## Configurar

Toda la configuración vive en `Files/config.json`. Editable sin recompilar. Las reglas duras (daily cap 1.5%, max SL 25 pips, R:R ≥ 1:2) están ahí — modificarlas requiere justificación en `03-docs/notes/decisiones.md`.

## Comunicación con el journal web

El EA hace `POST` a `${journal_api.base_url}${journal_api.endpoint_trade}` autenticado con `BOT_API_KEY`. El secret debe coincidir entre `config.json` (lado bot) y `.env` del journal web.

## Estado

🔧 Estructura inicial. Implementación pendiente — empezar por `LiquidityManager.mqh` después del backtest manual de Fase 0.
