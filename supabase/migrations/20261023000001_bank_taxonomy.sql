-- Banco en la nube, parte 1. Ids, taxonomía en la base y ajustes del banco (B11 del plan del cambio,
-- 1.2, 1.3 y 1.16 del plan de B11).
--
-- Qué trae
--   - ulid_uuid(). Un ULID escrito como uuid, con la hora en milisegundos en los primeros 48 bits y 80
--     bits al azar. Lo usan todas las versiones de pregunta y de opción, los casos nuevos y los ids que
--     nacen en el servidor. Su primer dígito es 0, así que siempre convierte a ULID en la app
--     (src/data/cloud/cloudIds.ts). El azar sale de gen_random_uuid(), que trae Postgres sin pgcrypto
--   - stable_bank_uuid(namespace, clave). md5 del texto con el primer dígito llevado a 0 a 7. Da el
--     mismo id para la misma pregunta del Sheet, la misma opción y el mismo caso, así repetir la
--     sincronización o recrear la base no cambia ningún id
--   - bank_taxonomy y bank_bias_tags, la taxonomía de src/demo/content para que el servidor valide sin
--     leer la app. tests/content/taxonomySeed.test.ts compara esta siembra con topic-taxonomy.json y
--     bias-taxonomy.json. Cambiar la taxonomía pide una migración nueva
--   - Claves nuevas de platform_settings (bank_limits, bank_sync, bank_goal y physician_pay), sin
--     secretos ni el ID del Sheet, porque platform_settings se lee sin sesión
--   - bank_open_for_students(), la bandera cloudBank leída en el servidor, así una app manipulada no
--     abre el banco antes, y bank_limit, los topes con sus valores de respaldo
--
-- Todas son ayudas internas, sin execute para nadie de la API. Es idempotente, no lleva sentencias
-- delete ni drop y no edita las migraciones anteriores (D-113)

-- ===================================================================== Ids
create or replace function public.ulid_uuid() returns uuid
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  -- 12 dígitos de hora y 20 al azar. Los primeros 12 dígitos de un uuid versión 4 son todos al azar
  return (
    lpad(to_hex(v_ms), 12, '0')
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  )::uuid;
end;
$$;

create or replace function public.stable_bank_uuid(p_namespace text, p_key text) returns uuid
language sql immutable set search_path = public, pg_temp as $$
  select (to_hex(('x' || substr(h, 1, 1))::bit(4)::int & 7) || substr(h, 2))::uuid
  from (select md5(coalesce(p_namespace, '') || ':' || coalesce(p_key, '')) as h) s
$$;

-- Fecha en UTC con milisegundos y Z, el formato de toISOString que piden los esquemas de la app
create or replace function public.bank_iso(p_at timestamptz) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_at is null then null
    else to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$$;

-- ===================================================================== Taxonomía
create table if not exists public.bank_taxonomy (
  branch text not null,
  topic text not null,
  subtopic text not null,
  section text not null default 'clinical' check (section in ('clinical', 'english')),
  primary key (branch, topic, subtopic)
);
create table if not exists public.bank_bias_tags (
  -- Solo las etiquetas taggable de bias-taxonomy.json
  tag text primary key
);
alter table public.bank_taxonomy enable row level security;
alter table public.bank_bias_tags enable row level security;
revoke all on public.bank_taxonomy, public.bank_bias_tags from public, anon, authenticated, service_role;

