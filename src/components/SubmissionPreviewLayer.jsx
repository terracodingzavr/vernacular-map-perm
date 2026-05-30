import React from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import L from 'leaflet';

// Determine styling for each preview feature. Preview features are
// rendered in a dedicated pane above existing map layers. Points and
// lines are drawn with higher weight and a distinctive color so that
// they stand out against the base map. Polygons have a light fill.
function getPreviewStyle(feature) {
  const baseColor = '#0072bc';
  const editColor = '#005a9e';
  const deleteColor = '#d73027';
  const vertexHoverColor = '#f4a261';
  const midpointColor = '#2ca25f';
  const props = feature.properties || {};
  const geometryType = feature.geometry?.type;

  if (props.__previewKind === 'drawing-vertex') {
    return {
      color: props.__canDeleteVertex ? baseColor : '#9aa9b5',
      fillColor: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      radius: 7,
    };
  }

  if (props.__previewKind === 'drawing-vertex-hover') {
    return {
      color: vertexHoverColor,
      fillColor: vertexHoverColor,
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      radius: 8,
    };
  }

  if (props.__previewKind === 'edit-vertex') {
    return {
      color: props.__canDeleteVertex ? editColor : '#9aa9b5',
      fillColor: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      radius: 7,
    };
  }

  if (props.__previewKind === 'edit-vertex-hover') {
    return {
      color: vertexHoverColor,
      fillColor: vertexHoverColor,
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      radius: 8,
    };
  }

  if (props.__previewKind === 'edit-midpoint') {
    return {
      color: midpointColor,
      fillColor: '#ffffff',
      weight: 2,
      opacity: 0.95,
      fillOpacity: 0.95,
      radius: 5,
    };
  }

  if (props.__previewKind === 'edit-midpoint-hover') {
    return {
      color: midpointColor,
      fillColor: midpointColor,
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      radius: 7,
    };
  }

  if (props.__previewKind === 'delete-target') {
    if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
      return {
        color: deleteColor,
        fillColor: deleteColor,
        weight: 3,
        opacity: 1,
        fillOpacity: 0.18,
        dashArray: '8 6',
      };
    }

    return {
      color: deleteColor,
      fillColor: deleteColor,
      weight: 4,
      opacity: 1,
      fillOpacity: 1,
      radius: 9,
      dashArray: '8 6',
    };
  }

  if (props.__previewKind === 'edit-geometry') {
    if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
      return {
        color: editColor,
        fillColor: editColor,
        weight: 3,
        opacity: 1,
        fillOpacity: 0.08,
        dashArray: '5 4',
      };
    }

    return {
      color: editColor,
      fillColor: editColor,
      weight: geometryType === 'Point' || geometryType === 'MultiPoint' ? 2 : 4,
      opacity: 1,
      fillOpacity: 0.95,
      radius: 9,
      dashArray: geometryType === 'Point' || geometryType === 'MultiPoint' ? null : '5 4',
    };
  }

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

function getHandleClasses(props) {
  const classes = ['preview-drag-handle'];
  const previewKind = props.__previewKind;

  if (previewKind === 'drawing-vertex') classes.push('drawing-vertex-handle');
  if (previewKind === 'edit-vertex') classes.push('edit-vertex-handle');
  if (previewKind === 'edit-midpoint') classes.push('edit-midpoint-handle');
  if (props.__canDeleteVertex) classes.push('can-delete');

  return classes.join(' ');
}

