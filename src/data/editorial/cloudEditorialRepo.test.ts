// Versión de la nube del repositorio editorial (B11, 5.7 del plan de B11). Llama las funciones editor_*
// con los nombres y los parámetros del contrato, deja las opciones nuevas sin id, convierte un ULID de
// la app a uuid, valida las respuestas y traduce cada código de error de 2.6.
import { describe, expect, it, vi } from 'vitest';
import { ulidToUuid } from '../cloud/cloudIds';
import { emptyOption, type QuestionDraft } from '@/features/physician/editorDraft';
import { cloudIdOf, createCloudEditorialRepo, draftForCloud } from './cloudEditorialRepo';
import { EditorialError } from './editorialRepo';

const UUID = '01234567-89ab-4cde-8f01-23456789abcd';
const OTHER = '0abcdef0-1234-4567-89ab-cdef01234567';
const ULID = '01HZY3Q5W8V2N4K6M8P0R2T4V6';

function fakeRpc(reply: (name: string, args: Record<string, unknown>) => unknown) {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    calls.push([name, args]);
    const value = reply(name, args);
    return Promise.resolve(
      value instanceof Error
        ? { data: null, error: { code: value.message, message: 'error', details: 'detalle' } }
        : { data: value, error: null },
    );
  });
  return { cloud: { rpc } as never, calls };
}

const draft = (): QuestionDraft => ({
  vignette: '[Prueba] Caso',
  prompt: '[Prueba] ¿Pregunta?',
  branch: 'internal_medicine',
  topic: 'cardiology',
  subtopic: 'hypertension',
  structure: { polarity: 'affirmative', task: 'diagnosis', format: 'clinical_case' },
  explanation: '[Prueba] Explicación',
  gpcRefs: [{ title: '[Prueba] GPC', status: 'to_verify' }],
  physicianDifficulty: 3,
  itemKinds: [],
  clues: [],
  options: [
    {
      optionId: UUID,
      text: 'A',
      isCorrect: true,
      biasTag: 'anchoring',
      secondaryBiasTags: [],
      rationale: 'r',
      canonical: true,
    },
    { ...emptyOption(), text: 'B', biasTag: 'anchoring', canonical: true },
  ],
});

