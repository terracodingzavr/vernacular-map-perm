// Utility functions for validating user submissions on the front‑end.
// These helpers ensure uploaded files and mapped features meet basic
// constraints before sending to the backend. All functions throw
// human‑friendly Error messages that can be shown in the UI.

/**
 * Validate that the file size does not exceed the given limit.
 * @param {File} file The file to check.
 * @param {number} maxBytes Maximum allowed file size in bytes.
 */
export function validateFileSize(file, maxBytes) {
  if (!file) return;
  if (file.size > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    throw new Error(`Файл больше ${mb} МБ`);
  }
}

/**
 * Validate that the uploaded JSON is a GeoJSON FeatureCollection.
 * @param {any} data Parsed GeoJSON object.
 */
export function validateFeatureCollection(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Файл не является GeoJSON FeatureCollection');
  }
}

/**
 * Validate that the number of features does not exceed the limit.
 * @param {Array} features Array of GeoJSON features.
 * @param {number} maxFeatures Maximum number of allowed features.
 */
export function validateFeatureLimit(features, maxFeatures) {
  if (features.length > maxFeatures) {
    throw new Error(`В заявке больше ${maxFeatures} объектов`);
  }
}

/**
 * Validate that the required mapping fields are provided.
 * @param {object} mapping Object with selected property names.
 */
export function validateRequiredMapping(mapping) {
  if (!mapping || !mapping.name) {
    throw new Error('Не выбрано поле с названием объекта');
  }
  if (!mapping.explainer) {
    throw new Error('Не выбрано поле с описанием объекта');
  }
}

/**
 * Validate that each normalized feature contains required properties
 * and supported geometry types.
 * @param {Array} features List of normalized GeoJSON features.
 */
export function validateNormalizedFeatures(features) {
  const supported = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ];
  features.forEach((feature, index) => {
    const i = index + 1;
    if (!feature.geometry) {
      throw new Error(`У объекта ${i} отсутствует geometry`);
    }
    const type = feature.geometry.type;
    if (!supported.includes(type)) {
      throw new Error(`Тип геометрии ${type} не поддерживается`);
    }
    const props = feature.properties || {};
    if (!props.name || props.name.toString().trim() === '') {
      throw new Error(`У объекта ${i} пустое название`);
    }
    if (!props.explainer || props.explainer.toString().trim() === '') {
      throw new Error(`У объекта ${i} пустое описание`);
    }
  });
}