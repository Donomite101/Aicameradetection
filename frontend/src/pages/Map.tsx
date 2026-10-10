'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';
import { Building2, AlertTriangle, Wifi, WifiOff, Search, Filter, MapPin, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { dashboardApi } from '@/services/api';
import type { CentreMapData } from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import L from 'leaflet';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const statusColors: Record<string, string> = {
  ACTIVE: '#22c55e',
  INACTIVE: '#ef4444',
  SUSPENDED: '#f59e0b',
  PENDING_VERIFICATION: '#6b7280',
};

function MapComponent({
  centres,
  selectedCentre,
  onCentreClick,
}: {
  centres: CentreMapData[];
  selectedCentre: CentreMapData | null;
  onCentreClick: (centre: CentreMapData) => void;
}) {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<L.Map | null>(null);
  const markersGroupRef = React.useRef<L.LayerGroup | null>(null);

  // Initialize Map
  React.useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersGroupRef.current = null;
      }
    };
  }, []);

  // Update Markers
  React.useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;
    markersGroupRef.current.clearLayers();

    centres.forEach((centre) => {
      if (!centre.position || !Array.isArray(centre.position) || centre.position.length !== 2) return;
      const [lat, lng] = centre.position;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const color = statusColors[centre.status] || '#6b7280';
      const hasAlerts = (centre.openAlerts ?? 0) > 0;

      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="background: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); position: relative; cursor: pointer;">
            <span style="font-size: 15px;">🏢</span>
            ${hasAlerts ? `<div style="position: absolute; top: -5px; right: -5px; height: 18px; min-width: 18px; border-radius: 9px; background: #ef4444; color: white; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; padding: 0 4px; border: 1px solid white;">${centre.openAlerts}</div>` : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: inherit; min-width: 180px; padding: 4px;">
          <h3 style="font-weight: 600; font-size: 14px; margin: 0 0 2px 0;">${centre.name}</h3>
          <p style="font-size: 12px; color: #64748b; margin: 0 0 8px 0;">${centre.code}</p>
          <div style="font-size: 12px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>Cameras:</span>
            <strong>${centre.cameraCount ?? 0}</strong>
          </div>
          <div style="font-size: 12px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>Status:</span>
            <span style="font-weight: 600; color: ${color};">${centre.status}</span>
          </div>
          <div style="font-size: 12px; display: flex; justify-content: space-between;">
            <span>Capacity:</span>
            <strong>${centre.capacity ?? 0}</strong>
          </div>
        </div>
      `);

      marker.on('click', () => {
        onCentreClick(centre);
      });

      marker.addTo(markersGroupRef.current!);
    });

    if (selectedCentre && Array.isArray(selectedCentre.position) && selectedCentre.position.length === 2) {
      mapInstanceRef.current.setView(selectedCentre.position as [number, number], 12, { animate: true });
    }
  }, [centres, selectedCentre, onCentreClick]);

  return (
    <div
      ref={mapContainerRef}
      style={{ height: '600px', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}
    />
  );
}

export function MapPage() {
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [selectedCentre, setSelectedCentre] = React.useState<CentreMapData | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['centres', 'map', { status: statusFilter }],
    queryFn: () => dashboardApi.centresMap({ status: statusFilter as any }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Centre Map View</h1>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
        <Card><CardContent className="p-6 h-[600px]"><div className="animate-pulse h-full bg-muted rounded"/></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Centre Map View</h1>
        <Card className="text-center py-12">
          <p className="text-destructive">Failed to load map data</p>
          <Button onClick={() => refetch()} className="mt-4">Retry</Button>
        </Card>
      </div>
    );
  }

  const centres = (Array.isArray(data) ? data : (data as any)?.data) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Centre Map View</h1>
          <p className="text-muted-foreground">Visualize training centres across India</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Map */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Training Centres Map</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <MapComponent
              centres={centres}
              selectedCentre={selectedCentre}
              onCentreClick={setSelectedCentre}
            />
          </CardContent>
        </Card>

        {/* Centre List / Details */}
        <Card>
          <CardHeader>
            <CardTitle>Centres ({centres.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {selectedCentre ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{selectedCentre.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedCentre.code}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedCentre(null)}>
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={selectedCentre.status === 'ACTIVE' ? 'success' : selectedCentre.status === 'INACTIVE' ? 'destructive' : 'secondary'}>
                      {selectedCentre.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cameras</p>
                    <p className="font-medium">{selectedCentre.cameraCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Capacity</p>
                    <p className="font-medium">{selectedCentre.capacity}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Open Alerts</p>
                    <Badge variant={selectedCentre.openAlerts > 0 ? 'destructive' : 'secondary'}>
                      {selectedCentre.openAlerts}
                    </Badge>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Click on a centre marker to view details</p>
                </div>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <ul className="divide-y" role="list">
                  {centres.map((centre) => (
                    <li key={centre.id}>
                      <button
                        onClick={() => setSelectedCentre(centre)}
                        className={cn(
                          'w-full p-4 text-left hover:bg-accent transition-colors flex items-center gap-3',
                          selectedCentre?.id === centre.id && 'bg-accent'
                        )}
                      >
                        <div className={cn('h-10 w-10 rounded-full flex items-center justify-center', 
                          statusColors[centre.status] ? `bg-[${statusColors[centre.status]}]/10` : 'bg-muted'
                        )}>
                          <Building2 className="h-5 w-5" style={{ color: statusColors[centre.status] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{centre.name}</p>
                          <p className="text-xs text-muted-foreground">{centre.code}</p>
                        </div>
                        <Badge variant={centre.openAlerts > 0 ? 'destructive' : 'secondary'} className="text-xs">
                          {centre.openAlerts}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">Status:</span>
            {Object.entries(statusColors).map(([status, color]) => (
              <span key={status} className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize">{status.toLowerCase().replace('_', ' ')}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}