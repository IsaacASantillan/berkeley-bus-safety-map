import { useQuery } from '@tanstack/react-query';
import { fetchBoundary } from '../lib/api.js';

export function useBoundary() {
  return useQuery({
    queryKey: ['boundary'],
    queryFn: fetchBoundary,
    staleTime: Infinity, // boundary never changes
  });
}
