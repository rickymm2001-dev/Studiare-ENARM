// Administración local de usuarios y asignaciones (D-070). Aplica las mismas reglas que Supabase
// (engines/roles). Con servidor, estas llamadas pasan a set_user_role y a review_assignments.
import { checkRoleChange, type AppRole, type RoleChangeCheck } from '@/engines/roles';
import type { DataApi } from '../context';
import { newId } from '../ids';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos'>;

export async function setLocalUserRole(
  api: Api,
  caller: { id: string | null; role: AppRole },
  target: User,
  next: AppRole,
): Promise<RoleChangeCheck> {
  const check = checkRoleChange({
    caller: caller.role,
    target: target.role,
    next,
    isSelf: caller.id === target.id,
  });
  if (check.ok) await api.repos.users.put({ ...target, role: next });
  return check;
}

/**
 * Deja asignadas a un médico exactamente las preguntas de las subespecialidades elegidas. Quita
 * las que ya no estén y agrega las nuevas
 */
export async function setPhysicianTopics(
  api: Api,
  physicianId: string,
  topics: ReadonlySet<string>,
  assignedBy: string | null,
): Promise<{ added: number; removed: number }> {
  const [questions, assignments] = await Promise.all([
    api.repos.questions.listLatest(),
    api.repos.reviewAssignments.list(),
  ]);
  const wanted = new Set(
    questions.filter((question) => topics.has(question.topic)).map((q) => q.questionId),
  );
  const mine = assignments.filter((assignment) => assignment.physicianId === physicianId);
  const current = new Set(mine.map((assignment) => assignment.questionId));
  const toRemove = mine.filter((assignment) => !wanted.has(assignment.questionId));
  for (const assignment of toRemove) await api.repos.reviewAssignments.remove(assignment.id);
  const now = new Date().toISOString();
  const toAdd = [...wanted]
    .filter((questionId) => !current.has(questionId))
    .map((questionId) => ({ id: newId(), questionId, physicianId, assignedBy, assignedAt: now }));
  await api.repos.reviewAssignments.putMany(toAdd);
  return { added: toAdd.length, removed: toRemove.length };
}
