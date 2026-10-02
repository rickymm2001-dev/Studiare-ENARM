// Banco de preguntas (pantalla 17). Primera versión (D-070). El médico ve solo las preguntas que un
// admin le asignó. El admin y el dueño ven todo el banco con a quién está asignada cada pregunta.
// El editor con versiones, etiquetas y decisiones llega en la Fase E.
import { useEffect, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { ensureDemoBank } from '@/data/usecases/bank';
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { EmptyState, LoadingState } from '@/ui/states/states';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

export function QuestionBankScreen() {
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const [bankReady, setBankReady] = useState(false);
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setBankReady(true);
    });
  }, [api]);
  const data = useLiveData(async () => {
    const [questions, assignments, users] = await Promise.all([
      api.repos.questions.listLatest(),
      api.repos.reviewAssignments.list(),
      api.repos.users.list(),
    ]);
    return { questions, assignments, users };
  }, [api.repos, bankReady]);

  const header = (
    <ScreenHeader
      title={t.screens.questionBank.title}
      description={role === 'physician' ? t.bank.physicianHint : t.bank.adminHint}
      badges={<DemoContentLabel />}
    />
  );
  // Espera a que el banco termine de guardarse, así las asignaciones lo ven completo
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const aliasOf = new Map(data.users.map((user) => [user.id, user.alias]));
  const assignedTo = new Map<string, string[]>();
  for (const assignment of data.assignments)
    assignedTo.set(assignment.questionId, [
      ...(assignedTo.get(assignment.questionId) ?? []),
      aliasOf.get(assignment.physicianId) ?? '?',
    ]);
  const visible =
    role === 'physician'
      ? data.questions.filter((question) =>
          data.assignments.some(
            (assignment) =>
              assignment.questionId === question.questionId && assignment.physicianId === me,
          ),
        )
      : data.questions;

  if (visible.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={t.bank.emptyTitle} description={t.bank.emptyBody} />
      </>
    );
  }

  return (
    <>
      {header}
      <p className="text-sm text-fg-muted">{t.bank.count(visible.length)}</p>
      {topicTaxonomy.branches.map((branch) => {
        const rows = visible.filter((question) => question.branch === branch.key);
        if (rows.length === 0) return null;
        return (
          <Card key={branch.key} aria-labelledby={`banco-${branch.key}`}>
            <CardHeader>
              <CardTitle id={`banco-${branch.key}`} className="flex items-center gap-2">
                <span
                  className={cn('rounded-full px-2.5 py-0.5 text-sm', toneClasses(branch.key).chip)}
                >
                  {branch.name}
                </span>
                <span className="text-sm font-normal text-fg-muted">{rows.length}</span>
              </CardTitle>
              <CardDescription>{t.bank.branchHint}</CardDescription>
            </CardHeader>
            <ul className="flex flex-col divide-y divide-line">
              {rows.slice(0, 40).map((question) => (
                <li key={question.id} className="flex flex-col gap-1 py-2">
                  <p className="text-sm">{question.prompt}</p>
                  <p className="flex flex-wrap gap-2 text-xs text-fg-muted">
                    <span>{topicName.get(question.topic) ?? question.topic}</span>
                    <span>· {t.bank.difficulty(question.physicianDifficulty)}</span>
                    <span>· {t.bank.status[question.editorialStatus]}</span>
                    {role !== 'physician' ? (
                      <span>
                        ·{' '}
                        {assignedTo.has(question.questionId)
                          ? t.bank.assignedTo(
                              (assignedTo.get(question.questionId) ?? []).join(', '),
                            )
                          : t.bank.unassigned}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
            {rows.length > 40 ? (
              <p className="mt-2 text-xs text-fg-muted">{t.bank.more(rows.length - 40)}</p>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
