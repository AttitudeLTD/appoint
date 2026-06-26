// Dichiarazioni di tipo per gli import di asset statici (es. immagini .png/.svg).
//
// Next.js le fornisce tramite `next-env.d.ts`, che però è auto-generato da
// `next dev`/`next build` e non è versionato. Riferendo qui gli stessi tipi
// (`next/image-types/global`) l'import di immagini (es. il marker-shadow di
// Leaflet in `utils/nav-icons.ts`, usato come `MarkerShadow.src`) è tipizzato
// anche quando si esegue `tsc --noEmit` da solo, senza errori TS2307.
/// <reference types="next/image-types/global" />
