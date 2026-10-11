import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { parseEnvironment } from '../config/env';
import '../styles/globals.css';

parseEnvironment(import.meta.env);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The application root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
