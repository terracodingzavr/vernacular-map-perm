import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Pane, ZoomControl } from "react-leaflet";
import { useMapEvents } from "react-leaflet/hooks";
import "leaflet/dist/leaflet.css";
import "./App.css";
import L from "leaflet";
import { area as turfArea } from "@turf/turf";
import "leaflet-textpath";

// Submission components
import SubmissionPanel from './components/SubmissionPanel';
import SubmissionPreviewLayer from './components/SubmissionPreviewLayer';
import { submitUserSubmission } from './utils/submissionApi';

// Конфигурация городов: центр карты, подпись в заголовке и городская легенда.
const cityConfigs = {
  perm: {
    label: "Пермь",
    cityName: "Пермь",
    titleName: "Перми",
    center: [58.01, 56.25],
    legendTitle: "Тип названия",
    legendLabels: {
      "Реальное название": "Официальное название",
    },
    typeColors: {
      "Ассоциация с объектом": "#ff7f00",
      "Ассоциация с официальным названием": "#377eb8",
      "Визуальная ассоциация": "#4daf4a",
      "Историческая ассоциация": "#e41a1c",
      "Реальное название": "#984ea3",
      "Другое": "#999999",
    },
  },
  cheb: {
    label: "Чебоксары",
    cityName: "Чебоксары",
    titleName: "Чебоксар",
    center: [56.1439, 47.2489],
    legendTitle: "Тип названия",
    legendLabels: {
      "Реальное название": "Официальное название",
    },
    typeColors: {
      "Ассоциация с объектом": "#ff7f00",
      "Ассоциация с официальным названием": "#377eb8",
      "Визуальная ассоциация": "#4daf4a",
      "Историческая ассоциация": "#e41a1c",
      "Реальное название": "#984ea3",
      "Другое": "#999999",
    },
  },
  tver: {
    label: "Тверь",
    cityName: "Тверь",
    titleName: "Твери",
    center: [56.8587, 35.9176],
    legendTitle: "Происхождение вернакулярного названия:",
    typeColors: {
      "Инфраструктурный объект": "#ff7f00",
      "Исторический объект": "#e41a1c",
      "Природный объект": "#4daf4a",
      "Ассоциация с реальным названием": "#377eb8",
      "Другое": "#999999",
    },
  },
};

const cityNameToKey = {
  "Пермь": "perm",
  "Чебоксары": "cheb",
  "Тверь": "tver",
};

const getFeatureCityKey = (feature) => {
  if (!feature || !feature.properties) {
    return "perm";
  }

  const city = feature.properties?.city || feature.properties?.["Город"];
  return cityNameToKey[city] || "perm";
};

const getFeatureTypeColors = (feature) => {
  const cityKey = getFeatureCityKey(feature);
  return cityConfigs[cityKey]?.typeColors || cityConfigs.perm.typeColors;
};

const getDisplayTypeName = (type, cityKey) => {
  const config = cityConfigs[cityKey] || cityConfigs.perm;
  return config.legendLabels?.[type] || type;
};

const getTargetLayerByGeometryType = (type) => {
  switch (type) {
    case "Point":
    case "MultiPoint":
      return "points";
    case "LineString":
    case "MultiLineString":
      return "lines";
    case "Polygon":
    case "MultiPolygon":
      return "districts";
    default:
      return null;
  }
};

const getMinimumVerticesForDrawingMode = (mode) => {
  if (mode === "line") return 2;
  if (mode === "polygon") return 3;
  return 1;
};

const buildGeometryFromDrawing = (mode, coords) => {
  if (mode === "point" && coords.length >= 1) {
    return {
      type: "Point",
      coordinates: coords[0],
    };
  }

  if (mode === "line" && coords.length >= 2) {
    return {
      type: "LineString",
      coordinates: coords,
    };
  }

  if (mode === "polygon" && coords.length >= 3) {
    return {
      type: "Polygon",
      coordinates: [[...coords, coords[0]]],
    };
  }

  return null;
};

const buildDrawingPreviewFeatures = (mode, coords) => {
  if (!mode || !coords.length) return [];

  const minimumVertices = getMinimumVerticesForDrawingMode(mode);
  const canRemoveVertex = mode !== "point" && coords.length > minimumVertices;

  const previewFeatures = coords.map((coord, index) => ({
    type: "Feature",
    id: `drawing_vertex_${index}`,
    properties: {
      name: index === coords.length - 1 ? "Новая вершина" : "",
      __previewKind: "drawing-vertex",
      __drawingVertexIndex: index,
      __drawingMode: mode,
      __canDeleteVertex: canRemoveVertex,
    },
    geometry: {
      type: "Point",
      coordinates: coord,
    },
  }));

  if (mode === "line" && coords.length >= 2) {
    previewFeatures.push({
      type: "Feature",
      id: "drawing_line_preview",
      properties: { name: "Новая линия" },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });
  }

  if (mode === "polygon") {
    if (coords.length >= 3) {
      previewFeatures.push({
        type: "Feature",
        id: "drawing_polygon_preview",
        properties: { name: "Новый полигон" },
        geometry: {
          type: "Polygon",
          coordinates: [[...coords, coords[0]]],
        },
      });
    } else if (coords.length >= 2) {
      previewFeatures.push({
        type: "Feature",
        id: "drawing_polygon_line_preview",
        properties: { name: "Новый полигон" },
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
      });
    }
  }

  return previewFeatures;
};

const getDrawingModeLabel = (mode) => {
  if (mode === "point") return "точки";
  if (mode === "line") return "линии";
  if (mode === "polygon") return "полигона";
  return "объекта";
};


const cloneFeature = (feature) => JSON.parse(JSON.stringify(feature));

const withLocalPreviewKind = (feature, previewKind) => {
  if (!feature) return null;

  const cloned = cloneFeature(feature);
  return {
    ...cloned,
    properties: {
      ...(cloned.properties || {}),
      __previewKind: previewKind,
    },
  };
};

const normalizeFeatureId = (feature) => {
  const rawId = feature?.id ?? feature?.properties?.id ?? feature?.properties?.feature_id;
  if (rawId === undefined || rawId === null || rawId === "") return null;
  const numeric = Number(rawId);
  return Number.isFinite(numeric) ? numeric : String(rawId);
};

const getEditableGeometryKind = (geometryType) => {
  if (geometryType === "Point" || geometryType === "MultiPoint") return "point";
  if (geometryType === "LineString" || geometryType === "MultiLineString") return "line";
  if (geometryType === "Polygon" || geometryType === "MultiPolygon") return "polygon";
  return null;
};

const isClosedRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 2) return false;

  const first = ring[0];
  const last = ring[ring.length - 1];

  return (
    Array.isArray(first) &&
    Array.isArray(last) &&
    first[0] === last[0] &&
    first[1] === last[1]
  );
};

const getOuterRingWithoutClosingPoint = (ring) => {
  if (!Array.isArray(ring)) return [];
  return isClosedRing(ring) ? ring.slice(0, -1) : ring;
};

const getCoordsFromEditableFeature = (feature) => {
  const geometry = feature?.geometry;
  const kind = getEditableGeometryKind(geometry?.type);

  if (!geometry || !kind) return [];

  if (kind === "point") {
    if (geometry.type === "MultiPoint") {
      const firstPoint = geometry.coordinates?.[0];
      return Array.isArray(firstPoint) ? [firstPoint] : [];
    }

    return Array.isArray(geometry.coordinates) ? [geometry.coordinates] : [];
  }

  if (kind === "line") {
    if (geometry.type === "MultiLineString") {
      return Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
    }

    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  if (kind === "polygon") {
    if (geometry.type === "MultiPolygon") {
      const firstOuterRing = geometry.coordinates?.[0]?.[0] || [];
      return getOuterRingWithoutClosingPoint(firstOuterRing);
    }

    const outerRing = geometry.coordinates?.[0] || [];
    return getOuterRingWithoutClosingPoint(outerRing);
  }

  return [];
};

const buildGeometryFromEditableCoords = (geometryType, coords, originalGeometry = null) => {
  const kind = getEditableGeometryKind(geometryType);

  if (kind === "point" && coords.length >= 1) {
    if (geometryType === "MultiPoint") {
      const restPoints = Array.isArray(originalGeometry?.coordinates)
        ? originalGeometry.coordinates.slice(1)
        : [];

      return {
        type: "MultiPoint",
        coordinates: [coords[0], ...restPoints],
      };
    }

    return {
      type: "Point",
      coordinates: coords[0],
    };
  }

  if (kind === "line" && coords.length >= 2) {
    if (geometryType === "MultiLineString") {
      const restLines = Array.isArray(originalGeometry?.coordinates)
        ? originalGeometry.coordinates.slice(1)
        : [];

      return {
        type: "MultiLineString",
        coordinates: [coords, ...restLines],
      };
    }

    return {
      type: "LineString",
      coordinates: coords,
    };
  }

  if (kind === "polygon" && coords.length >= 3) {
    const closedOuterRing = [...coords, coords[0]];

    if (geometryType === "MultiPolygon") {
      const firstPolygon = Array.isArray(originalGeometry?.coordinates?.[0])
        ? originalGeometry.coordinates[0]
        : [];
      const firstPolygonInnerRings = firstPolygon.slice(1);
      const restPolygons = Array.isArray(originalGeometry?.coordinates)
        ? originalGeometry.coordinates.slice(1)
        : [];

      return {
        type: "MultiPolygon",
        coordinates: [[closedOuterRing, ...firstPolygonInnerRings], ...restPolygons],
      };
    }

    const innerRings = Array.isArray(originalGeometry?.coordinates)
      ? originalGeometry.coordinates.slice(1)
      : [];

    return {
      type: "Polygon",
      coordinates: [closedOuterRing, ...innerRings],
    };
  }

  return null;
};

const getMinimumVerticesForGeometryType = (geometryType) => {
  const kind = getEditableGeometryKind(geometryType);
  if (kind === "line") return 2;
  if (kind === "polygon") return 3;
  return 1;
};

const getGeometryEditLabel = (geometryType) => {
  const kind = getEditableGeometryKind(geometryType);
  if (kind === "point") return "точки";
  if (kind === "line") return "линии";
  if (kind === "polygon") return "полигона";
  return "объекта";
};

const getSegmentMidpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const SNAP_TOLERANCE_PX = 14;

const normalizeCoord = (coord) => {
  if (!Array.isArray(coord) || coord.length < 2) return null;

  const lng = Number(coord[0]);
  const lat = Number(coord[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
};

const isSameFeatureId = (feature, excludedFeatureId) => {
  if (excludedFeatureId === null || excludedFeatureId === undefined) return false;
  const currentId = normalizeFeatureId(feature);
  if (currentId === null || currentId === undefined) return false;
  return String(currentId) === String(excludedFeatureId);
};

const addSnapVertex = (target, coord) => {
  const normalized = normalizeCoord(coord);
  if (normalized) target.push(normalized);
};

const addSnapSegment = (target, start, end) => {
  const a = normalizeCoord(start);
  const b = normalizeCoord(end);
  if (!a || !b) return;
  if (a[0] === b[0] && a[1] === b[1]) return;
  target.push([a, b]);
};

const isRingClosedForSnapping = (ring) => {
  if (!Array.isArray(ring) || ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return (
    Array.isArray(first) &&
    Array.isArray(last) &&
    first[0] === last[0] &&
    first[1] === last[1]
  );
};

const collectLineSnapSources = (coords, vertices, segments, closeRing = false) => {
  if (!Array.isArray(coords)) return;

  coords.forEach((coord) => addSnapVertex(vertices, coord));

  for (let index = 0; index < coords.length - 1; index += 1) {
    addSnapSegment(segments, coords[index], coords[index + 1]);
  }

  if (closeRing && coords.length > 2 && !isRingClosedForSnapping(coords)) {
    addSnapSegment(segments, coords[coords.length - 1], coords[0]);
  }
};

const collectGeometrySnapSources = (geometry, vertices, segments) => {
  if (!geometry) return;

  switch (geometry.type) {
    case "Point":
      addSnapVertex(vertices, geometry.coordinates);
      break;

    case "MultiPoint":
      geometry.coordinates?.forEach((coord) => addSnapVertex(vertices, coord));
      break;

    case "LineString":
      collectLineSnapSources(geometry.coordinates, vertices, segments, false);
      break;

    case "MultiLineString":
      geometry.coordinates?.forEach((line) =>
        collectLineSnapSources(line, vertices, segments, false)
      );
      break;

    case "Polygon":
      geometry.coordinates?.forEach((ring) =>
        collectLineSnapSources(ring, vertices, segments, true)
      );
      break;

    case "MultiPolygon":
      geometry.coordinates?.forEach((polygon) => {
        polygon?.forEach((ring) =>
          collectLineSnapSources(ring, vertices, segments, true)
        );
      });
      break;

    default:
      break;
  }
};

const buildSnapSources = (collections = [], excludedFeatureId = null) => {
  const vertices = [];
  const segments = [];

  collections.forEach((collection) => {
    if (!collection || !Array.isArray(collection.features)) return;

    collection.features.forEach((feature) => {
      if (isSameFeatureId(feature, excludedFeatureId)) return;
      collectGeometrySnapSources(feature.geometry, vertices, segments);
    });
  });

  return { vertices, segments };
};

const distanceBetweenLayerPoints = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getClosestLayerPointOnSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return start;

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );

  return L.point(start.x + t * dx, start.y + t * dy);
};

const coordToLeafletLatLng = (coord) => L.latLng(coord[1], coord[0]);

const latLngToCoord = (latlng) => [latlng.lng, latlng.lat];

const snapCoordinateToSources = (coord, snapSources, map, tolerancePx = SNAP_TOLERANCE_PX) => {
  const normalized = normalizeCoord(coord);
  if (!normalized || !map || !snapSources) return coord;

  const inputLatLng = coordToLeafletLatLng(normalized);
  const inputPoint = map.latLngToLayerPoint(inputLatLng);

  let bestVertex = null;
  let bestVertexDistance = Infinity;

  (snapSources.vertices || []).forEach((vertex) => {
    const vertexPoint = map.latLngToLayerPoint(coordToLeafletLatLng(vertex));
    const distance = distanceBetweenLayerPoints(inputPoint, vertexPoint);

    if (distance < bestVertexDistance) {
      bestVertexDistance = distance;
      bestVertex = vertex;
    }
  });

  if (bestVertex && bestVertexDistance <= tolerancePx) {
    return bestVertex;
  }

  let bestSegmentPoint = null;
  let bestSegmentDistance = Infinity;

  (snapSources.segments || []).forEach(([startCoord, endCoord]) => {
    const startPoint = map.latLngToLayerPoint(coordToLeafletLatLng(startCoord));
    const endPoint = map.latLngToLayerPoint(coordToLeafletLatLng(endCoord));
    const projectedPoint = getClosestLayerPointOnSegment(inputPoint, startPoint, endPoint);
    const distance = distanceBetweenLayerPoints(inputPoint, projectedPoint);

    if (distance < bestSegmentDistance) {
      bestSegmentDistance = distance;
      bestSegmentPoint = projectedPoint;
    }
  });

  if (bestSegmentPoint && bestSegmentDistance <= tolerancePx) {
    return latLngToCoord(map.layerPointToLatLng(bestSegmentPoint));
  }

  return normalized;
};


const coordsAreEqual = (a, b, epsilon = 1e-10) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
};

const dedupeConsecutiveCoords = (coords) =>
  coords.filter((coord, index) => index === 0 || !coordsAreEqual(coord, coords[index - 1]));

const getClosestLayerPointOnSegmentWithT = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return { point: start, t: 0 };
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );

  return {
    point: L.point(start.x + t * dx, start.y + t * dy),
    t,
  };
};

