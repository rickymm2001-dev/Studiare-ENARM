export const meta = {
  name: 'enarm-demo-review',
  description: 'Adversarial AI review of demo ENARM questions, two lenses per chunk plus a skeptic per finding',
  whenToUse:
    'Before committing a batch of demo questions, or to re-verify pending findings. Prepare args with node scripts/content/review-chunks.ts (see docs/contenido-demo.md)',
  phases: [
    { title: 'Review', detail: 'clinical and item-writing lenses per 10-question chunk' },
    { title: 'Verify', detail: 'skeptic re-checks every medium or high finding' },
  ],
}

// args.dir        absolute path of .review with the chunk files
// args.taxonomy   absolute path of src/demo/content/bias-taxonomy.json
// args.chunks     [{ file, first, last }] printed by scripts/content/review-chunks.ts
// args.findings   optional. Findings to verify only, skipping the review phase. Each one needs
//                 key, option, severity, category, problem, suggested_fix and file (its chunk file)

const DIR = args.dir
const TAXONOMY = args.taxonomy
const SEVERITIES = ['high', 'medium', 'low']
const CATEGORIES = [
  'wrong_key', 'second_correct', 'factual_error', 'outdated_or_gpc_mismatch',
  'vignette_inconsistency', 'explanation_error', 'negative_item_flaw',
  'cueing', 'rationale_or_bias_tag', 'canonical_set', 'other',
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'question key, for example b3-q14' },
          option: { type: 'string', description: 'option letter a-j involved, or empty string if it concerns the stem or explanation' },
          severity: { type: 'string', enum: SEVERITIES },
          category: { type: 'string', enum: CATEGORIES },
          problem: { type: 'string', description: 'concise description of the defect and why, citing the clinical fact' },
          suggested_fix: { type: 'string', description: 'concrete fix, with exact replacement text in Spanish de Mexico when text must change' },
        },
        required: ['key', 'option', 'severity', 'category', 'problem', 'suggested_fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    real: { type: 'boolean' },
    severity: { type: 'string', enum: SEVERITIES },
    reasoning: { type: 'string' },
    fix: { type: 'string', description: 'exact replacement text in Spanish de Mexico, or empty if not real' },
  },
  required: ['real', 'severity', 'reasoning', 'fix'],
}

const FORMAT = `
Context. These are demo practice items for a Mexican ENARM (residency entrance exam) prep app. Every item has a stem (optional vignette, plus caseVignette when it is part of a serial case, plus prompt), 10 options a-j with exactly one correct, and each distractor carries a cognitive-bias tag and a rationale explaining why a student might pick it. "canonical" is the 4-option subset shown in 4-option mode and must contain the correct option. Polarity "negative" items ask for the exception, so the keyed option is the single FALSE or non-matching statement and the other nine must all be true. Explanations are 80-150 words, in Spanish de Mexico, with "tu" register, and references are guideline titles only (no years). Content must be consistent with current Mexican GPC (CENETEC/IMSS) and NOMs, and with current major international guidelines where the GPC is silent or clearly outdated.
Severity. high = keyed answer is wrong, another option is also defensibly correct (in the 10-option set or in the 4-option canonical set), a negative item has more than one exception, or a statement is medically false or unsafe. medium = a specific inaccurate, outdated or misleading detail (number, threshold, dose, age, drug, sequence) in vignette, option, rationale or explanation that does not by itself flip the key, or a vignette that does not support the key well. low = wording, cueing, bias-tag fit, canonical-set choice, style.
Rules. Do not edit any file. Read only. Report only genuine defects; do not report personal style preferences or valid alternative phrasings. If an item is fine, report nothing for it. Be specific and cite the clinical fact. Write suggested fixes in Spanish de Mexico, keeping the item format (exactly one correct option, explanation 80-150 words).`

