import React from "react";
import { LatLngExpression } from "leaflet";
import MapComponent from "../../components";

const HomePage: React.FC = () => {
  const handleMapClick = (latlng: LatLngExpression) => {
    // alert(`Map clicked at latitude: ${latlng.lat}, longitude: ${latlng.lng}`);
  };

  // Example layers with different map styles
  const layers = [
    {
      name: "Satellite View",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenTopoMap contributors",
      checked: false, // Initially unchecked
    },
    {
      name: "Dark Mode",
      url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      attribution:
        "&copy; Stadia Maps, OpenMapTiles & OpenStreetMap contributors",
      checked: false,
    },
  ];

  return (
    <div>
      <MapComponent
        center={[51.505, -0.09]}
        zoom={13}
        style={{ height: "100vh", width: "100%" }}
        layers={layers}
        onMapClick={handleMapClick}
      />
    </div>
  );
};

export default HomePage;
