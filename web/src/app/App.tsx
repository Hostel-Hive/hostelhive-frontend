import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './router/routes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
