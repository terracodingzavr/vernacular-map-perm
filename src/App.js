import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import L from "leaflet";
import { area as turfArea, centerOfMass } from "@turf/turf";
import "leaflet-textpath";



// Цвета для типов
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
      color: color,
      fillColor: color,
      fillOpacity: 0.4,
      weight: 1
    };
  }

  return {
    color: color,
    fillColor: color,
    fillOpacity: 1,
    opacity: 1,
    weight: 2,
    radius: 6
  };
};

function App() {
  const [points, setPoints] = useState(null);
  const [lines, setLines] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const mapRef = useRef();
  const [mapZoom, setMapZoom] = useState(12);
  const labelLayerRef = useRef();
  const [showAbout, setShowAbout] = useState(false);






  useEffect(() => {
    if (!mapRef.current || !districts) return;

    const map = mapRef.current;

    // Удаляем старый слой с подписями
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current);
    }

    // Новый слой для подписей
    const labelLayer = L.layerGroup();
    labelLayerRef.current = labelLayer;

    districts.features.forEach((feature) => {
      const name = feature.properties?.["name"];
      if (!name) return;

      const area = turfArea(feature);
      const shouldShow = mapZoom >= 15 || area > 1_000_000;

      if (shouldShow) {
        const layer = L.geoJSON(feature, {
          style: () => ({ opacity: 0, fillOpacity: 0 }),
          onEachFeature: (_, lyr) => {
            lyr.bindTooltip(name, {
              permanent: true,
              direction: "center",
              className: "feature-label"
            });
          }
        });

        layer.eachLayer((l) => labelLayer.addLayer(l)); // 👈 вместо addTo(labelLayer)
      }
    });

    // 👇 Явно добавляем на карту
    labelLayer.addTo(map);
  }, [mapZoom, districts]);


  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/data/points.geojson").then(res => res.json()).then(setPoints);
    fetch(process.env.PUBLIC_URL + "/data/lines.geojson").then(res => res.json()).then(setLines);
    fetch(process.env.PUBLIC_URL + "/data/districts.geojson").then(res => res.json()).then(setDistricts);
  }, []);



  const handleFeatureHover = (feature, layer) => {
    const name = feature.properties?.["name"];
    if (!name) return;
    layer.bindTooltip(name, {
      direction: "top",
      sticky: true,
      offset: [0, -10],
      className: "custom-tooltip"
    });

    layer.on("click", () => {
      setSelectedFeature(feature);
      setExpanded(false);
    });
  };

  const renderTextPreview = (text) => {
    if (!text) return "";
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    return sentences ? sentences.slice(0, 3).join(" ") : text;
  };

  const featureProps = selectedFeature?.properties || {};
  const explainer = featureProps["explainer"];
  const isExpandable = explainer && explainer.match(/[^.!?]+[.!?]+/g)?.length > 3;

  return (
    <div className="App">
      <div className="header-trapezoid">
        <h1 className="header-title">Вернакулярная карта Перми</h1>
      </div>
      <butoon className="about-button" onClick={() => setShowAbout(true)}> 
        О карте
      </butoon>

      <MapContainer
        center={[58.01, 56.25]}
        zoom={12}
        whenCreated={(map) => {
          mapRef.current = map;
          window._map = map;
          map.on("zoomend", () => setMapZoom(map.getZoom()));
        }}
        style={{ height: "calc(100vh - 120px)", width: "100%" }}
      >

        <TileLayer
          attribution='Tiles © Esri'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />

        {districts && (
          <GeoJSON data={districts} style={styleByType} onEachFeature={handleFeatureHover} />
        )}

        {lines && (
          <GeoJSON data={lines} style={styleByType} onEachFeature={handleFeatureHover} />
        )}

      {points && (
        <GeoJSON
          data={points}
          pointToLayer={(feature, latlng) => {
            const layer = L.circleMarker(latlng, {
              ...styleByType(feature),
              zIndexOffset: 1000
            });
            handleFeatureHover(feature, layer); // 👈 вручную применяем
            return layer;
          }}
        />
      )}

      </MapContainer>
      {showAbout && (
        <div className="about-panel">
          <button className="close-about" onClick={() => setShowAbout(false)}>×</button>
          <div className="about-content">
            <p><strong>Вернакулярная карта города</strong> — это субъективная карта, отражающая восприятие, ассоциации и повседневный опыт местными жителями, а не официальную географию. Тем не менее, иногда они могут совпадать или быть производными друг от друга.</p>
            <p>Для создания данной вернакулярной карты было инициировано несколько опросов жителей города о том, какие разговорные названия они употребляют в обычной жизни по отношению к разным объектам в городе...</p>
            <p>Опросы происходили в telegram-каналах:
              <br />– «Без поддержки министерства культуры»
              <br />– «Пермь 36,6»
              <br />– репост: Надежда Агишева
            </p>
            <p>Информанты: журналист Иван Козлов («Новая вкладка»), активист Юрий Бобров.</p>
            <p>Важно: на карте не все названия, некоторые слишком локальны или спорны.</p>
          </div>
        </div>
      )}

      {/* Легенда */}
      <div className="legend-box-horizontal">
        <h4>Тип названия</h4>
        <div className="legend-vertical">
          {Object.entries(typeColors).map(([name, color]) => (
            <div key={name} className="legend-entry">
              <div className="legend-color-box" style={{ backgroundColor: color }}></div>
              <div className="legend-label">{name}</div>
            </div>
          ))}
        </div>
      </div>

    {selectedFeature && !expanded && (
      <div className="info-panel">
        <button className="close-btn" onClick={() => setSelectedFeature(null)}>×</button>

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
          {renderTextPreview(explainer)}
        </div>

        <div className="panel-bottom">
          {isExpandable && (
            <button className="expand-btn" onClick={() => setExpanded(true)}>Развернуть</button>
          )}
          <div className="panel-type">{featureProps["Тип названия"]}</div>
        </div>
      </div>
    )}


      {selectedFeature && expanded && (
        <div className="info-panel expanded">
          <button className="close-btn" onClick={() => setSelectedFeature(null)}>×</button>

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
            {explainer}
          </div>

          <div className="panel-bottom">
            <button className="expand-btn" onClick={() => setExpanded(false)}>Свернуть</button>
            <div className="panel-type">{featureProps["Тип названия"]}</div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;



