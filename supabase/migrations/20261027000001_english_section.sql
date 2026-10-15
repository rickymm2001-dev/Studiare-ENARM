-- Inglés médico (B13 del plan del cambio, respuesta 61). Siembra el tema de vocabulario de la taxonomía
-- del banco. tests/content/taxonomySeed.test.ts compara esta siembra, junto con la de
-- 20261023000001_bank_taxonomy.sql, con src/demo/content/topic-taxonomy.json
--
-- Es idempotente, no lleva sentencias delete ni drop y no edita las migraciones anteriores (D-113).
-- Va después de 20261023000006_bank_sync_cron.sql y de las de B12

-- ===================================================================== Taxonomía
-- Vocabulario médico. Solo lo usan las tarjetas del mazo de vocabulario, para que Repasar y Conócete las
-- agrupen dentro de Inglés médico. Ninguna pregunta lo usa
insert into public.bank_taxonomy (branch, topic, subtopic, section) values
  ('medical_english', 'medical_vocabulary', 'english_terms', 'english')
  on conflict (branch, topic, subtopic) do nothing;
