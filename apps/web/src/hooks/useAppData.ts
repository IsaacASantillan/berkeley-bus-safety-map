import { useState, useEffect } from 'react';
import type {
  AppData,
  StopsPayload,
  StopDetailMap,
  DataQuality,
} from '../types/index.js';

const BASE = import.meta.env.BASE_URL ?? '/';
function dataUrl(file: string) {
  return `${BASE}data/${file}`.replace(/\/\//g, '/');
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function useAppData(): AppData {
  const [state, setState] = useState<AppData>({
    stops:       [],
    stopDetails: {},
    quality:     null,
    loading:     true,
    error:       null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [stopsPayload, stopDetails, quality] =
          await Promise.all([
            fetchJSON<StopsPayload>(dataUrl('stops.json')),
            fetchJSON<StopDetailMap>(dataUrl('stop-details.json')),
            fetchJSON<DataQuality>(dataUrl('data-quality.json')).catch(() => null),
          ]);

        if (!cancelled) {
          setState({
            stops:       stopsPayload.stops,
            stopDetails,
            quality,
            loading:     false,
            error:       null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            error:   err instanceof Error ? err.message : String(err),
          }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
