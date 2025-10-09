// Disable Mapbox telemetry as early as possible to prevent events.mapbox.com requests
// This must run before any Mapbox instances are created

if (typeof window !== 'undefined') {
  // Method 1: Environment variable (most reliable for Mapbox GL JS 3.5.1)
  (window as any).__MAPBOX_TELEMETRY__ = false;
  
  // Method 2: API call with version-safe guard (fallback)
  try {
    // Import mapboxgl dynamically to avoid circular dependencies
    import('mapbox-gl').then((mapboxgl) => {
      if (mapboxgl.default && typeof (mapboxgl.default as any).setTelemetry === 'function') {
        (mapboxgl.default as any).setTelemetry(false);
      }
    }).catch(() => {
      // Silently fail if mapbox-gl is not available yet
    });
  } catch (error) {
    // Silently fail if import fails
  }
}
