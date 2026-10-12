import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './router/routes';
import AuthProvider from '../features/auth/components/AuthProvider';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