describe('repositorio editorial de la nube', () => {
  it('las opciones nuevas viajan sin id y la correcta sin etiqueta', () => {
    const sent = draftForCloud(draft());
    const options = sent.options as { optionId: string | null; biasTag: string | null }[];
    expect(options[0]).toMatchObject({ optionId: UUID, biasTag: null });
    expect(options[1]?.optionId).toBeNull();
    expect(options[1]?.biasTag).toBe('anchoring');
  });

  it('acepta ids de la nube y ULID de la app y rechaza lo demás', () => {
    expect(cloudIdOf(UUID.toUpperCase())).toBe(UUID);
    expect(cloudIdOf(ULID)).toBe(ulidToUuid(ULID));
    expect(cloudIdOf('no-es-id')).toBeNull();
  });

  it('llama cada función con sus parámetros del contrato', async () => {
    const { cloud, calls } = fakeRpc((name) => {
      switch (name) {
        case 'editor_list':
          return { total: 0, items: [] };
        case 'editor_save_version':
        case 'editor_create_question':
          return {
            status: 'saved',
            questionId: UUID,
            versionId: OTHER,
            version: 2,
            incomplete: [],
          };
        case 'editor_submit':
          return { status: 'in_review', versionId: OTHER, reviewerId: UUID };
        case 'editor_label_option':
          return { done: 1, total: 3, revealed: false };
        case 'editor_decide':
          return { status: 'approved', published: true, waitingCase: false };
        case 'editor_set_report_status':
          return 2;
        case 'editor_distractor_queue':
          return [];
        case 'editor_label_pairs':
          return [
            {
              option_id: UUID,
              author_tag: 'anchoring',
              reviewer_tag: 'framing_effect',
              labeled_at: '2026-10-14T10:00:00.000Z',
            },
          ];
        case 'editor_my_reviews':
          return {
            from: '2026-10-01',
            to: '2026-10-14',
            approved: 1,
            changesRequested: 0,
            rejected: 0,
            reviewed: 1,
            distractorsResolved: 0,
          };
        default:
          return 'ok';
      }
    });
    const repo = createCloudEditorialRepo(cloud);
    expect(repo.kind).toBe('cloud');
    await repo.list({ view: 'to_review', branch: '' }, { limit: 25, offset: 50 });
    await repo.saveVersion(UUID, ULID, draft());
    await repo.createQuestion(draft(), ULID);
    await repo.submit(OTHER);
    await repo.label(OTHER, UUID, 'anchoring');
    await repo.decide(OTHER, 'request_changes', '  Revisa la clave  ', ['topic_inferred']);
    await repo.setReportsStatus([UUID], 'resolved');
    await repo.distractorQueue('open');
    await repo.resolveDistractor(UUID, 'kept', ' ');
    const pairs = await repo.labelPairs();
    await repo.myReviews('2026-10-01', '2026-10-14');
    await repo.resolveSyncConflict(UUID, 'take_sheet');

    expect(calls.map(([name]) => name)).toEqual([
      'editor_list',
      'editor_save_version',
      'editor_create_question',
      'editor_submit',
      'editor_label_option',
      'editor_decide',
      'editor_set_report_status',
      'editor_distractor_queue',
      'editor_resolve_distractor',
      'editor_label_pairs',
      'editor_my_reviews',
      'editor_resolve_sync_conflict',
    ]);
    expect(calls[0]?.[1]).toEqual({ p_filter: { view: 'to_review' }, p_limit: 25, p_offset: 50 });
    expect(calls[1]?.[1]).toMatchObject({
      p_question_id: UUID,
      p_base_version_id: ulidToUuid(ULID),
    });
    expect(calls[2]?.[1]).toMatchObject({ p_variant_of: ulidToUuid(ULID) });
    expect(calls[4]?.[1]).toEqual({ p_version_id: OTHER, p_option_id: UUID, p_tag: 'anchoring' });
    expect(calls[5]?.[1]).toEqual({
      p_version_id: OTHER,
      p_decision: 'request_changes',
      p_comment: 'Revisa la clave',
      p_checks: ['topic_inferred'],
    });
    expect(calls[8]?.[1]).toEqual({ p_flag_id: UUID, p_resolution: 'kept', p_note: null });
    expect(pairs).toEqual([
      {
        optionId: UUID,
        authorTag: 'anchoring',
        reviewerTag: 'framing_effect',
        labeledAt: '2026-10-14T10:00:00.000Z',
      },
    ]);
  });

  it('traduce los códigos de la base y avisa del 42501 para pedir el segundo factor', async () => {
    const codes: [string, string][] = [
      ['BK002', 'stale'],
      ['BK003', 'same_author_reviewer'],
      ['BK004', 'blind_labels'],
      ['BK005', 'incomplete'],
      ['BK007', 'not_assigned'],
      ['BK008', 'flags_unconfirmed'],
      ['22023', 'invalid'],
      ['28000', 'no_session'],
      ['42501', 'forbidden'],
    ];
    for (const [sqlState, code] of codes) {
      const onForbidden = vi.fn();
      const { cloud } = fakeRpc(() => new Error(sqlState));
      const error = await createCloudEditorialRepo(cloud, { onForbidden })
        .decide(OTHER, 'approve', '', [])
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EditorialError);
      expect((error as EditorialError).code).toBe(code);
      expect(onForbidden).toHaveBeenCalledTimes(code === 'forbidden' ? 1 : 0);
    }
  });

  it('una respuesta con otra forma o sin red no pasa como buena', async () => {
    const { cloud } = fakeRpc(() => ({ total: 'muchas' }));
    await expect(
      createCloudEditorialRepo(cloud).list({}, { limit: 1, offset: 0 }),
    ).rejects.toMatchObject({ code: 'unknown' });
    const offline = { rpc: () => Promise.reject(new Error('Failed to fetch')) } as never;
    await expect(
      createCloudEditorialRepo(offline).list({}, { limit: 1, offset: 0 }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('un id que no es de la nube ni de la app no llega a la base', async () => {
    const { cloud, calls } = fakeRpc(() => ({}));
    await expect(createCloudEditorialRepo(cloud).question('no-es-id')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(calls).toHaveLength(0);
  });

  it('los reportes traen lo que se muestra de cada pregunta desde editor_list', async () => {
    const { cloud, calls } = fakeRpc((name) =>
      name === 'editor_reports'
        ? [
            {
              id: OTHER,
              questionId: UUID,
              questionKey: 'GO-0012',
              versionId: OTHER,
              version: 1,
              reason: 'typo',
              status: 'open',
              createdAt: '2026-10-14T10:00:00.000Z',
              resolvedAt: null,
            },
          ]
        : {
            total: 1,
            items: [
              {
                questionId: UUID,
                sourceKey: 'sheet:GO-0012',
                latestVersionId: OTHER,
                version: 2,
                status: 'draft',
                publishedVersion: null,
                branch: 'internal_medicine',
                topic: 'cardiology',
                subtopic: 'hypertension',
                difficulty: 3,
                promptPreview: '[Prueba] ¿Pregunta?',
                author: null,
                reviewer: { id: UUID, alias: 'Ana', code: 'AN' },
                myRole: 'reviewer',
                reviewState: 'none',
                incomplete: [],
                flags: [],
                openReports: 1,
                openDistractorFlags: 0,
                conflict: false,
                missing: false,
                retireRequested: false,
                retired: false,
                updatedAt: '2026-10-14T10:00:00.000Z',
              },
            ],
          },
    );
    const reports = await createCloudEditorialRepo(cloud).reports();
    expect(calls[0]).toEqual(['editor_reports', { p_status: 'all', p_limit: 500, p_offset: 0 }]);
    expect(reports.questions).toEqual([
      {
        questionId: UUID,
        questionKey: 'GO-0012',
        promptPreview: '[Prueba] ¿Pregunta?',
        branch: 'internal_medicine',
        topic: 'cardiology',
        latestVersion: 2,
      },
    ]);
  });
});
