/**
 * Validates and normalizes a map submission.
 * Throws an Error with code and message if validation fails.
 *
 * Supported changes:
 * - create: add a new GeoJSON feature to a layer
 * - update: replace an existing feature by id
 * - delete: remove an existing feature by id
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

  const normalized = {
    source: typeof input.source === 'string' ? input.source : 'unknown',
    method: typeof input.method === 'string' ? input.method : 'unknown',
    captchaToken: input.captchaToken || null,
    author: input.author && typeof input.author === 'object' ? input.author : {},
    changes: []
  };

  const allowedChangeTypes = ['create', 'update', 'delete'];
  const allowedLayers = ['points', 'lines', 'districts'];
  const allowedGeoms = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon'
  ];

  const typeToLayer = {
    Point: 'points',
    MultiPoint: 'points',
    LineString: 'lines',
    MultiLineString: 'lines',
    Polygon: 'districts',
    MultiPolygon: 'districts'
  };

  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];

    if (!change || !allowedChangeTypes.includes(change.changeType)) {
      const err = new Error(`Change ${index + 1}: unsupported changeType`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const targetLayer = String(change.targetLayer || '').trim();
    if (!allowedLayers.includes(targetLayer)) {
      const err = new Error(`Change ${index + 1}: targetLayer is required and must be points, lines, or districts`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const normalizedChange = {
      changeType: change.changeType,
      targetLayer
    };

    if (change.changeType === 'create' || change.changeType === 'update') {
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
      if (!allowedGeoms.includes(geomType)) {
        const err = new Error(`Change ${index + 1}: geometry.type ${geomType} is not supported`);
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const deducedLayer = typeToLayer[geomType];
      if (targetLayer !== deducedLayer) {
        const err = new Error(
          `Change ${index + 1}: targetLayer ${targetLayer} does not match geometry.type ${geomType}`
        );
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

      normalizedChange.feature = feature;
    }

    if (change.changeType === 'update' || change.changeType === 'delete') {
      const originalFeatureId = change.originalFeatureId;
      if (
        originalFeatureId === undefined ||
        originalFeatureId === null ||
        String(originalFeatureId).trim() === ''
      ) {
        const err = new Error(`Change ${index + 1}: originalFeatureId is required`);
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const reason = typeof change.reason === 'string' ? change.reason.trim() : '';
      if (!reason) {
        const err = new Error(`Change ${index + 1}: reason is required for ${change.changeType}`);
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      normalizedChange.originalFeatureId = originalFeatureId;
      normalizedChange.reason = reason;

      if (change.originalFeature && change.originalFeature.type === 'Feature') {
        normalizedChange.originalFeature = change.originalFeature;
      }
    } else {
      normalizedChange.originalFeatureId = change.originalFeatureId || null;
    }

    normalized.changes.push(normalizedChange);
  }

  return normalized;
}
