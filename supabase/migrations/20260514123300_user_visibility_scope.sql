-- =============================================================================
-- Migration: user_visibility_scope
-- Data:      2026-05-14
-- =============================================================================
-- Introduce un meccanismo di visibilità per utente, completamente ortogonale
-- al modello `areas` / `user_areas` (che resta dedicato alla sola gerarchia
-- AM ↔ agenti) e retroattivamente non-distruttivo:
--
--   * tutti gli utenti esistenti partono con `visibility_scope = 'all'`
--     → vedono esattamente quello che vedevano prima (nessuna regressione);
--   * i NUOVI utenti creati via `handle_new_user()` partono `'restricted'`
--     → sicurezza per default sui nuovi accessi;
--   * a un utente `'restricted'` si concede visibilità per:
--       - intero cliente   → riga in `public.user_client_access`
--       - singolo negozio  → riga in `public.user_store_access`
--     La visibilità finale è l'UNIONE delle due liste.
--
-- Nessun ruolo bypassa lo scoping: anche un `supervisor` con
-- `visibility_scope = 'restricted'` vede SOLO ciò che gli è esplicitamente
-- concesso. Per dare visibilità totale a un utente basta tenerlo a `'all'`.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) public.users: nuova colonna `visibility_scope`
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists visibility_scope text
    not null
    default 'all';

-- Vincolo di dominio (idempotente: drop+add se già esistente)
alter table public.users
  drop constraint if exists users_visibility_scope_check;
alter table public.users
  add  constraint users_visibility_scope_check
       check (visibility_scope in ('all', 'restricted'));

comment on column public.users.visibility_scope is
  'Determina la visibilità su clients/stores. ''all'' = vede tutto (default per utenti esistenti). ''restricted'' = vede solo ciò che è elencato in user_client_access/user_store_access.';


-- ---------------------------------------------------------------------------
-- 2) public.user_client_access — concessioni a livello CLIENTE
-- ---------------------------------------------------------------------------
create table if not exists public.user_client_access (
  user_id    uuid        not null references public.users(id)   on delete cascade,
  client_id  smallint    not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.user_client_access enable row level security;

comment on table public.user_client_access is
  'Lista bianca utente → cliente: un utente ''restricted'' vede tutti i negozi dei clienti elencati qui.';


-- ---------------------------------------------------------------------------
-- 3) public.user_store_access — concessioni a livello SINGOLO NEGOZIO
-- ---------------------------------------------------------------------------
create table if not exists public.user_store_access (
  user_id    uuid        not null references public.users(id)  on delete cascade,
  store_id   bigint      not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

alter table public.user_store_access enable row level security;

-- Indice utile per le visite "dall'altra parte": dato uno store, chi può vederlo?
create index if not exists idx_user_store_access_store_id
  on public.user_store_access (store_id);

comment on table public.user_store_access is
  'Lista bianca utente → negozio: un utente ''restricted'' vede anche i singoli negozi elencati qui (in aggiunta a quelli derivati da user_client_access).';


-- ---------------------------------------------------------------------------
-- 4) Funzioni helper
--    Centralizzano la logica di scoping. SECURITY DEFINER per poter leggere
--    le tabelle anche se le RLS sono restrittive sul caller. STABLE per
--    permettere l'inlining nel planner.
-- ---------------------------------------------------------------------------