-- Siembra de topic-taxonomy.json versión 3 y de las etiquetas de bias-taxonomy.json
insert into public.bank_taxonomy (branch, topic, subtopic, section) values
  ('internal_medicine', 'cardiology', 'hypertension', 'clinical'),
  ('internal_medicine', 'cardiology', 'heart_failure', 'clinical'),
  ('internal_medicine', 'cardiology', 'acute_coronary_syndrome', 'clinical'),
  ('internal_medicine', 'cardiology', 'atrial_fibrillation', 'clinical'),
  ('internal_medicine', 'endocrinology', 'diabetes_type_2', 'clinical'),
  ('internal_medicine', 'endocrinology', 'diabetic_emergencies', 'clinical'),
  ('internal_medicine', 'endocrinology', 'thyroid_disease', 'clinical'),
  ('internal_medicine', 'endocrinology', 'dyslipidemia', 'clinical'),
  ('internal_medicine', 'pulmonology', 'asthma_adult', 'clinical'),
  ('internal_medicine', 'pulmonology', 'copd', 'clinical'),
  ('internal_medicine', 'pulmonology', 'community_pneumonia', 'clinical'),
  ('internal_medicine', 'pulmonology', 'pulmonary_embolism', 'clinical'),
  ('internal_medicine', 'nephrology', 'acute_kidney_injury', 'clinical'),
  ('internal_medicine', 'nephrology', 'chronic_kidney_disease', 'clinical'),
  ('internal_medicine', 'nephrology', 'electrolyte_disorders', 'clinical'),
  ('internal_medicine', 'gastroenterology', 'upper_gi_bleeding', 'clinical'),
  ('internal_medicine', 'gastroenterology', 'cirrhosis', 'clinical'),
  ('internal_medicine', 'gastroenterology', 'viral_hepatitis', 'clinical'),
  ('internal_medicine', 'gastroenterology', 'peptic_ulcer', 'clinical'),
  ('internal_medicine', 'infectious_diseases', 'hiv', 'clinical'),
  ('internal_medicine', 'infectious_diseases', 'tuberculosis', 'clinical'),
  ('internal_medicine', 'infectious_diseases', 'dengue', 'clinical'),
  ('internal_medicine', 'infectious_diseases', 'sepsis', 'clinical'),
  ('internal_medicine', 'hematology', 'anemia_adult', 'clinical'),
  ('internal_medicine', 'hematology', 'anticoagulation', 'clinical'),
  ('internal_medicine', 'hematology', 'acute_leukemia_adult', 'clinical'),
  ('internal_medicine', 'neurology', 'stroke', 'clinical'),
  ('internal_medicine', 'neurology', 'epilepsy', 'clinical'),
  ('internal_medicine', 'neurology', 'headache', 'clinical'),
  ('internal_medicine', 'rheumatology', 'rheumatoid_arthritis', 'clinical'),
  ('internal_medicine', 'rheumatology', 'lupus', 'clinical'),
  ('internal_medicine', 'rheumatology', 'gout', 'clinical'),
  ('internal_medicine', 'psychiatry', 'depression', 'clinical'),
  ('internal_medicine', 'psychiatry', 'anxiety_disorders', 'clinical'),
  ('internal_medicine', 'psychiatry', 'substance_use', 'clinical'),
  ('internal_medicine', 'oncology', 'lung_cancer', 'clinical'),
  ('internal_medicine', 'oncology', 'colorectal_cancer_internal', 'clinical'),
  ('internal_medicine', 'oncology', 'lymphomas', 'clinical'),
  ('internal_medicine', 'dermatology', 'dermatitis', 'clinical'),
  ('internal_medicine', 'dermatology', 'skin_cancer', 'clinical'),
  ('internal_medicine', 'dermatology', 'psoriasis', 'clinical'),
  ('internal_medicine', 'geriatrics', 'geriatric_syndromes', 'clinical'),
  ('internal_medicine', 'geriatrics', 'delirium', 'clinical'),
  ('internal_medicine', 'geriatrics', 'falls', 'clinical'),
  ('internal_medicine', 'allergy_immunology', 'anaphylaxis', 'clinical'),
  ('internal_medicine', 'allergy_immunology', 'primary_immunodeficiency', 'clinical'),
  ('pediatrics', 'neonatology', 'neonatal_jaundice', 'clinical'),
  ('pediatrics', 'neonatology', 'neonatal_resuscitation', 'clinical'),
  ('pediatrics', 'neonatology', 'neonatal_respiratory_distress', 'clinical'),
  ('pediatrics', 'neonatology', 'neonatal_sepsis', 'clinical'),
  ('pediatrics', 'growth_development', 'developmental_milestones', 'clinical'),
  ('pediatrics', 'growth_development', 'child_malnutrition', 'clinical'),
  ('pediatrics', 'growth_development', 'breastfeeding', 'clinical'),
  ('pediatrics', 'immunizations', 'vaccination_schedule', 'clinical'),
  ('pediatrics', 'immunizations', 'vaccine_contraindications', 'clinical'),
  ('pediatrics', 'pediatric_infectious', 'acute_diarrhea_dehydration', 'clinical'),
  ('pediatrics', 'pediatric_infectious', 'exanthematous_diseases', 'clinical'),
  ('pediatrics', 'pediatric_infectious', 'acute_otitis_media', 'clinical'),
  ('pediatrics', 'pediatric_infectious', 'streptococcal_pharyngitis', 'clinical'),
  ('pediatrics', 'pediatric_respiratory', 'bronchiolitis', 'clinical'),
  ('pediatrics', 'pediatric_respiratory', 'croup', 'clinical'),
  ('pediatrics', 'pediatric_respiratory', 'pediatric_asthma', 'clinical'),
  ('pediatrics', 'pediatric_respiratory', 'pediatric_pneumonia', 'clinical'),
  ('pediatrics', 'pediatric_cardiology', 'congenital_heart_disease', 'clinical'),
  ('pediatrics', 'pediatric_cardiology', 'kawasaki_disease', 'clinical'),
  ('pediatrics', 'pediatric_neurology', 'febrile_seizures', 'clinical'),
  ('pediatrics', 'pediatric_neurology', 'bacterial_meningitis_child', 'clinical'),
  ('pediatrics', 'pediatric_nephrology', 'pediatric_uti', 'clinical'),
  ('pediatrics', 'pediatric_nephrology', 'nephrotic_syndrome_child', 'clinical'),
  ('pediatrics', 'pediatric_hematology_oncology', 'iron_deficiency_child', 'clinical'),
  ('pediatrics', 'pediatric_hematology_oncology', 'acute_lymphoblastic_leukemia', 'clinical'),
  ('pediatrics', 'pediatric_surgery', 'intussusception', 'clinical'),
  ('pediatrics', 'pediatric_surgery', 'pyloric_stenosis', 'clinical'),
  ('pediatrics', 'pediatric_surgery', 'cryptorchidism', 'clinical'),
  ('pediatrics', 'pediatric_gastroenterology', 'pediatric_diarrhea', 'clinical'),
  ('pediatrics', 'pediatric_gastroenterology', 'pediatric_gerd', 'clinical'),
  ('pediatrics', 'pediatric_endocrinology', 'congenital_hypothyroidism', 'clinical'),
  ('pediatrics', 'pediatric_endocrinology', 'pediatric_diabetes', 'clinical'),
  ('pediatrics', 'genetics', 'chromosomal_syndromes', 'clinical'),
  ('pediatrics', 'genetics', 'inborn_errors', 'clinical'),
  ('obstetrics_gynecology', 'prenatal_care', 'prenatal_control', 'clinical'),
  ('obstetrics_gynecology', 'prenatal_care', 'gestational_diabetes', 'clinical'),
  ('obstetrics_gynecology', 'hypertensive_pregnancy', 'preeclampsia', 'clinical'),
  ('obstetrics_gynecology', 'hypertensive_pregnancy', 'eclampsia_hellp', 'clinical'),
  ('obstetrics_gynecology', 'obstetric_hemorrhage', 'placenta_previa', 'clinical'),
  ('obstetrics_gynecology', 'obstetric_hemorrhage', 'placental_abruption', 'clinical'),
  ('obstetrics_gynecology', 'obstetric_hemorrhage', 'postpartum_hemorrhage', 'clinical'),
  ('obstetrics_gynecology', 'labor_delivery', 'normal_labor', 'clinical'),
  ('obstetrics_gynecology', 'labor_delivery', 'preterm_labor', 'clinical'),
  ('obstetrics_gynecology', 'labor_delivery', 'premature_rupture_membranes', 'clinical'),
  ('obstetrics_gynecology', 'early_pregnancy', 'ectopic_pregnancy', 'clinical'),
  ('obstetrics_gynecology', 'early_pregnancy', 'miscarriage', 'clinical'),
  ('obstetrics_gynecology', 'early_pregnancy', 'gestational_trophoblastic', 'clinical'),
  ('obstetrics_gynecology', 'puerperium', 'puerperal_infection', 'clinical'),
  ('obstetrics_gynecology', 'puerperium', 'mastitis', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_infections', 'vaginitis', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_infections', 'pelvic_inflammatory_disease', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_infections', 'hpv_infection', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_oncology', 'cervical_cancer', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_oncology', 'breast_cancer', 'clinical'),
  ('obstetrics_gynecology', 'gynecologic_oncology', 'endometrial_cancer', 'clinical'),
  ('obstetrics_gynecology', 'reproductive_endocrinology', 'amenorrhea', 'clinical'),
  ('obstetrics_gynecology', 'reproductive_endocrinology', 'polycystic_ovary', 'clinical'),
  ('obstetrics_gynecology', 'reproductive_endocrinology', 'menopause', 'clinical'),
  ('obstetrics_gynecology', 'contraception', 'hormonal_contraception', 'clinical'),
  ('obstetrics_gynecology', 'contraception', 'intrauterine_device', 'clinical'),
  ('obstetrics_gynecology', 'contraception', 'emergency_contraception', 'clinical'),
  ('obstetrics_gynecology', 'climacteric', 'menopause_obstetrics', 'clinical'),
  ('obstetrics_gynecology', 'climacteric', 'osteoporosis_postmenopausal', 'clinical'),
  ('obstetrics_gynecology', 'breast', 'breast_cancer_obstetrics', 'clinical'),
  ('obstetrics_gynecology', 'breast', 'benign_breast', 'clinical'),
  ('obstetrics_gynecology', 'maternal_fetal', 'fetal_growth_restriction', 'clinical'),
  ('obstetrics_gynecology', 'maternal_fetal', 'preterm_labor_obstetrics', 'clinical'),
  ('general_surgery', 'acute_abdomen', 'appendicitis', 'clinical'),
  ('general_surgery', 'acute_abdomen', 'bowel_obstruction', 'clinical'),
  ('general_surgery', 'acute_abdomen', 'hollow_viscus_perforation', 'clinical'),
  ('general_surgery', 'hepatobiliary', 'cholecystitis', 'clinical'),
  ('general_surgery', 'hepatobiliary', 'choledocholithiasis', 'clinical'),
  ('general_surgery', 'pancreas', 'acute_pancreatitis', 'clinical'),
  ('general_surgery', 'pancreas', 'pancreatic_cancer', 'clinical'),
  ('general_surgery', 'hernias', 'inguinal_hernia', 'clinical'),
  ('general_surgery', 'hernias', 'ventral_hernia', 'clinical'),
  ('general_surgery', 'trauma', 'primary_survey', 'clinical'),
  ('general_surgery', 'trauma', 'abdominal_trauma', 'clinical'),
  ('general_surgery', 'trauma', 'thoracic_trauma', 'clinical'),
  ('general_surgery', 'trauma', 'head_trauma', 'clinical'),
  ('general_surgery', 'burns', 'burn_classification', 'clinical'),
  ('general_surgery', 'burns', 'burn_resuscitation', 'clinical'),
  ('general_surgery', 'colorectal_anorectal', 'hemorrhoids', 'clinical'),
  ('general_surgery', 'colorectal_anorectal', 'anal_fissure_fistula', 'clinical'),
  ('general_surgery', 'colorectal_anorectal', 'colorectal_cancer', 'clinical'),
  ('general_surgery', 'colorectal_anorectal', 'diverticular_disease', 'clinical'),
  ('general_surgery', 'vascular_surgery', 'peripheral_arterial_disease', 'clinical'),
  ('general_surgery', 'vascular_surgery', 'aortic_aneurysm', 'clinical'),
  ('general_surgery', 'perioperative', 'preoperative_assessment', 'clinical'),
  ('general_surgery', 'perioperative', 'surgical_site_infection', 'clinical'),
  ('general_surgery', 'perioperative', 'postoperative_fluids', 'clinical'),
  ('general_surgery', 'urology', 'urolithiasis', 'clinical'),
  ('general_surgery', 'urology', 'benign_prostatic_hyperplasia', 'clinical'),
  ('general_surgery', 'urology', 'prostate_cancer', 'clinical'),
  ('general_surgery', 'urology', 'testicular_torsion', 'clinical'),
  ('general_surgery', 'orthopedics', 'fractures', 'clinical'),
  ('general_surgery', 'orthopedics', 'pediatric_orthopedics', 'clinical'),
  ('general_surgery', 'otolaryngology', 'otitis', 'clinical'),
  ('general_surgery', 'otolaryngology', 'sinusitis', 'clinical'),
  ('general_surgery', 'otolaryngology', 'epistaxis', 'clinical'),
  ('general_surgery', 'ophthalmology', 'red_eye', 'clinical'),
  ('general_surgery', 'ophthalmology', 'glaucoma', 'clinical'),
  ('general_surgery', 'ophthalmology', 'cataract', 'clinical'),
  ('general_surgery', 'neurosurgery', 'head_trauma_general', 'clinical'),
  ('general_surgery', 'neurosurgery', 'intracranial_hemorrhage', 'clinical'),
  ('general_surgery', 'thoracic_surgery', 'pneumothorax', 'clinical'),
  ('general_surgery', 'thoracic_surgery', 'pleural_effusion', 'clinical'),
  ('general_surgery', 'anesthesiology', 'preoperative_assessment_general', 'clinical'),
  ('general_surgery', 'anesthesiology', 'local_anesthetics', 'clinical'),
  ('family_medicine', 'chronic_disease_primary', 'diabetes_primary_care', 'clinical'),
  ('family_medicine', 'chronic_disease_primary', 'hypertension_primary_care', 'clinical'),
  ('family_medicine', 'chronic_disease_primary', 'dyslipidemia_family', 'clinical'),
  ('family_medicine', 'adolescent_health', 'adolescent_development', 'clinical'),
  ('family_medicine', 'adolescent_health', 'adolescent_risk', 'clinical'),
  ('family_medicine', 'primary_mental_health', 'depression_primary', 'clinical'),
  ('family_medicine', 'primary_mental_health', 'anxiety_primary', 'clinical'),
  ('family_medicine', 'primary_mental_health', 'substance_use_family', 'clinical'),
  ('family_medicine', 'family_health', 'family_life_cycle', 'clinical'),
  ('family_medicine', 'family_health', 'family_functionality', 'clinical'),
  ('family_medicine', 'medical_ethics_law', 'informed_consent', 'clinical'),
  ('family_medicine', 'medical_ethics_law', 'clinical_record_nom', 'clinical'),
  ('emergency_medicine', 'resuscitation', 'cardiac_arrest', 'clinical'),
  ('emergency_medicine', 'resuscitation', 'airway_management', 'clinical'),
  ('emergency_medicine', 'shock', 'septic_shock', 'clinical'),
  ('emergency_medicine', 'shock', 'hypovolemic_shock', 'clinical'),
  ('emergency_medicine', 'toxicology', 'poisonings', 'clinical'),
  ('emergency_medicine', 'toxicology', 'envenomations', 'clinical'),
  ('emergency_medicine', 'cardiovascular_emergencies', 'chest_pain', 'clinical'),
  ('emergency_medicine', 'cardiovascular_emergencies', 'arrhythmia', 'clinical'),
  ('emergency_medicine', 'respiratory_emergencies', 'asthma_exacerbation', 'clinical'),
  ('emergency_medicine', 'respiratory_emergencies', 'pulmonary_embolism_emergency', 'clinical'),
  ('emergency_medicine', 'neurologic_emergencies', 'stroke_emergency', 'clinical'),
  ('emergency_medicine', 'neurologic_emergencies', 'status_epilepticus', 'clinical'),
  ('emergency_medicine', 'metabolic_emergencies', 'diabetic_ketoacidosis', 'clinical'),
  ('emergency_medicine', 'metabolic_emergencies', 'electrolyte_disorders_emergency', 'clinical'),
  ('emergency_medicine', 'environmental_emergencies', 'heat_stroke', 'clinical'),
  ('emergency_medicine', 'environmental_emergencies', 'drowning', 'clinical'),
  ('emergency_medicine', 'environmental_emergencies', 'hypothermia', 'clinical'),
  ('emergency_medicine', 'polytrauma', 'atls', 'clinical'),
  ('emergency_medicine', 'polytrauma', 'spinal_trauma', 'clinical'),
  ('public_health', 'epidemiology', 'epidemiologic_surveillance', 'clinical'),
  ('public_health', 'epidemiology', 'frequency_association_measures', 'clinical'),
  ('public_health', 'epidemiology', 'outbreak_investigation', 'clinical'),
  ('public_health', 'biostatistics', 'study_design', 'clinical'),
  ('public_health', 'biostatistics', 'diagnostic_tests', 'clinical'),
  ('public_health', 'biostatistics', 'descriptive_inferential_statistics', 'clinical'),
  ('public_health', 'preventive_medicine', 'screening', 'clinical'),
  ('public_health', 'preventive_medicine', 'adult_immunizations', 'clinical'),
  ('public_health', 'preventive_medicine', 'health_promotion', 'clinical'),
  ('public_health', 'health_programs', 'national_health_programs', 'clinical'),
  ('public_health', 'health_programs', 'surveillance_notification_nom', 'clinical'),
  ('public_health', 'environmental_occupational', 'occupational_risks', 'clinical'),
  ('public_health', 'environmental_occupational', 'basic_sanitation', 'clinical'),
  ('public_health', 'health_system', 'care_levels', 'clinical'),
  ('public_health', 'health_system', 'health_indicators', 'clinical'),
  ('medical_english', 'reading_comprehension', 'english_internal_medicine', 'english'),
  ('medical_english', 'reading_comprehension', 'english_pediatrics', 'english'),
  ('medical_english', 'reading_comprehension', 'english_obstetrics_gynecology', 'english'),
  ('medical_english', 'reading_comprehension', 'english_general_surgery', 'english'),
  ('medical_english', 'reading_comprehension', 'english_family_medicine', 'english'),
  ('medical_english', 'reading_comprehension', 'english_emergency_medicine', 'english'),
  ('medical_english', 'reading_comprehension', 'english_public_health', 'english')
  on conflict (branch, topic, subtopic) do nothing;
insert into public.bank_bias_tags (tag) values
  ('premature_closure'), ('anchoring'), ('availability_heuristic'), ('base_rate_fallacy'),
  ('framing_effect'), ('sunk_cost_fallacy'), ('gamblers_fallacy'), ('clustering_illusion'),
  ('loss_aversion'), ('inattentional_blindness'), ('serial_position_effect'), ('representativeness_heuristic'),
  ('halo_horn_effect'), ('ambiguity_effect'), ('complexity_bias'), ('confirmation_bias'),
  ('status_quo_bias'), ('belief_bias'), ('information_bias'), ('focusing_illusion'),
  ('omission_bias')
  on conflict (tag) do nothing;

create or replace function public.bank_taxonomy_has(p_branch text, p_topic text, p_subtopic text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.bank_taxonomy
    where branch = p_branch and topic = p_topic and subtopic = p_subtopic
  )
$$;

-- ===================================================================== Ajustes del banco
-- Topes del alumno (2.2 y 2.3), sincronización con el Sheet (3.10), meta para abrir el banco
-- (respuesta 56) y tarifa por revisión (8.8). No pisa un valor que el admin ya haya cambiado
insert into public.platform_settings (key, value) values
  ('bank_limits', '{"perMinute":300,"perHour":900,"alertDaily":600,"alertWeekShare":0.5,"reportsPerDay":10,"maxFetch":100}'),
  ('bank_sync', '{"enabled":false,"mode":"dry_run","tab":"Preguntas","maxRows":5000,"minIntervalSeconds":60,"idPattern":"^[A-Z]{2,4}-[0-9]{4,5}$"}'),
  ('bank_goal', '{"approvedToOpen":300}'),
  ('physician_pay', '{"perReviewMxn":null}')
  on conflict (key) do nothing;

-- El banco de la nube abierto para los alumnos. Es la bandera cloudBank de feature_flags, la misma que
-- lee la app. Sin la clave o con otro valor, cerrado
create or replace function public.bank_open_for_students() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select value -> 'cloudBank' = 'true'::jsonb from public.platform_settings where key = 'feature_flags'),
    false
  )