const addTracePath = (paths, feature, coords, closed = false, sourceLabel = "trace") => {
  if (!Array.isArray(coords)) return;

  let cleaned = coords.map(normalizeCoord).filter(Boolean);
  if (closed && cleaned.length > 1 && coordsAreEqual(cleaned[0], cleaned[cleaned.length - 1])) {
    cleaned = cleaned.slice(0, -1);
  }

  if (cleaned.length < 2) return;

  const featureId = normalizeFeatureId(feature);
  const pathIndex = paths.length;
  paths.push({
    id: `${sourceLabel}_${featureId ?? "noid"}_${pathIndex}`,
    featureId,
    cityKey: getFeatureCityKey(feature),
    coords: cleaned,
    closed,
  });
};

const collectFeatureTracePaths = (feature, paths, sourceLabel = "feature") => {
  const geometry = feature?.geometry;
  if (!geometry) return;

  switch (geometry.type) {
    case "LineString":
      addTracePath(paths, feature, geometry.coordinates, false, sourceLabel);
      break;

    case "MultiLineString":
      geometry.coordinates?.forEach((line, index) =>
        addTracePath(paths, feature, line, false, `${sourceLabel}_line${index}`)
      );
      break;

    case "Polygon":
      // For the first version, trace only the outer boundary.
      addTracePath(paths, feature, geometry.coordinates?.[0] || [], true, `${sourceLabel}_outer`);
      break;

    case "MultiPolygon":
      geometry.coordinates?.forEach((polygon, index) =>
        addTracePath(paths, feature, polygon?.[0] || [], true, `${sourceLabel}_poly${index}_outer`)
      );
      break;

    default:
      break;
  }
};

const buildTraceSources = (collections = [], excludedFeatureId = null, activeCityKey = null) => {
  const paths = [];

  collections.forEach((collection, collectionIndex) => {
    if (!collection || !Array.isArray(collection.features)) return;

    collection.features.forEach((feature, featureIndex) => {
      if (isSameFeatureId(feature, excludedFeatureId)) return;
      if (activeCityKey && getFeatureCityKey(feature) !== activeCityKey) return;

      collectFeatureTracePaths(feature, paths, `c${collectionIndex}_f${featureIndex}`);
    });
  });

  return { paths };
};

const findTraceCandidate = (coord, traceSources, map, tolerancePx = SNAP_TOLERANCE_PX) => {
  const normalized = normalizeCoord(coord);
  if (!normalized || !map || !traceSources) return null;

  const inputPoint = map.latLngToLayerPoint(coordToLeafletLatLng(normalized));
  let best = null;

  (traceSources.paths || []).forEach((path) => {
    const coords = path.coords || [];
    const segmentCount = path.closed ? coords.length : coords.length - 1;

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const startCoord = coords[segmentIndex];
      const endCoord = coords[(segmentIndex + 1) % coords.length];
      if (!startCoord || !endCoord) continue;

      const startPoint = map.latLngToLayerPoint(coordToLeafletLatLng(startCoord));
      const endPoint = map.latLngToLayerPoint(coordToLeafletLatLng(endCoord));
      const projected = getClosestLayerPointOnSegmentWithT(inputPoint, startPoint, endPoint);
      const distance = distanceBetweenLayerPoints(inputPoint, projected.point);

      if (!best || distance < best.distance) {
        best = {
          pathId: path.id,
          path,
          segmentIndex,
          t: projected.t,
          coord: latLngToCoord(map.layerPointToLatLng(projected.point)),
          distance,
        };
      }
    }
  });

  if (!best || best.distance > tolerancePx) return null;
  return best;
};

const getCoordsDistance = (coords, map) => {
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  let total = 0;

  for (let index = 0; index < coords.length - 1; index += 1) {
    const a = coords[index];
    const b = coords[index + 1];

    if (map) {
      total += distanceBetweenLayerPoints(
        map.latLngToLayerPoint(coordToLeafletLatLng(a)),
        map.latLngToLayerPoint(coordToLeafletLatLng(b))
      );
    } else {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return total;
};

const buildForwardTraceCoords = (startCandidate, endCandidate) => {
  const path = startCandidate.path;
  const coords = path.coords || [];
  const n = coords.length;

  if (n < 2) return null;

  const result = [startCandidate.coord];
  let vertexIndex = (startCandidate.segmentIndex + 1) % n;
  const stopIndex = (endCandidate.segmentIndex + 1) % n;
  let guard = 0;

  while (vertexIndex !== stopIndex && guard <= n + 2) {
    result.push(coords[vertexIndex]);
    vertexIndex = (vertexIndex + 1) % n;
    guard += 1;
  }

  result.push(endCandidate.coord);
  return dedupeConsecutiveCoords(result);
};

const buildReverseTraceCoords = (startCandidate, endCandidate) => {
  const path = startCandidate.path;
  const coords = path.coords || [];
  const n = coords.length;

  if (n < 2) return null;

  const result = [startCandidate.coord];
  let vertexIndex = startCandidate.segmentIndex;
  const stopIndex = endCandidate.segmentIndex;
  let guard = 0;

  while (vertexIndex !== stopIndex && guard <= n + 2) {
    result.push(coords[vertexIndex]);
    vertexIndex = (vertexIndex - 1 + n) % n;
    guard += 1;
  }

  result.push(endCandidate.coord);
  return dedupeConsecutiveCoords(result);
};

const buildTraceCoordsBetween = (startCandidate, endCandidate, map) => {
  if (!startCandidate || !endCandidate) return null;
  if (startCandidate.pathId !== endCandidate.pathId) return null;

  const path = startCandidate.path;
  if (!path || !Array.isArray(path.coords) || path.coords.length < 2) return null;

  if (!path.closed) {
    const startPosition = startCandidate.segmentIndex + startCandidate.t;
    const endPosition = endCandidate.segmentIndex + endCandidate.t;

    return startPosition <= endPosition
      ? buildForwardTraceCoords(startCandidate, endCandidate)
      : buildReverseTraceCoords(startCandidate, endCandidate);
  }

  const forward = buildForwardTraceCoords(startCandidate, endCandidate);
  const reverse = buildReverseTraceCoords(startCandidate, endCandidate);

  if (!forward) return reverse;
  if (!reverse) return forward;

  return getCoordsDistance(forward, map) <= getCoordsDistance(reverse, map)
    ? forward
    : reverse;
};


const findNearestInsertIndexForEditableCoords = (coord, coords = [], kind, map) => {
  const normalized = normalizeCoord(coord);

  if (!normalized || !Array.isArray(coords) || coords.length < 2) {
    return Array.isArray(coords) ? coords.length : 0;
  }

  if (kind !== "line" && kind !== "polygon") {
    return coords.length;
  }

  const inputPoint = map
    ? map.latLngToLayerPoint(coordToLeafletLatLng(normalized))
    : L.point(normalized[0], normalized[1]);

  const segmentCount = kind === "polygon" ? coords.length : coords.length - 1;
  let best = null;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const startCoord = coords[segmentIndex];
    const endCoord = coords[(segmentIndex + 1) % coords.length];

    if (!startCoord || !endCoord) continue;

    const startPoint = map
      ? map.latLngToLayerPoint(coordToLeafletLatLng(startCoord))
      : L.point(startCoord[0], startCoord[1]);
    const endPoint = map
      ? map.latLngToLayerPoint(coordToLeafletLatLng(endCoord))
      : L.point(endCoord[0], endCoord[1]);

    const projected = getClosestLayerPointOnSegmentWithT(inputPoint, startPoint, endPoint);
    const distance = distanceBetweenLayerPoints(inputPoint, projected.point);

    if (!best || distance < best.distance) {
      best = {
        distance,
        insertIndex: segmentIndex + 1,
      };
    }
  }

  if (!best) return coords.length;

  return Math.max(0, Math.min(best.insertIndex, coords.length));
};



const buildEditedFeatureFromState = (originalFeature, geometryType, coords, formValues) => {
  if (!originalFeature) return null;

  const geometry =
    buildGeometryFromEditableCoords(geometryType, coords, originalFeature.geometry) || originalFeature.geometry;

  const originalProps = originalFeature.properties || {};
  const properties = {
    ...originalProps,
    name: formValues?.name?.trim() || originalProps.name || "",
    explainer: formValues?.explainer?.trim() || originalProps.explainer || "",
    ["Тип названия"]: formValues?.type || originalProps["Тип названия"] || "Другое",
  };

  const originalName = formValues?.original_name?.trim();
  if (originalName) {
    properties.original_name = originalName;
  } else if (formValues && Object.prototype.hasOwnProperty.call(formValues, "original_name")) {
    delete properties.original_name;
  }

  return {
    ...originalFeature,
    geometry,
    properties,
  };
};

const buildEditPreviewFeatures = (originalFeature, geometryType, coords, options = {}) => {
  if (!originalFeature) return [];

  const {
    includeGeometry = true,
    includeHandles = true,
    deletePreview = false,
    formValues = null,
  } = options;

  const features = [];
  const geometry = buildGeometryFromEditableCoords(geometryType, coords, originalFeature.geometry) || originalFeature.geometry;
  const baseFeature = buildEditedFeatureFromState(originalFeature, geometryType, coords, formValues) || {
    ...originalFeature,
    geometry,
  };

  if (deletePreview) {
    features.push({
      ...baseFeature,
      properties: {
        ...(baseFeature.properties || {}),
        name: baseFeature.properties?.name || "Объект к удалению",
        __previewKind: "delete-target",
      },
    });
    return features;
  }

  if (includeGeometry) {
    features.push({
      ...baseFeature,
      properties: {
        ...(baseFeature.properties || {}),
        name: baseFeature.properties?.name || "Редактируемый объект",
        __previewKind: "edit-geometry",
      },
    });
  }

  if (!includeHandles) return features;

  const kind = getEditableGeometryKind(geometryType);
  if (!kind) return features;

  const minimumVertices = getMinimumVerticesForGeometryType(geometryType);
  const canRemoveVertex = (kind === "line" || kind === "polygon") && coords.length > minimumVertices;

  coords.forEach((coord, index) => {
    features.push({
      type: "Feature",
      id: `edit_vertex_${normalizeFeatureId(originalFeature) || "feature"}_${index}`,
      properties: {
        name: "",
        __previewKind: "edit-vertex",
        __editVertexIndex: index,
        __canDeleteVertex: canRemoveVertex,
      },
      geometry: {
        type: "Point",
        coordinates: coord,
      },
    });
  });

  if (kind === "line" || kind === "polygon") {
    const segmentCount = kind === "polygon" ? coords.length : coords.length - 1;

    for (let index = 0; index < segmentCount; index += 1) {
      const start = coords[index];
      const end = coords[(index + 1) % coords.length];
      if (!start || !end) continue;

      features.push({
        type: "Feature",
        id: `edit_midpoint_${normalizeFeatureId(originalFeature) || "feature"}_${index}`,
        properties: {
          name: "",
          __previewKind: "edit-midpoint",
          __editInsertIndex: index + 1,
        },
        geometry: {
          type: "Point",
          coordinates: getSegmentMidpoint(start, end),
        },
      });
    }
  }

  return features;
};


function DrawingMapEvents({ drawingMode, onAddCoordinate, onCompleteDrawing }) {
  useMapEvents({
    click: (event) => {
      if (!drawingMode) return;
      onAddCoordinate([event.latlng.lng, event.latlng.lat]);
    },
    contextmenu: (event) => {
      if (!drawingMode || drawingMode === "point") return;
      event.originalEvent?.preventDefault();
      onCompleteDrawing();
    },
  });

  return null;
}


function EditingMapEvents({
  editingFeature,
  editGeometryType,
  editFormOpen,
  onMovePoint,
  onCompleteEdit,
}) {
  useMapEvents({
    click: (event) => {
      if (!editingFeature || editFormOpen) return;

      const kind = getEditableGeometryKind(editGeometryType);
      if (kind !== "point") return;

      onMovePoint([event.latlng.lng, event.latlng.lat]);
    },
    contextmenu: (event) => {
      if (!editingFeature || editFormOpen) return;
      event.originalEvent?.preventDefault();
      onCompleteEdit();
    },
  });

  return null;
}

// Стиль объектов
const styleByType = (feature) => {
  const type = feature.properties?.["Тип названия"];
  const typeColors = getFeatureTypeColors(feature);
  const color = typeColors[type] || "#cccccc";
  const geometryType = feature.geometry?.type;

  if (geometryType === "Polygon" || geometryType === "MultiPolygon") {
    return {
      color,
      fillColor: color,
      fillOpacity: 0.4,
      opacity: 1,
      weight: 1,
    };
  }

  if (geometryType === "Point" || geometryType === "MultiPoint") {
    return {
      color: "#000000",
      fillColor: color,
      fillOpacity: 1,
      opacity: 1,
      weight: 1.4,
      radius: 6,
    };
  }

  return {
    color,
    fillColor: color,
    fillOpacity: 1,
    opacity: 1,
    weight: 2,
    radius: 6,
  };
};

const splitIntoSentences = (text) => {
  if (!text) return [];

  return (
    text
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+(?:[.!?]+|$)/g)
      ?.map((sentence) => sentence.trim()) || []
  );
};

