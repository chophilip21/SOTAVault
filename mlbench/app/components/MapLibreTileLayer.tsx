import {
    type LayerProps,
    createElementObject,
    createTileLayerComponent,
    updateGridLayer,
    withPane,
} from '@react-leaflet/core'

import L from 'leaflet'
import '@maplibre/maplibre-gl-leaflet'

export interface MapLibreTileLayerProps extends L.LeafletMaplibreGLOptions, LayerProps {
    url: string,
    attribution: string,
}

export const MapLibreTileLayer = createTileLayerComponent<
    L.MaplibreGL,
    MapLibreTileLayerProps
>(
    function createTileLayer({ url, attribution, ...options }, context) {
        // maplibreGL() options are MapLibre GL map options (not Leaflet layer options),
        // so `attribution` is not part of its typed options. We set it on the Leaflet
        // layer after creation.
        const layer = L.maplibreGL({ style: url }, withPane(options, context))
        ;(layer as any).options = (layer as any).options ?? {}
        ;(layer as any).options.attribution = attribution
        ;(layer as any).options.noWrap = true
        return createElementObject(layer, context)
    },
    function updateTileLayer(layer, props, prevProps) {
        updateGridLayer(layer as any, props as any, prevProps as any)
        const { url, attribution } = props
        if (url != null && url !== prevProps.url) {
            layer.getMaplibreMap().setStyle(url)
        }
        if (attribution != null && attribution !== prevProps.attribution) {
            ;(layer as any).options = (layer as any).options ?? {}
            ;(layer as any).options.attribution = attribution
        }
    },
)











