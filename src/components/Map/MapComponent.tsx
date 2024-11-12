import React from "react";
import {
  MapContainer,
  TileLayer,
  LayerGroup,
  LayersControl,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LatLngExpression } from "leaflet";
import BuildingsLayer from "./Layers/BuildingLayer";

interface Layer {
  name: string;
  url: string;
  attribution: string;
  checked?: boolean;
}

interface MapComponentProps {
  center?: LatLngExpression; // Default: [51.505, -0.09]
  zoom?: number; // Default: 13
  style?: React.CSSProperties; // CSS properties for map container
  layers?: Layer[]; // Array of additional layers
  onMapClick?: (latlng: LatLngExpression) => void; // Optional click handler
}

const MapComponent: React.FC<MapComponentProps> = ({
  center = [51.505, -0.09],
  zoom = 13,
  style = { height: "500px", width: "100%" },
  layers = [],
  onMapClick,
}) => {
  // Component to handle map click events and trigger `onMapClick`
  const MapEvents: React.FC = () => {
    useMapEvents({
      click: (e) => {
        if (onMapClick) {
          onMapClick(e.latlng);
        }
      },
    });
    return null;
  };

  return (
    <MapContainer center={center} zoom={zoom} style={style}>
      <LayersControl position="topright">
        {/* Default OSM Tile Layer */}
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        </LayersControl.BaseLayer>

        {/* Additional Layers from Props */}
        {layers.map((layer, index) => (
          <LayersControl.Overlay
            key={index}
            checked={layer.checked}
            name={layer.name}
          >
            <LayerGroup>
              <TileLayer url={layer.url} attribution={layer.attribution} />
            </LayerGroup>
          </LayersControl.Overlay>
        ))}
        <LayersControl.Overlay checked name="Buildings">
          <BuildingsLayer style={{ color: "blue", weight: 1, opacity: 0.5 }} />
        </LayersControl.Overlay>
      </LayersControl>

      <MapEvents />
    </MapContainer>
  );
};

export default MapComponent;
