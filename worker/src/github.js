const GITHUB_API_URL = 'https://api.github.com';

/**
 * Performs a fetch request against the GitHub API with proper headers.
 *
 * @param {string} url - Full API endpoint.
 * @param {object} options - Fetch options (method, body, etc.).
 * @param {any} env - Environment variables (needs GITHUB_TOKEN).
 */
async function githubFetch(url, options, env) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (options && options.headers) {
    Object.assign(headers, options.headers);
  }
  return fetch(url, { ...options, headers });
}

/**
 * Decodes Base64 content (UTF‑8) returned by GitHub API.
 */
function decodeBase64ToString(base64) {
  // atob works in Cloudflare Workers
  return atob(base64);
}

/**
 * Encodes a string into Base64.
 */
function encodeToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Returns the reference object for the base branch (contains sha and type).
 */
export async function getBaseBranchRef(env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/ref/heads/${env.GITHUB_BASE_BRANCH}`;
  const res = await githubFetch(url, {}, env);
  if (!res.ok) {
    throw new Error(`Failed to get base branch ref: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.object;
}

/**
 * Creates a new branch pointing to a given sha. If the branch already exists,
 * the GitHub API will return 422; we ignore that case.
 */
export async function createBranch(branchName, baseSha, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs`;
  const body = {
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  };
  const res = await githubFetch(url, { method: 'POST', body: JSON.stringify(body) }, env);
  if (!res.ok && res.status !== 422) {
    throw new Error(`Failed to create branch: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/**
 * Retrieves a file from GitHub with its base64 content and sha.
 */
export async function getFile(path, ref, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(
    path
  )}?ref=${ref}`;
  const res = await githubFetch(url, {}, env);
  if (!res.ok) {
    throw new Error(`Failed to fetch file ${path}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content = decodeBase64ToString(data.content);
  return { content, sha: data.sha };
}

/**
 * Creates or updates a file in a given branch.
 */
export async function createOrUpdateFile(path, contentString, branchName, message, sha, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(
    path
  )}`;
  const body = {
    message,
    branch: branchName,
    content: encodeToBase64(contentString)
  };
  if (sha) {
    body.sha = sha;
  }
  const res = await githubFetch(url, { method: 'PUT', body: JSON.stringify(body) }, env);
  if (!res.ok) {
    throw new Error(`Failed to write file ${path}: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/**
 * Creates a new pull request.
 */
export async function createPullRequest({ title, body, head, base }, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls`;
  const prBody = {
    title,
    body,
    head,
    base
  };
  const res = await githubFetch(url, { method: 'POST', body: JSON.stringify(prBody) }, env);
  if (!res.ok) {
    throw new Error(`Failed to create pull request: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}