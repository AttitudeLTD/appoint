-- =============================================================================
-- Migration: normalize_user_names
-- Date: 2026-06-26
-- Author: egidiosalinaro
--
-- Cosa fa:
--   - Normalizza i nomi/cognomi degli utenti (derivati dall'email aziendale):
--       * rimuove i numeri finali  ("Bonanni108" -> "Bonanni", "Prato06" -> "Prato")
--       * se il nome è solo l'iniziale, aggiunge il punto ("A" -> "A.", "F" -> "F.")
--       * normalizza il maiuscolo/minuscolo (initcap)
--   - Funzione riusabile `public.normalize_person_name(text)`.
--   - Backfill su TUTTI gli utenti esistenti (normalizza i valori presenti; per
--     gli utenti senza nome, deriva nome/cognome dalla local-part dell'email).
--   - Estende `handle_new_user()` così i PROSSIMI utenti ricevono già nome/cognome
--     normalizzati derivati dall'email (le mail attitudeltd seguono lo schema
--     `nome.cognome@` o `n.cognome@`).
--
-- Idempotente: `create or replace`, e l'update è ri-eseguibile (la normalizzazione
--   di un valore già normalizzato è stabile: "Bonanni" -> "Bonanni").
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Funzione di normalizzazione di un "pezzo" di nome (nome o cognome).
--    NB: rimuove SOLO i numeri in coda (gli identificativi tipo "108", "06");
--    eventuali parole multiple (es. "de santis") vengono gestite da initcap.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_person_name(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  if raw is null then
    return null;
  end if;
  -- togli numeri finali ed eventuali spazi
  v := btrim(regexp_replace(raw, '[0-9]+$', ''));
  if v = '' then
    return null;
  end if;
  -- solo iniziale -> aggiungi il punto
  if length(v) = 1 then
    return upper(v) || '.';
  end if;
  -- altrimenti title-case (Mario, Bonanni, De Santis)
  return initcap(v);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Backfill utenti esistenti.
-- ---------------------------------------------------------------------------

-- 2a) Utenti con nome/cognome già valorizzati: normalizza i valori presenti.
update public.users
set name    = public.normalize_person_name(name),
    surname = public.normalize_person_name(surname)
where (name is not null and name <> '')
   or (surname is not null and surname <> '');

-- 2b) Utenti SENZA nome: deriva da email (local-part), poi normalizza.
--     name    = parte prima del primo punto
--     surname = resto dopo il primo punto, con i punti rimanenti -> spazi
update public.users u
set name = public.normalize_person_name(
      split_part(split_part(u.email, '@', 1), '.', 1)
    ),
    surname = public.normalize_person_name(
      nullif(
        replace(
          substr(
            split_part(u.email, '@', 1),
            nullif(position('.' in split_part(u.email, '@', 1)), 0) + 1
          ),
          '.', ' '
        ),
        ''
      )
    )
where (u.name is null or u.name = '')
  and u.email is not null;

-- ---------------------------------------------------------------------------
-- 3) Nuovi utenti: handle_new_user deriva e normalizza nome/cognome dall'email.
--    Mantiene il comportamento esistente (visibility_scope + auto-grant clienti).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local   text := split_part(new.email, '@', 1);
  v_name    text;
  v_surname text;
begin
  v_name := public.normalize_person_name(split_part(v_local, '.', 1));
  v_surname := public.normalize_person_name(
    nullif(
      replace(
        substr(v_local, nullif(position('.' in v_local), 0) + 1),
        '.', ' '
      ),
      ''
    )
  );

  insert into public.users (id, email, name, surname, visibility_scope)
  values (new.id, new.email, v_name, v_surname, 'restricted')
  on conflict (id) do nothing;

  insert into public.user_client_access (user_id, client_id)
  select new.id, c.id from public.clients c
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

commit;
