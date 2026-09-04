// PostgREST (e quindi Supabase) tronca OGNI risposta a max 1000 righe
// (impostazione `max-rows`), anche se la query chiede `.limit(2000)`: le righe
// oltre la millesima vengono silenziosamente scartate. Per le liste che
// possono superare la soglia (es. export negozi di un cliente, storico su
// periodi lunghi) bisogna paginare con `.range()` e concatenare le pagine.
//
// Uso:
//   const { data, error } = await fetchAllRows((from, to) =>
//     supabase.from('stores').select('id, name').eq('client_id', 5).order('id').range(from, to)
//   );
//
// La query deve avere un ORDER BY stabile (es. per id) altrimenti le pagine
// possono sovrapporsi o saltare righe.

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

// Spezza una lista (tipicamente di id per `.in()`) in blocchi: tiene corta la
// querystring e, con blocchi ≤ 1000, ogni risposta resta sotto max-rows
// quando c'è al più una riga per id.
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
