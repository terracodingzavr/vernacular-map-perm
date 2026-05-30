/**
 * Applies create/update/delete changes to an existing GeoJSON FeatureCollection.
 * Returns a new FeatureCollection without modifying the original.
 *
 * Matching order for update/delete:
 * 1. Stable feature id / properties.id / properties.feature_id.
 * 2. Original feature snapshot fallback: name + city + geometry type + exact geometry.
 * 3. Original feature snapshot fallback: unique name + city + geometry type.
 *
 * The fallback is important for local testing when the frontend already has
 * numeric ids locally, but the GitHub base branch still contains older GeoJSON
 * files without those ids.
 *
 * @param {object} existingGeoJson - Original GeoJSON FeatureCollection.
 * @param {Array} changesForLayer - Array of change objects.
 * @returns {object} New GeoJSON FeatureCollection with applied changes.
 */
export function applyChangesToGeoJson(existingGeoJson, changesForLayer) {
  if (
    !existingGeoJson ||
    existingGeoJson.type !== 'FeatureCollection' ||
    !Array.isArray(existingGeoJson.features)
  ) {
    throw new Error('Invalid GeoJSON: expected FeatureCollection');
  }

  const getFeatureId = (feature) => {
    const rawId = feature?.id ?? feature?.properties?.id ?? feature?.properties?.feature_id;
    if (rawId === undefined || rawId === null) return null;
    return String(rawId);
  };

  const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

  const getFeatureName = (feature) => normalizeText(feature?.properties?.name);

  const getFeatureCity = (feature) => normalizeText(
    feature?.properties?.city ?? feature?.properties?.['Город']
  );

  const getGeometryType = (feature) => feature?.geometry?.type || '';

  const stringifyGeometry = (feature) => {
    if (!feature?.geometry) return '';
    try {
      return JSON.stringify(feature.geometry);
    } catch {
      return '';
    }
  };

  const findIndexByFallback = (features, change) => {
    const snapshot = change.originalFeature || change.feature;
    if (!snapshot || snapshot.type !== 'Feature') return -1;

    const targetName = getFeatureName(snapshot);
    const targetCity = getFeatureCity(snapshot);
    const targetGeometryType = getGeometryType(snapshot);
    const targetGeometry = stringifyGeometry(snapshot);

    if (!targetName || !targetGeometryType) return -1;

    const candidates = features
      .map((feature, index) => ({ feature, index }))
      .filter(({ feature }) => {
        if (getFeatureName(feature) !== targetName) return false;
        if (getGeometryType(feature) !== targetGeometryType) return false;

        const featureCity = getFeatureCity(feature);
        if (targetCity && featureCity && targetCity !== featureCity) return false;

        return true;
      });

    if (candidates.length === 0) return -1;

    if (targetGeometry) {
      const exactGeometryMatches = candidates.filter(
        ({ feature }) => stringifyGeometry(feature) === targetGeometry
      );

      if (exactGeometryMatches.length === 1) {
        return exactGeometryMatches[0].index;
      }
    }

    if (candidates.length === 1) {
      return candidates[0].index;
    }

    return -1;
  };

  const newFeatures = existingGeoJson.features.map((f) => JSON.parse(JSON.stringify(f)));

  for (const change of changesForLayer) {
    if (change.changeType === 'create') {
      const feature = JSON.parse(JSON.stringify(change.feature));

      if (feature.id == null) {
        feature.id = Date.now();
      }

      newFeatures.push(feature);
      continue;
    }

    const targetId = String(change.originalFeatureId);
    let index = newFeatures.findIndex((feature) => getFeatureId(feature) === targetId);

    if (index === -1) {
      index = findIndexByFallback(newFeatures, change);
    }

    if (index === -1) {
      throw new Error(
        `Feature with id ${targetId} was not found. ` +
          'The GitHub base file may not yet contain numeric ids; fallback matching by name/city/geometry also failed.'
      );
    }

    if (change.changeType === 'update') {
      const updatedFeature = JSON.parse(JSON.stringify(change.feature));
      updatedFeature.id = newFeatures[index].id ?? updatedFeature.id;
      newFeatures[index] = updatedFeature;
      continue;
    }

    if (change.changeType === 'delete') {
      newFeatures.splice(index, 1);
      continue;
    }

    throw new Error(`Unsupported changeType: ${change.changeType}`);
  }

  return {
    type: 'FeatureCollection',
    features: newFeatures
  };
}
