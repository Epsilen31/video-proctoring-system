import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';

const InterviewPage = lazy(() => import('./features/proctor/InterviewPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));

const App = () => {
  const queryClient = useMemo(() => new QueryClient(), []);

  const router = createBrowserRouter([
    {
      path: '/',
      element: (
        <main className="min-h-screen bg-slate-900 text-slate-100">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
            <header className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold">Focus Proctor</h1>
              <p className="text-sm text-slate-400">
                Real-time focus and object detection for secure video interviews.
              </p>
            </header>
            <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
              <InterviewPage />
            </Suspense>
          </div>
        </main>
      ),
    },
    {
      path: '/report/:sessionId',
      element: (
        <div className="min-h-screen">
          <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading report…</div>}>
            <ReportRouteWrapper />
          </Suspense>
        </div>
      ),
    },
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

export default App;

const ReportRouteWrapper = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return null;
  return <ReportPage sessionId={sessionId} />;
};
