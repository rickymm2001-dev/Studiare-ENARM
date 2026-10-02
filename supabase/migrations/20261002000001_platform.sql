-- Esquema de la plataforma en Supabase (Fase P, bloque 3, D-069).
-- Permisos por fila en cada tabla. El navegador solo usa la llave pública y nunca la secreta.
-- Los roles viven aquí y no en el navegador. Alumno sin poderes, médico revisa lo asignado,
-- administrador todo, dueño fijo que nadie puede quitar.

create extension if not exists pgcrypto;

-- ===================================================================== Roles
create type public.app_role as enum ('student', 'physician', 'admin', 'owner');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
-- Solo puede haber un dueño
create unique index user_roles_single_owner on public.user_roles (role) where role = 'owner';

create table public.role_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_role public.app_role,
  new_role public.app_role not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now()
);

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'student'::public.app_role)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'owner')
$$;

-- Cambiar el rol de alguien. Única puerta para cambiar roles desde la app
--   - Solo administradores y el dueño
--   - Nadie puede dar ni quitar el rol de dueño desde aquí
--   - Solo el dueño puede nombrar o quitar administradores
--   - Nadie cambia su propio rol
create or replace function public.set_user_role(target uuid, new_role public.app_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  caller_role public.app_role := public.current_app_role();
  old public.app_role;
begin
  if caller_role not in ('admin', 'owner') then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'Nadie cambia su propio rol' using errcode = '42501';
  end if;
  if new_role = 'owner' then
    raise exception 'El rol de dueño no se asigna desde la app' using errcode = '42501';
  end if;
  select role into old from public.user_roles where user_id = target for update;
  if old = 'owner' then
    raise exception 'Nadie puede quitar al dueño' using errcode = '42501';
  end if;
  if (old = 'admin' or new_role = 'admin') and caller_role <> 'owner' then
    raise exception 'Solo el dueño nombra o quita administradores' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, updated_at, updated_by)
    values (target, new_role, now(), auth.uid())
    on conflict (user_id) do update set role = excluded.role, updated_at = now(), updated_by = auth.uid();
  insert into public.role_audit (user_id, old_role, new_role, changed_by)
    values (target, old, new_role, auth.uid());
end;
$$;

-- ===================================================================== Personas
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Alias seudónimo. Es lo único que ven otros alumnos y lo único que viaja a la IA con el ID
  alias text not null check (char_length(alias) between 1 and 40),
  time_zone text not null default 'America/Merida',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Datos de cuenta, aparte del perfil (D-068). Nunca viajan a la IA ni a Party
create table public.private_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  birth_year int check (birth_year between 1940 and 2010),
  sex text check (sex in ('female', 'male', 'other', 'undisclosed')),
  state text check (state ~ '^[A-Z]{2,4}$'),
  situation text check (situation in ('internship', 'social_service', 'graduated', 'working', 'other')),
  attempt int check (attempt between 1 and 10),
  target_specialty text check (target_specialty ~ '^[a-z_]{2,48}$'),
  avatar jsonb not null default '{"kind":"initials"}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.privacy_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  notice_version text not null,
  accepted_at timestamptz not null default now(),
  -- La ley pide poder negarse a las finalidades secundarias, como el marketing
  marketing_opt_out boolean not null default false
);

-- Al registrarse alguien en Supabase Auth nace su perfil y su rol de alumno
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, alias)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'alias', ''), 'Alumno'));
  insert into public.user_roles (user_id) values (new.id);
  insert into public.private_accounts (user_id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================== Plataforma
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('enarm_exam', '{"date":"2027-09-13","provisional":true}'),
  ('plans', '{"free":{"priceMxn":0,"dailyQuestions":20},"monthly":{"priceMxn":249},"annual":{"priceMxn":1990}}');

-- ===================================================================== Pagos
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'monthly', 'annual')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  provider text check (provider in ('stripe', 'mercadopago')),
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_payment_id text not null,
  amount_mxn numeric(10, 2) not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

-- Cada aviso del procesador de pago tal cual llegó. El id único evita procesarlo dos veces
create table public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

