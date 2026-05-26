import React from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import L from 'leaflet';

// Determine styling for each preview feature. Preview features are
// rendered in a dedicated pane above existing map layers. Points and
// lines are drawn with higher weight and a distinctive color so that
// they stand out against the base map. Polygons have a light fill.
function getPreviewStyle(feature) {
  const baseColor = '#0072bc';
  const geometryType = feature.geometry?.type;
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
    return {
      color: baseColor,
      fillColor: baseColor,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.2,
    };
  }
  return {
    color: baseColor,
    fillColor: baseColor,
    weight: 3,
    opacity: 1,
    fillOpacity: 1,
    radius: 8,
  };
}

const SubmissionPreviewLayer = ({ previewFeatures = [], pane = 'submission-preview-pane' }) => {
  if (!previewFeatures || previewFeatures.length === 0) return null;

  const pointToLayer = (feature, latlng) => {
    return L.circleMarker(latlng, {
      ...getPreviewStyle(feature),
      pane,
    });
  };

  return (
    <Pane name={pane}>
      <GeoJSON
        data={{ type: 'FeatureCollection', features: previewFeatures }}
        pane={pane}
        style={getPreviewStyle}
        pointToLayer={pointToLayer}
        onEachFeature={(feature, layer) => {
          const name = feature.properties?.name;
          if (name) {
            layer.bindTooltip(name, {
              direction: 'top',
              sticky: true,
              offset: [0, -10],
              className: 'custom-tooltip',
            });
          }
        }}
      />
    </Pane>
  );
};

export default SubmissionPreviewLayer;