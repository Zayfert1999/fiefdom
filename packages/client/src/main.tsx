import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {syncCssVariables} from '@/core/constants.ts'
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './App.css';

syncCssVariables();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary name="App (root)">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
