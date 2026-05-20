/**
 * Applies a list of "create" changes to an existing GeoJSON FeatureCollection.
 * Returns a new FeatureCollection without modifying the original.
 *
 * @param {object} existingGeoJson - Original GeoJSON FeatureCollection.
 * @param {Array} changesForLayer - Array of change objects (with .feature).
 * @returns {object} New GeoJSON FeatureCollection with added features.
 */
export function applyChangesToGeoJson(existingGeoJson, changesForLayer) {
  if (
    !existingGeoJson ||
    existingGeoJson.type !== 'FeatureCollection' ||
    !Array.isArray(existingGeoJson.features)
  ) {
    throw new Error('Invalid GeoJSON: expected FeatureCollection');
  }

  // Clone existing features to avoid mutations
  const newFeatures = existingGeoJson.features.map((f) => ({ ...f }));

  for (const change of changesForLayer) {
    const feature = JSON.parse(JSON.stringify(change.feature));

    // Assign an id if missing
    if (feature.id == null) {
      // crypto.randomUUID is available in Cloudflare Workers
      feature.id = crypto.randomUUID();
    }

    newFeatures.push(feature);
  }

  return {
    type: 'FeatureCollection',
    features: newFeatures
  };
}