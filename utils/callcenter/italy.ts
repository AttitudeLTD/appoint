/**
 * Province italiane: sigla → { nome, regione }.
 *
 * Serve al webhook del call center per normalizzare `provincia` (accetta sia la
 * sigla "MI" sia il nome "Milano") e per derivare `stores.regione` con la stessa
 * grafia già usata dai lead AiCall importati via seed ("Emilia Romagna" senza
 * trattino, "Trentino-Alto Adige/Südtirol").
 */
export const PROVINCE: Record<string, { nome: string; regione: string }> = {
  AG: { nome: 'Agrigento', regione: 'Sicilia' },
  AL: { nome: 'Alessandria', regione: 'Piemonte' },
  AN: { nome: 'Ancona', regione: 'Marche' },
  AO: { nome: 'Aosta', regione: "Valle d'Aosta" },
  AP: { nome: 'Ascoli Piceno', regione: 'Marche' },
  AQ: { nome: "L'Aquila", regione: 'Abruzzo' },
  AR: { nome: 'Arezzo', regione: 'Toscana' },
  AT: { nome: 'Asti', regione: 'Piemonte' },
  AV: { nome: 'Avellino', regione: 'Campania' },
  BA: { nome: 'Bari', regione: 'Puglia' },
  BG: { nome: 'Bergamo', regione: 'Lombardia' },
  BI: { nome: 'Biella', regione: 'Piemonte' },
  BL: { nome: 'Belluno', regione: 'Veneto' },
  BN: { nome: 'Benevento', regione: 'Campania' },
  BO: { nome: 'Bologna', regione: 'Emilia Romagna' },
  BR: { nome: 'Brindisi', regione: 'Puglia' },
  BS: { nome: 'Brescia', regione: 'Lombardia' },
  BT: { nome: 'Barletta-Andria-Trani', regione: 'Puglia' },
  BZ: { nome: 'Bolzano', regione: 'Trentino-Alto Adige/Südtirol' },
  CA: { nome: 'Cagliari', regione: 'Sardegna' },
  CB: { nome: 'Campobasso', regione: 'Molise' },
  CE: { nome: 'Caserta', regione: 'Campania' },
  CH: { nome: 'Chieti', regione: 'Abruzzo' },
  CL: { nome: 'Caltanissetta', regione: 'Sicilia' },
  CN: { nome: 'Cuneo', regione: 'Piemonte' },
  CO: { nome: 'Como', regione: 'Lombardia' },
  CR: { nome: 'Cremona', regione: 'Lombardia' },
  CS: { nome: 'Cosenza', regione: 'Calabria' },
  CT: { nome: 'Catania', regione: 'Sicilia' },
  CZ: { nome: 'Catanzaro', regione: 'Calabria' },
  EN: { nome: 'Enna', regione: 'Sicilia' },
  FC: { nome: 'Forlì-Cesena', regione: 'Emilia Romagna' },
  FE: { nome: 'Ferrara', regione: 'Emilia Romagna' },
  FG: { nome: 'Foggia', regione: 'Puglia' },
  FI: { nome: 'Firenze', regione: 'Toscana' },
  FM: { nome: 'Fermo', regione: 'Marche' },
  FR: { nome: 'Frosinone', regione: 'Lazio' },
  GE: { nome: 'Genova', regione: 'Liguria' },
  GO: { nome: 'Gorizia', regione: 'Friuli-Venezia Giulia' },
  GR: { nome: 'Grosseto', regione: 'Toscana' },
  IM: { nome: 'Imperia', regione: 'Liguria' },
  IS: { nome: 'Isernia', regione: 'Molise' },
  KR: { nome: 'Crotone', regione: 'Calabria' },
  LC: { nome: 'Lecco', regione: 'Lombardia' },
  LE: { nome: 'Lecce', regione: 'Puglia' },
  LI: { nome: 'Livorno', regione: 'Toscana' },
  LO: { nome: 'Lodi', regione: 'Lombardia' },
  LT: { nome: 'Latina', regione: 'Lazio' },
  LU: { nome: 'Lucca', regione: 'Toscana' },
  MB: { nome: 'Monza e Brianza', regione: 'Lombardia' },
  MC: { nome: 'Macerata', regione: 'Marche' },
  ME: { nome: 'Messina', regione: 'Sicilia' },
  MI: { nome: 'Milano', regione: 'Lombardia' },
  MN: { nome: 'Mantova', regione: 'Lombardia' },
  MO: { nome: 'Modena', regione: 'Emilia Romagna' },
  MS: { nome: 'Massa-Carrara', regione: 'Toscana' },
  MT: { nome: 'Matera', regione: 'Basilicata' },
  NA: { nome: 'Napoli', regione: 'Campania' },
  NO: { nome: 'Novara', regione: 'Piemonte' },
  NU: { nome: 'Nuoro', regione: 'Sardegna' },
  OR: { nome: 'Oristano', regione: 'Sardegna' },
  PA: { nome: 'Palermo', regione: 'Sicilia' },
  PC: { nome: 'Piacenza', regione: 'Emilia Romagna' },
  PD: { nome: 'Padova', regione: 'Veneto' },
  PE: { nome: 'Pescara', regione: 'Abruzzo' },
  PG: { nome: 'Perugia', regione: 'Umbria' },
  PI: { nome: 'Pisa', regione: 'Toscana' },
  PN: { nome: 'Pordenone', regione: 'Friuli-Venezia Giulia' },
  PO: { nome: 'Prato', regione: 'Toscana' },
  PR: { nome: 'Parma', regione: 'Emilia Romagna' },
  PT: { nome: 'Pistoia', regione: 'Toscana' },
  PU: { nome: 'Pesaro e Urbino', regione: 'Marche' },
  PV: { nome: 'Pavia', regione: 'Lombardia' },
  PZ: { nome: 'Potenza', regione: 'Basilicata' },
  RA: { nome: 'Ravenna', regione: 'Emilia Romagna' },
  RC: { nome: 'Reggio Calabria', regione: 'Calabria' },
  RE: { nome: 'Reggio Emilia', regione: 'Emilia Romagna' },
  RG: { nome: 'Ragusa', regione: 'Sicilia' },
  RI: { nome: 'Rieti', regione: 'Lazio' },
  RM: { nome: 'Roma', regione: 'Lazio' },
  RN: { nome: 'Rimini', regione: 'Emilia Romagna' },
  RO: { nome: 'Rovigo', regione: 'Veneto' },
  SA: { nome: 'Salerno', regione: 'Campania' },
  SI: { nome: 'Siena', regione: 'Toscana' },
  SO: { nome: 'Sondrio', regione: 'Lombardia' },
  SP: { nome: 'La Spezia', regione: 'Liguria' },
  SR: { nome: 'Siracusa', regione: 'Sicilia' },
  SS: { nome: 'Sassari', regione: 'Sardegna' },
  SU: { nome: 'Sud Sardegna', regione: 'Sardegna' },
  SV: { nome: 'Savona', regione: 'Liguria' },
  TA: { nome: 'Taranto', regione: 'Puglia' },
  TE: { nome: 'Teramo', regione: 'Abruzzo' },
  TN: { nome: 'Trento', regione: 'Trentino-Alto Adige/Südtirol' },
  TO: { nome: 'Torino', regione: 'Piemonte' },
  TP: { nome: 'Trapani', regione: 'Sicilia' },
  TR: { nome: 'Terni', regione: 'Umbria' },
  TS: { nome: 'Trieste', regione: 'Friuli-Venezia Giulia' },
  TV: { nome: 'Treviso', regione: 'Veneto' },
  UD: { nome: 'Udine', regione: 'Friuli-Venezia Giulia' },
  VA: { nome: 'Varese', regione: 'Lombardia' },
  VB: { nome: 'Verbano-Cusio-Ossola', regione: 'Piemonte' },
  VC: { nome: 'Vercelli', regione: 'Piemonte' },
  VE: { nome: 'Venezia', regione: 'Veneto' },
  VI: { nome: 'Vicenza', regione: 'Veneto' },
  VR: { nome: 'Verona', regione: 'Veneto' },
  VT: { nome: 'Viterbo', regione: 'Lazio' },
  VV: { nome: 'Vibo Valentia', regione: 'Calabria' },
};

