// API helper for sending user submissions to the backend.
// Reads the submission endpoint from the REACT_APP_SUBMISSIONS_API_URL
// environment variable (injected at build time). Throws friendly
// errors when the endpoint is missing or the response indicates
// failure.

/**
 * Submit a normalized submission to the backend.
 * @param {object} submission Submission payload ready for the API.
 * @returns {Promise<object>} Response JSON with submissionId and pullRequestUrl.
 */
export async function submitUserSubmission(submission) {
  const apiUrl = process.env.REACT_APP_SUBMISSIONS_API_URL;
  if (!apiUrl) {
    throw new Error('REACT_APP_SUBMISSIONS_API_URL не задан. Укажите адрес backend.');
  }
  // Remove trailing slash to avoid double slashes when building URL
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/api/submissions`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
  } catch (err) {
    throw new Error('Не удалось связаться с сервером');
  }
  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error('Некорректный ответ сервера');
  }
  if (!response.ok) {
    // attempt to display server error message
    const message = json?.error?.message || json?.message || 'Ошибка сервера';
    throw new Error(message);
  }
  return json;
}