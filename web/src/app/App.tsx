import { useEffect, useRef, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppRoutes from './router/routes';
import AuthProvider from '../features/auth/components/AuthProvider';

export default function App() {
  const [router] = useState(() =>
    createBrowserRouter([
      {
        path: '*',
        element: (
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        ),
      },
    ]),
  );
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Allow StrictMode's effect replay before disposing history listeners.
      queueMicrotask(() => {
        if (!mounted.current) router.dispose();
      });
    };
  }, [router]);
  return <RouterProvider router={router} />;
}
