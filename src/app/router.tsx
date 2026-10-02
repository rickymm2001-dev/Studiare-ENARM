// Rutas de las 26 pantallas. Las que todavía son esqueleto usan ScreenPlaceholder.
import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { SubscriptionScreen } from '@/features/billing/SubscriptionScreen';
import { DecksScreen } from '@/features/decks/DecksScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { ReviewScreen } from '@/features/review/ReviewScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { PartyScreen } from '@/features/party/PartyScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
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
  decks: DecksScreen,
  subscription: SubscriptionScreen,
  party: PartyScreen,
  profile: ProfileScreen,
  settings: SettingsScreen,
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