function createHandleIcon(feature) {
  const props = feature.properties || {};
  const previewKind = props.__previewKind;
  const label = previewKind === 'edit-midpoint' ? '+' : '';

  return L.divIcon({
    className: 'preview-drag-handle-icon',
    html: `<div class="${getHandleClasses(props)}">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function disableMapDragging(layer) {
  const map = layer?._map;
  if (map?.dragging?.enabled()) {
    map.dragging.disable();
    return true;
  }
  return false;
}

function enableMapDragging(layer, wasEnabled) {
  const map = layer?._map;
  if (wasEnabled && map?.dragging && !map.dragging.enabled()) {
    map.dragging.enable();
  }
}


function cloneGeometry(geometry) {
  if (!geometry) return null;
  return JSON.parse(JSON.stringify(geometry));
}

function replaceCoordinateAtIndex(geometry, vertexIndex, coord) {
  if (!geometry || typeof vertexIndex !== 'number' || !Array.isArray(coord)) {
    return null;
  }

  const updated = cloneGeometry(geometry);
  const type = updated.type;

  if (type === 'Point') {
    if (vertexIndex !== 0) return null;
    updated.coordinates = coord;
    return updated;
  }

  if (type === 'MultiPoint') {
    if (!Array.isArray(updated.coordinates) || !updated.coordinates[vertexIndex]) return null;
    updated.coordinates[vertexIndex] = coord;
    return updated;
  }

  if (type === 'LineString') {
    if (!Array.isArray(updated.coordinates) || !updated.coordinates[vertexIndex]) return null;
    updated.coordinates[vertexIndex] = coord;
    return updated;
  }

  if (type === 'MultiLineString') {
    const firstLine = updated.coordinates?.[0];
    if (!Array.isArray(firstLine) || !firstLine[vertexIndex]) return null;
    firstLine[vertexIndex] = coord;
    return updated;
  }

  if (type === 'Polygon') {
    const outerRing = updated.coordinates?.[0];
    if (!Array.isArray(outerRing) || !outerRing[vertexIndex]) return null;
    outerRing[vertexIndex] = coord;

    const lastIndex = outerRing.length - 1;
    if (vertexIndex === 0 && lastIndex > 0) {
      outerRing[lastIndex] = coord;
    }

    return updated;
  }

  if (type === 'MultiPolygon') {
    const outerRing = updated.coordinates?.[0]?.[0];
    if (!Array.isArray(outerRing) || !outerRing[vertexIndex]) return null;
    outerRing[vertexIndex] = coord;

    const lastIndex = outerRing.length - 1;
    if (vertexIndex === 0 && lastIndex > 0) {
      outerRing[lastIndex] = coord;
    }

    return updated;
  }

  return null;
}

function coordToLatLng(coord) {
  return [coord[1], coord[0]];
}

function geometryToLeafletLatLngs(geometry) {
  if (!geometry) return [];

  switch (geometry.type) {
    case 'LineString':
    case 'MultiPoint':
      return geometry.coordinates.map(coordToLatLng);
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.map((part) => part.map(coordToLatLng));
    case 'MultiPolygon':
      return geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(coordToLatLng))
      );
    default:
      return [];
  }
}

function isLiveEditableGeometryLayer(feature) {
  const props = feature.properties || {};
  const id = String(feature.id || '');

  return (
    props.__previewKind === 'edit-geometry' ||
    id === 'drawing_line_preview' ||
    id === 'drawing_polygon_preview' ||
    id === 'drawing_polygon_line_preview'
  );
}

function applyGeometryToLayer(layer, geometry) {
  if (!layer || !geometry) return;

  if (geometry.type === 'Point') {
    if (typeof layer.setLatLng === 'function') {
      layer.setLatLng(coordToLatLng(geometry.coordinates));
    }
    return;
  }

  if (typeof layer.setLatLngs === 'function') {
    layer.setLatLngs(geometryToLeafletLatLngs(geometry));
  }
}

const SubmissionPreviewLayer = ({
  previewFeatures = [],
  pane = 'submission-preview-pane',
  onRemoveDrawingVertex,
  onMoveDrawingVertex,
  onRemoveEditVertex,
  onMoveEditVertex,
  onAddEditVertex,
}) => {
  if (!previewFeatures || previewFeatures.length === 0) return null;

  const geoJsonKey = JSON.stringify(
    previewFeatures.map((feature, index) => ({
      id: feature.id || `feature_${index}`,
      type: feature.geometry?.type || 'unknown',
      coordinates: feature.geometry?.coordinates || [],
      previewKind: feature.properties?.__previewKind || '',
      vertexIndex: feature.properties?.__drawingVertexIndex ?? feature.properties?.__editVertexIndex ?? null,
      insertIndex: feature.properties?.__editInsertIndex ?? null,
      name: feature.properties?.name || '',
    }))
  );

  const geometryLayerEntries = [];

  const updateLiveGeometryLayers = (vertexIndex, coord) => {
    geometryLayerEntries.forEach(({ layer, feature }) => {
      const nextGeometry = replaceCoordinateAtIndex(feature.geometry, vertexIndex, coord);
      applyGeometryToLayer(layer, nextGeometry);
    });
  };

  const pointToLayer = (feature, latlng) => {
    const props = feature.properties || {};
    const previewKind = props.__previewKind;
    const isVertexHandle =
      previewKind === 'drawing-vertex' || previewKind === 'edit-vertex';
    const isMidpointHandle = previewKind === 'edit-midpoint';

    if (isVertexHandle || isMidpointHandle) {
      return L.marker(latlng, {
        pane,
        icon: createHandleIcon(feature),
        draggable: isVertexHandle,
        bubblingMouseEvents: false,
        zIndexOffset: isMidpointHandle ? 900 : 1000,
      });
    }

    return L.circleMarker(latlng, {
      ...getPreviewStyle(feature),
      pane,
      bubblingMouseEvents: true,
    });
  };

  return (
    <Pane name={pane} style={{ zIndex: 440 }}>
      <GeoJSON
        key={geoJsonKey}
        data={{ type: 'FeatureCollection', features: previewFeatures }}
        pane={pane}
        style={getPreviewStyle}
        pointToLayer={pointToLayer}
        onEachFeature={(feature, layer) => {
          if (isLiveEditableGeometryLayer(feature)) {
            geometryLayerEntries.push({ layer, feature });
          }

          const props = feature.properties || {};
          const name = props.name;
          const previewKind = props.__previewKind;
          const isDrawingVertex = previewKind === 'drawing-vertex';
          const isEditVertex = previewKind === 'edit-vertex';
          const isEditMidpoint = previewKind === 'edit-midpoint';
          const canDeleteVertex = Boolean(props.__canDeleteVertex);

          if (isDrawingVertex) {
            let wasDragged = false;
            let mapDraggingWasEnabled = false;

            layer.bindTooltip(canDeleteVertex ? '×' : 'перетащить', {
              direction: 'center',
              permanent: false,
              className: canDeleteVertex
                ? 'drawing-vertex-delete-tooltip'
                : 'drawing-vertex-disabled-tooltip',
              opacity: 1,
            });

            layer.on('mousedown', (event) => {
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            });

            layer.on('mouseover', () => layer.openTooltip());
            layer.on('mouseout', () => layer.closeTooltip());

            if (typeof onMoveDrawingVertex === 'function') {
              layer.on('dragstart', () => {
                wasDragged = true;
                mapDraggingWasEnabled = disableMapDragging(layer);
                layer.getElement()?.classList.add('is-dragging');
              });

              layer.on('drag', (event) => {
                const latlng = event.target.getLatLng();
                updateLiveGeometryLayers(props.__drawingVertexIndex, [latlng.lng, latlng.lat]);
              });

              layer.on('dragend', (event) => {
                enableMapDragging(layer, mapDraggingWasEnabled);
                layer.getElement()?.classList.remove('is-dragging');
                const latlng = event.target.getLatLng();
                onMoveDrawingVertex(props.__drawingVertexIndex, [latlng.lng, latlng.lat]);
                window.setTimeout(() => {
                  wasDragged = false;
                }, 0);
              });
            }

            if (typeof onRemoveDrawingVertex === 'function') {
              layer.on('click', (event) => {
                if (event.originalEvent) {
                  L.DomEvent.preventDefault(event.originalEvent);
                  L.DomEvent.stopPropagation(event.originalEvent);
                }

                if (wasDragged || !canDeleteVertex) return;
                onRemoveDrawingVertex(props.__drawingVertexIndex);
              });
            }

            return;
          }

          if (isEditVertex) {
            let wasDragged = false;
            let mapDraggingWasEnabled = false;

            layer.bindTooltip(canDeleteVertex ? '×' : 'перетащить', {
              direction: 'center',
              permanent: false,
              className: canDeleteVertex
                ? 'drawing-vertex-delete-tooltip'
                : 'drawing-vertex-disabled-tooltip',
              opacity: 1,
            });

            layer.on('mousedown', (event) => {
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            });

            layer.on('mouseover', () => layer.openTooltip());
            layer.on('mouseout', () => layer.closeTooltip());

            if (typeof onMoveEditVertex === 'function') {
              layer.on('dragstart', () => {
                wasDragged = true;
                mapDraggingWasEnabled = disableMapDragging(layer);
                layer.getElement()?.classList.add('is-dragging');
              });

              layer.on('drag', (event) => {
                const latlng = event.target.getLatLng();
                updateLiveGeometryLayers(props.__editVertexIndex, [latlng.lng, latlng.lat]);
              });

              layer.on('dragend', (event) => {
                enableMapDragging(layer, mapDraggingWasEnabled);
                layer.getElement()?.classList.remove('is-dragging');
                const latlng = event.target.getLatLng();
                onMoveEditVertex(props.__editVertexIndex, [latlng.lng, latlng.lat]);
                window.setTimeout(() => {
                  wasDragged = false;
                }, 0);
              });
            }

            if (typeof onRemoveEditVertex === 'function') {
              layer.on('click', (event) => {
                if (event.originalEvent) {
                  L.DomEvent.preventDefault(event.originalEvent);
                  L.DomEvent.stopPropagation(event.originalEvent);
                }

                if (wasDragged || !canDeleteVertex) return;
                onRemoveEditVertex(props.__editVertexIndex);
              });
            }

            return;
          }

          if (isEditMidpoint && typeof onAddEditVertex === 'function') {
            layer.bindTooltip('+', {
              direction: 'center',
              permanent: false,
              className: 'edit-midpoint-add-tooltip',
              opacity: 1,
            });

            layer.on('mousedown', (event) => {
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            });

            layer.on('mouseover', () => layer.openTooltip());
            layer.on('mouseout', () => layer.closeTooltip());

            layer.on('click', (event) => {
              if (event.originalEvent) {
                L.DomEvent.preventDefault(event.originalEvent);
                L.DomEvent.stopPropagation(event.originalEvent);
              }

              onAddEditVertex(props.__editInsertIndex, feature.geometry?.coordinates);
            });

            return;
          }

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
