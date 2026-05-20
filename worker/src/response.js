/**
 * Builds a JSON response with proper CORS headers.
 *
 * @param {any} body - Object to serialize into JSON.
 * @param {any} env - Environment variables to derive ALLOWED_ORIGIN.
 * @param {number} status - HTTP status code (default 200).
 * @returns {Response}
 */
export function jsonResponse(body, env, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Returns a standardized error response structure.
 *
 * @param {string} code - Error code.
 * @param {string} message - Human-readable message.
 * @param {any} env - Environment variables.
 * @param {number} status - HTTP status code.
 */
export function errorResponse(code, message, env, status = 400) {
  const errorBody = { ok: false, error: { code, message } };
  return jsonResponse(errorBody, env, status);
}