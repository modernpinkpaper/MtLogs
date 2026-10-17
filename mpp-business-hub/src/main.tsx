import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { HubServer } from './server/hub';
import { HubProvider } from './ui/hubContext';
import { App } from './ui/App';

// The prototype runs entirely in this browser tab with synthetic data. No network, no Firebase, no API keys.
HubServer.create({ persist: true }).then((hub) => {
  (window as unknown as { __hub: HubServer }).__hub = hub; // handy for demos/debugging in the console
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HubProvider hub={hub}>
        <App />
      </HubProvider>
    </StrictMode>,
  );
});
