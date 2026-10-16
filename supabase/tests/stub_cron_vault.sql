-- Imitación mínima de Vault, pg_cron y pg_net para probar supabase/manual/ia-lotes-cron.sql (B12, 6.4).
-- Se carga dentro de una transacción que termina en rollback, así las demás pruebas siguen viendo una
-- base sin esos esquemas, como espera bank_sync_test.sql BS14. Las firmas son las de Supabase.
create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text,
  description text
);
create view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret, description from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '',
  new_key_id uuid default null) returns uuid language sql as $$
  insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id
$$;

create schema cron;
create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique,
  schedule text not null,
  command text not null
);
-- Con el mismo nombre reemplaza el trabajo, como pg_cron
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

create schema net;
create table net.requests (
  id bigint generated always as identity primary key,
  url text not null,
  headers jsonb,
  body jsonb,
  timeout_milliseconds integer
);
create function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.requests (url, headers, body, timeout_milliseconds)
  values (url, headers, body, timeout_milliseconds) returning id
$$;