$$;

-- Los topes con sus valores de respaldo, por si el admin borra una clave o escribe algo que no se lee
create or replace function public.bank_limits() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select '{"perMinute":300,"perHour":900,"alertDaily":600,"alertWeekShare":0.5,"reportsPerDay":10,"maxFetch":100}'::jsonb
    || coalesce(
      (select value from public.platform_settings where key = 'bank_limits' and jsonb_typeof(value) = 'object'),
      '{}'::jsonb
    )
$$;

-- Un número de bank_limits. Con un valor que no es número o es negativo, el de respaldo
create or replace function public.bank_limit(p_field text, p_default numeric) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value numeric;
begin
  select (value ->> p_field)::numeric into v_value from public.platform_settings where key = 'bank_limits';
  if v_value is null or v_value < 0 then
    return p_default;
  end if;
  return v_value;
exception when others then
  return p_default;
end;
$$;

-- ===================================================================== Permisos de las funciones
-- Todas son ayudas internas. Solo las llaman otras funciones del servidor
revoke all on function public.ulid_uuid() from public, anon, authenticated, service_role;
revoke all on function public.stable_bank_uuid(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bank_iso(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.bank_taxonomy_has(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bank_open_for_students() from public, anon, authenticated, service_role;
revoke all on function public.bank_limits() from public, anon, authenticated, service_role;
revoke all on function public.bank_limit(text, numeric) from public, anon, authenticated, service_role;
