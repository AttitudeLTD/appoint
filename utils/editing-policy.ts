/**
 * Chi può riaprire un punto vendita già esitato.
 *
 * Configurato per cliente su `clients.editing_policy`:
 *
 *   'exclusive' (default) — il primo agente che esita mantiene il controllo.
 *                           Per gli altri il pin risulta "trattativa in corso"
 *                           e non espone il pannello "Gestisci".
 *   'shared'              — qualunque agente autorizzato può riaprire il punto
 *                           vendita e registrare un proprio esito.
 *
 * Non è un permesso: l'esclusività non è mai stata imposta dal database (la
 * policy UPDATE di `stores` è `user_can_see_store`, senza controllo di
 * proprietà). È una regola di INTERFACCIA, e vive tutta qui dentro — mappa e
 * Dashboard chiamano `isLockedForMe`, nessuna delle due contiene condizioni
 * legate a un cliente specifico.
 */

export type EditingPolicy = 'exclusive' | 'shared';

/** Valore usato quando il cliente non dichiara nulla: comportamento storico. */
export const DEFAULT_EDITING_POLICY: EditingPolicy = 'exclusive';

/**
 * Il punto vendita è bloccato per l'utente corrente?
 *
 * @param policy      `clients.editing_policy` del cliente PRIMARIO dello store.
 *                    Qualsiasi valore diverso da 'shared' (incluso `undefined`,
 *                    un cliente non ancora configurato, o un valore futuro non
 *                    ancora gestito dal frontend) ricade sul comportamento
 *                    storico: fail-safe verso 'exclusive'.
 * @param modifierId  autore dell'ultima modifica NON dell'utente corrente
 *                    (`null`/`undefined` se il pin non è stato lavorato da altri).
 * @param myId        id dell'utente corrente.
 */
export function isLockedForMe({
  policy,
  modifierId,
  myId,
}: {
  policy?: string | null;
  modifierId?: string | null;
  myId: string;
}): boolean {
  if (policy === 'shared') return false;
  return modifierId != null && modifierId !== myId;
}
