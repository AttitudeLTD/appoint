# Webhook appuntamenti — integrazione CRM call center → Appoint

Specifica per il partner che sviluppa il CRM del call center (progetto **AiCall**).

Ogni volta che un operatore **chiude un appuntamento**, il CRM invia una richiesta
HTTPS POST al nostro endpoint. Appoint registra sul punto vendita l'esito
**"OK - Appuntamento preso"**, con data/ora dell'appuntamento e note
dell'operatore, così l'agente sul territorio lo vede subito in mappa. Se la
Partita IVA non è ancora presente in Appoint, il punto vendita viene creato e
posizionato in mappa geocodificando l'indirizzo.

---

## 1. Endpoint

```
POST https://<dominio-appoint>/api/webhooks/callcenter
Content-Type: application/json
Authorization: Bearer <TOKEN>
```

- `<dominio-appoint>` e `<TOKEN>` vengono comunicati da Attitude su canale
  separato. Il token va custodito come una password: non deve finire in log,
  repository o email.
- In alternativa all'header `Authorization` è accettato `X-Webhook-Token: <TOKEN>`.
- **Una richiesta = un appuntamento.** Non sono accettati array.
- Solo HTTPS. Metodi diversi da POST ricevono `405`.

## 2. Body JSON

| Campo                  | Tipo     | Obbl. | Descrizione                                                                                                                         |
| ---------------------- | -------- | :---: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id_esterno`           | string   |  no*  | Id univoco dell'appuntamento nel CRM. Non obbligatorio ma **fortemente consigliato**: lo salviamo e lo restituiamo nella risposta.     |
| `ragione_sociale`      | string   |  sì   | Ragione sociale dell'azienda (max 200 caratteri).                                                                                    |
| `partita_iva`          | string   |  sì   | **11 cifre**. Accettati anche prefisso `IT` e spazi, che vengono rimossi. È la chiave con cui il punto vendita viene riconosciuto.    |
| `indirizzo`            | string   |  sì   | Via e numero civico dell'appuntamento (es. `"Via Roma 10"`).                                                                        |
| `cap`                  | string   |  no   | CAP a 5 cifre. Consigliato: rende la geolocalizzazione molto più precisa.                                                            |
| `comune`               | string   |  sì   | Comune (es. `"Milano"`).                                                                                                             |
| `provincia`            | string   |  no   | Sigla a 2 lettere (es. `"MI"`); accettato anche il nome per esteso.                                                                  |
| `titolare`             | string   |  no   | Nome del titolare / referente da incontrare.                                                                                         |
| `telefono`             | string   |  no   | Telefono del titolare.                                                                                                               |
| `email`                | string   |  no   | Email del titolare, se disponibile.                                                                                                  |
| `data_creazione_esito` | datetime |  no   | Quando l'operatore ha chiuso l'appuntamento. Se assente usiamo l'istante di ricezione.                                              |
| `data_appuntamento`    | datetime |  sì   | Data e ora dell'appuntamento fissato.                                                                                                |
| `note_operatore`       | string   |  no   | Note libere dell'operatore per l'agente (max 2000 caratteri).                                                                        |
| `dry_run`              | boolean  |  no   | `true` → la richiesta viene validata e l'indirizzo geocodificato, **ma non viene scritto nulla**. Utile per i test di integrazione. |

\* Se `indirizzo` arriva "tutto in una riga" (es. `"Via Roma 10, 20121 Milano (MI)"`)
e `comune` manca, proviamo a separare i pezzi noi; è però preferibile mandare i
campi separati.

### Formato date/ore

Preferito **ISO 8601 con fuso orario**: `"2026-09-15T10:30:00+02:00"`.
Sono accettati anche:

- ISO senza fuso (`"2026-09-15T10:30"`, `"2026-09-15 10:30"`) → interpretato come **ora italiana**;
- formato italiano `"15/09/2026 10:30"` → ora italiana;
- sola data (`"2026-09-15"`, `"15/09/2026"`) → all'agente viene mostrata solo la data, senza orario.

### Esempio

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
  "data_creazione_esito": "2026-09-10T10:32:00+02:00",
  "data_appuntamento": "2026-09-15T10:30:00+02:00",
  "note_operatore": "Chiedere di Mario, ingresso dal retro. Interessato a Platino."
}
```

