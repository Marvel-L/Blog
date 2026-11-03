import React from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import Anki from '../../blog/src/pages/anki/Anki';
import '../../blog/src/index.css';

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <BrowserRouter>
      <Anki />
    </BrowserRouter>
  </HelmetProvider>,
);
