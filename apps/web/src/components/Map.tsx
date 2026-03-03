import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/helpers';
import bboxPolygon from '@turf/bbox';
import difference from '@turf/difference';
import type { StopSummary } from '@bss/shared';
import type { StopsQuery } from '../lib/api.js';
import { SEVERITY_HEX } from '../lib/colors.js';
import { useBoundary } from '../hooks/useBoundary.js';
import { useStops } from '../hooks/useStops.js';

interface MapProps {
  query: StopsQuery;
  onStopClick: (stopId: string) => void;
  onBoundsChange: (bbox: [number, number, number, number]) => void;
}

// Berkeley, CA center
const BERKELEY_CENTER: [number, number] = [-122.2727, 37.8716];
const INITIAL_ZOOM = 14;

// CARTO Positron: clean, light basemap
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export function Map({ query, onStopClick, onBoundsChange }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const { data: boundary } = useBoundary();
  const { data: stopsData } = useStops(query);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: BERKELEY_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    );

    map.on('load', () => {
      // ── Boundary layers (added once on load) ───────────────────────────────
      map.addSource('boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Outside mask (dimmed area)
      map.addSource('boundary-mask', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'boundary-mask-fill',
        type: 'fill',
        source: 'boundary-mask',
        paint: {
          'fill-color': '#1e293b',
          'fill-opacity': 0.18,
        },
      });

      map.addLayer({
        id: 'boundary-outline',
        type: 'line',
        source: 'boundary',
        paint: {
          'line-color': '#6366f1',
          'line-width': 2.5,
          'line-opacity': 0.85,
        },
      });

      // ── Stops source + layers ──────────────────────────────────────────────
      map.addSource('stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
      });

      // Cluster circles
      map.addLayer({
        id: 'stops-cluster',
        type: 'circle',
        source: 'stops',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': [
            'step', ['get', 'point_count'],
            16, 10, 22, 50, 28,
          ],
          'circle-color': '#6366f1',
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      map.addLayer({
        id: 'stops-cluster-count',
        type: 'symbol',
        source: 'stops',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#fff' },
      });

      // Individual stop circles
      map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: 'stops',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 5,
            16, 10,
          ],
          'circle-color': [
            'match', ['get', 'severity_color'],
            'RED',    SEVERITY_HEX.RED,
            'ORANGE', SEVERITY_HEX.ORANGE,
            'YELLOW', SEVERITY_HEX.YELLOW,
            'GREEN',  SEVERITY_HEX.GREEN,
            SEVERITY_HEX.GRAY,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.92,
        },
      });

      // Hover state: larger stroke
      map.addLayer({
        id: 'stops-circle-hover',
        type: 'circle',
        source: 'stops',
        filter: ['==', ['get', 'stop_id'], ''],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 7,
            16, 13,
          ],
          'circle-color': 'transparent',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#1e293b',
        },
      });
    });

    // ── Hover popup ────────────────────────────────────────────────────────────
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });
    popupRef.current = popup;

    map.on('mouseenter', 'stops-circle', e => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0];
      if (!feature) return;

      const props = feature.properties as Record<string, unknown>;
      const name = (props.stop_name as string) || `Stop ${props.stop_id}`;
      const count = props.incident_count_total as number;
      const color = props.severity_color as string;

      const dot = `<span style="
        display:inline-block;width:10px;height:10px;border-radius:50%;
        background:${SEVERITY_HEX[color as keyof typeof SEVERITY_HEX] ?? SEVERITY_HEX.GRAY};
        margin-right:5px;vertical-align:middle;
      "></span>`;

      popup
        .setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<strong>${name}</strong><br/>
           ${dot}${count} incident${count !== 1 ? 's' : ''}`
        )
        .addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setFilter('stops-circle-hover', ['==', ['get', 'stop_id'], props.stop_id] as any);
    });

    map.on('mouseleave', 'stops-circle', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setFilter('stops-circle-hover', ['==', ['get', 'stop_id'], ''] as any);
    });

    // ── Click to open drawer ───────────────────────────────────────────────────
    map.on('click', 'stops-circle', e => {
      const feature = e.features?.[0];
      if (!feature) return;
      const stopId = (feature.properties as Record<string, unknown>).stop_id as string;
      onStopClick(stopId);
    });

    // ── Cluster expand on click ─────────────────────────────────────────────
    map.on('click', 'stops-cluster', async e => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['stops-cluster'] });
      if (!features[0]) return;
      const clusterId = features[0].properties?.cluster_id as number;
      const source = map.getSource('stops') as maplibregl.GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
      });
    });

    // ── Emit bounds on move ─────────────────────────────────────────────────
    const emitBounds = () => {
      const b = map.getBounds();
      onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on('moveend', emitBounds);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update boundary source when data arrives ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundary || !map.isStyleLoaded()) return;

    const boundarySource = map.getSource('boundary') as maplibregl.GeoJSONSource | undefined;
    if (boundarySource) boundarySource.setData(boundary);

    // Build mask polygon: world minus Berkeley
    try {
      const world = turf.polygon([[
        [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
      ]]);

      let mask: GeoJSON.Feature | null = world;
      for (const feature of boundary.features) {
        if (!mask) break;
        // @ts-expect-error turf types are loose
        mask = difference(mask, feature);
      }

      const maskSource = map.getSource('boundary-mask') as maplibregl.GeoJSONSource | undefined;
      if (maskSource && mask) {
        maskSource.setData({ type: 'FeatureCollection', features: [mask] });
      }
    } catch (_) {}
  }, [boundary]);

  // ── Update stops source when data changes ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const stopsSource = map.getSource('stops') as maplibregl.GeoJSONSource | undefined;
    if (!stopsSource) return;

    const stops = stopsData ?? [];
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: stops.map((s: StopSummary) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.stop_lon, s.stop_lat],
        },
        properties: {
          stop_id: s.stop_id,
          stop_name: s.stop_name,
          incident_count_total: s.incident_count_total,
          incident_count_last_12mo: s.incident_count_last_12mo,
          severity_color: s.severity_color,
        },
      })),
    };

    stopsSource.setData(fc);
  }, [stopsData]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
