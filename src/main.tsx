import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './ui/App';
import { UiProvider } from './ui/common';
import './ui/styles.css';

// 브라우저가 저장 공간을 임의로 비우지 않도록 요청 (거부될 수 있음 → 백업 안내로 보완)
void navigator.storage?.persist?.().catch(() => false);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <UiProvider>
        <App />
      </UiProvider>
    </HashRouter>
  </React.StrictMode>,
);
