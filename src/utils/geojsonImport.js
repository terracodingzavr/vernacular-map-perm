// Helpers for reading and normalizing GeoJSON files on the front‑end.
// These functions extract keys, build preview tables and produce
// normalized features ready for submission to the backend.

/**
 * Read a selected file and parse it as JSON. Throws if parsing fails.
 * @param {File} file The selected upload.
 * @returns {Promise<any>} Parsed JSON object.
 */
export async function readGeoJsonFile(file) {
  if (!file) {
    throw new Error('Файл не выбран');
  }
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Файл не является валидным JSON');
  }
  return data;
}

/**
 * Extract unique property keys across all features in a collection.
 * @param {object} featureCollection GeoJSON FeatureCollection.
 * @returns {Array<string>} Sorted list of property keys.
 */
export function extractPropertyKeys(featureCollection) {
  const keys = new Set();
  featureCollection.features.forEach((feature) => {
    const props = feature.properties || {};
    Object.keys(props).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
}

/**
 * Build preview rows for the attribute mapping table. Only include properties.
 * @param {object} featureCollection GeoJSON FeatureCollection.
 * @param {number} limit Number of rows to return.
 * @returns {Array<object>} Preview rows with only properties.
 */
export function buildAttributeRows(featureCollection, limit = 5) {
  return featureCollection.features.slice(0, limit).map((feature) => ({
    properties: feature.properties || {},
  }));
}

/**
 * Map geometry types to submission layer names. These names are used
 * throughout the project and converted to file paths in the backend.
 * @param {string} type Geometry type from GeoJSON.
 * @returns {string|null} Corresponding target layer name or null.
 */
export function getTargetLayerByGeometryType(type) {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return 'points';
    case 'LineString':
    case 'MultiLineString':
      return 'lines';
    case 'Polygon':
    case 'MultiPolygon':
      return 'districts';
    default:
      return null;
  }
}

/**
 * Normalize features according to the user's field mapping.
 * Copies geometry and assigns new id if absent. It also maps the
 * selected property fields into standard names and optionally sets
 * the type field.
 * @param {object} featureCollection GeoJSON FeatureCollection.
 * @param {object} mapping Object with selected keys: name, explainer, type.
 * @param {object} options Optional defaults such as { city }.
 * @returns {Array<object>} List of normalized GeoJSON features.
 */
export function normalizeFeatures(featureCollection, mapping, options = {}) {
  const timestampBase = Date.now();

  return featureCollection.features.map((feature, index) => {
    const props = feature.properties || {};
    const numericFeatureId = Number(feature.id);

    return {
      ...feature,
      id: Number.isFinite(numericFeatureId)
        ? numericFeatureId
        : timestampBase + index,
      properties: {
        ...props,
        name: props[mapping.name],
        explainer: props[mapping.explainer],
        city: props.city || props['Город'] || options.city || '',
        ['Тип названия']:
          mapping.type && props[mapping.type] ? props[mapping.type] : 'Другое',
      },
    };
  });
}
