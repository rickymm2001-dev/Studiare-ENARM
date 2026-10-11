-- Precios de D-114. El mensual regular sube a 149 y el anual a 1499. El Fundador de 79 queda como la
-- promoción del mensual para los primeros 100. Solo cambia la referencia de precios que guarda la
-- plataforma. Lo que cobra Stripe sale de sus Price ID, que se cambian en los secretos del servidor
--
-- Es idempotente. Se corre después de 20261014000001_function_grants.sql. No edita las migraciones
-- anteriores y no pisa un valor que el admin ya haya cambiado
update public.platform_settings
  set value = '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"monthly":{"priceMxn":149},"annual":{"priceMxn":1499}}'::jsonb,
      updated_at = now()
  where key = 'plans'
    and value = '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"monthly":{"priceMxn":150},"annual":{"priceMxn":1200}}'::jsonb;
