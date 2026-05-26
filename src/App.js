import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Pane } from "react-leaflet";
import { useMapEvents } from "react-leaflet/hooks";
import "leaflet/dist/leaflet.css";
import "./App.css";
import L from "leaflet";
import { area as turfArea } from "@turf/turf";
import "leaflet-textpath";

// Submission components
import SubmissionPanel from './components/SubmissionPanel';
import SubmissionPreviewLayer from './components/SubmissionPreviewLayer';

// Цвета для типов названий
const typeColors = {
  "Ассоциация с объектом": "#ff7f00",
  "Ассоциация с официальным названием": "#377eb8",
  "Визуальная ассоциация": "#4daf4a",
  "Историческая ассоциация": "#e41a1c",
  "Реальное название": "#984ea3",
  "Другое": "#999999",
};

// Стиль объектов
const styleByType = (feature) => {
  const type = feature.properties?.["Тип названия"];
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
  // Which city is currently selected (perm or cheb)
  // We keep selectedCity only to move the map between Perm and Cheboksary.
  const [selectedCity, setSelectedCity] = useState("perm");
  const [titleCity, setTitleCity] = useState("perm");
  const [titlePhase, setTitlePhase] = useState("in");
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [mapZoom, setMapZoom] = useState(12);
  const [mapReady, setMapReady] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // State for showing the submission panel and previewing user features
  const [showSubmissionPanel, setShowSubmissionPanel] = useState(false);
  const [previewFeatures, setPreviewFeatures] = useState([]);

  const mapRef = useRef(null);
  const labelLayerRef = useRef(null);

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
      const shouldShow = mapZoom >= 15 || featureArea > 1_000_000;
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

  const handleFeatureHover = useCallback((feature, layer) => {
    const name = feature.properties?.["name"];
    if (!name) return;

    layer.bindTooltip(name, {
      direction: "top",
      sticky: true,
      offset: [0, -10],
      className: "custom-tooltip",
    });

    layer.on("click", () => {
      setSelectedFeature(feature);
      setExpanded(false);
    });
  }, []);

  const closeInfoPanel = () => {
    setSelectedFeature(null);
    setExpanded(false);
  };

  /**
   * Navigate the map to a specific city and toggle the visible dataset.
   *
   * When called, this function updates the selectedCity state,
   * then uses the Leaflet map instance to set the view to the
   * appropriate coordinates. The zoom level is preserved unless
   * otherwise specified.
   *
   * @param {string} city Either "perm" or "cheb"
   */
  const handleCityNavigation = (city) => {
    setSelectedCity(city);
    const coords = city === "perm" ? [58.01, 56.25] : [56.1439, 47.2489];
    if (mapRef.current) {
      const currentZoom = mapRef.current.getZoom();
      // Use flyTo for smooth animation when switching cities
      mapRef.current.flyTo(coords, currentZoom);
    }
  };

  const featureProps = selectedFeature?.properties || {};
  const explainer = featureProps["explainer"] || "";
  const explainerSentences = splitIntoSentences(explainer);
  const isExpandable = explainerSentences.length > 3;
  const visibleExplainer = expanded ? explainer : getTextPreview(explainer);
  const titleCityName = titleCity === "perm" ? "Перми" : "Чебоксар";

  return (
    <div className="App">
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
        className="edit-button"
        onClick={() => setShowSubmissionPanel(true)}
        aria-label="Предложить правку"
        title="Предложить правку"
      >
        <span className="edit-icon">✎</span>
      </button>

      <MapContainer
        center={[58.01, 56.25]}
        zoom={12}
        style={{ height: "calc(100vh - var(--header-height))", width: "100%" }}
      >
        <MapEvents
          mapRef={mapRef}
          setMapZoom={setMapZoom}
          setMapReady={setMapReady}
        />

        <TileLayer
          attribution="Tiles © Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />

        <Pane name="polygons-pane" style={{ zIndex: 410 }}>
          {/* Always render districts on the polygons pane; the dataset includes both Perm and Cheboksary objects */}
          {districts && (
            <GeoJSON
              data={districts}
              pane="polygons-pane"
              style={styleByType}
              onEachFeature={handleFeatureHover}
            />
          )}
        </Pane>

        <Pane name="lines-pane" style={{ zIndex: 420 }}>
          {/* Always render lines regardless of selected city */}
          {lines && (
            <GeoJSON
              data={lines}
              pane="lines-pane"
              style={styleByType}
              onEachFeature={handleFeatureHover}
            />
          )}
        </Pane>

        <Pane name="points-pane" style={{ zIndex: 430 }}>
          {/* Always render points regardless of selected city */}
          {points && (
            <GeoJSON
              data={points}
              pane="points-pane"
              pointToLayer={(feature, latlng) => {
                const layer = L.circleMarker(latlng, {
                  ...styleByType(feature),
                  pane: "points-pane",
                });
                handleFeatureHover(feature, layer);
                return layer;
              }}
            />
          )}
        </Pane>

        {/* Preview of user submission features rendered above existing layers */}
        <Pane name="submission-preview-pane" style={{ zIndex: 440 }}>
          {previewFeatures.length > 0 && (
            <SubmissionPreviewLayer
              previewFeatures={previewFeatures}
              pane="submission-preview-pane"
            />
          )}
        </Pane>
      </MapContainer>

      {/* Navigation buttons for quickly moving the map between cities */}
      <div className="map-nav">
        <button
          className={`nav-button ${selectedCity === "perm" ? "active" : ""}`}
          onClick={() => handleCityNavigation("perm")}
        >
          Пермь
        </button>
        <button
          className={`nav-button ${selectedCity === "cheb" ? "active" : ""}`}
          onClick={() => handleCityNavigation("cheb")}
        >
          Чебоксары
        </button>
      </div>

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
              Юрий Бобров.
            </p>

            <p>
              Важно: приоритет отдавался более локальным названиям, которые не связаны с официальными. Не все названия являются единственными релевантными. Границы районов неточны, ими нельзя пользоваться для детального определения местоположения внутри вернакулярных районов.
            </p>
          </div>
        </div>
      )}

      <div className="legend-box-horizontal">
        <h4>Тип названия</h4>

        <div className="legend-vertical">
          {Object.entries(typeColors).map(([name, color]) => (
            <div key={name} className="legend-entry">
              <div
                className="legend-color-box"
                style={{ backgroundColor: color }}
              ></div>

              <div className="legend-label">{name}</div>
            </div>
          ))}
        </div>
      </div>

      {selectedFeature && (
        <div className={`info-panel ${expanded ? "expanded" : ""}`}>
          <button className="close-btn" onClick={closeInfoPanel}>
            ×
          </button>

          <div className="panel-header">
            <div className="panel-title">{featureProps["name"]}</div>

            {featureProps["original_name"] && (
              <div
                className="panel-original"
                style={{ color: typeColors["Реальное название"] }}
              >
                {featureProps["original_name"]}
              </div>
            )}
          </div>

          <div className="panel-explainer">
            {visibleExplainer || "Описание пока не добавлено."}
          </div>

          {/* Photos section: render only if photos are defined */}
          {(() => {
            const photos = getFeaturePhotos(featureProps);
            return photos.length > 0 ? (
              <div className="panel-photos">
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

          <div className="panel-bottom">
            {isExpandable && (
              <button
                className="expand-btn"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Свернуть" : "Развернуть"}
              </button>
            )}

            <div className="panel-type">{featureProps["Тип названия"]}</div>
          </div>
        </div>
      )}

      {/* Submission panel modal */}
      {showSubmissionPanel && (
        <SubmissionPanel
          onClose={() => setShowSubmissionPanel(false)}
          setPreviewFeatures={setPreviewFeatures}
        />
      )}
    </div>
  );
}

export default App;
