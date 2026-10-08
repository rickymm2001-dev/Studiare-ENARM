// Rutas de las pantallas. Las que todavía son esqueleto usan ScreenPlaceholder.
import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { SubscriptionScreen } from '@/features/billing/SubscriptionScreen';
import { DecksScreen } from '@/features/decks/DecksScreen';
import { ExploreScreen } from '@/features/explore/ExploreScreen';
import { NotesScreen } from '@/features/notes/NotesScreen';
import { ExamResultsScreen } from '@/features/exam/ExamResultsScreen';
import { ExamScreen } from '@/features/exam/ExamScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { ReviewScreen } from '@/features/review/ReviewScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { PlannerScreen } from '@/features/planner/PlannerScreen';
import { AdminUsersScreen } from '@/features/admin/AdminUsersScreen';
import { PartyScreen } from '@/features/party/PartyScreen';
import { RewardsScreen } from '@/features/rewards/RewardsScreen';
import { QuestionBankScreen } from '@/features/physician/QuestionBankScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { ProgressScreen } from '@/features/progress/ProgressScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { TutorScreen } from '@/features/tutor/TutorScreen';
import { RoleSelectorScreen } from '@/features/role/RoleSelectorScreen';
import { FeedbackScreen } from '@/features/simulator/FeedbackScreen';
import { QuestionScreen } from '@/features/simulator/QuestionScreen';
import { SessionSummaryScreen } from '@/features/simulator/SessionSummaryScreen';
import { SimulatorSetupScreen } from '@/features/simulator/SimulatorSetupScreen';
import { AppShell } from './layout/AppShell';
import { InitialLoadingScreen, NotFoundScreen, RouteErrorScreen } from './layout/RouteFallbacks';
import { ScreenPlaceholder } from './layout/ScreenPlaceholder';
import { SCREEN_KEYS, SCREENS, type ScreenKey } from './screens';

/** Pantallas que ya tienen componente propio. Las demás muestran el esqueleto */
const BUILT_SCREENS: Partial<Record<ScreenKey, ComponentType>> = {
  onboarding: OnboardingScreen,
  home: HomeScreen,
  review: ReviewScreen,
  question: QuestionScreen,
  feedback: FeedbackScreen,
  sessionSummary: SessionSummaryScreen,
  simulatorSetup: SimulatorSetupScreen,
  exam: ExamScreen,
  examResults: ExamResultsScreen,
  decks: DecksScreen,
  explore: ExploreScreen,
  notes: NotesScreen,
  planner: PlannerScreen,
  tutor: TutorScreen,
  subscription: SubscriptionScreen,
  party: PartyScreen,
  rewards: RewardsScreen,
  profile: ProfileScreen,
  progress: ProgressScreen,
  settings: SettingsScreen,
  adminUsers: AdminUsersScreen,
  questionBank: QuestionBankScreen,
  roleSelector: RoleSelectorScreen,
};

function routeFor(key: ScreenKey): RouteObject {
  const Built = BUILT_SCREENS[key];
  return {
    path: SCREENS[key].path,
    element: Built ? <Built /> : <ScreenPlaceholder screenKey={key} />,
  };
}

const keysIn = (area: 'student' | 'physician' | 'admin' | 'shared') =>
  SCREEN_KEYS.filter((key) => SCREENS[key].area === area);

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteErrorScreen,
    HydrateFallback: InitialLoadingScreen,
    children: [
      ...keysIn('student').map(routeFor),
      ...keysIn('shared').map(routeFor),
      {
        path: '/medico',
        lazy: async () => {
          const { PhysicianArea } = await import('@/features/physician/PhysicianArea');
          return { Component: PhysicianArea };
        },
        children: keysIn('physician').map(routeFor),
      },
      {
        path: '/admin',
        lazy: async () => {
          const { AdminArea } = await import('@/features/admin/AdminArea');
          return { Component: AdminArea };
        },
        children: keysIn('admin').map(routeFor),
      },
      { path: '*', Component: NotFoundScreen },
    ],
  },
];

/** Ruta base de la app publicada sin la diagonal final. En local es / */
export const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

export function createAppRouter() {
  return createBrowserRouter(routes, { basename: ROUTER_BASENAME });
}
