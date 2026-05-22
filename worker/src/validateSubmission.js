/**
 * Validates and normalizes a map submission.
 * Throws an Error with code and message if validation fails.
 *
 * @param {any} input - Raw submission object.
 * @param {any} limits - Env vars containing MAX_FEATURES.
 * @returns {object} - Normalized submission.
 */
export function validateSubmission(input, limits) {
  const maxFeatures = parseInt(limits.MAX_FEATURES, 10);

  if (!input || typeof input !== 'object') {
    const err = new Error('Invalid submission format');
    err.code = 'INVALID_REQUEST';
    throw err;
  }

  const changes = input.changes;
  if (!Array.isArray(changes)) {
    const err = new Error('Field "changes" must be an array');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (changes.length < 1) {
    const err = new Error('At least one change is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (changes.length > maxFeatures) {
    const err = new Error(`Too many changes: maximum ${maxFeatures}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalized = { changes: [] };

  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];

    if (!change || change.changeType !== 'create') {
      const err = new Error(`Change ${index + 1}: unsupported changeType`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const feature = change.feature;
    if (!feature || feature.type !== 'Feature') {
      const err = new Error(`Change ${index + 1}: feature must be a GeoJSON Feature`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!feature.geometry) {
      const err = new Error(`Change ${index + 1}: feature.geometry is required`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const geomType = feature.geometry.type;
    const allowedGeoms = [
      'Point',
      'MultiPoint',
      'LineString',
      'MultiLineString',
      'Polygon',
      'MultiPolygon'
    ];

    if (!allowedGeoms.includes(geomType)) {
      const err = new Error(`Change ${index + 1}: geometry.type ${geomType} is not supported`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!feature.properties || typeof feature.properties.name !== 'string' || feature.properties.name.trim() === '') {
      const err = new Error(`Change ${index + 1}: properties.name is required`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!feature.properties || typeof feature.properties.explainer !== 'string' || feature.properties.explainer.trim() === '') {
      const err = new Error(`Change ${index + 1}: properties.explainer is required`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Determine target layer based on geometry.type
    const typeToLayer = {
      Point: 'public/data/points.geojson',
      MultiPoint: 'public/data/points.geojson',
      LineString: 'public/data/lines.geojson',
      MultiLineString: 'public/data/lines.geojson',
      Polygon: 'public/data/districts.geojson',
      MultiPolygon: 'public/data/districts.geojson'
    };

    let targetLayer = change.targetLayer;
    const deducedLayer = typeToLayer[geomType];

    if (targetLayer) {
      const trimmed = targetLayer.trim();
      if (trimmed !== deducedLayer) {
        const err = new Error(`Change ${index + 1}: targetLayer ${targetLayer} does not match geometry.type ${geomType}`);
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      targetLayer = trimmed;
    } else {
      targetLayer = deducedLayer;
    }

    normalized.changes.push({
      changeType: 'create',
      feature,
      targetLayer
    });
  }

  if (input.submissionId) {
    normalized.submissionId = String(input.submissionId);
  }

  return normalized;
}