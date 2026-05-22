import React, { useState, useEffect } from 'react';
import GeoJsonImportStep from './GeoJsonImportStep';
import AttributeMappingTable from './AttributeMappingTable';
import {
  extractPropertyKeys,
  buildAttributeRows,
  normalizeFeatures,
  getTargetLayerByGeometryType,
} from '../utils/geojsonImport';
import {
  validateRequiredMapping,
  validateNormalizedFeatures,
} from '../utils/submissionValidation';
import { submitUserSubmission } from '../utils/submissionApi';

/**
 * A multi‑step panel that guides users through uploading a GeoJSON file,
 * selecting property mappings, previewing their edits on the map and
 * ultimately submitting a change request. The parent component controls
 * visibility via onClose and can receive preview features via
 * setPreviewFeatures for display on the map.
 */
const SubmissionPanel = ({ onClose, setPreviewFeatures }) => {
  const [step, setStep] = useState(1);
  const [error, setError] = useState(null);
  const [featureCollection, setFeatureCollection] = useState(null);
  const [mapping, setMapping] = useState({ name: '', explainer: '', type: '' });

  // Update preview when entering the preview step
  useEffect(() => {
    if (step === 3 && featureCollection && mapping.name && mapping.explainer) {
      try {
        const normalized = normalizeFeatures(featureCollection, mapping);
        validateNormalizedFeatures(normalized);
        setPreviewFeatures(normalized);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    }
  }, [step, featureCollection, mapping, setPreviewFeatures]);

  const propertyKeys = featureCollection ? extractPropertyKeys(featureCollection) : [];
  const previewRows = featureCollection ? buildAttributeRows(featureCollection, 5) : [];

  const handleSubmit = async () => {
    try {
      validateRequiredMapping(mapping);
      const normalizedFeatures = normalizeFeatures(featureCollection, mapping);
      validateNormalizedFeatures(normalizedFeatures);
      const changes = normalizedFeatures.map((feat) => ({
        changeType: 'create',
        targetLayer: getTargetLayerByGeometryType(feat.geometry.type),
        originalFeatureId: null,
        feature: feat,
      }));
      const submission = {
        source: 'public-map',
        method: 'geojson-import',
        captchaToken: null,
        author: { displayName: '', contact: '' },
        changes,
      };
      const response = await submitUserSubmission(submission);
      // Display both submissionId and pullRequestUrl if present
      const prUrl = response.pullRequestUrl || '';
      let message = `Заявка отправлена на модерацию. ID: ${response.submissionId || ''}`;
      if (prUrl) {
        message += `\nPull Request: ${prUrl}`;
      }
      alert(message);
      // Reset state and close panel
      setStep(1);
      setFeatureCollection(null);
      setMapping({ name: '', explainer: '', type: '' });
      setPreviewFeatures([]);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const canNext = () => {
    if (step === 1) return featureCollection != null;
    if (step === 2) return mapping.name && mapping.explainer;
    return false;
  };

  return (
    <div className="submission-panel">
      <button className="close-btn" onClick={onClose}>
        ×
      </button>
      <h2>Предложить правку</h2>
      {error && <div className="error-message">{error}</div>}
      {step === 1 && (
        <GeoJsonImportStep
          onImported={(data) => setFeatureCollection(data)}
          onError={(err) => setError(err)}
        />
      )}
      {step === 2 && featureCollection && (
        <AttributeMappingTable
          propertyKeys={propertyKeys}
          previewRows={previewRows}
          mapping={mapping}
          onMappingChange={setMapping}
        />
      )}
      {step === 3 && (
        <div className="preview-step">
          <p>Проверьте объекты на карте. Если всё верно, отправьте заявку.</p>
        </div>
      )}
      <div className="panel-navigation">
        {step > 1 && (
          <button onClick={() => setStep((s) => s - 1)}>Назад</button>
        )}
        {step < 3 && (
          <button
            onClick={() => {
              if (canNext()) setStep((s) => s + 1);
            }}
            disabled={!canNext()}
          >
            Далее
          </button>
        )}
        {step === 3 && (
          <button onClick={handleSubmit}>Отправить на модерацию</button>
        )}
      </div>
    </div>
  );
};

export default SubmissionPanel;