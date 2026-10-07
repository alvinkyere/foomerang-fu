import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShellHarness } from './ShellHarness';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <ShellHarness />
  </StrictMode>,
);
