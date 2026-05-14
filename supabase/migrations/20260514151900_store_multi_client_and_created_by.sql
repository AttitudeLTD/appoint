-- =============================================================================
-- Migration: store_multi_client_and_created_by
-- Data:      2026-05-14
-- =============================================================================
-- Obiettivi:
--   1. Permettere ad UNO `stores` di essere associato a PIÙ `clients`
--      (un punto vendita può essere "per Amex + Scalapay + Maintenance Amex").
--   2. Tracciare l'utente che ha caricato un punto vendita via app
--      (`stores.created_by`), mantenendo `NULL` per le righe importate in bulk
--      dal DB (la grande maggioranza dei record storici).
--
-- Strategia:
--   * Nuova tabella di join `public.store_clients (store_id, client_id, …)`.
--   * `stores.client_id` resta "cliente primario" della riga (regge UI legacy:
--     filtro mappa pre-esistente, workflow del popup, `store_visit_outcomes`).
--   * Tutti i clienti effettivamente associati (incluso il primario) finiscono
--     anche in `store_clients`: questa tabella diventa la fonte di verità
--     per visibilità multi-cliente e filtri della mappa.
--   * Backfill automatico: per ogni store esistente viene inserita una riga
--     `(store_id, stores.client_id, is_primary = true)`.
--   * `user_can_see_store` / `user_can_see_client` / `get_stores_within_radius`
--     aggiornati per considerare ANCHE i client linkati via `store_clients`
--     (UNION con il vecchio `stores.client_id`, per robustezza).
--
-- Idempotenza:
--   * `create table if not exists`, `add column if not exists`,
--     `insert … on conflict do nothing`, `drop function if exists` prima dei
--     ricreate → rieseguire la migration è sicuro.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) stores.created_by: utente applicativo che ha caricato il punto vendita.
--    NULL per le righe pre-esistenti / import bulk.
-- ---------------------------------------------------------------------------
alter table public.stores
  add column if not exists created_by uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_created_by_fkey'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_created_by_fkey
      foreign key (created_by)
      references public.users(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_stores_created_by
  on public.stores (created_by)
  where created_by is not null;


-- ---------------------------------------------------------------------------
-- 2) Tabella di join `store_clients` (N:N stores ↔ clients).
--    PK composta (store_id, client_id) → impedisce duplicati.
-- ---------------------------------------------------------------------------
create table if not exists public.store_clients (
  store_id   bigint      not null
    references public.stores(id)  on delete cascade,
  client_id  smallint    not null
    references public.clients(id) on delete cascade,
  is_primary boolean     not null default false,
  created_at timestamptz not null default now(),
  created_by uuid        null
    references public.users(id) on delete set null,
  primary key (store_id, client_id)
);

create index if not exists idx_store_clients_client_id
  on public.store_clients (client_id);

create index if not exists idx_store_clients_store_id
  on public.store_clients (store_id);

-- Al massimo un cliente primario per store.
create unique index if not exists uq_store_clients_primary_per_store
  on public.store_clients (store_id)
  where is_primary;


-- ---------------------------------------------------------------------------
-- 3) Backfill: ogni store esistente → riga (store_id, stores.client_id)
--    marcata come primaria. Idempotente grazie alla PK composta.
-- ---------------------------------------------------------------------------
insert into public.store_clients (store_id, client_id, is_primary, created_by)
select s.id, s.client_id, true, null
from public.stores s
where s.client_id is not null
on conflict (store_id, client_id) do nothing;


-- ---------------------------------------------------------------------------
-- 4) RLS su `store_clients`.
--    * SELECT: solo se l'utente può vedere lo store (riusiamo
--      `user_can_see_store`, che dopo lo step 5 considera anche store_clients).
--    * INSERT: utenti `authenticated`, ma SOLO su store che vedono.
--    * DELETE: idem (per consentire al creatore di togliere un'associazione
--      sbagliata; in pratica la UI non lo espone ancora).
-- ---------------------------------------------------------------------------
alter table public.store_clients enable row level security;

drop policy if exists "Read store_clients via store visibility"   on public.store_clients;
drop policy if exists "Insert store_clients via store visibility" on public.store_clients;
drop policy if exists "Delete store_clients via store visibility" on public.store_clients;

create policy "Read store_clients via store visibility"
  on public.store_clients
  for select
  to authenticated
  using (public.user_can_see_store(auth.uid(), store_id));

create policy "Insert store_clients via store visibility"
  on public.store_clients
  for insert
  to authenticated
  with check (public.user_can_see_store(auth.uid(), store_id));

create policy "Delete store_clients via store visibility"
  on public.store_clients
  for delete
  to authenticated
  using (public.user_can_see_store(auth.uid(), store_id));


