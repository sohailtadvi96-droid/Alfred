import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { router } from '@/routes/router';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
            <RouterProvider router={router} />
          </Tooltip.Provider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
