import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 30,       // 30 s
      retry:              1,
      refetchOnWindowFocus: false,
    },
  },
});