-- ---------------------------------------------------------------------------
-- 5) `user_can_see_store`: oltre alle whitelist esistenti
--    (user_store_access, user_client_access ↔ stores.client_id) considera
--    ANCHE i clienti associati allo store via `store_clients`.
--
--    SECURITY DEFINER mantenuto, search_path forzato a `public`.
-- ---------------------------------------------------------------------------
create or replace function public.user_can_see_store(
  p_user_id  uuid,
  p_store_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
begin
  if p_user_id is null or p_store_id is null then
    return false;
  end if;

  select visibility_scope into v_scope
  from public.users
  where id = p_user_id;

  if v_scope is null then
    return false;
  end if;

  if v_scope = 'all' then
    return true;
  end if;

  -- whitelist diretta sullo store
  if exists (
    select 1
    from public.user_store_access
    where user_id  = p_user_id
      and store_id = p_store_id
  ) then
    return true;
  end if;

  -- whitelist cliente ↔ cliente primario dello store (legacy)
  if exists (
    select 1
    from public.stores             s
    join public.user_client_access uca
      on uca.client_id = s.client_id
    where s.id        = p_store_id
      and uca.user_id = p_user_id
  ) then
    return true;
  end if;

  -- whitelist cliente ↔ uno qualsiasi dei clienti associati via store_clients
  if exists (
    select 1
    from public.store_clients      sc
    join public.user_client_access uca
      on uca.client_id = sc.client_id
    where sc.store_id = p_store_id
      and uca.user_id = p_user_id
  ) then
    return true;
  end if;

  return false;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) `user_can_see_client`: in coerenza con quanto sopra, considera "visibile"
--    anche un cliente che è associato (via `store_clients`) ad uno store
--    che l'utente può vedere tramite `user_store_access`.
-- ---------------------------------------------------------------------------
create or replace function public.user_can_see_client(
  p_user_id   uuid,
  p_client_id smallint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
begin
  if p_user_id is null or p_client_id is null then
    return false;
  end if;

  select visibility_scope into v_scope
  from public.users
  where id = p_user_id;

  if v_scope is null then
    return false;
  end if;

  if v_scope = 'all' then
    return true;
  end if;

  -- grant esplicito
  if exists (
    select 1
    from public.user_client_access
    where user_id   = p_user_id
      and client_id = p_client_id
  ) then
    return true;
  end if;

  -- grant via store (cliente primario)
  if exists (
    select 1
    from public.user_store_access usa
    join public.stores            s on s.id = usa.store_id
    where usa.user_id = p_user_id
      and s.client_id = p_client_id
  ) then
    return true;
  end if;

  -- grant via store (cliente associato in store_clients)
  if exists (
    select 1
    from public.user_store_access usa
    join public.store_clients     sc on sc.store_id = usa.store_id
    where usa.user_id  = p_user_id
      and sc.client_id = p_client_id
  ) then
    return true;
  end if;

  return false;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) `get_stores_within_radius`: il filtro per cliente ora matcha sia il
--    cliente primario (`stores.client_id`) sia uno qualsiasi dei clienti
--    associati via `store_clients`.
--
--    IMPORTANTE: i default dei parametri devono restare invariati
--    (vedi nota nella migration 20260514123300_user_visibility_scope.sql).
--    Si droppano tutte le versioni esistenti prima di ricreare, perché
--    Postgres rifiuta `create or replace function` con shape diversa.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select format('drop function if exists %s(%s);',
                  p.oid::regproc,
                  pg_get_function_identity_arguments(p.oid)) as cmd
    from pg_proc p
    where p.proname     = 'get_stores_within_radius'
      and p.pronamespace = 'public'::regnamespace
  loop
    execute r.cmd;
  end loop;
end
$$;

create or replace function public.get_stores_within_radius(
  lat         double precision,
  lng         double precision,
  radius      double precision,
  p_client_id bigint  default null,
  p_limit     integer default 500
)
returns table (
  id          bigint,
  name        text,
  address     text,
  location    text,
  phone       text,
  category    text,
  email       text,
  owner_name  text,
  status      text,
  tier        text,
  fatturato   text,
  client_id   smallint,
  client_name text,
  client_logo text
)
language plpgsql
stable
as $$
begin
  return query
  select
    s.id, s.name, s.address,
    ST_AsText(s.location) as location,
    s.phone, s.category, s.email, s.owner_name,
    s.status, s.tier, s.fatturato,
    s.client_id, c.name as client_name, c.logo as client_logo
  from public.stores s
  left join public.clients c on c.id = s.client_id
  where s.location is not null
    and (
      p_client_id is null
      or s.client_id = p_client_id
      or exists (
        select 1
        from public.store_clients sc
        where sc.store_id  = s.id
          and sc.client_id = p_client_id
      )
    )
    and public.user_can_see_store(auth.uid(), s.id)
    and ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius
    )
  order by s.location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  limit p_limit;
end;
$$;
