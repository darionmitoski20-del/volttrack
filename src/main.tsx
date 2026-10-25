import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import { AuthProvider } from '@/features/auth/AuthProvider';
import App from '@/App';
import '@/index.css';

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
