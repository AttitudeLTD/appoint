-- =============================================================================
-- Appoint — Baseline snapshot dello schema `public` (Supabase)
-- =============================================================================
-- Generato manualmente il 2026-05-14 a partire dallo stato reale del DB.
--
-- Scopo: rappresentare lo stato attuale dello schema `public` in modo
-- ricreabile. NON eseguire su un DB già popolato: serve solo come riferimento
-- (e per ricreare l'ambiente da zero, es. in un progetto Supabase locale).
--
-- Per modifiche incrementali allo schema usare le file in `supabase/migrations/`.
-- Vedi anche `supabase/SCHEMA.md` per la documentazione human-readable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Estensioni richieste
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "postgis"   with schema public;


-- ---------------------------------------------------------------------------
-- Sequenze (per tabelle non-identity)
-- ---------------------------------------------------------------------------
create sequence if not exists public.clients_id_seq        as smallint;
create sequence if not exists public.generic_photos_id_seq as bigint;
create sequence if not exists public.store_photos_id_seq   as bigint;


-- ---------------------------------------------------------------------------
-- TABLE: clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id         smallint primary key default nextval('public.clients_id_seq'::regclass),
  name       text         not null,
  created_at timestamptz  default now(),
  logo       text
);

alter sequence public.clients_id_seq owned by public.clients.id;
alter table public.clients enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: client_workflows
-- ---------------------------------------------------------------------------
create table if not exists public.client_workflows (
  id         bigint generated always as identity primary key,
  client_id  smallint not null unique
             references public.clients(id) on delete cascade,
  name       text     not null,
  workflow   jsonb    not null,
  active     boolean  not null default true,
  created_at timestamptz not null default now()
);

alter table public.client_workflows enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: users (profilo applicativo, 1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id               uuid primary key references auth.users(id),
  created_at       timestamptz not null default now(),
  name             text,
  surname          text,
  number           text,
  email            text,
  role             text not null default 'agent'
                   check (role in ('agent','am','supervisor')),
  visibility_scope text not null default 'all'
                   check (visibility_scope in ('all','restricted'))
);

alter table public.users enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: areas
-- ---------------------------------------------------------------------------
create table if not exists public.areas (
  id         bigint generated always as identity primary key,
  name       text     not null,
  client_id  smallint references public.clients(id),
  province   text[],
  created_at timestamptz not null default now()
);

alter table public.areas enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: user_areas (M:N)
-- ---------------------------------------------------------------------------
create table if not exists public.user_areas (
  user_id uuid   not null references public.users(id) on delete cascade,
  area_id bigint not null references public.areas(id) on delete cascade,
  primary key (user_id, area_id)
);