-- Può l'utente p_user_id vedere lo store p_store_id?
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

  -- visibility_scope = 'restricted': controllo le due liste bianche.
  if exists (
    select 1
    from public.user_store_access
    where user_id  = p_user_id
      and store_id = p_store_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.stores              s
    join public.user_client_access  uca
      on uca.client_id = s.client_id
    where s.id        = p_store_id
      and uca.user_id = p_user_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.user_can_see_store(uuid, bigint) from public;
grant  execute on function public.user_can_see_store(uuid, bigint) to authenticated, anon;


-- Può l'utente p_user_id vedere il cliente p_client_id?
-- Vero anche se vede UN solo negozio di quel cliente (così il dropdown
-- e i metadata cliente — nome/logo — sono coerenti con i pin visibili).
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

  if exists (
    select 1
    from public.user_client_access
    where user_id   = p_user_id
      and client_id = p_client_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.user_store_access usa
    join public.stores            s on s.id = usa.store_id
    where usa.user_id = p_user_id
      and s.client_id = p_client_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.user_can_see_client(uuid, smallint) from public;
grant  execute on function public.user_can_see_client(uuid, smallint) to authenticated, anon;


-- ---------------------------------------------------------------------------
-- 5) RLS: policy SELECT su user_client_access / user_store_access
--    Un utente può leggere SOLO le proprie righe (i propri accessi).
--    La gestione (insert/update/delete) resta agli amministratori via service
--    role / SQL editor — nessuna policy applicativa qui per ora.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own client access" on public.user_client_access;
create policy "Users can read own client access"
  on public.user_client_access
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read own store access" on public.user_store_access;
create policy "Users can read own store access"
  on public.user_store_access
  for select
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 6) RLS: aggiornamento policy SELECT su `stores` e `clients`
--    Sostituisce `USING (true)` con la funzione di scoping.
--    Le policy INSERT/UPDATE su `stores` restano invariate (gestione separata).
-- ---------------------------------------------------------------------------

-- stores: SELECT vincolato a user_can_see_store()
drop policy if exists "Enable read access for all users"        on public.stores;
drop policy if exists "Read stores via visibility scope"        on public.stores;
create policy "Read stores via visibility scope"
  on public.stores
  for select
  using (public.user_can_see_store(auth.uid(), id));

-- clients: SELECT vincolato a user_can_see_client()
drop policy if exists "Authenticated users can read clients"    on public.clients;
drop policy if exists "Read clients via visibility scope"       on public.clients;
create policy "Read clients via visibility scope"
  on public.clients
  for select
  to authenticated
  using (public.user_can_see_client(auth.uid(), id));

-- client_workflows: SELECT solo se il cliente è visibile all'utente
drop policy if exists "Authenticated read client_workflows"     on public.client_workflows;
drop policy if exists "Read client_workflows via visibility scope" on public.client_workflows;
create policy "Read client_workflows via visibility scope"
  on public.client_workflows
  for select
  to authenticated
  using (public.user_can_see_client(auth.uid(), client_id));


-- ---------------------------------------------------------------------------
-- 7) RPC `get_stores_within_radius`: applica il filtro di scoping.
--
--    IMPORTANTE: i default dei parametri DEVONO restare uguali alla versione
--    pre-esistente, perché PostgREST risolve gli overload in base ai parametri
--    nominati passati dal client. Il chiamante `components/map.tsx` chiama la
--    RPC senza `p_client_id` quando non c'è filtro cliente attivo → se
--    `p_client_id` non ha `default null`, PostgREST risponde 404 PGRST202
--    ("Could not find the function ... in the schema cache").
--
--    NB: serve un DROP esplicito perché Postgres non permette a
--    CREATE OR REPLACE di modificare i default dei parametri di una funzione
--    già esistente con shape diversa (errore 42P13). Droppiamo TUTTE le
--    versioni con lo stesso nome nello schema `public` per essere robusti a
--    eventuali overload pre-esistenti, poi ricreiamo la versione canonica.
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
    and (p_client_id is null or s.client_id = p_client_id)
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


-- ---------------------------------------------------------------------------
-- 8) `handle_new_user`: i nuovi utenti partono `restricted`.
--    Gli utenti GIÀ ESISTENTI mantengono il default di colonna `'all'`
--    (vedi il punto 1: la colonna è stata aggiunta con default 'all',
--    quindi tutte le righe pre-esistenti sono state popolate a 'all').
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, visibility_scope)
  values (new.id, new.email, 'restricted')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Il trigger su auth.users è già installato: non serve ricrearlo qui.
