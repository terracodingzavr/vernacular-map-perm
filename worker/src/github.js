const GITHUB_API_URL = 'https://api.github.com';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function githubFetch(url, options = {}, env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vernacular-map-submissions-worker'
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  return fetch(url, { ...options, headers });
}

async function parseGithubResponse(response, fallbackMessage) {
  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const details =
      data && typeof data === 'object' && data.message
        ? JSON.stringify(data, null, 2)
        : text || response.statusText;

    throw new Error(`${fallbackMessage}: ${response.status} ${details}`);
  }

  return data;
}

function decodeBase64ToString(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function getBaseBranchRef(env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/ref/heads/${encodeURIComponent(
    env.GITHUB_BASE_BRANCH
  )}`;

  const response = await githubFetch(url, { method: 'GET' }, env);
  const data = await parseGithubResponse(response, 'Failed to get base branch ref');

  return data.object;
}

export async function createBranch(branchName, baseSha, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs`;

  const body = {
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  };

  const response = await githubFetch(
    url,
    {
      method: 'POST',
      body: JSON.stringify(body)
    },
    env
  );

  if (response.status === 422) {
    const text = await response.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const message =
      data && typeof data === 'object' && data.message
        ? data.message
        : text;

    if (message && message.toLowerCase().includes('reference already exists')) {
      return data;
    }

    throw new Error(`Failed to create branch: 422 ${text}`);
  }

  return parseGithubResponse(response, 'Failed to create branch');
}

export async function getFile(path, ref, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(
    path
  )}?ref=${encodeURIComponent(ref)}`;

  const response = await githubFetch(url, { method: 'GET' }, env);
  const data = await parseGithubResponse(response, `Failed to fetch file ${path}`);

  if (data.type !== 'file' || !data.content || !data.sha) {
    throw new Error(`GitHub path is not a file or has no content: ${path}`);
  }

  return {
    content: decodeBase64ToString(data.content),
    sha: data.sha
  };
}

export async function createOrUpdateFile(path, content, branch, message, sha, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(
    path
  )}`;

  const body = {
    message,
    content: encodeToBase64(content),
    branch
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await githubFetch(
    url,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    },
    env
  );

  return parseGithubResponse(response, `Failed to write file ${path}`);
}

export async function createPullRequest({ title, body, head, base }, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls`;

  const prBody = {
    title,
    body,
    head,
    base
  };

  const response = await githubFetch(
    url,
    {
      method: 'POST',
      body: JSON.stringify(prBody)
    },
    env
  );

  return parseGithubResponse(response, 'Failed to create pull request');
}