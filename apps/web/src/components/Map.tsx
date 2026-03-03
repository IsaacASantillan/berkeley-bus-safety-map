import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { StopSummary, CollisionRecord } from '../types/index.js';
import { SEVERITY_HEX, getCollisionSeverityColor } from '../lib/colorPalette.js';

interface MapProps {
  stops:              StopSummary[];
  onStopClick:        (stopId: string) => void;
  selectedStopId:     string | null;
  selectedCollisions: CollisionRecord[];
}

const BERKELEY_CENTER: [number, number] = [-122.2727, 37.8716];
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

function buildStopsGeoJSON(stops: StopSummary[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stops.map(s => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: {
        stop_id:            s.stop_id,
        stop_name:          s.stop_name,
        collision_count:    s.collision_count,
        collision_severity: s.collision_severity,
        route:              s.route,
        zip:                s.zip ?? '',
      },
    })),
  };
}

function buildCollisionDotsGeoJSON(collisions: CollisionRecord[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: collisions.map(c => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: {
        collision_id: c.id,
        category:     c.category,
        severity:     c.severity,
        datetime:     c.datetime ?? '',
        dot_color:    getCollisionSeverityColor(c.severity),
      },
    })),
  };
}

export function Map({
  stops, onStopClick, selectedStopId, selectedCollisions,
}: MapProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const stopsRef        = useRef(stops);
  const stopPopRef      = useRef<maplibregl.Popup | null>(null);
  const collisionPopRef = useRef<maplibregl.Popup | null>(null);

  stopsRef.current = stops;

  // ── One-time map init ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLE,
      center:    BERKELEY_CENTER,
      zoom:      13.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    const stopPop = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 12,
    });
    stopPopRef.current = stopPop;

    const collisionPop = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 10,
    });
    collisionPopRef.current = collisionPop;

    map.on('load', () => {
      // ── Bus stops ────────────────────────────────────────────────────────
      map.addSource('stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius:  40,
      });
      map.addLayer({ id: 'stops-cluster', type: 'circle', source: 'stops',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
          'circle-color': '#6366f1', 'circle-opacity': 0.85,
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff',
        } });
      map.addLayer({ id: 'stops-cluster-count', type: 'symbol', source: 'stops',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'stops-circle', type: 'circle', source: 'stops',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 17, 11],
          'circle-color': ['match', ['get', 'collision_severity'],
            'RED',    SEVERITY_HEX.RED,
            'ORANGE', SEVERITY_HEX.ORANGE,
            'YELLOW', SEVERITY_HEX.YELLOW,
            'GREEN',  SEVERITY_HEX.GREEN,
            SEVERITY_HEX.GRAY],
          'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
          'circle-opacity': 0.93,
        } });
      map.addLayer({ id: 'stops-selected', type: 'circle', source: 'stops',
        filter: ['==', ['get', 'stop_id'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 17, 15],
          'circle-color': 'transparent',
          'circle-stroke-width': 3.5, 'circle-stroke-color': '#1e293b',
        } });

      // ── Collision dots (shown when a stop is selected) ────────────────
      map.addSource('collision-dots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({ id: 'collision-dots-circle', type: 'circle',
        source: 'collision-dots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 19, 10],
          'circle-color':  ['get', 'dot_color'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        } });

      // Seed initial data
      (map.getSource('stops') as maplibregl.GeoJSONSource)
        .setData(buildStopsGeoJSON(stopsRef.current));
    });

    // ── Stop hover popup ──────────────────────────────────────────────────
    map.on('mouseenter', 'stops-circle', e => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as Record<string, unknown>;
      const sev = p.collision_severity as string;
      stopPop
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<strong>${p.stop_name}</strong><br/>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
            background:${SEVERITY_HEX[sev] ?? SEVERITY_HEX.GRAY};margin-right:4px;vertical-align:middle;"></span>
          ${p.collision_count} collision${Number(p.collision_count) !== 1 ? 's' : ''} nearby`)
        .addTo(map);
    });
    map.on('mouseleave', 'stops-circle', () => {
      map.getCanvas().style.cursor = '';
      stopPop.remove();
    });

    // ── Collision dot hover popup ─────────────────────────────────────────
    map.on('mouseenter', 'collision-dots-circle', e => {
      map.getCanvas().style.cursor = 'default';
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as Record<string, unknown>;
      const dateStr = p.datetime
        ? new Date(p.datetime as string).toLocaleDateString('en-US',
            { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      const dotColor = p.dot_color as string;
      collisionPop
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div style="font-size:12px;max-width:180px;">
          <div style="font-weight:700;margin-bottom:3px;">${p.category}</div>
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
            <span style="color:#64748b;">${p.severity || 'No injury'}</span>
          </div>
          <div style="color:#94a3b8;margin-top:3px;">${dateStr}</div>
        </div>`)
        .addTo(map);
    });
    map.on('mouseleave', 'collision-dots-circle', () => {
      map.getCanvas().style.cursor = '';
      collisionPop.remove();
    });

    // ── Click handlers ────────────────────────────────────────────────────
    map.on('click', 'stops-circle', e => {
      const f = e.features?.[0];
      if (!f) return;
      stopPop.remove();
      onStopClick((f.properties as Record<string, unknown>).stop_id as string);
    });

    map.on('click', 'stops-cluster', async e => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['stops-cluster'] });
      if (!features[0]) return;
      const cid = features[0].properties?.cluster_id as number;
      const src = map.getSource('stops') as maplibregl.GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(cid);
      map.easeTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reactive updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      (map.getSource('stops') as maplibregl.GeoJSONSource | undefined)
        ?.setData(buildStopsGeoJSON(stops));
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = () => map.setFilter('stops-selected',
      ['==', ['get', 'stop_id'], selectedStopId ?? ''] as any);
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      (map.getSource('collision-dots') as maplibregl.GeoJSONSource | undefined)
        ?.setData(buildCollisionDotsGeoJSON(selectedCollisions));
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [selectedCollisions]);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
  );
}
