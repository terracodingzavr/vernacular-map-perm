import React from 'react';

/**
 * Table for displaying feature properties and selecting mapping fields.
 * Users choose which property should be used for the name, explainer
 * and optional type. The preview rows show a sample of data from
 * uploaded GeoJSON so that users can make informed selections.
 */
const AttributeMappingTable = ({
  propertyKeys = [],
  previewRows = [],
  mapping,
  onMappingChange,
}) => {
  const handleChange = (field) => (e) => {
    const value = e.target.value || '';
    onMappingChange({ ...mapping, [field]: value });
  };

  return (
    <div className="attribute-mapping">
      <h3>Таблица атрибутов</h3>
      <table className="mapping-table">
        <thead>
          <tr>
            {propertyKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, idx) => (
            <tr key={idx}>
              {propertyKeys.map((key) => (
                <td key={key}>{row.properties[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mapping-selects">
        <div className="mapping-select">
          <label>Поле названия:</label>
          <select value={mapping.name || ''} onChange={handleChange('name')}>
            <option value="">— выберите поле —</option>
            {propertyKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div className="mapping-select">
          <label>Поле описания:</label>
          <select value={mapping.explainer || ''} onChange={handleChange('explainer')}>
            <option value="">— выберите поле —</option>
            {propertyKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div className="mapping-select">
          <label>Поле типа (опционально):</label>
          <select value={mapping.type || ''} onChange={handleChange('type')}>
            <option value="">Другое</option>
            {propertyKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default AttributeMappingTable;