-- ===================================================================== Contenido
create table public.clinical_cases (
  id uuid primary key default gen_random_uuid(),
  vignette text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  version int not null check (version >= 1),
  case_id uuid references public.clinical_cases (id),
  branch text not null,
  topic text not null,
  -- Enunciado, explicación, referencias, estructura y dificultad, validados con zod en la app
  body jsonb not null,
  editorial_status text not null default 'draft'
    check (editorial_status in ('draft', 'in_review', 'approved', 'rejected', 'retired')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.questions (id) on delete cascade,
  text text not null,
  is_correct boolean not null,
  bias_tag text,
  rationale text not null
);

-- Qué pregunta revisa qué médico
create table public.review_assignments (
  question_id uuid not null,
  physician_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  assigned_at timestamptz not null default now(),
  primary key (question_id, physician_id)
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.questions (id) on delete cascade,
  physician_id uuid not null references auth.users (id),
  decision text not null check (decision in ('approve', 'request_changes', 'reject')),
  comment text,
  decided_at timestamptz not null default now()
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('question', 'note')),
  target_id uuid not null,
  reason text not null check (reason in ('clinical_error', 'wrong_key', 'typo', 'outdated', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ===================================================================== Mazos
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  origin text not null check (origin in ('preloaded', 'imported', 'manual', 'generated')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  body jsonb not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  ordinal int not null default 0
);

-- ===================================================================== Bitácora
-- Solo se agrega. Nunca se edita ni se borra (regla del proyecto). El id viene del navegador,
-- así sincronizar dos veces el mismo evento no lo duplica
create table public.events (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  at timestamptz not null,
  tz text not null,
  session_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index events_user_at on public.events (user_id, at);

create or replace function public.forbid_event_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'La bitácora solo se agrega' using errcode = '42501';
end;
$$;
create trigger events_append_only before update or delete on public.events
  for each row execute function public.forbid_event_changes();

-- ===================================================================== Social
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  metric text not null check (metric in ('cards', 'questions', 'xp', 'accuracy')),
  target numeric not null check (target > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

-- Si dos alumnos comparten un grupo activo. Sin recursión en los permisos de memberships
create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = other
      and mine.left_at is null and theirs.left_at is null
  )
$$;

create or replace function public.is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where group_id = target_group and user_id = auth.uid() and left_at is null
  )
$$;

-- ===================================================================== IA
create table public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  content jsonb not null,
  source_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ===================================================================== Permisos por fila
alter table public.user_roles enable row level security;
alter table public.role_audit enable row level security;
alter table public.profiles enable row level security;
alter table public.private_accounts enable row level security;
alter table public.privacy_acceptances enable row level security;
alter table public.platform_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.clinical_cases enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.review_assignments enable row level security;
alter table public.review_decisions enable row level security;
alter table public.content_reports enable row level security;
alter table public.decks enable row level security;
alter table public.notes enable row level security;
alter table public.cards enable row level security;
alter table public.events enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.challenges enable row level security;
alter table public.ai_artifacts enable row level security;

-- Roles. Cada quien ve el suyo y el admin ve todos. Nadie los escribe directo, solo con set_user_role
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy role_audit_select on public.role_audit for select to authenticated
  using (public.is_admin());

-- Perfiles. El propio, los de tus grupos y todos para el admin
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Datos de cuenta. Solo el dueño de la cuenta y el admin
create policy accounts_select on public.private_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy accounts_update on public.private_accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy privacy_own on public.privacy_acceptances for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Configuración. Todos la leen, incluso sin sesión para la portada. Solo el admin la cambia
create policy settings_read on public.platform_settings for select to anon, authenticated using (true);
create policy settings_write on public.platform_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pagos. Cada quien ve lo suyo. Solo el servidor con la llave secreta escribe
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Contenido. El alumno ve lo aprobado y lo de demostración. El médico ve además lo que se le
-- asignó. El admin ve y escribe todo
create policy questions_select on public.questions for select to authenticated using (
  editorial_status = 'approved' or is_demo or public.is_admin()
  or exists (
    select 1 from public.review_assignments ra
    where ra.question_id = questions.question_id and ra.physician_id = auth.uid()
  )
);
create policy questions_admin_write on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy options_select on public.question_options for select to authenticated using (
  exists (select 1 from public.questions q where q.id = question_options.question_version_id)
);
create policy options_admin_write on public.question_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy cases_select on public.clinical_cases for select to authenticated using (true);
create policy cases_admin_write on public.clinical_cases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy assignments_select on public.review_assignments for select to authenticated
  using (physician_id = auth.uid() or public.is_admin());
create policy assignments_admin_write on public.review_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- El médico solo decide sobre lo que tiene asignado
create policy decisions_insert on public.review_decisions for insert to authenticated with check (
  physician_id = auth.uid()
  and public.current_app_role() in ('physician', 'admin', 'owner')
  and exists (
    select 1 from public.review_assignments ra
    join public.questions q on q.question_id = ra.question_id
    where q.id = review_decisions.question_version_id and ra.physician_id = auth.uid()
  )
);
create policy decisions_select on public.review_decisions for select to authenticated
  using (physician_id = auth.uid() or public.is_admin());

create policy reports_insert on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_select on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.content_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Mazos. Públicos para todos, privados solo para su dueño
create policy decks_select on public.decks for select to authenticated
  using (visibility = 'public' or owner_id = auth.uid() or public.is_admin());
create policy decks_own_write on public.decks for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy notes_select on public.notes for select to authenticated
  using (exists (select 1 from public.decks d where d.id = notes.deck_id));
create policy notes_own_write on public.notes for all to authenticated
  using (exists (select 1 from public.decks d where d.id = notes.deck_id and (d.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.decks d where d.id = notes.deck_id and (d.owner_id = auth.uid() or public.is_admin())));
create policy cards_select on public.cards for select to authenticated
  using (exists (select 1 from public.decks d where d.id = cards.deck_id));
create policy cards_own_write on public.cards for all to authenticated
  using (exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_id = auth.uid() or public.is_admin())));

-- Bitácora. Cada quien agrega y lee la suya. Nadie la edita ni la borra
create policy events_insert on public.events for insert to authenticated
  with check (user_id = auth.uid());
create policy events_select on public.events for select to authenticated
  using (user_id = auth.uid());

-- Grupos
create policy groups_select on public.groups for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));
create policy memberships_own on public.memberships for insert to authenticated
  with check (user_id = auth.uid());
create policy memberships_leave on public.memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy challenges_select on public.challenges for select to authenticated
  using (public.is_group_member(group_id));
create policy challenges_insert on public.challenges for insert to authenticated
  with check (public.is_group_member(group_id));

-- IA. El alumno ve y decide sobre sus borradores. Los crea el servidor
create policy ai_select on public.ai_artifacts for select to authenticated using (user_id = auth.uid());
create policy ai_decide on public.ai_artifacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La función de roles la puede llamar cualquier usuario con sesión. Ella misma revisa permisos
revoke all on function public.set_user_role(uuid, public.app_role) from public;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
