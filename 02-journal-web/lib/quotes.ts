export type Quote = {
  text: string;
  author: string;
};

export const QUOTES: Quote[] = [
  { text: "El mercado no premia al ocupado, premia al paciente.", author: "Mark Douglas" },
  { text: "Los mejores trades son los que se ven obvios — pero solo después de la paciencia.", author: "Mark Douglas" },
  { text: "Yo no juego para ganar partidos, juego para ganar siempre.", author: "Cristiano Ronaldo" },
  { text: "El talento sin trabajo es nada. El trabajo sin disciplina es nada.", author: "Cristiano Ronaldo" },
  { text: "El que se rinde no gana. El que gana no se rinde.", author: "Cristiano Ronaldo" },
  { text: "El fútbol no es un partido, es una preparación de toda la semana.", author: "Carlo Ancelotti" },
  { text: "Cuando el equipo entra al campo, ya el trabajo está hecho.", author: "Carlo Ancelotti" },
  { text: "Buy below value, sell above value. Liquidity is the currency of the markets.", author: "ICT" },
  { text: "Los pools de liquidez son la verdad del mercado. Lo demás es ruido.", author: "ICT" },
  { text: "Un trader que entiende killzones no necesita más de tres horas al día.", author: "ICT" },
  { text: "El riesgo no es lo que tomas, es lo que no entiendes.", author: "Paul Tudor Jones" },
  { text: "Don't focus on making money; focus on protecting what you have.", author: "Paul Tudor Jones" },
  { text: "If you can't take a small loss, sooner or later you will take the mother of all losses.", author: "Ed Seykota" },
  { text: "Win or learn. Both are progress.", author: "Ed Seykota" },
  { text: "El mercado castiga a los soberbios y pagando a los humildes.", author: "Linda Raschke" },
  { text: "Plan the trade and trade the plan.", author: "Linda Raschke" },
  { text: "Don't aspire to make a living, aspire to make a difference.", author: "Linda Raschke" },
  { text: "Hala Madrid y nada más.", author: "Real Madrid" },
  { text: "El que no cree en el equipo, no juega en el equipo.", author: "Filosofía RM" },
  { text: "La elegancia es saber quedarse cuando todos quieren entrar.", author: "GIO" },
  { text: "Disciplina sin emoción. Emoción sin impulso.", author: "GIO" },
  { text: "Si esperas el setup, el setup viene. Si lo persigues, te ignora.", author: "GIO" },
  { text: "El dinero es solo el termómetro de tus decisiones pasadas.", author: "GIO" },
  { text: "Cada killzone perdida es una ganada en autocontrol.", author: "GIO" },
  { text: "El mejor trade es a veces no operar.", author: "Jesse Livermore" },
  { text: "It never was my thinking that made the big money. It was my sitting.", author: "Jesse Livermore" },
  { text: "Los grandes movimientos toman tiempo en desarrollarse.", author: "Jesse Livermore" },
  { text: "El mercado puede permanecer irracional más tiempo del que tú puedes permanecer solvente.", author: "John Maynard Keynes" },
  { text: "Cabeza fría, manos quietas.", author: "Bernardo Mora" },
  { text: "El plan se respeta o se rompe. No hay puntos medios.", author: "GIO" },
];

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getQuoteOfDay(date: Date = new Date()): Quote {
  const idx = getDayOfYear(date) % QUOTES.length;
  return QUOTES[idx];
}
