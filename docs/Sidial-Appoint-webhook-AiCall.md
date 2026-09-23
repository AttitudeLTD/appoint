# Appoint ← Sidial — specifica webhook appuntamenti (progetto AiCall)

**Destinatario:** team di sviluppo Sidial (CRM call center)
**Autore:** Attitude Ltd — Appoint
**Data:** 23 settembre 2026
**Versione:** 1.1

Questo documento descrive come il CRM Sidial deve inviare ad Appoint gli
appuntamenti del progetto **AiCall**. In allegato alla mail di accompagnamento
trovate anche:

1. questa specifica tecnica;
2. la **screen recording** del processo di assegnazione agente su Sidial
   (è il momento in cui va fatta la POST, e la fonte di id/nome agente);
3. un **tracciato** estratto dal call center Sidial sul progetto AiCall, per
   contesto sui nomi dei campi.

---

## 1. Cosa deve succedere

Quando un appuntamento AiCall viene **assegnato a un agente** su Sidial
(vedi screen recording), Sidial fa una `POST HTTPS` all’endpoint Appoint
indicato sotto, con un JSON autenticato da un token che vi forniamo noi.

Appoint, per ogni appuntamento ricevuto:

- cerca il punto vendita per **Partita IVA**;
- se esiste, lo esita **"OK - Appuntamento preso"** e lo porta in lavorazione;
- se non esiste, **crea il pin** (geolocalizzando l’indirizzo) già esitato
  con lo stesso esito;
- salva data/ora appuntamento, note, stato Sidial e agente assegnato.

L’agente sul territorio vede il pin già esitato, senza dover fare nulla
sulla mappa.

Si può inviare **un appuntamento per chiamata** (nel momento dell’assegnazione)
oppure un **batch** a fine giornata / fine turno (fino a 100 consigliati,
massimo 200).

---

## 2. Endpoint

```
POST https://appoint.attitudeltd.com/api/webhooks/callcenter
Content-Type: application/json
Authorization: Bearer <TOKEN>
```

- Solo HTTPS, solo POST (altri metodi → `405`).
- In alternativa a `Authorization` è accettato `X-Webhook-Token: <TOKEN>`.
- Il token vi viene comunicato da Attitude su canale separato. Va trattato
  come una password: non in log, repository o email.
- Timeout HTTP del client: **almeno 90 secondi**.

---

## 3. Mapping tracciato Sidial → JSON Appoint

I nomi nel JSON **non** coincidono sempre con le intestazioni del tracciato
estratto dal call center. Usare questa tabella. I nomi della colonna
«Tracciato Sidial» sono quelli del file di estrazione allegato.

| JSON da inviare ad Appoint | Colonna nel tracciato Sidial | Obbl. | Note |
| -------------------------- | ---------------------------- | :---: | ---- |
| `id_esterno` | `id` | no* | Id dell’appuntamento nel vostro CRM. Fortemente consigliato: lo salviamo e lo restituiamo in risposta. |
| `ragione_sociale` | `ragione sociale` | sì | Max 200 caratteri. |
| `partita_iva` | `p.iva` | sì | 11 cifre. Accettiamo anche prefisso `IT` e spazi. **Chiave** con cui riconosciamo il punto vendita. |
| `indirizzo` | `indirizzo` | sì | Via e numero civico (es. `"Via Roma 10"`). |
| `comune` | `comune` | sì | Es. `"Milano"`. |
| `provincia` | `provincia` | no | Sigla a 2 lettere (`"MI"`) o nome per esteso. |
| `telefono` | `telefono` | no | Telefono del titolare / contatto. |
| `note_operatore` | `noteoperatore` | no | Note libere per l’agente, max 2000 caratteri. |
| `data_creazione_esito` | `Data Creazione` | no | Quando l’appuntamento è stato creato / assegnato. Se manca usiamo l’istante di ricezione. |
| `data_appuntamento` | `Data Appuntamento` | sì | Data e ora dell’appuntamento fissato. |
| `stato` | `stato` | sì | Stato dell’appuntamento **nel vostro CRM**, così com’è nel tracciato. Non è lo status del pin Appoint. |

\* `id_esterno` non è obbligatorio, ma senza non riusciamo a riallineare
facilmente un invio con la riga del tracciato. Mandatelo sempre se avete `id`.

### Campi che nel tracciato non ci sono (vanno presi dall’assegnazione)

Questi dati si vedono nel processo di **assegnazione agente** (screen recording).
Non hanno una colonna omonima nel tracciato allegato, ma **vanno comunque
inviati** nella POST.

