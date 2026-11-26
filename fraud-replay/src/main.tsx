import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/inter'
import './index.css'
import './App.css'
import App from './App.tsx'

let application = <BrowserRouter><App /></BrowserRouter>
if (import.meta.env.DEV) {
  const [, scope, role] = window.location.pathname.split('/')
  if (scope === 'dev' && (role === 'admin' || role === 'analyst' || role === 'viewer')) {
    const DevWorkspace = lazy(() => import('./dev/DevWorkspace'))
    application = <BrowserRouter basename={`/dev/${role}`}>
      <Suspense fallback={null}><DevWorkspace role={role} /></Suspense>
    </BrowserRouter>
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {application}
  </StrictMode>,
)