const getTextPreview = (text, limit = 3) => {
  const sentences = splitIntoSentences(text);
  return sentences.slice(0, limit).join(" ");
};

/**
 * Normalize and resolve photo definitions in feature properties.
 *
 * A feature may define either a `photo` field (string) or an array
 * `photos` containing objects or strings. This helper normalizes
 * those definitions into an array of objects with resolved `src`,
 * optional `alt` and `caption` fields. Relative paths are
 * automatically prefixed with `process.env.PUBLIC_URL` so that
 * resources in the `public` directory resolve correctly when
 * deployed on GitHub Pages or another base path.
 *
 * @param {object} props Feature properties
 * @returns {Array<{src: string, alt: string, caption: string}>}
 */
const getFeaturePhotos = (props = {}) => {
  const result = [];
  const resolveSrc = (src) => {
    if (!src) return null;
    // Absolute URL (http or https) or protocol-relative
    if (/^(?:https?:)?\/\//.test(src)) return src;
    // Ensure leading slash
    const normalized = src.startsWith("/") ? src : `/${src}`;
    // process.env.PUBLIC_URL may be undefined in tests; default to empty string
    const base = process.env.PUBLIC_URL || "";
    return `${base}${normalized}`;
  };

  if (Array.isArray(props.photos)) {
    props.photos.forEach((p) => {
      if (!p) return;
      if (typeof p === "string") {
        const src = resolveSrc(p);
        if (src) result.push({ src, alt: "", caption: "" });
      } else if (typeof p === "object" && p.src) {
        const src = resolveSrc(p.src);
        if (src) {
          result.push({ src, alt: p.alt || "", caption: p.caption || "" });
        }
      }
    });
  } else if (typeof props.photo === "string") {
    const src = resolveSrc(props.photo);
    if (src) result.push({ src, alt: "", caption: "" });
  }
  return result;
};


const normalizeSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();

const getLayerDisplayName = (layer) => {
  if (layer === "districts") return "Полигон";
  if (layer === "lines") return "Линия";
  if (layer === "points") return "Точка";
  return "Объект";
};

const getFeatureDisplayName = (feature) => feature?.properties?.name || "Без названия";

const getFeatureSearchText = (feature) => {
  const props = feature?.properties || {};
  return normalizeSearchText([
    props.name,
    props.original_name,
    props.explainer,
    props["Тип названия"],
    props.city,
    props["Город"],
  ].filter(Boolean).join(" "));
};

const getPointCoordinate = (geometry) => {
  if (!geometry) return null;

  if (geometry.type === "Point") {
    return normalizeCoord(geometry.coordinates);
  }

  if (geometry.type === "MultiPoint") {
    return normalizeCoord(geometry.coordinates?.[0]);
  }

  return null;
};

const getFeaturePrimaryCoordinate = (feature) => {
  const point = getPointCoordinate(feature?.geometry);
  if (point) return point;

  try {
    const layer = L.geoJSON(feature, { interactive: false });
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      const center = bounds.getCenter();
      return [center.lng, center.lat];
    }
  } catch {
    return null;
  }

  return null;
};

const getFeatureBounds = (feature) => {
  if (!feature?.geometry) return null;

  const point = getPointCoordinate(feature.geometry);
  if (point) {
    const latlng = L.latLng(point[1], point[0]);
    return L.latLngBounds(latlng, latlng);
  }

  try {
    const layer = L.geoJSON(feature, { interactive: false });
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : null;
  } catch {
    return null;
  }
};

const removeInternalProperties = (properties = {}) => {
  const cleaned = {};

  Object.entries(properties || {}).forEach(([key, value]) => {
    if (!key.startsWith("__")) {
      cleaned[key] = value;
    }
  });

  return cleaned;
};

const cleanFeatureForExport = (feature, extraProperties = {}) => {
  if (!feature || feature.type !== "Feature") return null;

  const cloned = cloneFeature(feature);
  return {
    ...cloned,
    properties: {
      ...removeInternalProperties(cloned.properties || {}),
      ...extraProperties,
    },
  };
};

const buildExportFeatureCollection = (features = []) => ({
  type: "FeatureCollection",
  features: features.filter(Boolean),
});

const sanitizeFileNamePart = (value, fallback = "object") => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return normalized || fallback;
};