| JSON Appoint | Obbl. | Fonte |
| ------------ | :---: | ----- |
| `agente_id` | sì | Id dell’agente assegnato **in Sidial** (non l’id Appoint). Accettiamo anche un numero. |
| `agente_nome` | sì | Nome e cognome dell’agente assegnato, come compare su Sidial (max 200 caratteri). |
| `cap` | no | CAP a 5 cifre. Consigliato: rende la geolocalizzazione molto più precisa. |
| `titolare` | no | Nome del titolare / referente da incontrare. |
| `email` | no | Email del titolare, se disponibile. |
| `dry_run` | no | Solo per i test (`true` = valida e geolocalizza **senza scrivere nulla**). |

`agente_id` e `agente_nome` si possono mandare anche come oggetto:

```json
{ "agente": { "id": "42", "nome": "Luca Boschetti" } }
```

---

## 4. Formato date/ore

Preferito **ISO 8601 con fuso orario**: `"2026-09-15T10:30:00+02:00"`.

Sono accettati anche:

- ISO senza fuso (`"2026-09-15T10:30"`, `"2026-09-15 10:30"`) → ora italiana;
- formato italiano `"15/09/2026 10:30"` → ora italiana;
- sola data (`"2026-09-15"`, `"15/09/2026"`) → all’agente mostriamo solo la data.

Se il tracciato ha `Data Creazione` / `Data Appuntamento` in formato italiano,
va bene: le interpretiamo come ora italiana.

---

## 5. Esempio — singolo appuntamento

```json
{
  "id_esterno": "CRM-2026-000123",
  "ragione_sociale": "ROSSI SRL",
  "partita_iva": "01234567890",
  "indirizzo": "Via Roma 10",
  "cap": "20121",
  "comune": "Milano",
  "provincia": "MI",
  "titolare": "Mario Rossi",
  "telefono": "3331234567",
  "agente_id": "42",
  "agente_nome": "Luca Boschetti",
  "stato": "Assegnato",
  "data_creazione_esito": "2026-09-10T10:32:00+02:00",
  "data_appuntamento": "2026-09-15T10:30:00+02:00",
  "note_operatore": "Chiedere di Mario, ingresso dal retro. Interessato a Platino."
}
```

```bash
curl -X POST https://appoint.attitudeltd.com/api/webhooks/callcenter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @appuntamento.json
```

Se l’indirizzo arriva tutto in una riga (`"Via Roma 10, 20121 Milano (MI)"`) e
`comune` manca, proviamo a spezzarlo noi. È più affidabile mandare i campi
separati.

---

## 6. Batch — più appuntamenti in una chiamata

Il body è un **array** degli stessi oggetti:

```json
[
  {
    "id_esterno": "CRM-2026-000123",
    "ragione_sociale": "ROSSI SRL",
    "partita_iva": "01234567890",
    "indirizzo": "Via Roma 10",
    "cap": "20121",
    "comune": "Milano",
    "provincia": "MI",
    "telefono": "3331234567",
    "agente_id": "42",
    "agente_nome": "Luca Boschetti",
    "stato": "Assegnato",
    "data_creazione_esito": "2026-09-10T10:32:00+02:00",
    "data_appuntamento": "2026-09-15T10:30:00+02:00",
    "note_operatore": "Chiedere di Mario."
  },
  {
    "id_esterno": "CRM-2026-000124",
    "ragione_sociale": "BIANCHI SNC",
    "partita_iva": "09876543210",
    "indirizzo": "Corso Italia 5",
    "cap": "16123",
    "comune": "Genova",
    "provincia": "GE",
    "telefono": "3470001111",
    "agente_id": "17",
    "agente_nome": "Anna Verdi",
    "stato": "Assegnato",
    "data_creazione_esito": "2026-09-10T11:05:00+02:00",
    "data_appuntamento": "2026-09-16T09:00:00+02:00",
    "note_operatore": ""
  }
]
```

È accettata anche la forma `{ "appuntamenti": [ ... ] }`, utile per
`dry_run` una volta sola: `{ "dry_run": true, "appuntamenti": [ ... ] }`.

Regole:

- Massimo **200** elementi (oltre: `400`). Consigliato restare entro 100.
- Ogni elemento è validato e registrato da solo: uno sbagliato non blocca gli altri.
- `dry_run` deve valere per **tutto** il batch.
- Se la stessa Partita IVA compare due volte nello stesso array, l’ultimo vince.

---

## 7. Risposte

Tutte le risposte sono JSON con il campo `ok`.

### Singolo — `200 OK`

