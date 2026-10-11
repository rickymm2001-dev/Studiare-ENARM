-- Pruebas de los precios de D-114 (migración 20261015000001). Corre al final sobre la misma base.
-- Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- ===================================================================== P1. Precios nuevos
select pg_temp.expect(
  (select value from public.platform_settings where key = 'plans') =
    '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"monthly":{"priceMxn":149},"annual":{"priceMxn":1499}}'::jsonb,
  'P1. Los precios deben ser 79 Fundador, 149 mensual y 1499 anual'
);

-- ===================================================================== P2. No pisa lo que cambió el admin
begin;
update public.platform_settings
  set value = '{"free":{"priceMxn":0,"dailyQuestions":25},"founder":{"priceMxn":79},"monthly":{"priceMxn":150},"annual":{"priceMxn":1200}}'::jsonb
  where key = 'plans';
\ir ../migrations/20261015000001_plan_prices.sql
select pg_temp.expect(
  (select (value -> 'free' ->> 'dailyQuestions')::integer from public.platform_settings where key = 'plans') = 25,
  'P2. La migración pisó un valor que el admin ya había cambiado'
);
rollback;

select 'TODAS LAS PRUEBAS DE PRECIOS PASARON' as resultado;