const downloadGeoJsonFile = (features, fileName) => {
  if (typeof document === "undefined") return;

  const collection = buildExportFeatureCollection(features);
  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const cityExportFileNames = {
  perm: "perm_vernacular_objects.geojson",
  cheb: "cheboksary_vernacular_objects.geojson",
  tver: "tver_vernacular_objects.geojson",
};

const getLocalPreviewExportType = (feature) => {
  const previewKind = feature?.properties?.__previewKind;

  if (previewKind === "local-saved-create") return "create";
  if (previewKind === "local-saved-update") return "update";
  if (previewKind === "local-saved-delete") return "delete";

  return "preview";
};



class SubmissionPanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Ошибка в панели отправки заявки:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

function MapEvents({ mapRef, setMapZoom, setMapReady }) {
  const map = useMapEvents({
    zoomend: (event) => {
      setMapZoom(event.target.getZoom());
    },
  });

  useEffect(() => {
    mapRef.current = map;
    setMapZoom(map.getZoom());
    setMapReady(true);

    if (typeof window !== "undefined") {
      window._map = map;
    }

    return () => {
      if (mapRef.current === map) {
        mapRef.current = null;
      }

      if (typeof window !== "undefined" && window._map === map) {
        delete window._map;
      }

      setMapReady(false);
    };
  }, [map, mapRef, setMapReady, setMapZoom]);

  return null;
}

function App() {
  const [points, setPoints] = useState(null);
  const [lines, setLines] = useState(null);
  const [districts, setDistricts] = useState(null);
  // Which city is currently selected.
  // We keep selectedCity to move the map, update the title and switch the visible legend.
  const [selectedCity, setSelectedCity] = useState("perm");
  const [titleCity, setTitleCity] = useState("perm");
  const [titlePhase, setTitlePhase] = useState("in");
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedFeatureLayer, setSelectedFeatureLayer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [copiedFeatureLink, setCopiedFeatureLink] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mapZoom, setMapZoom] = useState(12);
  const [mapReady, setMapReady] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [legendMobileOpen, setLegendMobileOpen] = useState(false);

  // State for showing the submission panel and previewing user features
  const [showSubmissionPanel, setShowSubmissionPanel] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState(null);
  const [previewFeatures, setPreviewFeatures] = useState([]);
  const [submittedPreviewFeatures, setSubmittedPreviewFeatures] = useState([]);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [drawToolbarOpen, setDrawToolbarOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(null);
  const [drawingCoords, setDrawingCoords] = useState([]);
  const [drawingHistory, setDrawingHistory] = useState([]);
  const [drawingError, setDrawingError] = useState("");
  const [drawFeatureDraft, setDrawFeatureDraft] = useState(null);
  const [drawFeatureCityKey, setDrawFeatureCityKey] = useState(null);
  const [drawForm, setDrawForm] = useState({
    name: "",
    explainer: "",
    type: "",
    original_name: "",
  });
  const [drawSubmitError, setDrawSubmitError] = useState("");
  const [isSubmittingDrawFeature, setIsSubmittingDrawFeature] = useState(false);
  const [displayDrawPreviewLocally, setDisplayDrawPreviewLocally] = useState(true);

  const [editSelectMode, setEditSelectMode] = useState(false);
  const [editingFeatureOriginal, setEditingFeatureOriginal] = useState(null);
  const [editTargetLayer, setEditTargetLayer] = useState(null);
  const [editGeometryType, setEditGeometryType] = useState(null);
  const [editGeometryCoords, setEditGeometryCoords] = useState([]);
  const [editGeometryHistory, setEditGeometryHistory] = useState([]);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editAction, setEditAction] = useState("update");
  const [editForm, setEditForm] = useState({
    name: "",
    explainer: "",
    type: "",
    original_name: "",
    reason: "",
  });
  const [editSubmitError, setEditSubmitError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [displayEditPreviewLocally, setDisplayEditPreviewLocally] = useState(true);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [tracingEnabled, setTracingEnabled] = useState(false);
  const [traceStart, setTraceStart] = useState(null);

  const mapRef = useRef(null);
  const labelLayerRef = useRef(null);
  const deepLinkAppliedRef = useRef(false);

  const activeSnapExcludeId = editingFeatureOriginal
    ? normalizeFeatureId(editingFeatureOriginal)
    : null;

  const snapSources = useMemo(
    () => buildSnapSources([points, lines, districts], activeSnapExcludeId),
    [points, lines, districts, activeSnapExcludeId]
  );

  const traceSources = useMemo(
    () => buildTraceSources([points, lines, districts], activeSnapExcludeId, selectedCity),
    [points, lines, districts, activeSnapExcludeId, selectedCity]
  );

  const searchableFeatures = useMemo(() => {
    const collect = (collection, targetLayer) =>
      (collection?.features || []).map((feature) => ({
        feature,
        targetLayer,
        id: normalizeFeatureId(feature),
        name: getFeatureDisplayName(feature),
        cityKey: getFeatureCityKey(feature),
        cityName: cityConfigs[getFeatureCityKey(feature)]?.cityName || "Пермь",
        layerLabel: getLayerDisplayName(targetLayer),
        typeName: feature.properties?.["Тип названия"] || "Другое",
        searchText: getFeatureSearchText(feature),
      }));

    return [
      ...collect(districts, "districts"),
      ...collect(lines, "lines"),
      ...collect(points, "points"),
    ].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [districts, lines, points]);

  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const searchResults = useMemo(() => {
    if (normalizedSearchQuery.length < 2) return [];

    return searchableFeatures
      .filter((item) => item.searchText.includes(normalizedSearchQuery))
      .sort((a, b) => {
        const aStarts = normalizeSearchText(a.name).startsWith(normalizedSearchQuery) ? 0 : 1;
        const bStarts = normalizeSearchText(b.name).startsWith(normalizedSearchQuery) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;

        const aCity = a.cityKey === selectedCity ? 0 : 1;
        const bCity = b.cityKey === selectedCity ? 0 : 1;
        if (aCity !== bCity) return aCity - bCity;

        return a.name.localeCompare(b.name, "ru");
      })
      .slice(0, 12);
  }, [normalizedSearchQuery, searchableFeatures, selectedCity]);

  const currentCityExportFeatures = useMemo(() => {
    const collect = (collection) =>
      (collection?.features || [])
        .filter((feature) => getFeatureCityKey(feature) === selectedCity)
        .map((feature) => cleanFeatureForExport(feature))
        .filter(Boolean);

    return [
      ...collect(districts),
      ...collect(lines),
      ...collect(points),
    ];
  }, [districts, lines, points, selectedCity]);

  const localPreviewExportFeatures = useMemo(
    () =>
      submittedPreviewFeatures
        .map((feature) =>
          cleanFeatureForExport(feature, {
            local_preview_type: getLocalPreviewExportType(feature),
          })
        )
        .filter(Boolean),
    [submittedPreviewFeatures]
  );

  const snapCoordinate = useCallback(
    (coord) => {
      if (!snappingEnabled) return coord;
      return snapCoordinateToSources(coord, snapSources, mapRef.current);
    },
    [snappingEnabled, snapSources]
  );

  const getTraceCandidate = useCallback(
    (coord) => {
      if (!snappingEnabled || !tracingEnabled) return null;
      return findTraceCandidate(coord, traceSources, mapRef.current);
    },
    [snappingEnabled, tracingEnabled, traceSources]
  );

  const toggleSnapping = () => {
    setSnappingEnabled((value) => {
      const nextValue = !value;

      if (!nextValue) {
        setTracingEnabled(false);
        setTraceStart(null);
      }

      return nextValue;
    });
  };

  const toggleTracing = () => {
    setTracingEnabled((value) => {
      const nextValue = !value;

      if (nextValue && !snappingEnabled) {
        setSnappingEnabled(true);
      }

      setTraceStart(null);
      setDrawingError("");
      setEditSubmitError("");
      return nextValue;
    });
  };

  useEffect(() => {
    if (selectedCity === titleCity) return undefined;

    setTitlePhase("out");

    const timeoutId = window.setTimeout(() => {
      setTitleCity(selectedCity);
      setTitlePhase("in");
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [selectedCity, titleCity]);

  useEffect(() => {
    let isMounted = true;

    const loadGeoJson = async (fileName, setter) => {
      try {
        const response = await fetch(process.env.PUBLIC_URL + fileName);

        if (!response.ok) {
          throw new Error(`Не удалось загрузить ${fileName}: ${response.status}`);
        }

        const data = await response.json();

        if (isMounted) {
          setter(data);
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadGeoJson("/data/points.geojson", setPoints);
    loadGeoJson("/data/lines.geojson", setLines);
    loadGeoJson("/data/districts.geojson", setDistricts);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !districts) return undefined;

    const map = mapRef.current;

    // Remove existing label layer if present
    if (labelLayerRef.current && map.hasLayer(labelLayerRef.current)) {
      map.removeLayer(labelLayerRef.current);
    }

    const labelLayer = L.layerGroup();
    labelLayerRef.current = labelLayer;

    districts.features?.forEach((feature) => {
      const name = feature.properties?.["name"];
      if (!name) return;

      // Skip features with invalid geometry or empty coordinates
      const geometry = feature.geometry;
      if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) return;

      let featureArea;
      try {
        featureArea = turfArea(feature);
      } catch (err) {
        featureArea = 0;
      }

      // Show label either at high zoom or for large polygons
      const shouldShow = mapZoom >= 15 || featureArea > 700_000;
      if (!shouldShow) return;

      // Compute center of the feature via bounds. Catch any errors for invalid geometries.
      try {
        const geoLayer = L.geoJSON(feature, { interactive: false });
        const bounds = geoLayer.getBounds();
        if (!bounds.isValid()) return;
        const center = bounds.getCenter();
        // Create a tooltip manually and add it to the label layer
        const tooltip = L.tooltip({
          permanent: true,
          direction: "center",
          className: "feature-label",
          interactive: false,
        })
          .setLatLng(center)
          .setContent(name);
        labelLayer.addLayer(tooltip);
      } catch (err) {
        // Skip features that throw errors (e.g., invalid geometry)
        return;
      }
    });

    labelLayer.addTo(map);

    return () => {
      if (map.hasLayer(labelLayer)) {
        map.removeLayer(labelLayer);
      }
      if (labelLayerRef.current === labelLayer) {
        labelLayerRef.current = null;
      }
    };
  }, [mapReady, mapZoom, districts]);

  const resetEditState = () => {
    setEditSelectMode(false);
    setEditingFeatureOriginal(null);
    setEditTargetLayer(null);
    setEditGeometryType(null);
    setEditGeometryCoords([]);
    setEditGeometryHistory([]);
    setEditFormOpen(false);
    setEditAction("update");
    setEditForm({
      name: "",
      explainer: "",
      type: "",
      original_name: "",
      reason: "",
    });
    setEditSubmitError("");
    setIsSubmittingEdit(false);
    setDisplayEditPreviewLocally(true);
    setTraceStart(null);
  };

  const startEditingFeature = useCallback((feature, targetLayer, options = {}) => {
    if (!feature || !targetLayer) return;

    const cloned = cloneFeature(feature);
    const geometryType = cloned.geometry?.type || null;
    const editableKind = getEditableGeometryKind(geometryType);
    const coords = editableKind ? getCoordsFromEditableFeature(cloned) : [];

    setSelectedFeature(null);
    setExpanded(false);
    setEditMenuOpen(false);
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    setDrawToolbarOpen(false);
    setDrawingMode(null);
    setDrawingCoords([]);
    setDrawingHistory([]);
    setDrawingError("");
    setDrawFeatureDraft(null);
    setTraceStart(null);
    setTracingEnabled(false);

    setEditSelectMode(false);
    setEditingFeatureOriginal(cloned);
    setEditTargetLayer(targetLayer);
    setEditGeometryType(geometryType);
    setEditGeometryCoords(coords);
    setEditGeometryHistory([]);
    setEditAction("update");
    setEditForm({
      name: cloned.properties?.name || "",
      explainer: cloned.properties?.explainer || "",
      type: cloned.properties?.["Тип названия"] || "",
      original_name: cloned.properties?.original_name || "",
      reason: "",
    });
    setEditSubmitError("");
    setIsSubmittingEdit(false);
    setDisplayEditPreviewLocally(true);

    if (options.propertiesOnly || !editableKind) {
      setEditFormOpen(true);
    } else {
      setEditFormOpen(false);
    }
  }, []);


  const buildFeatureLink = useCallback((feature, targetLayer) => {
    if (typeof window === "undefined" || !feature) return "";

    const url = new URL(window.location.href);
    const featureId = normalizeFeatureId(feature);
    const cityKey = getFeatureCityKey(feature);

    url.searchParams.set("city", cityKey);
    if (targetLayer) url.searchParams.set("layer", targetLayer);

    if (featureId !== null && featureId !== undefined && featureId !== "") {
      url.searchParams.set("object", String(featureId));
      url.searchParams.delete("objectName");
    } else {
      url.searchParams.set("objectName", getFeatureDisplayName(feature));
      url.searchParams.delete("object");
    }

    return url.toString();
  }, []);

  const updateUrlForFeature = useCallback((feature, targetLayer) => {
    if (typeof window === "undefined" || !feature) return;

    const link = buildFeatureLink(feature, targetLayer);
    if (link) {
      window.history.replaceState(null, "", link);
    }
  }, [buildFeatureLink]);

  const focusFeature = useCallback((feature, targetLayer, options = {}) => {
    if (!feature) return;

    const { flyTo = true, updateUrl = false, syncSearch = false } = options;
    const cityKey = getFeatureCityKey(feature);

    setSelectedCity(cityKey);
    setSelectedFeature(feature);
    setSelectedFeatureLayer(targetLayer);
    setExpanded(false);
    setCopiedFeatureLink(false);
    setSearchFocused(false);

    if (syncSearch) {
      setSearchQuery(getFeatureDisplayName(feature));
    }

    if (flyTo && mapRef.current) {
      const map = mapRef.current;
      const bounds = getFeatureBounds(feature);

      if (bounds?.isValid()) {
        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();
        const isPointBounds = northEast.equals(southWest);

        if (isPointBounds) {
          map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), 16));
        } else {
          map.flyToBounds(bounds.pad(0.2), { maxZoom: 16 });
        }
      } else {
        const coord = getFeaturePrimaryCoordinate(feature);
        if (coord) map.flyTo([coord[1], coord[0]], Math.max(map.getZoom(), 16));
      }
    }

    if (updateUrl) {
      updateUrlForFeature(feature, targetLayer);
    }
  }, [updateUrlForFeature]);

  const handleFeatureHover = useCallback((feature, layer, targetLayer) => {
    const name = feature.properties?.["name"];
    if (!name) return;

    layer.bindTooltip(name, {
      direction: "top",
      sticky: true,
      offset: [0, -10],
      className: "custom-tooltip",
    });

    layer.on("click", (event) => {
      if (event.originalEvent) {
        L.DomEvent.preventDefault(event.originalEvent);
      }

      if (editSelectMode) {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        startEditingFeature(feature, targetLayer);
        return;
      }

      if (editingFeatureOriginal || editFormOpen || drawingMode || drawFeatureDraft) {
        return;
      }

      focusFeature(feature, targetLayer, { flyTo: false, updateUrl: false });
    });
  }, [editSelectMode, editFormOpen, editingFeatureOriginal, drawingMode, drawFeatureDraft, startEditingFeature, focusFeature]);

  const closeInfoPanel = () => {
    setSelectedFeature(null);
    setSelectedFeatureLayer(null);
    setCopiedFeatureLink(false);
    setExpanded(false);
  };

  const openSubmissionPanel = () => {
    setSubmissionNotice(null);
    setEditMenuOpen(false);
    setDrawToolbarOpen(false);
    setDrawingMode(null);
    setDrawingCoords([]);
    setDrawingError("");
    resetEditState();
    setShowSubmissionPanel(true);
  };

  const closeSubmissionPanel = () => {
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
  };

  const handleSubmissionSuccess = (response = {}) => {
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    setSubmissionNotice({
      title: "Заявка отправлена",
      text: "Спасибо за участие в создании карты! Ваша заявка будет рассмотрена, и после проверки данные смогут быть добавлены в проект.",
      pullRequestUrl: response?.pullRequestUrl || "",
    });
  };

  const handleSubmissionPanelError = () => {
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    setSubmissionNotice({
      title: "Панель заявки закрыта",
      text: "При обработке формы возникла ошибка, но карта продолжает работать. Попробуйте отправить заявку ещё раз.",
    });
  };

  const resetDrawingState = () => {
    setDrawToolbarOpen(false);
    setDrawingMode(null);
    setDrawingCoords([]);
    setDrawingHistory([]);
    setDrawingError("");
    setDrawFeatureDraft(null);
    setDrawSubmitError("");
    setDisplayDrawPreviewLocally(true);
    setTracingEnabled(false);
    setTraceStart(null);
  };

  const closeEditTools = () => {
    setEditMenuOpen(false);
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    resetDrawingState();
    resetEditState();
  };

  const toggleEditMenu = () => {
    const hasActiveEditTools =
      editMenuOpen ||
      showSubmissionPanel ||
      drawToolbarOpen ||
      editSelectMode ||
      Boolean(drawingMode) ||
      Boolean(drawFeatureDraft) ||
      Boolean(editingFeatureOriginal) ||
      editFormOpen;

    if (hasActiveEditTools) {
      closeEditTools();
      return;
    }

    setSubmissionNotice(null);
    setEditMenuOpen(true);
  };

  const openExistingEditMode = () => {
    setSubmissionNotice(null);
    setSelectedFeature(null);
    setSelectedFeatureLayer(null);
    setExpanded(false);
    setEditMenuOpen(false);
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    resetDrawingState();
    resetEditState();
    setEditSelectMode(true);
  };

  const openDrawTools = () => {
    setSubmissionNotice(null);
    setEditMenuOpen(false);
    setShowSubmissionPanel(false);
    setPreviewFeatures([]);
    resetEditState();
    setDrawToolbarOpen(true);
    setDrawingError("");
  };

  const closeDrawTools = () => {
    resetDrawingState();
  };

  const startDrawing = (mode) => {
    setDrawFeatureDraft(null);
    setDrawSubmitError("");
    setDrawingError("");
    setDrawingCoords([]);
    setDrawingHistory([]);
    setTraceStart(null);
    setDrawingMode(mode);
    setDrawFeatureCityKey(selectedCity);

    if (mode === "point") {
      setTracingEnabled(false);
    }
  };

  const openDrawDetailsForm = useCallback(
    (mode, coords) => {
      const geometry = buildGeometryFromDrawing(mode, coords);
      if (!geometry) {
        const minVertices = getMinimumVerticesForDrawingMode(mode);
        setDrawingError(
          `Для ${getDrawingModeLabel(mode)} нужно минимум ${minVertices} точек.`
        );
        return;
      }

      setDrawFeatureDraft({
        type: "Feature",
        id: Date.now(),
        properties: {},
        geometry,
      });
      setDrawFeatureCityKey(selectedCity);
      setDrawForm({
        name: "",
        explainer: "",
        type: "",
        original_name: "",
      });
      setDrawSubmitError("");
      setDisplayDrawPreviewLocally(true);
      setDrawingError("");
      setDrawingMode(null);
      setDrawingCoords([]);
      setDrawingHistory([]);
    },
    [selectedCity]
  );

  const handleDrawingMapClick = useCallback(
    (coord) => {
      if (!drawingMode) return;

      if (drawingMode === "point") {
        const snappedCoord = snapCoordinate(coord);
        openDrawDetailsForm("point", [snappedCoord]);
        return;
      }

      const addRegularDrawingPoint = (message = "") => {
        const snappedCoord = snapCoordinate(coord);

        setDrawingCoords((coords) => {
          setDrawingHistory((history) => [...history, coords]);
          return [...coords, snappedCoord];
        });

        setTraceStart(null);
        setDrawingError(message);
      };

      if (tracingEnabled) {
        const traceCandidate = getTraceCandidate(coord);

        if (!traceCandidate) {
          addRegularDrawingPoint(
            traceStart
              ? "Трассировка отменена: добавлена обычная точка вне существующей границы."
              : ""
          );
          return;
        }

        if (!traceStart) {
          const startCoord = traceCandidate.coord;

          setDrawingCoords((coords) => {
            setDrawingHistory((history) => [...history, coords]);

            if (coords.length && coordsAreEqual(coords[coords.length - 1], startCoord)) {
              return coords;
            }

            return [...coords, startCoord];
          });

          setTraceStart({ ...traceCandidate, mode: "drawing" });
          setDrawingError("Начало трассировки выбрано. Кликните вторую точку на той же границе или поставьте обычную точку в пустом месте.");
          return;
        }

        if (traceStart.pathId !== traceCandidate.pathId) {
          setDrawingError("Выберите вторую точку на той же линии или границе либо кликните в пустом месте, чтобы продолжить обычное рисование.");
          return;
        }

        const tracedCoords = buildTraceCoordsBetween(traceStart, traceCandidate, mapRef.current);

        if (!tracedCoords || tracedCoords.length < 2) {
          setDrawingError("Не удалось построить трассу по выбранной границе.");
          return;
        }

        setDrawingCoords((coords) => {
          setDrawingHistory((history) => [...history, coords]);

          let baseCoords = [...coords];
          if (
            baseCoords.length &&
            coordsAreEqual(baseCoords[baseCoords.length - 1], traceStart.coord)
          ) {
            baseCoords = baseCoords.slice(0, -1);
          }

          return dedupeConsecutiveCoords([...baseCoords, ...tracedCoords]);
        });

        setTraceStart(null);
        setDrawingError("Трассировка добавлена. Можно продолжить рисование.");
        return;
      }

      addRegularDrawingPoint("");
    },
    [
      drawingMode,
      openDrawDetailsForm,
      snapCoordinate,
      tracingEnabled,
      getTraceCandidate,
      traceStart,
    ]
  );

  const removeDrawingVertex = useCallback(
    (vertexIndex) => {
      if (drawingMode !== "line" && drawingMode !== "polygon") return;

      setDrawingCoords((coords) => {
        const minimumVertices = getMinimumVerticesForDrawingMode(drawingMode);

        if (coords.length <= minimumVertices) {
          setDrawingError(
            `Для ${getDrawingModeLabel(drawingMode)} нужно минимум ${minimumVertices} точек.`
          );
          return coords;
        }

        if (
          typeof vertexIndex !== "number" ||
          vertexIndex < 0 ||
          vertexIndex >= coords.length
        ) {
          return coords;
        }

        setDrawingHistory((history) => [...history, coords]);
        setDrawingError("");
        return coords.filter((_, index) => index !== vertexIndex);
      });
    },
    [drawingMode]
  );

  const moveDrawingVertex = useCallback(
    (vertexIndex, coord) => {
      if (drawingMode !== "line" && drawingMode !== "polygon") return;

      const snappedCoord = snapCoordinate(coord);

      setDrawingCoords((coords) => {
        if (
          typeof vertexIndex !== "number" ||
          vertexIndex < 0 ||
          vertexIndex >= coords.length ||
          !Array.isArray(snappedCoord)
        ) {
          return coords;
        }

        setDrawingHistory((history) => [...history, coords]);
        const next = [...coords];
        next[vertexIndex] = snappedCoord;
        return next;
      });

      setDrawingError("");
    },
    [drawingMode, snapCoordinate]
  );

  const undoLastDrawingAction = useCallback(() => {
    setDrawingHistory((history) => {
      if (!history.length) return history;

      const previousCoords = history[history.length - 1];
      setDrawingCoords(previousCoords);
      setDrawingError("");
      setTraceStart(null);
      return history.slice(0, -1);
    });
  }, []);

  const completeDrawing = useCallback(() => {
    if (!drawingMode || drawingMode === "point") return;
    setTraceStart(null);
    openDrawDetailsForm(drawingMode, drawingCoords);
  }, [drawingMode, drawingCoords, openDrawDetailsForm]);

  const handleDrawFormChange = (field, value) => {
    setDrawForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const closeDrawDetailsForm = () => {
    setDrawFeatureDraft(null);
    setDrawSubmitError("");
  };

  const pushEditHistory = useCallback((coords) => {
    setEditGeometryHistory((history) => [...history, coords]);
  }, []);

  const moveEditingPoint = useCallback(
    (coord) => {
      if (!editingFeatureOriginal || getEditableGeometryKind(editGeometryType) !== "point" || editFormOpen) return;

      const snappedCoord = snapCoordinate(coord);

      setEditGeometryCoords((coords) => {
        pushEditHistory(coords);
        return [snappedCoord];
      });
      setEditSubmitError("");
    },
    [editingFeatureOriginal, editGeometryType, editFormOpen, pushEditHistory, snapCoordinate]
  );

  const removeEditVertex = useCallback(
    (vertexIndex) => {
      if (!editingFeatureOriginal) return;

      const kind = getEditableGeometryKind(editGeometryType);
      if (kind !== "line" && kind !== "polygon") return;

      setEditGeometryCoords((coords) => {
        const minimumVertices = getMinimumVerticesForGeometryType(editGeometryType);

        if (coords.length <= minimumVertices) {
          setEditSubmitError(
            `Для ${getGeometryEditLabel(editGeometryType)} нужно минимум ${minimumVertices} точек.`
          );
          return coords;
        }

        if (
          typeof vertexIndex !== "number" ||
          vertexIndex < 0 ||
          vertexIndex >= coords.length
        ) {
          return coords;
        }

        pushEditHistory(coords);
        setEditSubmitError("");
        return coords.filter((_, index) => index !== vertexIndex);
      });
    },
    [editingFeatureOriginal, editGeometryType, pushEditHistory]
  );

  const addEditVertex = useCallback(
    (insertIndex, coord) => {
      if (!editingFeatureOriginal) return;

      const kind = getEditableGeometryKind(editGeometryType);
      if (kind !== "line" && kind !== "polygon") return;

      const snappedCoord = snapCoordinate(coord);

      setEditGeometryCoords((coords) => {
        const safeIndex = Math.max(0, Math.min(insertIndex, coords.length));
        pushEditHistory(coords);
        const next = [...coords];
        next.splice(safeIndex, 0, snappedCoord);
        return next;
      });
      setEditSubmitError("");
    },
    [editingFeatureOriginal, editGeometryType, pushEditHistory, snapCoordinate]
  );

  const moveEditVertex = useCallback(
    (vertexIndex, coord) => {
      if (!editingFeatureOriginal || editFormOpen || !Array.isArray(coord)) return;

      const kind = getEditableGeometryKind(editGeometryType);
      if (kind !== "point" && kind !== "line" && kind !== "polygon") return;

      const snappedCoord = snapCoordinate(coord);

      setEditGeometryCoords((coords) => {
        if (!coords.length) return coords;

        if (kind === "point") {
          pushEditHistory(coords);
          setEditSubmitError("");
          return [snappedCoord];
        }

        if (
          typeof vertexIndex !== "number" ||
          vertexIndex < 0 ||
          vertexIndex >= coords.length
        ) {
          return coords;
        }

        pushEditHistory(coords);
        setEditSubmitError("");
        const next = [...coords];
        next[vertexIndex] = snappedCoord;
        return next;
      });
    },
    [editingFeatureOriginal, editFormOpen, editGeometryType, pushEditHistory, snapCoordinate]
  );

  const undoLastEditAction = useCallback(() => {
    setEditGeometryHistory((history) => {
      if (!history.length) return history;

      const previousCoords = history[history.length - 1];
      setEditGeometryCoords(previousCoords);
      setEditSubmitError("");
      setTraceStart(null);
      return history.slice(0, -1);
    });
  }, []);

  const openEditFormForUpdate = useCallback(() => {
    if (!editingFeatureOriginal) return;

    const geometry = buildGeometryFromEditableCoords(editGeometryType, editGeometryCoords, editingFeatureOriginal.geometry);
    if (!geometry && getEditableGeometryKind(editGeometryType)) {
      const minimumVertices = getMinimumVerticesForGeometryType(editGeometryType);
      setEditSubmitError(
        `Для ${getGeometryEditLabel(editGeometryType)} нужно минимум ${minimumVertices} точек.`
      );
      return;
    }

    setTraceStart(null);
    setEditAction("update");
    setEditFormOpen(true);
    setEditSubmitError("");
  }, [editingFeatureOriginal, editGeometryType, editGeometryCoords]);

  const openEditFormForDelete = () => {
    if (!editingFeatureOriginal) return;
    setEditAction("delete");
    setEditForm((current) => ({
      ...current,
      reason: "",
    }));
    setEditFormOpen(true);
    setEditSubmitError("");
  };

  const handleEditFormChange = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submitEditedFeature = async () => {
    if (!editingFeatureOriginal || !editTargetLayer) return;

    const reason = editForm.reason.trim();
    if (!reason) {
      setEditSubmitError("Обоснование правки обязательно для заполнения.");
      return;
    }

    const originalFeatureId = normalizeFeatureId(editingFeatureOriginal);
    if (originalFeatureId === null) {
      setEditSubmitError("У объекта нет id, поэтому его нельзя отредактировать автоматически.");
      return;
    }

    const change = {
      changeType: editAction,
      targetLayer: editTargetLayer,
      originalFeatureId,
      // The backend primarily updates/deletes by id. During local testing the
      // GitHub base branch may still contain GeoJSON files without numeric ids,
      // so we also send the original feature snapshot as a safe fallback for
      // matching by name/city/geometry.
      originalFeature: editingFeatureOriginal,
      reason,
    };

    let editedFeature = null;

    if (editAction === "update") {
      const name = editForm.name.trim();
      const explainer = editForm.explainer.trim();

      if (!name || !explainer) {
        setEditSubmitError("Название и описание обязательны для заполнения.");
        return;
      }

      editedFeature = buildEditedFeatureFromState(
        editingFeatureOriginal,
        editGeometryType,
        editGeometryCoords,
        editForm
      );

      change.feature = editedFeature;
    }

    const submission = {
      source: "public-map",
      method: editAction === "delete" ? "delete-existing-feature" : "edit-existing-feature",
      captchaToken: null,
      author: { displayName: "", contact: "" },
      changes: [change],
    };

    setIsSubmittingEdit(true);
    setEditSubmitError("");

    try {
      const response = await submitUserSubmission(submission);

      if (displayEditPreviewLocally) {
        const localPreviewFeature = editAction === "delete"
          ? withLocalPreviewKind(editingFeatureOriginal, "local-saved-delete")
          : withLocalPreviewKind(editedFeature, "local-saved-update");

        if (localPreviewFeature) {
          setSubmittedPreviewFeatures((features) => [...features, localPreviewFeature]);
        }
      }

      resetEditState();
      setSubmissionNotice({
        title: editAction === "delete" ? "Удаление отправлено" : "Правка отправлена",
        text:
          editAction === "delete"
            ? displayEditPreviewLocally
              ? "Спасибо за участие в создании карты! Предложение удалить объект отправлено на модерацию, а удаляемый объект временно отмечен на карте."
              : "Спасибо за участие в создании карты! Предложение удалить объект отправлено на модерацию."
            : displayEditPreviewLocally
              ? "Спасибо за участие в создании карты! Предложенная правка отправлена на модерацию и временно отображена на карте пунктиром."
              : "Спасибо за участие в создании карты! Предложенная правка отправлена на модерацию и будет применена после проверки.",
        pullRequestUrl: response?.pullRequestUrl || "",
      });
    } catch (err) {
      setEditSubmitError(err.message || "Не удалось отправить правку.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const openSelectedFeaturePropertyEdit = () => {
    if (!selectedFeature || !selectedFeatureLayer) return;
    startEditingFeature(selectedFeature, selectedFeatureLayer, { propertiesOnly: true });
  };

  const copySelectedFeatureLink = async () => {
    if (!selectedFeature) return;

    const link = buildFeatureLink(selectedFeature, selectedFeatureLayer);
    if (!link) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement("input");
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setCopiedFeatureLink(true);
      window.setTimeout(() => setCopiedFeatureLink(false), 1800);
    } catch (error) {
      console.error("Не удалось скопировать ссылку на объект:", error);
    }
  };
  const downloadSelectedFeatureGeoJson = () => {
    if (!selectedFeature) return;

    const featureId = normalizeFeatureId(selectedFeature);
    const namePart = sanitizeFileNamePart(
      featureId !== null ? `object_${featureId}` : getFeatureDisplayName(selectedFeature),
      "selected_object"
    );

    downloadGeoJsonFile(
      [cleanFeatureForExport(selectedFeature)],
      `selected_${namePart}.geojson`
    );
  };

  const downloadCurrentCityGeoJson = () => {
    const fileName = cityExportFileNames[selectedCity] || `${selectedCity}_vernacular_objects.geojson`;
    downloadGeoJsonFile(currentCityExportFeatures, fileName);
    setExportMenuOpen(false);
  };

  const downloadLocalPreviewGeoJson = () => {
    downloadGeoJsonFile(localPreviewExportFeatures, "local_preview_changes.geojson");
    setExportMenuOpen(false);
  };


  const buildDrawnFeatureFromForm = () => {
    if (!drawFeatureDraft) return null;

    const name = drawForm.name.trim();
    const explainer = drawForm.explainer.trim();

    if (!name || !explainer) {
      setDrawSubmitError("Название и описание обязательны для заполнения.");
      return null;
    }

    const cityKey = drawFeatureCityKey || selectedCity;
    const cityConfig = cityConfigs[cityKey] || cityConfigs.perm;
    const featureType = drawForm.type || "Другое";
    const targetLayer = getTargetLayerByGeometryType(drawFeatureDraft.geometry?.type);

    if (!targetLayer) {
      setDrawSubmitError("Не удалось определить слой для созданной геометрии.");
      return null;
    }

    const properties = {
      name,
      explainer,
      city: cityConfig.cityName,
      "Тип названия": featureType,
    };

    const originalName = drawForm.original_name.trim();
    if (originalName) {
      properties.original_name = originalName;
    }

    const feature = {
      ...drawFeatureDraft,
      id: drawFeatureDraft.id || Date.now(),
      properties,
    };

    return { feature, targetLayer };
  };

  const submitDrawnFeature = async () => {
    const result = buildDrawnFeatureFromForm();
    if (!result) return;

    const { feature, targetLayer } = result;

    const submission = {
      source: "public-map",
      method: "draw-tool",
      captchaToken: null,
      author: { displayName: "", contact: "" },
      changes: [
        {
          changeType: "create",
          targetLayer,
          originalFeatureId: null,
          feature,
        },
      ],
    };

    setIsSubmittingDrawFeature(true);
    setDrawSubmitError("");

    try {
      const response = await submitUserSubmission(submission);

      if (displayDrawPreviewLocally) {
        setSubmittedPreviewFeatures((features) => [
          ...features,
          withLocalPreviewKind(feature, "local-saved-create"),
        ]);
      }

      setDrawFeatureDraft(null);
      setDrawToolbarOpen(false);
      setDrawingMode(null);
      setDrawingCoords([]);

      setSubmissionNotice({
        title: "Заявка отправлена",
        text: displayDrawPreviewLocally
          ? "Спасибо за участие в создании карты! Новый объект отправлен на модерацию и временно отображён на карте пунктиром."
          : "Спасибо за участие в создании карты! Новый объект отправлен на модерацию и будет добавлен после проверки.",
        pullRequestUrl: response?.pullRequestUrl || "",
      });
    } catch (err) {
      setDrawSubmitError(err.message || "Не удалось отправить заявку.");
    } finally {
      setIsSubmittingDrawFeature(false);
    }
  };

  /**
   * Navigate the map to a specific city and toggle the visible dataset.
   *
   * When called, this function updates the selectedCity state,
   * then uses the Leaflet map instance to set the view to the
   * appropriate coordinates. The zoom level is preserved unless
   * otherwise specified.
   *
   * @param {string} city City config key: "perm", "cheb" or "tver"
   */
  const handleCityNavigation = (city) => {
    const config = cityConfigs[city];
    if (!config) return;

    setSelectedCity(city);
    if (mapRef.current) {
      const currentZoom = mapRef.current.getZoom();
      // Use flyTo for smooth animation when switching cities
      mapRef.current.flyTo(config.center, currentZoom);
    }
  };

  useEffect(() => {
    if (deepLinkAppliedRef.current || !mapReady || !points || !lines || !districts) {
      return;
    }

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const objectId = params.get("object");
    const objectName = normalizeSearchText(params.get("objectName"));
    const requestedLayer = params.get("layer");
    const requestedCity = params.get("city");

    if (!objectId && !objectName) return;

    const collections = {
      districts,
      lines,
      points,
    };

    const layerOrder = requestedLayer && collections[requestedLayer]
      ? [requestedLayer]
      : ["districts", "lines", "points"];

    for (const layerName of layerOrder) {
      const collection = collections[layerName];
      const foundFeature = collection?.features?.find((feature) => {
        if (requestedCity && cityConfigs[requestedCity] && getFeatureCityKey(feature) !== requestedCity) {
          return false;
        }

        const featureId = normalizeFeatureId(feature);
        if (objectId && String(featureId) === String(objectId)) return true;

        if (objectName && normalizeSearchText(getFeatureDisplayName(feature)) === objectName) return true;

        return false;
      });

      if (foundFeature) {
        deepLinkAppliedRef.current = true;
        focusFeature(foundFeature, layerName, { flyTo: true, updateUrl: false, syncSearch: false });
        break;
      }
    }
  }, [mapReady, points, lines, districts, focusFeature]);

  const featureProps = selectedFeature?.properties || {};
  const selectedFeatureCityKey = selectedFeature ? getFeatureCityKey(selectedFeature) : selectedCity;
  const selectedFeatureCityConfig = cityConfigs[selectedFeatureCityKey] || cityConfigs.perm;
  const selectedFeatureType = featureProps["Тип названия"] || "Другое";
  const selectedFeatureTypeColors = selectedFeature ? getFeatureTypeColors(selectedFeature) : cityConfigs.perm.typeColors;
  const selectedFeatureTypeColor = selectedFeatureTypeColors[selectedFeatureType] || "#999999";
  const selectedFeatureLink = selectedFeature ? buildFeatureLink(selectedFeature, selectedFeatureLayer) : "";
  const explainer = featureProps["explainer"] || "";
  const explainerSentences = splitIntoSentences(explainer);
  const isExpandable = explainerSentences.length > 3;
  const visibleExplainer = expanded ? explainer : getTextPreview(explainer);
  const currentCityConfig = cityConfigs[selectedCity] || cityConfigs.perm;
  const currentTypeColors = currentCityConfig.typeColors;
  const titleCityName = cityConfigs[titleCity]?.titleName || cityConfigs.perm.titleName;
  const drawingPreviewFeatures = buildDrawingPreviewFeatures(drawingMode, drawingCoords);
  const draftPreviewFeatures = drawFeatureDraft
    ? [
        {
          ...drawFeatureDraft,
          properties: {
            ...drawFeatureDraft.properties,
            name: drawForm.name.trim() || "Новый объект",
          },
        },
      ]
    : [];
  const activeEditPreviewFeatures =
    editingFeatureOriginal && !editFormOpen
      ? buildEditPreviewFeatures(editingFeatureOriginal, editGeometryType, editGeometryCoords, {
          includeGeometry: true,
          includeHandles: true,
        })
      : [];
  const editFormPreviewFeatures =
    editingFeatureOriginal && editFormOpen
      ? buildEditPreviewFeatures(editingFeatureOriginal, editGeometryType, editGeometryCoords, {
          includeGeometry: true,
          includeHandles: false,
          deletePreview: editAction === "delete",
          formValues: editAction === "update" ? editForm : null,
        })
      : [];
  const selectedFeaturePreviewFeatures =
    selectedFeature &&
    !editSelectMode &&
    !editingFeatureOriginal &&
    !editFormOpen &&
    !drawingMode &&
    !drawFeatureDraft &&
    !showSubmissionPanel
      ? [withLocalPreviewKind(selectedFeature, "selected-feature")]
      : [];
  const previewLayerFeatures = [
    ...previewFeatures,
    ...submittedPreviewFeatures,
    ...selectedFeaturePreviewFeatures,
    ...draftPreviewFeatures,
    ...drawingPreviewFeatures,
    ...activeEditPreviewFeatures,
    ...editFormPreviewFeatures,
  ];
  const canCompleteDrawing =
    drawingMode &&
    drawingMode !== "point" &&
    drawingCoords.length >= getMinimumVerticesForDrawingMode(drawingMode);
  const editGeometryKind = getEditableGeometryKind(editGeometryType);
  const canUseTracing = Boolean(drawingMode && drawingMode !== "point" && snappingEnabled);
  const drawFeatureConfig =
    cityConfigs[drawFeatureCityKey || selectedCity] || currentCityConfig;
  const drawTypeOptions = Object.keys(drawFeatureConfig.typeColors || {});
  const editFeatureConfig =
    cityConfigs[getFeatureCityKey(editingFeatureOriginal)] || currentCityConfig;
  const editTypeOptions = Object.keys(editFeatureConfig.typeColors || {});
  const canEditGeometry = Boolean(editGeometryKind);
  const canUndoEdit = editGeometryHistory.length > 0;

  return (
    <div className={`App ${drawingMode || editSelectMode || (editingFeatureOriginal && !editFormOpen) ? "drawing-active" : ""}`}>
      <div className="header-trapezoid">
        <h1 className="header-title">
          Вернакулярная карта{" "}
          <span
            className={`header-city-word ${
              titlePhase === "out"
                ? "header-city-word-out"
                : "header-city-word-in"
            }`}
          >
            {titleCityName}
          </span>
        </h1>
      </div>

      <button
        className="about-button"
        onClick={() => setShowAbout(true)}
        aria-label="О карте"
        title="О карте"
      >
        <span>О карте</span>
      </button>

      {/* New edit button positioned on the left side of the header */}
      <button
        className={`edit-button ${
          editMenuOpen ||
          showSubmissionPanel ||
          drawToolbarOpen ||
          editSelectMode ||
          drawingMode ||
          drawFeatureDraft ||
          editingFeatureOriginal ||
          editFormOpen
            ? "active"
            : ""
        }`}
        onClick={toggleEditMenu}
        aria-label="Предложить правку"
        title="Предложить правку"
      >
        <span className="edit-icon">✎</span>
      </button>

      {editMenuOpen && (
        <div className="edit-mode-menu" role="menu" aria-label="Выбор режима правки">
          <button
            className="edit-mode-option"
            type="button"
            onClick={openSubmissionPanel}
          >
            <span className="edit-mode-icon edit-mode-icon-geojson">GJ</span>
            <span>Импорт GeoJSON</span>
          </button>

          <button
            className="edit-mode-option"
            type="button"
            onClick={openDrawTools}
          >
            <span className="edit-mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M4 17.5L9 5l4.5 9 2-4L20 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="4" cy="17.5" r="1.8" fill="currentColor" />
                <circle cx="9" cy="5" r="1.8" fill="currentColor" />
                <circle cx="13.5" cy="14" r="1.8" fill="currentColor" />
                <circle cx="20" cy="18" r="1.8" fill="currentColor" />
              </svg>
            </span>
            <span>Нарисовать объект</span>
          </button>

          <button
            className="edit-mode-option"
            type="button"
            onClick={openExistingEditMode}
          >
            <span className="edit-mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M5 19l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.5 6.5l3 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>Редактировать объект</span>
          </button>
        </div>
      )}


      <div className="map-search-panel">
        <div className="map-search-row">
          <div className="map-search-input-wrap">
            <span className="map-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => {
                setSearchFocused(true);
                setExportMenuOpen(false);
              }}
              placeholder="Найти"
              aria-label="Поиск по объектам карты"
            />
            {searchQuery && (
              <button
                className="map-search-clear"
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchFocused(false);
                }}
                aria-label="Очистить поиск"
              >
                ×
              </button>
            )}
          </div>

          <button
            className={`map-export-toggle ${exportMenuOpen ? "active" : ""}`}
            type="button"
            onClick={() => {
              setExportMenuOpen((value) => !value);
              setSearchFocused(false);
            }}
            title="Скачать данные карты в формате GeoJSON"
            aria-label="Скачать данные карты"
          >
            ⬇
          </button>
        </div>

        {exportMenuOpen && (
          <div className="map-export-menu">
            <div className="map-export-title">Скачать данные</div>

            <button
              type="button"
              onClick={downloadCurrentCityGeoJson}
              disabled={!currentCityExportFeatures.length}
            >
              Текущий город
              <span>{currentCityExportFeatures.length} объектов</span>
            </button>

            <button
              type="button"
              onClick={downloadLocalPreviewGeoJson}
              disabled={!localPreviewExportFeatures.length}
            >
              Локальные правки
              <span>{localPreviewExportFeatures.length || "нет"}</span>
            </button>
          </div>
        )}

        {searchFocused && normalizedSearchQuery.length >= 2 && (
          <div className="map-search-results" role="listbox">
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <button
                  key={`${result.targetLayer}_${result.id ?? result.name}`}
                  type="button"
                  className="map-search-result"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => focusFeature(result.feature, result.targetLayer, {
                    flyTo: true,
                    updateUrl: true,
                    syncSearch: true,
                  })}
                >
                  <span className="map-search-result-name">{result.name}</span>
                  <span className="map-search-result-meta">
                    {result.cityName} · {result.layerLabel} · {getDisplayTypeName(result.typeName, result.cityKey)}
                  </span>
                </button>
              ))
            ) : (
              <div className="map-search-empty">Ничего не найдено</div>
            )}
          </div>
        )}
      </div>

      <MapContainer
        center={[58.01, 56.25]}
        zoom={12}
        attributionControl={false}
        zoomControl={false}
        style={{ height: "calc(100vh - var(--header-height))", width: "100%" }}
      >
        <MapEvents
          mapRef={mapRef}
          setMapZoom={setMapZoom}
          setMapReady={setMapReady}
        />

        <ZoomControl position="topright" />

        <DrawingMapEvents
          drawingMode={drawingMode}
          onAddCoordinate={handleDrawingMapClick}
          onCompleteDrawing={completeDrawing}
        />

        <EditingMapEvents
          editingFeature={editingFeatureOriginal}
          editGeometryType={editGeometryType}
          editFormOpen={editFormOpen}
          onMovePoint={moveEditingPoint}
          onCompleteEdit={openEditFormForUpdate}
        />

        <TileLayer
          attribution="Tiles © Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />

        <Pane name="polygons-pane" style={{ zIndex: 410 }}>
          {/* Always render districts on the polygons pane; the dataset includes both Perm and Cheboksary objects */}
          {districts && (
            <GeoJSON
              key={`districts-${editSelectMode ? "edit-select" : "view"}-${editingFeatureOriginal ? "editing" : "idle"}`}
              data={districts}
              pane="polygons-pane"
              style={styleByType}
              onEachFeature={(feature, layer) => handleFeatureHover(feature, layer, "districts")}
            />
          )}
        </Pane>

        <Pane name="lines-pane" style={{ zIndex: 420 }}>
          {/* Always render lines regardless of selected city */}
          {lines && (
            <GeoJSON
              key={`lines-${editSelectMode ? "edit-select" : "view"}-${editingFeatureOriginal ? "editing" : "idle"}`}
              data={lines}
              pane="lines-pane"
              style={styleByType}
              onEachFeature={(feature, layer) => handleFeatureHover(feature, layer, "lines")}
            />
          )}
        </Pane>

        <Pane name="points-pane" style={{ zIndex: 430 }}>
          {/* Always render points regardless of selected city */}
          {points && (
            <GeoJSON
              key={`points-${editSelectMode ? "edit-select" : "view"}-${editingFeatureOriginal ? "editing" : "idle"}`}
              data={points}
              pane="points-pane"
              pointToLayer={(feature, latlng) => {
                const layer = L.circleMarker(latlng, {
                  ...styleByType(feature),
                  pane: "points-pane",
                });
                handleFeatureHover(feature, layer, "points");
                return layer;
              }}
            />
          )}
        </Pane>

        {/* Preview of user submission features rendered above existing layers.
            SubmissionPreviewLayer creates/uses its own pane, so we do not wrap it
            in an extra <Pane> here to avoid duplicate Leaflet pane errors. */}
        {previewLayerFeatures.length > 0 && (
          <SubmissionPreviewLayer
            previewFeatures={previewLayerFeatures}
            pane="submission-preview-pane"
            onRemoveDrawingVertex={removeDrawingVertex}
            onMoveDrawingVertex={moveDrawingVertex}
            onRemoveEditVertex={removeEditVertex}
            onMoveEditVertex={moveEditVertex}
            onAddEditVertex={addEditVertex}
            snapCoordinate={snapCoordinate}
            snappingEnabled={snappingEnabled}
          />
        )}
      </MapContainer>

      {/* Navigation buttons for quickly moving the map between cities */}
      <div className="map-nav">
        {Object.entries(cityConfigs).map(([cityKey, config]) => (
          <button
            key={cityKey}
            className={`nav-button ${selectedCity === cityKey ? "active" : ""}`}
            onClick={() => handleCityNavigation(cityKey)}
          >
            {config.label}
          </button>
        ))}
      </div>

      {submissionNotice && (
        <div className="submission-success-panel" role="status" aria-live="polite">
          <button
            className="close-btn"
            onClick={() => setSubmissionNotice(null)}
            aria-label="Закрыть сообщение"
          >
            ×
          </button>

          <h2>{submissionNotice.title}</h2>

          <p>{submissionNotice.text}</p>

          {submissionNotice.pullRequestUrl && (
            <p className="submission-pr-link">
              Ваша правка доступна по{" "}
              <a
                href={submissionNotice.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                ссылке
              </a>.
            </p>
          )}

          <button
            className="success-ok-btn"
            onClick={() => setSubmissionNotice(null)}
          >
            Вернуться к карте
          </button>
        </div>
      )}


      {editSelectMode && (
        <div className="edit-select-banner">
          <button
            className="close-btn"
            onClick={resetEditState}
            aria-label="Выйти из режима выбора объекта"
          >
            ×
          </button>
          <strong>Выберите объект на карте</strong>
          <span>Кликните по точке, линии или полигону, который нужно отредактировать.</span>
        </div>
      )}

      {editingFeatureOriginal && !editFormOpen && (
        <div className="edit-geometry-toolbar" aria-label="Редактирование объекта">
          <div className="edit-geometry-title">
            Редактирование: {editingFeatureOriginal.properties?.name || "объект"}
          </div>

          <div className="mobile-editor-hint" aria-live="polite">
            {editGeometryKind === "point"
              ? "Перетяните точку или коснитесь карты, чтобы переместить её. Затем нажмите ✓ Завершить."
              : "Перетаскивайте вершины пальцем. + добавляет вершину, × удаляет. Затем нажмите ✓ Завершить."}
          </div>

          {!canEditGeometry && (
            <div className="edit-geometry-note">
              Для этой геометрии доступно редактирование описания и удаление.
            </div>
          )}

          {getEditableGeometryKind(editGeometryType) === "point" && (
            <div className="edit-geometry-note">
              Кликните по карте, чтобы переместить точку.
            </div>
          )}

          {(editGeometryKind === "line" || editGeometryKind === "polygon") && (
            <div className="edit-geometry-note">
              Клик по маленькой точке на грани добавляет вершину. Клик по вершине с × удаляет её. Магнит притягивает вершины к соседним точкам и границам.
            </div>
          )}


          <div className="edit-geometry-actions">
            <button
              type="button"
              className="edit-geometry-btn primary"
              onClick={openEditFormForUpdate}
            >
              ✓ Завершить
            </button>

            {canEditGeometry && (
              <button
                type="button"
                className="edit-geometry-btn"
                onClick={undoLastEditAction}
                disabled={!canUndoEdit}
              >
                ↶ Отменить
              </button>
            )}

            {canEditGeometry && (
              <button
                type="button"
                className={`edit-geometry-btn snap-toggle ${snappingEnabled ? "active" : ""}`}
                onClick={toggleSnapping}
                title="Примагничивание к вершинам и границам существующих объектов"
              >
                🧲 Магнит: {snappingEnabled ? "вкл" : "выкл"}
              </button>
            )}


            <button
              type="button"
              className="edit-geometry-btn danger"
              onClick={openEditFormForDelete}
            >
              Удалить объект
            </button>

            <button
              type="button"
              className="edit-geometry-btn"
              onClick={resetEditState}
            >
              Отмена
            </button>
          </div>

          {editSubmitError && <div className="error-message">{editSubmitError}</div>}
        </div>
      )}

      {editFormOpen && editingFeatureOriginal && (
        <div className="draw-feature-form edit-feature-form">
          <button
            className="close-btn"
            onClick={resetEditState}
            aria-label="Закрыть форму редактирования"
            disabled={isSubmittingEdit}
          >
            ×
          </button>

          <h2>{editAction === "delete" ? "Удаление объекта" : "Редактирование объекта"}</h2>

          <p className="draw-feature-form-note">
            Объект: {editingFeatureOriginal.properties?.name || "без названия"}.
            {editAction === "delete"
              ? " Укажите обоснование удаления."
              : " Проверьте поля и укажите обоснование правки."}
          </p>

          {editSubmitError && <div className="error-message">{editSubmitError}</div>}

          {editAction === "update" && (
            <>
              <label>
                Название *
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(event) => handleEditFormChange("name", event.target.value)}
                  placeholder="Введите вернакулярное название"
                  disabled={isSubmittingEdit}
                />
              </label>

              <label>
                Описание *
                <textarea
                  value={editForm.explainer}
                  onChange={(event) => handleEditFormChange("explainer", event.target.value)}
                  placeholder="Кратко объясните происхождение или смысл названия"
                  rows={5}
                  disabled={isSubmittingEdit}
                />
              </label>

              <label>
                Тип названия
                <select
                  value={editForm.type}
                  onChange={(event) => handleEditFormChange("type", event.target.value)}
                  disabled={isSubmittingEdit}
                >
                  <option value="">Другое / не указано</option>
                  {editTypeOptions.map((typeName) => (
                    <option key={typeName} value={typeName}>
                      {getDisplayTypeName(typeName, getFeatureCityKey(editingFeatureOriginal))}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Официальное название
                <input
                  type="text"
                  value={editForm.original_name}
                  onChange={(event) => handleEditFormChange("original_name", event.target.value)}
                  placeholder="Можно оставить пустым"
                  disabled={isSubmittingEdit}
                />
              </label>
            </>
          )}

          <label>
            Обоснование {editAction === "delete" ? "удаления" : "правки"} *
            <textarea
              value={editForm.reason}
              onChange={(event) => handleEditFormChange("reason", event.target.value)}
              placeholder="Коротко объясните, почему нужна эта правка"
              rows={4}
              disabled={isSubmittingEdit}
            />
          </label>

          <label className="local-preview-option">
            <input
              type="checkbox"
              checked={displayEditPreviewLocally}
              onChange={(event) => setDisplayEditPreviewLocally(event.target.checked)}
              disabled={isSubmittingEdit}
            />
            <span>Отобразить правку локально</span>
            <span
              className="local-preview-help"
              tabIndex={0}
              aria-label="После отправки на модерацию правка будет временно показана на карте пунктиром только в вашем браузере. Это не заменяет отправку заявки и не меняет основные данные до принятия Pull Request."
            >
              ?
            </span>
          </label>

          <div className="draw-feature-form-actions">
            <button
              type="button"
              className={editAction === "delete" ? "danger-submit-btn" : "success-ok-btn"}
              onClick={submitEditedFeature}
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit
                ? "Отправка..."
                : editAction === "delete"
                  ? "Отправить удаление на модерацию"
                  : "Отправить правку на модерацию"}
            </button>
          </div>
        </div>
      )}

      {drawToolbarOpen && (
        <div className="draw-toolbar" aria-label="Инструменты рисования">
          <div className="draw-tool-group">
            <button
              className={`draw-tool-button ${drawingMode === "polygon" ? "active" : ""}`}
              type="button"
              onClick={() => startDrawing("polygon")}
              title="Добавить полигон"
              aria-label="Добавить полигон"
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M5 7l7-4 7 5-2 10-9 2-5-7z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              className={`draw-tool-button ${drawingMode === "line" ? "active" : ""}`}
              type="button"
              onClick={() => startDrawing("line")}
              title="Добавить линию"
              aria-label="Добавить линию"
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M4 18L9 8l5 5 6-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              className={`draw-tool-button ${drawingMode === "point" ? "active" : ""}`}
              type="button"
              onClick={() => startDrawing("point")}
              title="Добавить точку"
              aria-label="Добавить точку"
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <circle cx="12" cy="12" r="5.5" fill="currentColor" />
              </svg>
            </button>

            <button
              className="draw-tool-button draw-close-button"
              type="button"
              onClick={closeDrawTools}
              title="Выйти из режима создания объектов"
              aria-label="Выйти из режима создания объектов"
            >
              ×
            </button>
          </div>

          <div className="mobile-editor-hint" aria-live="polite">
            {drawingMode
              ? "Касание по карте добавляет вершину. Перетаскивайте вершины пальцем. × удаляет вершину, ✓ завершает объект."
              : "Выберите тип объекта: полигон, линия или точка."}
          </div>

          <button
            className={`draw-snap-button ${snappingEnabled ? "active" : ""}`}
            type="button"
            onClick={toggleSnapping}
            title="Примагничивание к вершинам и границам существующих объектов"
            aria-label="Переключить примагничивание"
          >
            🧲 Магнит: {snappingEnabled ? "вкл" : "выкл"}
          </button>

          <button
            className={`draw-trace-button ${tracingEnabled ? "active" : ""}`}
            type="button"
            onClick={toggleTracing}
            disabled={!canUseTracing}
            title="Трассировка по существующей линии или границе"
            aria-label="Переключить трассировку"
          >
            ⛓ Трассировка: {tracingEnabled ? "вкл" : "выкл"}
          </button>

          {traceStart && (
            <div className="draw-trace-status">
              Начало трассировки выбрано. Кликните вторую точку на той же границе.
            </div>
          )}

          {drawingMode && drawingMode !== "point" && (
            <button
              className="draw-finish-button"
              type="button"
              onClick={completeDrawing}
              disabled={!canCompleteDrawing}
            >
              ✓ Завершить
            </button>
          )}

          {drawingMode && drawingMode !== "point" && (
            <button
              className="draw-undo-button"
              type="button"
              onClick={undoLastDrawingAction}
              disabled={!drawingHistory.length}
            >
              ↶ Отменить
            </button>
          )}

          {drawingError && <div className="draw-error">{drawingError}</div>}
        </div>
      )}

      {drawFeatureDraft && (
        <div className="draw-feature-form">
          <button
            className="close-btn"
            onClick={closeDrawDetailsForm}
            aria-label="Закрыть форму"
          >
            ×
          </button>

          <h2>Описание нового объекта</h2>

          <p className="draw-feature-form-note">
            Город: {drawFeatureConfig.cityName}. Геометрия будет отправлена как заявка на модерацию.
          </p>

          {drawSubmitError && <div className="error-message">{drawSubmitError}</div>}

          <label>
            Название *
            <input
              type="text"
              value={drawForm.name}
              onChange={(event) => handleDrawFormChange("name", event.target.value)}
              placeholder="Введите вернакулярное название"
            />
          </label>

          <label>
            Описание *
            <textarea
              value={drawForm.explainer}
              onChange={(event) => handleDrawFormChange("explainer", event.target.value)}
              placeholder="Кратко объясните происхождение или смысл названия"
              rows={5}
            />
          </label>

          <label>
            Тип названия
            <select
              value={drawForm.type}
              onChange={(event) => handleDrawFormChange("type", event.target.value)}
            >
              <option value="">Другое / не указано</option>
              {drawTypeOptions.map((typeName) => (
                <option key={typeName} value={typeName}>
                  {getDisplayTypeName(typeName, drawFeatureCityKey || selectedCity)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Официальное название
            <input
              type="text"
              value={drawForm.original_name}
              onChange={(event) =>
                handleDrawFormChange("original_name", event.target.value)
              }
              placeholder="Можно оставить пустым"
            />
          </label>

          <label className="local-preview-option">
            <input
              type="checkbox"
              checked={displayDrawPreviewLocally}
              onChange={(event) => setDisplayDrawPreviewLocally(event.target.checked)}
              disabled={isSubmittingDrawFeature}
            />
            <span>Отобразить правку локально</span>
            <span
              className="local-preview-help"
              tabIndex={0}
              aria-label="После отправки на модерацию новый объект будет временно показан на карте пунктиром только в вашем браузере. Это не заменяет отправку заявки и не меняет основные данные до принятия Pull Request."
            >
              ?
            </span>
          </label>

          <div className="draw-feature-form-actions">
            <button
              type="button"
              className="success-ok-btn"
              onClick={submitDrawnFeature}
              disabled={isSubmittingDrawFeature}
            >
              {isSubmittingDrawFeature ? "Отправка..." : "Отправить на модерацию"}
            </button>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="about-panel">
          <button className="close-about" onClick={() => setShowAbout(false)}>
            ×
          </button>

          <div className="about-content">
            <p>
              <strong>Вернакулярная карта города</strong> — это субъективная
              карта, отражающая восприятие, ассоциации и повседневный опыт
              местными жителями, а не официальную географию. Тем не менее,
              иногда они могут совпадать или быть производными друг от друга.
            </p>

            <p>
              Для создания данной вернакулярной карты было инициировано
              несколько опросов жителей города о том, какие разговорные
              названия они употребляют в обычной жизни по отношению к разным
              объектам в городе...
            </p>

            <p>
              Опросы происходили в telegram-каналах:
              <br />– «Без поддержки министерства культуры»
            </p>

            <p>
              "Местные эксперты": журналист Иван Козлов,
              Юрий Дягилев.
            </p>

            <p>
              Данные по Чебоксарам: студент Станислав Клементьев.
            </p>

            <p>
              Данные по Твери:{" "}
              <a
                href="https://altsyplenkov.github.io/projects/vernacular-districts-tver.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                студент Александр Цыпленков
              </a>.
            </p>

            <p>
              Важно: приоритет отдавался более локальным названиям, которые не связаны с официальными. Не все названия являются единственными релевантными. Границы районов неточны, ими нельзя пользоваться для детального определения местоположения внутри вернакулярных районов.
            </p>
          </div>
        </div>
      )}

      <div className={`legend-box-horizontal ${legendMobileOpen ? "mobile-open" : ""}`}>
        <div className="legend-header-row">
          <h4>{currentCityConfig.legendTitle}</h4>
          <button
            className="legend-mobile-toggle"
            type="button"
            onClick={() => setLegendMobileOpen((value) => !value)}
            aria-expanded={legendMobileOpen}
          >
            {legendMobileOpen ? "Скрыть" : "Легенда"}
          </button>
        </div>

        <div className="legend-vertical">
          {Object.entries(currentTypeColors).map(([name, color]) => (
            <div key={name} className="legend-entry">
              <div
                className="legend-color-box"
                style={{ backgroundColor: color }}
              ></div>

              <div className="legend-label">
                {getDisplayTypeName(name, selectedCity)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFeature && (
        <div className={`info-panel ${expanded ? "expanded" : ""}`}>
          <button className="close-btn" onClick={closeInfoPanel} aria-label="Закрыть карточку объекта">
            ×
          </button>

          <div className="panel-card-topline">
            <span className="panel-city-badge">{selectedFeatureCityConfig.cityName}</span>
            <span
              className="panel-type-badge"
              style={{
                borderColor: selectedFeatureTypeColor,
                backgroundColor: `${selectedFeatureTypeColor}18`,
                color: selectedFeatureTypeColor,
              }}
            >
              {getDisplayTypeName(selectedFeatureType, selectedFeatureCityKey)}
            </span>
          </div>

          <div className="panel-header panel-header-enhanced">
            <div>
              <div className="panel-kicker">Вернакулярное название</div>
              <h2 className="panel-title">{featureProps["name"]}</h2>
            </div>
          </div>

          {featureProps["original_name"] && (
            <div className="panel-info-row">
              <span className="panel-info-label">Официальное название</span>
              <span className="panel-info-value">{featureProps["original_name"]}</span>
            </div>
          )}

          <div className="panel-section">
            <div className="panel-section-title">Описание</div>
            <div className="panel-explainer">
              {visibleExplainer || "Описание пока не добавлено."}
            </div>
          </div>

          {/* Photos section: render only if photos are defined */}
          {(() => {
            const photos = getFeaturePhotos(featureProps);
            return photos.length > 0 ? (
              <div className="panel-photos panel-section">
                <div className="panel-section-title">Фотографии</div>
                {photos.map((p, index) => (
                  <div key={index} className="panel-photo">
                    <img src={p.src} alt={p.alt || featureProps["name"] || ""} />
                    {p.caption && (
                      <div className="panel-photo-caption">{p.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null;
          })()}

          <div className="panel-actions">
            <button
              className="panel-action-button panel-action-primary"
              type="button"
              onClick={openSelectedFeaturePropertyEdit}
            >
              ✎ Предложить правку
            </button>

            <button
              className="panel-action-button"
              type="button"
              onClick={copySelectedFeatureLink}
              disabled={!selectedFeatureLink}
              title="Скопировать ссылку, которая откроет карту сразу на этом объекте"
            >
              🔗 {copiedFeatureLink ? "Ссылка скопирована" : "Скопировать ссылку"}
            </button>

            <button
              className="panel-action-button"
              type="button"
              onClick={downloadSelectedFeatureGeoJson}
              disabled={!selectedFeature}
              title="Скачать выбранный объект в формате GeoJSON"
            >
              ⬇ Скачать GeoJSON
            </button>
          </div>

          <div className="panel-bottom panel-bottom-enhanced">
            {isExpandable && (
              <button
                className="expand-btn"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Свернуть" : "Развернуть"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Submission panel modal */}
      {showSubmissionPanel && (
        <SubmissionPanelErrorBoundary onError={handleSubmissionPanelError}>
          <SubmissionPanel
            onClose={closeSubmissionPanel}
            onSuccess={handleSubmissionSuccess}
            onSubmitted={handleSubmissionSuccess}
            onSubmitSuccess={handleSubmissionSuccess}
            setPreviewFeatures={setPreviewFeatures}
            defaultCity={currentCityConfig.cityName}
          />
        </SubmissionPanelErrorBoundary>
      )}
    </div>
  );
}

export default App;
