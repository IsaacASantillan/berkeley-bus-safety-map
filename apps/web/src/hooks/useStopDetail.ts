import { useQuery } from '@tanstack/react-query';
import { fetchStopDetail } from '../lib/api.js';

export function useStopDetail(stopId: string | null) {
  return useQuery({
    queryKey: ['stop', stopId],
    queryFn: () => fetchStopDetail(stopId!),
    enabled: stopId !== null,
  });
}