alter table public.user_areas enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: user_client_access (lista bianca utente → cliente)
-- ---------------------------------------------------------------------------
-- Usata SOLO se public.users.visibility_scope = 'restricted'.
-- Un utente 'all' vede tutto a prescindere da queste righe.
create table if not exists public.user_client_access (
  user_id    uuid        not null references public.users(id)   on delete cascade,
  client_id  smallint    not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.user_client_access enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: user_store_access (lista bianca utente → singolo negozio)
-- ---------------------------------------------------------------------------
-- Idem: si applica solo a utenti 'restricted'. Indipendente da user_client_access.
create table if not exists public.user_store_access (
  user_id    uuid        not null references public.users(id)  on delete cascade,
  store_id   bigint      not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create index if not exists idx_user_store_access_store_id
  on public.user_store_access (store_id);

alter table public.user_store_access enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: stores
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id                  bigint generated by default as identity primary key,
  created_at          timestamptz not null default now(),
  name                text,
  address             text,
  coordinates         text,                              -- "lng,lat" — input
  location            geography,                         -- PostGIS, popolato via trigger
  phone               text,
  category            text,
  owner_name          text,
  email               text,
  status              text default 'free',               -- free | in_progress | concluded | already_client | failed | not_interested | non_existent
  tier                text,                              -- bronze | silver | gold | gold+
  consent             boolean,
  type                text,
  codice_ateco_gruppo text,
  codice_ateco        text,
  cap                 text,
  regione             text,
  provincia           text,
  comune              text,
  pi                  text,
  cf_azienda          text,
  dipendenti          text,
  fatturato           text,
  client_id           smallint not null default 1
                      references public.clients(id) on delete restrict,
  -- Utente applicativo che ha caricato lo store via app (form NewStoreForm).
  -- NULL per le righe storiche / importate in bulk: la grande maggioranza dei record.
  created_by          uuid     null
                      references public.users(id) on delete set null
);

create index if not exists idx_stores_client_id  on public.stores (client_id);
create index if not exists idx_stores_created_by on public.stores (created_by)
  where created_by is not null;
-- Suggerito (non ancora presente in produzione):
-- create index if not exists idx_stores_location_gix on public.stores using gist (location);

alter table public.stores enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: store_clients  (N:N stores ↔ clients)
-- ---------------------------------------------------------------------------
-- Un punto vendita può essere associato a più clienti (es. Amex + Scalapay).
-- `stores.client_id` resta il cliente "primario" (regge UI legacy: filtro mappa,
-- workflow del popup, store_visit_outcomes). La riga in store_clients con
-- `is_primary = true` mirrora `stores.client_id`.
create table if not exists public.store_clients (
  store_id   bigint      not null references public.stores(id)  on delete cascade,
  client_id  smallint    not null references public.clients(id) on delete cascade,
  is_primary boolean     not null default false,
  created_at timestamptz not null default now(),
  created_by uuid        null     references public.users(id)   on delete set null,
  primary key (store_id, client_id)
);

create index if not exists idx_store_clients_client_id on public.store_clients (client_id);
create index if not exists idx_store_clients_store_id  on public.store_clients (store_id);
-- Al massimo una riga "is_primary = true" per store.
create unique index if not exists uq_store_clients_primary_per_store
  on public.store_clients (store_id)
  where is_primary;

alter table public.store_clients enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: store_status_logs
-- ---------------------------------------------------------------------------
create table if not exists public.store_status_logs (
  id         bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  store_id   bigint not null references public.stores(id),
  prev       text   not null,
  new        text   not null,
  modifier   uuid   not null references public.users(id),
  notes      text
);

alter table public.store_status_logs enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: store_visit_outcomes
-- ---------------------------------------------------------------------------
create table if not exists public.store_visit_outcomes (
  id           bigint generated always as identity primary key,
  store_id     bigint   not null references public.stores(id) on delete cascade,
  client_id    smallint not null references public.clients(id),
  user_id      uuid     not null,
  outcome_data jsonb    not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint uq_store_visit_outcomes_store_user unique (store_id, user_id)
);

create index if not exists idx_store_visit_outcomes_store_id on public.store_visit_outcomes (store_id);
create index if not exists idx_store_visit_outcomes_user_id  on public.store_visit_outcomes (user_id);

alter table public.store_visit_outcomes enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: store_photos
-- ---------------------------------------------------------------------------
create table if not exists public.store_photos (
  id         bigint primary key default nextval('public.store_photos_id_seq'::regclass),
  store_id   integer not null references public.stores(id) on delete cascade,
  user_id    uuid    not null,
  photo_url  text    not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter sequence public.store_photos_id_seq owned by public.store_photos.id;

create index if not exists idx_store_photos_store_id   on public.store_photos (store_id);
create index if not exists idx_store_photos_user_id    on public.store_photos (user_id);
create index if not exists idx_store_photos_created_at on public.store_photos (created_at desc);

alter table public.store_photos enable row level security;


-- ---------------------------------------------------------------------------
-- TABLE: generic_photos
-- ---------------------------------------------------------------------------
create table if not exists public.generic_photos (
  id         bigint primary key default nextval('public.generic_photos_id_seq'::regclass),
  store_id   integer not null references public.stores(id) on delete cascade,
  user_id    uuid    not null,
  photo_url  text    not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter sequence public.generic_photos_id_seq owned by public.generic_photos.id;

create index if not exists idx_generic_photos_store_id   on public.generic_photos (store_id);
create index if not exists idx_generic_photos_user_id    on public.generic_photos (user_id);
create index if not exists idx_generic_photos_created_at on public.generic_photos (created_at desc);

alter table public.generic_photos enable row level security;


-- ---------------------------------------------------------------------------
-- FUNCTIONS & TRIGGERS
-- ---------------------------------------------------------------------------

-- Crea la riga in public.users quando viene creato un nuovo auth.users.
-- Nota: i nuovi utenti partono `restricted` per default (fail-closed),
-- gli utenti pre-esistenti mantengono il default di colonna 'all'.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Converte stores.coordinates ("lng,lat") nel geography stores.location
create or replace function public.convert_coordinates_to_location()
returns trigger
language plpgsql
as $$
declare
  parts text[];
  lng   double precision;
  lat   double precision;
begin
  if new.coordinates is null or new.coordinates = '' then
    new.location := null;
    return new;
  end if;

  parts := string_to_array(new.coordinates, ',');
  if array_length(parts, 1) < 2 then
    return new;
  end if;

  lng := nullif(trim(parts[1]), '')::double precision;
  lat := nullif(trim(parts[2]), '')::double precision;

  if lng is not null and lat is not null then
    new.location := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_convert_coordinates        on public.stores;
drop trigger if exists trigger_convert_coordinates_update on public.stores;

create trigger trigger_convert_coordinates
  before insert on public.stores
  for each row execute function public.convert_coordinates_to_location();

create trigger trigger_convert_coordinates_update
  before update on public.stores
  for each row execute function public.convert_coordinates_to_location();


-- updated_at touchers
create or replace function public.update_store_photos_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function public.update_generic_photos_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists update_store_photos_updated_at   on public.store_photos;
drop trigger if exists update_generic_photos_updated_at on public.generic_photos;

create trigger update_store_photos_updated_at
  before update on public.store_photos
  for each row execute function public.update_store_photos_updated_at();

create trigger update_generic_photos_updated_at
  before update on public.generic_photos
  for each row execute function public.update_generic_photos_updated_at();


-- Helper: può l'utente p_user_id vedere lo store p_store_id?
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

  if exists (
    select 1 from public.user_store_access
    where user_id = p_user_id and store_id = p_store_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.stores             s
    join public.user_client_access uca on uca.client_id = s.client_id
    where s.id = p_store_id and uca.user_id = p_user_id
  ) then
    return true;
  end if;

  -- whitelist cliente ↔ uno qualsiasi dei clienti associati via store_clients
  if exists (
    select 1
    from public.store_clients      sc
    join public.user_client_access uca on uca.client_id = sc.client_id
    where sc.store_id = p_store_id and uca.user_id = p_user_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all  on function public.user_can_see_store(uuid, bigint) from public;
grant execute on function public.user_can_see_store(uuid, bigint) to authenticated, anon;


-- Helper: può l'utente p_user_id vedere il cliente p_client_id?
-- Vero anche se vede solo un negozio di quel cliente.
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
    select 1 from public.user_client_access
    where user_id = p_user_id and client_id = p_client_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.user_store_access usa
    join public.stores            s on s.id = usa.store_id
    where usa.user_id = p_user_id and s.client_id = p_client_id
  ) then
    return true;
  end if;

  -- grant via store (cliente associato in store_clients)
  if exists (
    select 1
    from public.user_store_access usa
    join public.store_clients     sc on sc.store_id = usa.store_id
    where usa.user_id = p_user_id and sc.client_id = p_client_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all  on function public.user_can_see_client(uuid, smallint) from public;
grant execute on function public.user_can_see_client(uuid, smallint) to authenticated, anon;


-- Geosearch: stores entro un raggio (metri) da un punto, filtrati per cliente
-- e per scope di visibilità dell'utente chiamante.
-- NB: `p_client_id default null` è importante perché PostgREST risolve gli
-- overload in base ai parametri nominati passati dal client (vedi commento
-- nella migration 20260514123300_user_visibility_scope.sql).
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
        select 1 from public.store_clients sc
        where sc.store_id = s.id and sc.client_id = p_client_id
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


-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- clients (lettura vincolata allo scope di visibilità dell'utente)
drop policy if exists "Authenticated users can read clients" on public.clients;
drop policy if exists "Read clients via visibility scope"    on public.clients;
create policy "Read clients via visibility scope"
  on public.clients for select to authenticated
  using (public.user_can_see_client(auth.uid(), id));

-- client_workflows (visibile se l'utente vede il cliente di riferimento)
drop policy if exists "Authenticated read client_workflows"        on public.client_workflows;
drop policy if exists "Read client_workflows via visibility scope" on public.client_workflows;
create policy "Read client_workflows via visibility scope"
  on public.client_workflows for select to authenticated
  using (public.user_can_see_client(auth.uid(), client_id));

-- users
drop policy if exists "Enable read access for all users" on public.users;
create policy "Enable read access for all users"
  on public.users for select using (true);

-- areas
drop policy if exists "Auth read areas" on public.areas;
create policy "Auth read areas"
  on public.areas for select using (auth.role() = 'authenticated');

-- user_areas
drop policy if exists "Auth read user_areas" on public.user_areas;
create policy "Auth read user_areas"
  on public.user_areas for select using (auth.role() = 'authenticated');

-- user_client_access (ognuno legge solo le proprie righe)
drop policy if exists "Users can read own client access" on public.user_client_access;
create policy "Users can read own client access"
  on public.user_client_access for select to authenticated
  using (user_id = auth.uid());

-- user_store_access (ognuno legge solo le proprie righe)
drop policy if exists "Users can read own store access" on public.user_store_access;
create policy "Users can read own store access"
  on public.user_store_access for select to authenticated
  using (user_id = auth.uid());

-- stores (lettura vincolata allo scope di visibilità dell'utente)
drop policy if exists "Enable read access for all users"          on public.stores;
drop policy if exists "Read stores via visibility scope"          on public.stores;
drop policy if exists "Enable insert for authenticated users only" on public.stores;
drop policy if exists "Enable update for users"                   on public.stores;

create policy "Read stores via visibility scope"
  on public.stores for select
  using (public.user_can_see_store(auth.uid(), id));

create policy "Enable insert for authenticated users only"
  on public.stores for insert to authenticated with check (true);

create policy "Enable update for users"
  on public.stores for update using (true) with check (true);

-- store_clients (read/insert/delete vincolati alla visibilità dello store)
drop policy if exists "Read store_clients via store visibility"   on public.store_clients;
drop policy if exists "Insert store_clients via store visibility" on public.store_clients;
drop policy if exists "Delete store_clients via store visibility" on public.store_clients;

create policy "Read store_clients via store visibility"
  on public.store_clients for select to authenticated
  using (public.user_can_see_store(auth.uid(), store_id));

create policy "Insert store_clients via store visibility"
  on public.store_clients for insert to authenticated
  with check (public.user_can_see_store(auth.uid(), store_id));

create policy "Delete store_clients via store visibility"
  on public.store_clients for delete to authenticated
  using (public.user_can_see_store(auth.uid(), store_id));

-- store_status_logs
drop policy if exists "Enable read access for all users"          on public.store_status_logs;
drop policy if exists "Enable insert for authenticated users only" on public.store_status_logs;

create policy "Enable read access for all users"
  on public.store_status_logs for select using (true);

create policy "Enable insert for authenticated users only"
  on public.store_status_logs for insert to authenticated with check (true);

-- store_visit_outcomes
drop policy if exists "Authenticated read store_visit_outcomes"       on public.store_visit_outcomes;
drop policy if exists "Authenticated insert store_visit_outcomes"     on public.store_visit_outcomes;
drop policy if exists "Authenticated update own store_visit_outcomes" on public.store_visit_outcomes;

create policy "Authenticated read store_visit_outcomes"
  on public.store_visit_outcomes for select using (auth.role() = 'authenticated');

create policy "Authenticated insert store_visit_outcomes"
  on public.store_visit_outcomes for insert with check (auth.role() = 'authenticated');

create policy "Authenticated update own store_visit_outcomes"
  on public.store_visit_outcomes for update using (user_id = auth.uid());

-- store_photos
drop policy if exists "Authenticated users can view all photos" on public.store_photos;
drop policy if exists "Users can insert their own photos"       on public.store_photos;
drop policy if exists "Users can delete their own photos"       on public.store_photos;

create policy "Authenticated users can view all photos"
  on public.store_photos for select to authenticated using (true);

create policy "Users can insert their own photos"
  on public.store_photos for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can delete their own photos"
  on public.store_photos for delete to authenticated using (auth.uid() = user_id);

-- generic_photos
drop policy if exists "Authenticated users can view all generic photos" on public.generic_photos;
drop policy if exists "Users can insert their own generic photos"       on public.generic_photos;
drop policy if exists "Users can delete their own generic photos"       on public.generic_photos;

create policy "Authenticated users can view all generic photos"
  on public.generic_photos for select to authenticated using (true);

create policy "Users can insert their own generic photos"
  on public.generic_photos for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can delete their own generic photos"
  on public.generic_photos for delete to authenticated using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Storage buckets & policies
-- ---------------------------------------------------------------------------
-- (Eseguibili anche tramite Supabase CLI / Dashboard; qui per completezza.)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('client-logos',   'client-logos',   true, 1048576,
   array['image/jpeg','image/png','image/webp','image/gif']),
  ('generic-photos', 'generic-photos', true, 5242880,
   array['image/jpeg','image/png','image/webp','image/gif','image/jpg']),
  ('store-photos',   'store-photos',   true, null, null)
on conflict (id) do nothing;

-- Policy oggetti — vedi `supabase/SCHEMA.md` per il dettaglio
-- (omesse qui per evitare drift; gestite via Dashboard Supabase).
