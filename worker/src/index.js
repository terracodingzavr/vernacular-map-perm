import { validateSubmission } from './validateSubmission.js';
import { applyChangesToGeoJson } from './applyChanges.js';
import * as github from './github.js';
import { jsonResponse, errorResponse } from './response.js';
import { verifyCaptcha } from './captcha.js';

/**
 * Generates a unique submission ID based on date and timestamp.
 * Format: sub_YYYY-MM-DD_<last4digits_of_timestamp>
 */
function generateSubmissionId() {
  const now = new Date();
  const yyyy = now.getFullYear().toString().padStart(4, '0');
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const time = now.getTime().toString().slice(-4);
  return `sub_${yyyy}-${mm}-${dd}_${time}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health‑check endpoint
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'vernacular-map-submissions' }, env);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
      }

    // Main API endpoint
    if (request.method === 'POST' && url.pathname === '/api/submissions') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== env.ALLOWED_ORIGIN) {
        return errorResponse('FORBIDDEN_ORIGIN', 'Origin not allowed', env, 403);
      }

      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return errorResponse('INVALID_CONTENT_TYPE', 'Content-Type must be application/json', env, 415);
      }

      // Enforce body size limit
      const contentLength = request.headers.get('content-length');
      const maxBytes = parseInt(env.MAX_BODY_BYTES, 10);
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        return errorResponse('PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes`, env, 413);
      }

      let rawBody;
      try {
        rawBody = await request.text();
      } catch {
        return errorResponse('INVALID_JSON', 'Unable to read request body', env, 400);
      }

      if (rawBody.length > maxBytes) {
        return errorResponse('PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes`, env, 413);
      }

      let submission;
      try {
        submission = JSON.parse(rawBody);
      } catch {
        return errorResponse('INVALID_JSON', 'Request body must be valid JSON', env, 400);
      }

      // CAPTCHA verification
      const captchaToken = submission.captchaToken || null;
      const requestIp = request.headers.get('CF-Connecting-IP') || '';
      try {
        const captchaOk = await verifyCaptcha(captchaToken, requestIp, env);
        if (!captchaOk) {
          return errorResponse('CAPTCHA_FAILED', 'Captcha validation failed', env, 400);
        }
      } catch (e) {
        return errorResponse('CAPTCHA_ERROR', e.message || 'Captcha error', env, 400);
      }

      // Validate and normalize the submission
      let normalized;
      try {
        normalized = validateSubmission(submission, env);
      } catch (err) {
        return errorResponse(err.code || 'VALIDATION_ERROR', err.message, env, 400);
      }

      // Generate submissionId if not provided
      const submissionId = normalized.submissionId || generateSubmissionId();
      normalized.submissionId = submissionId;

      // Apply changes and push to GitHub
      try {
        // Fetch base branch SHA
        const baseRef = await github.getBaseBranchRef(env);
        const branchName = `submission/${submissionId}`;
        await github.createBranch(branchName, baseRef.sha, env);

        // Group changes by target layer
        const changesByLayer = {};
        for (const change of normalized.changes) {
          const layer = change.targetLayer;
          if (!changesByLayer[layer]) {
            changesByLayer[layer] = [];
          }
          changesByLayer[layer].push(change);
        }

        // Update each GeoJSON file
        for (const layer in changesByLayer) {
          const { content: fileContent, sha } = await github.getFile(layer, env.GITHUB_BASE_BRANCH, env);
          let geojson;
          try {
            geojson = JSON.parse(fileContent);
          } catch {
            throw new Error(`Invalid JSON in repository file ${layer}`);
          }

          const updated = applyChangesToGeoJson(geojson, changesByLayer[layer]);
          await github.createOrUpdateFile(
            layer,
            JSON.stringify(updated, null, 2),
            branchName,
            `feat: add submission ${submissionId} changes to ${layer}`,
            sha,
            env
          );
        }

        // Save the submission record into submissions/pending
        const submissionPath = `submissions/pending/${submissionId}.json`;
        await github.createOrUpdateFile(
          submissionPath,
          JSON.stringify(normalized, null, 2),
          branchName,
          `chore: add submission record ${submissionId}`,
          null,
          env
        );

        // Create a Pull Request
        const pr = await github.createPullRequest({
          title: `Map submission ${submissionId}`,
          body: `Automated map submission ${submissionId}`,
          head: branchName,
          base: env.GITHUB_BASE_BRANCH
        }, env);

        return jsonResponse({ ok: true, submissionId, pullRequestUrl: pr.html_url }, env);
      } catch (err) {
        return errorResponse('GITHUB_ERROR', err.message || 'GitHub operation failed', env, 500);
      }
    }

    // Fallback 404
    return new Response('Not Found', { status: 404 });
  }
};