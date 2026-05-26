/**
 * Builds a JSON response with proper CORS headers.
 *
 * @param {any} body - Object to serialize into JSON.
 * @param {any} env - Environment variables to derive ALLOWED_ORIGIN.
 * @param {number} status - HTTP status code (default 200).
 * @returns {Response}
 */
export function jsonResponse(body, env, status = 200) {
  // Determine which origin to allow for CORS. If a specific origin was
  // recorded in env.__response_origin (set by index.js), use it. Otherwise
  // fall back to the first configured allowed origin.
  let allowOrigin = env.__response_origin;
  if (!allowOrigin) {
    const allowed = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '';
    allowOrigin = allowed.split(',')[0].trim();
  }
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
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