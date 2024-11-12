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
  masked: boolean;
}

// Custom wrapper component for rotated image overlay
const RotatedImageOverlay: React.FC<{
  url: string;
  bounds: L.LatLngBounds;
  rotation: number;
  opacity?: number;
  clipPath?: string;
}> = ({ url, bounds, rotation, opacity = 1, clipPath }) => {
  const map = useMap();
  const imageRef = React.useRef<L.ImageOverlay>(null);

  useEffect(() => {
    if (imageRef.current) {
      const element = imageRef.current.getElement();
      if (element) {
        element.style.transform = `rotate(${rotation}deg)`;
        element.style.transformOrigin = "center center";
        element.style.opacity = opacity.toString();
        if (clipPath) {
          element.style.clipPath = clipPath;
        }
      }
    }
  }, [rotation, opacity, clipPath]);

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
  const [opacity, setOpacity] = useState(1);
  const [clipPath, setClipPath] = useState<string>("");

  const controlsStyle = {
    position: "fixed" as const,
    top: "20px",
    right: "20px",
    backgroundColor: "white",
    padding: "16px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.1)",
    zIndex: 1000,
    width: "300px",
  };

  const sliderStyle = {
    width: "100%",
    marginTop: "8px",
    marginBottom: "16px",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "8px",
    fontWeight: "500" as const,
    color: "#374151",
  };

  const buttonStyle = {
    backgroundColor: "#EF4444",
    color: "white",
    padding: "8px 16px",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    width: "100%",
    fontWeight: "500" as const,
    marginBottom: "8px",
  };

  const toggleButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#3B82F6",
  };

  const updateClipPath = useCallback(() => {
    if (selectedBuildingRef.current && floorMap?.masked) {
      const layer = selectedBuildingRef.current as L.Polygon;
      const points = layer.getLatLngs()[0] as L.LatLng[];
      const clipPoints = points.map((point) => {
        const pixel = map.latLngToContainerPoint(point as L.LatLng);
        return `${pixel.x}px ${pixel.y}px`;
      });
      setClipPath(`polygon(${clipPoints.join(", ")})`);
    } else {
      setClipPath("");
    }
  }, [map, floorMap?.masked]);

  // Update clip path on map movement
  useMapEvent("move", updateClipPath);
  useMapEvent("zoom", updateClipPath);

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
    e.stopPropagation();
    const input = e.target as HTMLInputElement;
    const currentSelectedBuilding = selectedBuildingRef.current;
    console.log(currentSelectedBuilding);
    if (input.files && input.files[0] && currentSelectedBuilding) {
      const file = input.files[0];
      const imageUrl = URL.createObjectURL(file);
      const bounds = (
        currentSelectedBuilding as L.Layer & { getBounds(): L.LatLngBounds }
      ).getBounds();
      console.log(bounds);
      setFloorMap({
        url: imageUrl,
        bounds,
        scale: 1,
        rotation: 0,
        masked: false,
      });
      setShowControls(true);
      setOpacity(1);

      (
        currentSelectedBuilding as L.Layer & { closePopup(): void }
      ).closePopup();
    }
  }, []);

  const handleBuildingClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const layer = e.target;
      selectedBuildingRef.current = layer;

      const popupContent = document.createElement("div");
      popupContent.className = "p-4";
      popupContent.innerHTML =
        '<input type="file" accept="image/*" id="floor-map-input" class="mb-2" />';

      // Prevent click propagation on the popup content
      popupContent.addEventListener("click", (e) => e.stopPropagation());

      const popup = L.popup().setContent(popupContent).setLatLng(e.latlng);

      layer.bindPopup(popup).openPopup();

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

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOpacity = parseFloat(e.target.value);
    setOpacity(newOpacity);
  };

  const toggleMask = () => {
    setFloorMap((prev) => {
      if (!prev) return null;
      const masked = !prev.masked;
      if (masked) {
        updateClipPath();
      } else {
        setClipPath("");
      }
      return { ...prev, masked };
    });
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
            opacity={opacity}
            clipPath={clipPath}
          />

          {showControls && (
            <div style={controlsStyle}>
              <div>
                <label style={labelStyle}>
                  Scale
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={floorMap.scale}
                    onChange={handleScaleChange}
                    style={sliderStyle}
                  />
                  <span style={{ float: "right" }}>
                    {floorMap.scale.toFixed(1)}x
                  </span>
                </label>
              </div>

              <div>
                <label style={labelStyle}>
                  Rotation
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={floorMap.rotation}
                    onChange={handleRotationChange}
                    style={sliderStyle}
                  />
                  <span style={{ float: "right" }}>{floorMap.rotation}°</span>
                </label>
              </div>

              <div>
                <label style={labelStyle}>
                  Opacity
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={opacity}
                    onChange={handleOpacityChange}
                    style={sliderStyle}
                  />
                  <span style={{ float: "right" }}>
                    {(opacity * 100).toFixed(0)}%
                  </span>
                </label>
              </div>

              <button onClick={toggleMask} style={toggleButtonStyle}>
                {floorMap.masked ? "Disable Mask" : "Enable Mask"}
              </button>

              <button
                onClick={() => {
                  if (floorMap?.url) {
                    URL.revokeObjectURL(floorMap.url);
                  }
                  setFloorMap(null);
                  setShowControls(false);
                  setClipPath("");
                }}
                style={buttonStyle}
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