// Sigle storiche ancora in circolazione nei CRM (province sarde soppresse nel 2016
// e vecchia sigla di Forlì).
const ALIAS: Record<string, string> = { CI: 'SU', VS: 'SU', OG: 'NU', OT: 'SS', FO: 'FC' };

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();

const CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(PROVINCE).map(([code, p]) => [fold(p.nome), code])
);
// Nomi alternativi comuni.
Object.assign(CODE_BY_NAME, {
  [fold('Monza')]: 'MB',
  [fold('Monza Brianza')]: 'MB',
  [fold('Forlì')]: 'FC',
  [fold('Forli Cesena')]: 'FC',
  [fold('Pesaro')]: 'PU',
  [fold('Massa')]: 'MS',
  [fold('Carbonia Iglesias')]: 'SU',
  [fold('Reggio di Calabria')]: 'RC',
  [fold("Reggio nell'Emilia")]: 'RE',
  [fold('Bolzano Bozen')]: 'BZ',
  [fold('Verbania')]: 'VB',
  [fold('Aosta Aoste')]: 'AO',
});

/**
 * Normalizza la provincia in sigla a 2 lettere maiuscole. Accetta "MI", "mi",
 * "(MI)", "Milano", "MILANO". Ritorna null se non riconosciuta.
 */
export function normalizeProvincia(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[()\s.]/g, '').trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2) {
    const code = ALIAS[up] ?? up;
    return code in PROVINCE ? code : null;
  }
  return CODE_BY_NAME[fold(s)] ?? null;
}

export function regioneByProvincia(code: string | null | undefined): string | null {
  if (!code) return null;
  return PROVINCE[code]?.regione ?? null;
}
