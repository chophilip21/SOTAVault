import 'leaflet';
import '@maplibre/maplibre-gl-leaflet';

declare module 'leaflet' {
  interface LeafletMaplibreGLOptions {
    style?: string | object;
    attribution?: string;
    noWrap?: boolean;
    padding?: number;
    pane?: string;
  }

  function maplibreGL(options?: LeafletMaplibreGLOptions, paneOptions?: any): MaplibreGL;

  class MaplibreGL extends Layer {
    getMaplibreMap(): any;
    options: LeafletMaplibreGLOptions;
  }
}