const LENSES = [
  {
    key: 'clinical',
    focus: `You are a senior Mexican physician and ENARM item writer with expertise in internal medicine, pediatrics, obstetrics-gynecology and general surgery. For each item check, in this order:
1. Is the keyed option truly the single best answer for this exact vignette under current Mexican GPC and NOMs (and current major guidelines where the GPC is silent)? Consider the patient's specific data (age, stability, gestational age, lab values).
2. Is any distractor also correct or equally defensible? Check all 10 options and separately the 4 canonical options. For negative items, confirm that all nine non-keyed statements are true and the keyed one is false.
3. Any factual error or outdated content (doses, thresholds, ages, schedules, drug of choice, sequence of steps) in the vignette, options, rationales or explanation?
4. Does the vignette contain the needed data and nothing that contradicts the key?`,
  },
  {
    key: 'item',
    focus: `You are a psychometrician and medical educator reviewing item-writing quality and internal consistency. For each item check:
1. Ambiguity. A distractor that is partially correct or that a well-prepared student could reasonably defend; unclear prompt; for negative items, more than one option that could be the exception, or a double negation.
2. Internal consistency. The explanation must agree with the key and with every option's rationale; a rationale must not call something wrong that the explanation presents as correct, and vice versa; the vignette must not contradict the prompt.
3. Strong cueing only. Report when the correct option is conspicuously the only complete or the only qualified answer while the others are fragments, or when grammar or repeated words point to it. Report as low.
4. Rationale and bias tag. Read the taxonomy at ${TAXONOMY} (field distractorDefinition). Report as low only clear mismatches where the rationale describes a completely different reasoning error than the tagged bias.
5. Canonical set. Report as low if canonical omits clearly more attractive distractors than the ones it includes, and as high if canonical includes a second defensible answer.`,
  },
]

function reviewPrompt(lens, chunk) {
  return `${lens.focus}
${FORMAT}
Read the JSON file ${DIR}/${chunk.file}. It contains up to 10 items, ${chunk.first} to ${chunk.last}. Review every item and return all findings.`
}

function verifyPrompt(f) {
  return `A reviewer flagged a possible defect in a Mexican ENARM practice item. Independently check it and try to refute it.
${FORMAT}
Item: ${f.key} in the JSON file ${DIR}/${f.file}. Read the whole item, including caseVignette when present.
Flagged option: ${f.option || '(stem or explanation)'}
Category: ${f.category}. Reviewer severity: ${f.severity}.
Problem as reported: ${f.problem}
Suggested fix: ${f.suggested_fix}
Decide whether the defect is real. Return real=true only if the defect genuinely exists as described or a closely related real defect exists, in which case describe that one. Return real=false if the claim rests on a stylistic preference, on a guideline nuance that does not change what a Mexican ENARM item should key, or on a misreading of the item. When real, give the exact fix in Spanish de Mexico that keeps the item format, and set the severity you judge correct.`
}

function dedupe(findings) {
  const byKey = new Map()
  for (const f of findings) {
    const id = `${f.key}|${f.option}|${f.category}`
    const prev = byKey.get(id)
    if (!prev) { byKey.set(id, f); continue }
    const keep = SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(prev.severity) ? f : prev
    byKey.set(id, { ...keep, lens: `${prev.lens}+${f.lens}`, problem: `${prev.problem} || ${f.problem}` })
  }
  return [...byKey.values()]
}

// A failed verifier keeps its finding with verdict null, so nothing is lost when a limit is hit
async function verifyAll(findings) {
  const toVerify = findings.filter((f) => f.severity !== 'low')
  const low = findings.filter((f) => f.severity === 'low')
  const verdicts = await parallel(toVerify.map((f) => () =>
    agent(verifyPrompt(f), {
      label: `verify:${f.key}${f.option ? '-' + f.option : ''}`,
      phase: 'Verify',
      schema: VERDICT,
      effort: 'high',
    })
  ))
  return { verified: toVerify.map((f, i) => ({ ...f, verdict: verdicts[i] ?? null })), low }
}

let results
if (Array.isArray(args.findings)) {
  phase('Verify')
  results = [await verifyAll(args.findings)]
} else {
  results = await pipeline(
    args.chunks,
    async (chunk) => {
      const reviews = await parallel(LENSES.map((lens) => () =>
        agent(reviewPrompt(lens, chunk), {
          label: `${lens.key}:${chunk.first}`,
          phase: 'Review',
          schema: FINDINGS,
          effort: 'high',
        }).then((r) => (r ? r.findings.map((f) => ({ ...f, lens: lens.key, file: chunk.file })) : null))
      ))
      const failed = reviews.filter((r) => r === null).length
      if (failed > 0) log(`${chunk.first}-${chunk.last}: ${failed} review lens failed, rerun this chunk`)
      return dedupe(reviews.filter(Boolean).flat())
    },
    async (findings, chunk) => {
      const out = await verifyAll(findings)
      log(`${chunk.first}-${chunk.last}: ${out.verified.length} verified, ${out.low.length} low`)
      return out
    },
  )
}

const all = results.filter(Boolean)
const verified = all.flatMap((r) => r.verified)
const confirmed = verified.filter((f) => f.verdict && f.verdict.real)
const refuted = verified.filter((f) => f.verdict && !f.verdict.real)
const pending = verified.filter((f) => !f.verdict)
const low = all.flatMap((r) => r.low)
log(`confirmed ${confirmed.length}, refuted ${refuted.length}, pending ${pending.length}, low ${low.length}`)
return { confirmed, refuted, pending, low }
