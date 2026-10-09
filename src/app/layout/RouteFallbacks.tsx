import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { reportClientError } from '@/app/errorReporter';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states/states';
import { ScreenHeader } from './ScreenHeader';

export function NotFoundScreen() {
  return (
    <>
      <ScreenHeader title={t.notFound.title} />
      <EmptyState
        title={t.notFound.title}
        description={t.notFound.description}
        action={
          <Button asChild>
            <Link to="/">{t.notFound.goHome}</Link>
          </Button>
        }
      />
    </>
  );
}

export function RouteErrorScreen() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) reportClientError('render', error);
  }, [error, notFound]);
  if (notFound) {
    return <NotFoundScreen />;
  }
  console.error(error);
  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4 p-4">
      <ScreenHeader title={t.routeError.title} />
      <ErrorState
        description={t.routeError.description}
        onRetry={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}

export function InitialLoadingScreen() {
  return (
    <div className="mx-auto max-w-reading p-4">
      <LoadingState />
    </div>
  );
}
