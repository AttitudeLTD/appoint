/**
 * Configurazione store di test: range di id e utente abilitato.
 * - Gli store con id in [TEST_STORE_ID_MIN, TEST_STORE_ID_MAX] sono considerati "di test".
 * - L'utente TEST_USER_ID vede solo questi store in mappa/prospect; tutti gli altri utenti non li vedono.
 */

export const TEST_STORE_ID_MIN = 13565;
export const TEST_STORE_ID_MAX = 13814;
export const TEST_USER_ID = '81c0a417-836b-4ecd-9e8a-ca9bfcd37ac7';

function isTestStoreId(storeId: number): boolean {
  return storeId >= TEST_STORE_ID_MIN && storeId <= TEST_STORE_ID_MAX;
}

/**
 * Filtra gli store in base all'utente corrente:
 * - Se userId === TEST_USER_ID: restituisce solo store con id in [TEST_STORE_ID_MIN, TEST_STORE_ID_MAX].
 * - Altrimenti: restituisce solo store con id fuori da quel range (nessun utente vede i test in produzione).
 */
export function filterStoresForUser<T extends { id: number }>(
  stores: T[],
  userId: string
): T[] {
  if (stores.length === 0) return stores;
  const isTestUser = userId === TEST_USER_ID;
  return stores.filter((store) => {
    const inTestRange = isTestStoreId(store.id);
    return isTestUser ? inTestRange : !inTestRange;
  });
}
