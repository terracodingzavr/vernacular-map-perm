import React, { useState } from 'react';
import {
  validateFileSize,
  validateFeatureCollection,
  validateFeatureLimit,
} from '../utils/submissionValidation';
import { readGeoJsonFile } from '../utils/geojsonImport';

/**
 * Step component responsible for reading a GeoJSON file from user input.
 * It validates file size, the GeoJSON structure and feature count before
 * passing the parsed data up via onImported. Validation errors are
 * communicated via onError.
 */
const GeoJsonImportStep = ({ maxSize = 2 * 1024 * 1024, maxFeatures = 10, onImported, onError }) => {
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      validateFileSize(file, maxSize);
      setLoading(true);
      const data = await readGeoJsonFile(file);
      validateFeatureCollection(data);
      validateFeatureLimit(data.features, maxFeatures);
      onImported(data);
      onError(null);
    } catch (err) {
      onImported(null);
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="geojson-import-step">
      <label className="file-input-label">
        Выберите GeoJSON (.geojson, .json):
        <input type="file" accept=".geojson,.json" onChange={handleFileChange} />
      </label>
      {loading && <p>Загрузка...</p>}
    </div>
  );
};

export default GeoJsonImportStep;