// Disable Mapbox telemetry in dev only to prevent events.mapbox.com noise
// This must run before any Mapbox instances are created

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Method 1: Set all known global flags that Mapbox checks
  (window as any).__MAPBOX_TELEMETRY__ = false;
  (window as any).__MAPBOX_DISABLE_TELEMETRY__ = true;
  
  // Also set on self for additional coverage
  if (typeof (globalThis as any).__MAPBOX_TELEMETRY__ !== 'undefined') {
    (globalThis as any).__MAPBOX_TELEMETRY__ = false;
  }
  if (typeof (globalThis as any).__MAPBOX_DISABLE_TELEMETRY__ !== 'undefined') {
    (globalThis as any).__MAPBOX_DISABLE_TELEMETRY__ = true;
  }
  
  // Method 2: API call with version-safe guard (fallback)
  try {
    // Import mapboxgl dynamically to avoid circular dependencies
    import('mapbox-gl').then((mapboxgl) => {
      if (mapboxgl.default) {
        const mapbox = mapboxgl.default as any;
        
        // Try multiple possible telemetry disable methods
        if (typeof mapbox.setTelemetry === 'function') {
          mapbox.setTelemetry(false);
        } else if (typeof mapbox.setTelemetryEnabled === 'function') {
          mapbox.setTelemetryEnabled(false);
        } else if (typeof mapbox.disableTelemetry === 'function') {
          mapbox.disableTelemetry();
        }
      }
    }).catch(() => {
      // Silently fail if mapbox-gl is not available yet
    });
  } catch (error) {
    // Silently fail if import fails
  }
}