```json
{
  "ok": true,
  "store_id": 15709,
  "store_created": false,
  "status_changed": true,
  "geocoded": "existing",
  "esito": "ok_appuntamento_preso",
  "outcome": "created",
  "id_esterno": "CRM-2026-000123",
  "warnings": []
}
```

| Campo | Significato |
| ----- | ----------- |
| `store_id` | Id del punto vendita in Appoint. |
| `store_created` | `true` se la P.IVA non esisteva e il pin è stato creato ora. |
| `status_changed` | `true` se il pin è passato da libero a in lavorazione. |
| `geocoded` | `"existing"` pin già posizionato; `"street"` indirizzo trovato; `"comune"` solo centro del comune; `"pending"` posizione calcolata da noi entro poche ore (l’appuntamento è comunque registrato); `"none"` indirizzo non trovato. |
| `outcome` | `"created"` al primo invio per quella P.IVA, `"updated"` ai successivi. |
| `warnings` | Avvisi non bloccanti. |

Con `"dry_run": true` la `200` ha `dry_run: true`, `would_create_store`,
`geocode` e `note_preview`. Non viene scritto nulla.

### Batch — `200`

```json
{
  "ok": true,
  "totale": 3,
  "registrati": 2,
  "falliti": 1,
  "geocodifica_in_sospeso": 0,
  "risultati": [
    { "indice": 0, "ok": true, "store_id": 15709, "store_created": false, "geocoded": "existing", "outcome": "created", "id_esterno": "CRM-2026-000123", "warnings": [] },
    { "indice": 1, "ok": false, "error": "validation_error", "details": ["data_appuntamento: obbligatoria"], "id_esterno": "CRM-2026-000124" },
    { "indice": 2, "ok": true, "store_id": 15810, "store_created": true, "geocoded": "street", "outcome": "created", "id_esterno": "CRM-2026-000125", "warnings": [] }
  ]
}
```

`ok` a livello di batch è `true` solo se **tutti** gli elementi sono andati a
buon fine. Lo status HTTP è comunque `200` se il batch è stato elaborato.
Ogni elemento ha `indice` (da 0, stesso ordine dell’array) e `id_esterno`.

### Errori sull’intera chiamata

| HTTP | `error` | Cosa fare |
| ---: | ------- | --------- |
| 400 | `invalid_json` | Body non è JSON. Correggere, non ritentare uguale. |
| 400 | `validation_error` | Campi mancanti o non validi (`details`), oppure batch vuoto / oltre 200 / `dry_run` incoerente. Correggere, non ritentare uguale. |
| 401 | `unauthorized` | Token assente o errato. |
| 405 | — | Metodo diverso da POST. |
| 500 | `internal_error` | Errore nostro. **Ritentare** con backoff (1, 5, 30 minuti): l’invio è idempotente. |
| 503 | `not_configured` | Endpoint non ancora configurato da noi. Contattare Attitude. |

Nel batch, un elemento sbagliato ha `ok: false` e `error: "validation_error"`
(correggere e rimandare quello) oppure `error: "internal_error"` (ritentare
quello più tardi).

---

## 8. Idempotenza, spostamenti e riassegnazioni

- Il punto vendita è identificato dalla **Partita IVA**: due invii per la stessa
  P.IVA non creano due pin.
- L’appuntamento del call center è **uno per punto vendita**: un secondo invio
  per la stessa P.IVA **aggiorna** data, note, indirizzo, stato e agente
  assegnato (`outcome: "updated"`). Per uno **spostamento** o una
  **riassegnazione** basta rimandare la stessa P.IVA con i campi aggiornati.
- Ritentare una `500` è sicuro.
- Non è previsto un messaggio di **annullamento**: se un appuntamento viene
  cancellato, per ora segnalarlo al referente Attitude.

---

## 9. Test di integrazione (prima della produzione)

1. Inviare l’esempio del §5 con `"dry_run": true` → `200`, `dry_run: true`.
2. Token sbagliato → `401`.
3. Senza `data_appuntamento`, senza `stato` o senza `agente_id` / `agente_nome`
   → `400` con `details`.
4. Stesso esempio senza `dry_run` → `200`, `outcome: "created"`. Concordare
   prima una Partita IVA di prova, così il pin fittizio viene rimosso a fine
   collaudo.
5. Re-inviare cambiando `data_appuntamento`, `agente_id` o `stato` → `200`,
   `outcome: "updated"`.
6. Array di 2–3 appuntamenti (uno volutamente senza `data_appuntamento`) →
   `200` con `risultati` per elemento e `falliti: 1`.

Quando siete pronti per il primo invio reale, avvisate Attitude: verifichiamo
che pin ed esito siano arrivati in mappa.
