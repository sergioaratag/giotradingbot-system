const STATS = [
  { label: "Trades hoy" },
  { label: "P&L Hoy" },
  { label: "Win Rate" },
  { label: "Drawdown" },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight-50">Dashboard</h1>
      <p className="mt-1 text-sm text-midnight-400">
        Las métricas aparecerán aquí cuando empiecen a registrarse trades.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="bg-midnight-900 border border-midnight-800 rounded-lg p-6"
          >
            <div className="text-sm text-midnight-400">{s.label}</div>
            <div className="mt-2 text-2xl font-mono text-midnight-50">—</div>
          </div>
        ))}
      </div>
    </div>
  );
}
