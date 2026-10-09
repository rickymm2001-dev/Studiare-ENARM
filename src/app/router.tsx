// Rutas de las pantallas, todas con carga diferida. Las que todavía son esqueleto usan ScreenPlaceholder.
import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './layout/AppShell';
import { InitialLoadingScreen, NotFoundScreen, RouteErrorScreen } from './layout/RouteFallbacks';
import { ScreenPlaceholder } from './layout/ScreenPlaceholder';
import { SCREEN_KEYS, SCREENS, type ScreenKey } from './screens';

/**
 * Pantallas que ya tienen componente propio. Cada una vive en su propio archivo, que el navegador
 * baja al entrar. Así lo que se descarga para pintar la primera pantalla queda bajo el presupuesto
 * de 300 KB comprimidos (14.4) y el panel médico, el de administración y el importador solo pesan
 * cuando se usan. Las demás pantallas muestran el esqueleto
 */
const BUILT_SCREENS: Partial<Record<ScreenKey, () => Promise<ComponentType>>> = {
  onboarding: () =>
    import('@/features/onboarding/OnboardingScreen').then((module) => module.OnboardingScreen),
  home: () => import('@/features/home/HomeScreen').then((module) => module.HomeScreen),
  review: () => import('@/features/review/ReviewScreen').then((module) => module.ReviewScreen),
  question: () =>
    import('@/features/simulator/QuestionScreen').then((module) => module.QuestionScreen),
  feedback: () =>
    import('@/features/simulator/FeedbackScreen').then((module) => module.FeedbackScreen),
  sessionSummary: () =>
    import('@/features/simulator/SessionSummaryScreen').then(
      (module) => module.SessionSummaryScreen,
    ),
  simulatorSetup: () =>
    import('@/features/simulator/SimulatorSetupScreen').then(
      (module) => module.SimulatorSetupScreen,
    ),
  exam: () => import('@/features/exam/ExamScreen').then((module) => module.ExamScreen),
  examResults: () =>
    import('@/features/exam/ExamResultsScreen').then((module) => module.ExamResultsScreen),
  decks: () => import('@/features/decks/DecksScreen').then((module) => module.DecksScreen),
  explore: () => import('@/features/explore/ExploreScreen').then((module) => module.ExploreScreen),
  outlines: () =>
    import('@/features/outlines/OutlinesScreen').then((module) => module.OutlinesScreen),
  planner: () => import('@/features/planner/PlannerScreen').then((module) => module.PlannerScreen),
  tutor: () => import('@/features/tutor/TutorScreen').then((module) => module.TutorScreen),
  subscription: () =>
    import('@/features/billing/SubscriptionScreen').then((module) => module.SubscriptionScreen),
  party: () => import('@/features/party/PartyScreen').then((module) => module.PartyScreen),
  rewards: () => import('@/features/rewards/RewardsScreen').then((module) => module.RewardsScreen),
  profile: () => import('@/features/profile/ProfileScreen').then((module) => module.ProfileScreen),
  progress: () =>
    import('@/features/progress/ProgressScreen').then((module) => module.ProgressScreen),
  settings: () =>
    import('@/features/settings/SettingsScreen').then((module) => module.SettingsScreen),
  adminUsers: () =>
    import('@/features/admin/AdminUsersScreen').then((module) => module.AdminUsersScreen),
  aiCosts: () => import('@/features/admin/AiCostsScreen').then((module) => module.AiCostsScreen),
  demoData: () => import('@/features/admin/DemoDataScreen').then((module) => module.DemoDataScreen),
  adminSettings: () =>
    import('@/features/admin/AdminSettingsScreen').then((module) => module.AdminSettingsScreen),
  questionBank: () =>
    import('@/features/physician/QuestionBankScreen').then((module) => module.QuestionBankScreen),
  agreement: () =>
    import('@/features/physician/AgreementScreen').then((module) => module.AgreementScreen),
  questionEditor: () =>
    import('@/features/physician/QuestionEditorScreen').then(
      (module) => module.QuestionEditorScreen,
    ),
  contentReports: () =>
    import('@/features/physician/ReportsScreen').then((module) => module.ReportsScreen),
  aiDrafts: () =>
    import('@/features/physician/AiDraftsScreen').then((module) => module.AiDraftsScreen),
  bankImport: () =>
    import('@/features/physician/BankImportScreen').then((module) => module.BankImportScreen),
  roleSelector: () =>
    import('@/features/role/RoleSelectorScreen').then((module) => module.RoleSelectorScreen),
};

function routeFor(key: ScreenKey): RouteObject {
  const load = BUILT_SCREENS[key];
  if (!load) return { path: SCREENS[key].path, element: <ScreenPlaceholder screenKey={key} /> };
  return {
    path: SCREENS[key].path,
    lazy: async () => ({ Component: await load() }),
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