```bash
curl -X POST https://<dominio-appoint>/api/webhooks/callcenter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @appuntamento.json
```

## 3. Risposte

Tutte le risposte sono JSON con il campo `ok`.

### `200 OK` — appuntamento registrato

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

| Campo            | Significato                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store_id`       | Id del punto vendita in Appoint.                                                                                                                      |
| `store_created`  | `true` se la Partita IVA non esisteva e il punto vendita è stato creato ora.                                                                          |
| `status_changed` | `true` se il pin è passato da "libero" a "in lavorazione".                                                                                            |
| `geocoded`       | `"existing"` (il pin aveva già una posizione), `"street"` (indirizzo trovato), `"comune"` (solo centro del comune), `"none"` (indirizzo non trovato). |
| `outcome`        | `"created"` al primo invio per quella Partita IVA, `"updated"` ai successivi (vedi §4).                                                               |
| `warnings`       | Avvisi non bloccanti (campo ignorato perché non valido, indirizzo approssimato, …). Utili in fase di test.                                            |

Con `dry_run: true` la risposta `200` ha invece `dry_run: true`, `would_create_store`,
`geocode` (coordinate trovate) e `note_preview` (il testo che vedrebbe l'agente).

### Errori

| HTTP  | `error`            | Quando                                                                       | Cosa fare                                                               |
| ----- | ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `400` | `invalid_json`     | Body non è JSON valido.                                                      | Correggere la richiesta. Non ritentare uguale.                          |
| `400` | `validation_error` | Campi mancanti o non validi: la lista è in `details` (es. `"partita_iva: deve essere composta da 11 cifre"`). | Correggere il dato. Non ritentare uguale.   |
| `401` | `unauthorized`     | Token assente o errato.                                                      | Verificare l'header `Authorization`.                                     |
| `405` | —                  | Metodo diverso da POST.                                                      |                                                                         |
| `500` | `internal_error`   | Errore lato nostro.                                                          | **Ritentare** con backoff (es. 1, 5, 30 minuti): l'invio è idempotente. |
| `503` | `not_configured`   | Endpoint non ancora configurato lato nostro.                                 | Contattare Attitude.                                                    |

## 4. Idempotenza e re-invii

- Il punto vendita è identificato dalla **Partita IVA**: due invii per la stessa
  P.IVA non creano due pin.
- L'appuntamento del call center è **uno per punto vendita**: un secondo invio per
  la stessa P.IVA **aggiorna** data, note e indirizzo dell'appuntamento
  (`outcome: "updated"`). Serve quindi anche per comunicare uno **spostamento**
  dell'appuntamento: basta rimandare la stessa P.IVA con la nuova `data_appuntamento`.
- Ritentare una richiesta andata in `500` è sicuro.
- Non è previsto un messaggio di **annullamento**: se l'appuntamento viene
  cancellato, comunicarlo per ora al referente Attitude.

## 5. Cosa vede l'agente

Sul pin del punto vendita, sezione "Storico esiti":

```
Agente: Call Center AiCall
Esito:  OK - Appuntamento preso
Note:   Appuntamento: 15/09/2026 ore 10:30 — Titolare: Mario Rossi — Note operatore: Chiedere di Mario, ingresso dal retro. Interessato a Platino.
```

Se l'indirizzo dell'appuntamento è diverso da quello già registrato sul punto
vendita, nella nota compare anche `Indirizzo appuntamento: …` (il pin non viene
spostato). I dati già presenti sul punto vendita (telefono, referente, …) non
vengono sovrascritti: vengono completati solo se vuoti.

## 6. Test di integrazione consigliato

1. Inviare l'esempio del §2 con `"dry_run": true` → attendersi `200` con
   `dry_run: true` e `geocode.precision = "street"`.
2. Inviare con un token sbagliato → `401`.
3. Inviare senza `data_appuntamento` → `400` con `details`.
4. Inviare l'esempio senza `dry_run` → `200`, `outcome: "created"`.
5. Re-inviare cambiando `data_appuntamento` → `200`, `outcome: "updated"`.

Per i test concordare con Attitude una Partita IVA di prova, così il punto
vendita fittizio può essere rimosso a fine collaudo.
