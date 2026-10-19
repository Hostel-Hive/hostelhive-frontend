import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { parseEnvironment } from '../config/env';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-700-italic.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../styles/tokens.css';
import '../styles/globals.css';
import '../styles/ui.css';
import '../styles/auth.css';
import '../styles/students.css';
import '../styles/inventory.css';
import '../styles/leave.css';
import '../styles/late-access.css';

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
