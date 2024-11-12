import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import * as L from "leaflet";
import osmtogeojson from "osmtogeojson";
import { useMap, GeoJSON, ImageOverlay, useMapEvent } from "react-leaflet";
import _ from "lodash";
import "leaflet/dist/leaflet.css";
import type * as geojson from "geojson";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

interface BuildingsLayerProps {
  style?: L.PathOptions;
}

interface FloorMapState {
  url: string;
  bounds: L.LatLngBounds;
  scale: number;
  rotation: number;
}

// Custom wrapper component for rotated image overlay
const RotatedImageOverlay: React.FC<{
  url: string;
  bounds: L.LatLngBounds;
  rotation: number;
}> = ({ url, bounds, rotation }) => {
  const map = useMap();
  const imageRef = React.useRef<L.ImageOverlay>(null);

  useEffect(() => {
    if (imageRef.current) {
      const element = imageRef.current.getElement();
      if (element) {
        element.style.transform = `rotate(${rotation}deg)`;
        element.style.transformOrigin = "center center";
      }
    }
  }, [rotation]);

  // Update transform origin when map moves
  useMapEvent("move", () => {
    if (imageRef.current) {
      const element = imageRef.current.getElement();
      if (element) {
        const center = bounds.getCenter();
        const point = map.latLngToContainerPoint(center);
        element.style.transformOrigin = `${point.x}px ${point.y}px`;
      }
    }
  });

  return <ImageOverlay ref={imageRef} url={url} bounds={bounds} zIndex={400} />;
};

const BuildingsLayer: React.FC<BuildingsLayerProps> = ({ style }) => {
  const map = useMap();
  const [geojsonData, setGeojsonData] = useState<geojson.GeoJsonObject | null>(
    null
  );
  const selectedBuildingRef = useRef<L.Layer | null>(null);
  const [floorMap, setFloorMap] = useState<FloorMapState | null>(null);
  const [showControls, setShowControls] = useState(false);

  const fetchBuildingData = async () => {
    if (map.getZoom() < 15) {
      setGeojsonData(null);
      return;
    }

    const bounds = map.getBounds();
    const [south, west] = [bounds.getSouth(), bounds.getWest()];
    const [north, east] = [bounds.getNorth(), bounds.getEast()];

    const query = `
      [out:json][timeout:25];
      (
        way["building"]["building"~"^(residential|commercial|office|retail)$"](${south},${west},${north},${east});
      );
      out body 500;
      >;
      out skel qt;
    `;

    try {
      const response = await axios.post(
        "https://overpass-api.de/api/interpreter",
        `data=${encodeURIComponent(query)}`,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const geoJson = osmtogeojson(response.data);
      setGeojsonData(geoJson as geojson.GeoJsonObject);
    } catch (error) {
      console.error("Error fetching building data:", error);
    }
  };

  const debouncedFetchBuildingData = useCallback(
    _.debounce(fetchBuildingData, 500),
    [map]
  );

  useEffect(() => {
    fetchBuildingData();
    map.on("moveend", debouncedFetchBuildingData);

    return () => {
      map.off("moveend", debouncedFetchBuildingData);
    };
  }, [map, debouncedFetchBuildingData]);

  const handleFileUpload = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const currentSelectedBuilding = selectedBuildingRef.current;

    if (input.files && input.files[0] && currentSelectedBuilding) {
      const file = input.files[0];
      const imageUrl = URL.createObjectURL(file);
      const bounds = (
        currentSelectedBuilding as L.Layer & { getBounds(): L.LatLngBounds }
      ).getBounds();

      setFloorMap({
        url: imageUrl,
        bounds,
        scale: 1,
        rotation: 0,
      });
      setShowControls(true);

      (
        currentSelectedBuilding as L.Layer & { closePopup(): void }
      ).closePopup();
    }
  }, []);

  const handleBuildingClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const layer = e.target;
      selectedBuildingRef.current = layer;

      const popupContent = `
      <div class="p-4">
        <input type="file" accept="image/*" id="floor-map-input" class="mb-2" />
      </div>
    `;

      layer.bindPopup(popupContent).openPopup();

      // Remove any existing event listener before adding a new one
      const existingInput = document.getElementById("floor-map-input");
      if (existingInput) {
        existingInput.removeEventListener("change", handleFileUpload);
      }

      // Add new event listener
      setTimeout(() => {
        const fileInput = document.getElementById("floor-map-input");
        if (fileInput) {
          fileInput.addEventListener("change", handleFileUpload);
        }
      }, 0);
    },
    [handleFileUpload]
  );

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (floorMap) {
      const scale = parseFloat(e.target.value);
      setFloorMap((prev) => {
        if (!prev) return null;
        const center = prev.bounds.getCenter();
        const originalBounds = (
          selectedBuildingRef.current as L.Layer & {
            getBounds(): L.LatLngBounds;
          }
        ).getBounds();
        const width = originalBounds.getEast() - originalBounds.getWest();
        const height = originalBounds.getNorth() - originalBounds.getSouth();

        const newBounds = L.latLngBounds(
          [center.lat - (height * scale) / 2, center.lng - (width * scale) / 2],
          [center.lat + (height * scale) / 2, center.lng + (width * scale) / 2]
        );

        return { ...prev, bounds: newBounds, scale };
      });
    }
  };

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (floorMap) {
      const rotation = parseInt(e.target.value);
      setFloorMap((prev) => (prev ? { ...prev, rotation } : null));
    }
  };

  // Cleanup URL when component unmounts or floor map is removed
  useEffect(() => {
    return () => {
      if (floorMap?.url) {
        URL.revokeObjectURL(floorMap.url);
      }
    };
  }, [floorMap?.url]);

  return (
    <>
      {geojsonData && (
        <GeoJSON
          data={geojsonData}
          style={style}
          onEachFeature={(_, layer) => {
            layer.on("click", handleBuildingClick);
          }}
        />
      )}

      {floorMap && (
        <>
          <RotatedImageOverlay
            url={floorMap.url}
            bounds={floorMap.bounds}
            rotation={floorMap.rotation}
          />

          {showControls && (
            <div className="absolute top-4 right-4 bg-white p-4 rounded shadow-lg z-50">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Scale
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={floorMap.scale}
                    onChange={handleScaleChange}
                    className="w-full mt-1"
                  />
                </label>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Rotation
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={floorMap.rotation}
                    onChange={handleRotationChange}
                    className="w-full mt-1"
                  />
                </label>
              </div>

              <button
                onClick={() => {
                  if (floorMap?.url) {
                    URL.revokeObjectURL(floorMap.url);
                  }
                  setFloorMap(null);
                  setShowControls(false);
                }}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Remove Floor Map
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default BuildingsLayer;
