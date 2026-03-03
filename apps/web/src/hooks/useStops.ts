import { useQuery } from '@tanstack/react-query';
import { fetchStops, type StopsQuery } from '../lib/api.js';

export function useStops(query: StopsQuery = {}) {
  const key = JSON.stringify(query);

  return useQuery({
    queryKey: ['stops', key],
    queryFn: () => fetchStops(query),
    placeholderData: prev => prev, // keep old data while refetching
  });
}
