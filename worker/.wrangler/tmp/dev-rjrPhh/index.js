var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-3vJjbr/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/validateSubmission.js
function validateSubmission(input, limits) {
  const maxFeatures = parseInt(limits.MAX_FEATURES, 10);
  if (!input || typeof input !== "object") {
    const err = new Error("Invalid submission format");
    err.code = "INVALID_REQUEST";
    throw err;
  }
  const changes = input.changes;
  if (!Array.isArray(changes)) {
    const err = new Error('Field "changes" must be an array');
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (changes.length < 1) {
    const err = new Error("At least one change is required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (changes.length > maxFeatures) {
    const err = new Error(`Too many changes: maximum ${maxFeatures}`);
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const normalized = { changes: [] };
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (!change || change.changeType !== "create") {
      const err = new Error(`Change ${index + 1}: unsupported changeType`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const feature = change.feature;
    if (!feature || feature.type !== "Feature") {
      const err = new Error(`Change ${index + 1}: feature must be a GeoJSON Feature`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (!feature.geometry) {
      const err = new Error(`Change ${index + 1}: feature.geometry is required`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const geomType = feature.geometry.type;
    const allowedGeoms = [
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon"
    ];
    if (!allowedGeoms.includes(geomType)) {
      const err = new Error(`Change ${index + 1}: geometry.type ${geomType} is not supported`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (!feature.properties || typeof feature.properties.name !== "string" || feature.properties.name.trim() === "") {
      const err = new Error(`Change ${index + 1}: properties.name is required`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (!feature.properties || typeof feature.properties.explainer !== "string" || feature.properties.explainer.trim() === "") {
      const err = new Error(`Change ${index + 1}: properties.explainer is required`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const typeToLayer = {
      Point: "public/data/points.geojson",
      MultiPoint: "public/data/points.geojson",
      LineString: "public/data/lines.geojson",
      MultiLineString: "public/data/lines.geojson",
      Polygon: "public/data/districts.geojson",
      MultiPolygon: "public/data/districts.geojson"
    };
    let targetLayer = change.targetLayer;
    const deducedLayer = typeToLayer[geomType];
    if (targetLayer) {
      const trimmed = targetLayer.trim();
      if (trimmed !== deducedLayer) {
        const err = new Error(`Change ${index + 1}: targetLayer ${targetLayer} does not match geometry.type ${geomType}`);
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      targetLayer = trimmed;
    } else {
      targetLayer = deducedLayer;
    }
    normalized.changes.push({
      changeType: "create",
      feature,
      targetLayer
    });
  }
  if (input.submissionId) {
    normalized.submissionId = String(input.submissionId);
  }
  return normalized;
}
__name(validateSubmission, "validateSubmission");

// src/applyChanges.js
function applyChangesToGeoJson(existingGeoJson, changesForLayer) {
  if (!existingGeoJson || existingGeoJson.type !== "FeatureCollection" || !Array.isArray(existingGeoJson.features)) {
    throw new Error("Invalid GeoJSON: expected FeatureCollection");
  }
  const newFeatures = existingGeoJson.features.map((f) => ({ ...f }));
  for (const change of changesForLayer) {
    const feature = JSON.parse(JSON.stringify(change.feature));
    if (feature.id == null) {
      feature.id = crypto.randomUUID();
    }
    newFeatures.push(feature);
  }
  return {
    type: "FeatureCollection",
    features: newFeatures
  };
}
__name(applyChangesToGeoJson, "applyChangesToGeoJson");

// src/github.js
var GITHUB_API_URL = "https://api.github.com";
async function githubFetch(url, options, env) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (options && options.headers) {
    Object.assign(headers, options.headers);
  }
  return fetch(url, { ...options, headers });
}
__name(githubFetch, "githubFetch");
function decodeBase64ToString(base64) {
  return atob(base64);
}
__name(decodeBase64ToString, "decodeBase64ToString");
function encodeToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
__name(encodeToBase64, "encodeToBase64");
async function getBaseBranchRef(env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/ref/heads/${env.GITHUB_BASE_BRANCH}`;
  const res = await githubFetch(url, {}, env);
  if (!res.ok) {
    throw new Error(`Failed to get base branch ref: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.object;
}
__name(getBaseBranchRef, "getBaseBranchRef");
async function createBranch(branchName, baseSha, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs`;
  const body = {
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  };
  const res = await githubFetch(url, { method: "POST", body: JSON.stringify(body) }, env);
  if (!res.ok && res.status !== 422) {
    throw new Error(`Failed to create branch: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}
__name(createBranch, "createBranch");
async function getFile(path, ref, env) {
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
__name(getFile, "getFile");
async function createOrUpdateFile(path, contentString, branchName, message, sha, env) {
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
  const res = await githubFetch(url, { method: "PUT", body: JSON.stringify(body) }, env);
  if (!res.ok) {
    throw new Error(`Failed to write file ${path}: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}
__name(createOrUpdateFile, "createOrUpdateFile");
async function createPullRequest({ title, body, head, base }, env) {
  const url = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls`;
  const prBody = {
    title,
    body,
    head,
    base
  };
  const res = await githubFetch(url, { method: "POST", body: JSON.stringify(prBody) }, env);
  if (!res.ok) {
    throw new Error(`Failed to create pull request: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}
__name(createPullRequest, "createPullRequest");

// src/response.js
function jsonResponse(body, env, status = 200) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
  return new Response(JSON.stringify(body), { status, headers });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(code, message, env, status = 400) {
  const errorBody = { ok: false, error: { code, message } };
  return jsonResponse(errorBody, env, status);
}
__name(errorResponse, "errorResponse");

// src/captcha.js
async function verifyCaptcha(captchaToken, requestIp, env) {
  if (env.CAPTCHA_ENABLED !== "true") {
    return true;
  }
  throw new Error("CAPTCHA_ENABLED is true, but captcha verification is not implemented yet");
}
__name(verifyCaptcha, "verifyCaptcha");

// src/index.js
function generateSubmissionId() {
  const now = /* @__PURE__ */ new Date();
  const yyyy = now.getFullYear().toString().padStart(4, "0");
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const time = now.getTime().toString().slice(-4);
  return `sub_${yyyy}-${mm}-${dd}_${time}`;
}
__name(generateSubmissionId, "generateSubmissionId");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "vernacular-map-submissions" }, env);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    if (request.method === "POST" && url.pathname === "/api/submissions") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== env.ALLOWED_ORIGIN) {
        return errorResponse("FORBIDDEN_ORIGIN", "Origin not allowed", env, 403);
      }
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return errorResponse("INVALID_CONTENT_TYPE", "Content-Type must be application/json", env, 415);
      }
      const contentLength = request.headers.get("content-length");
      const maxBytes = parseInt(env.MAX_BODY_BYTES, 10);
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        return errorResponse("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`, env, 413);
      }
      let rawBody;
      try {
        rawBody = await request.text();
      } catch {
        return errorResponse("INVALID_JSON", "Unable to read request body", env, 400);
      }
      if (rawBody.length > maxBytes) {
        return errorResponse("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`, env, 413);
      }
      let submission;
      try {
        submission = JSON.parse(rawBody);
      } catch {
        return errorResponse("INVALID_JSON", "Request body must be valid JSON", env, 400);
      }
      const captchaToken = submission.captchaToken || null;
      const requestIp = request.headers.get("CF-Connecting-IP") || "";
      try {
        const captchaOk = await verifyCaptcha(captchaToken, requestIp, env);
        if (!captchaOk) {
          return errorResponse("CAPTCHA_FAILED", "Captcha validation failed", env, 400);
        }
      } catch (e) {
        return errorResponse("CAPTCHA_ERROR", e.message || "Captcha error", env, 400);
      }
      let normalized;
      try {
        normalized = validateSubmission(submission, env);
      } catch (err) {
        return errorResponse(err.code || "VALIDATION_ERROR", err.message, env, 400);
      }
      const submissionId = normalized.submissionId || generateSubmissionId();
      normalized.submissionId = submissionId;
      try {
        const baseRef = await getBaseBranchRef(env);
        const branchName = `submission/${submissionId}`;
        await createBranch(branchName, baseRef.sha, env);
        const changesByLayer = {};
        for (const change of normalized.changes) {
          const layer = change.targetLayer;
          if (!changesByLayer[layer]) {
            changesByLayer[layer] = [];
          }
          changesByLayer[layer].push(change);
        }
        for (const layer in changesByLayer) {
          const { content: fileContent, sha } = await getFile(layer, env.GITHUB_BASE_BRANCH, env);
          let geojson;
          try {
            geojson = JSON.parse(fileContent);
          } catch {
            throw new Error(`Invalid JSON in repository file ${layer}`);
          }
          const updated = applyChangesToGeoJson(geojson, changesByLayer[layer]);
          await createOrUpdateFile(
            layer,
            JSON.stringify(updated, null, 2),
            branchName,
            `feat: add submission ${submissionId} changes to ${layer}`,
            sha,
            env
          );
        }
        const submissionPath = `submissions/pending/${submissionId}.json`;
        await createOrUpdateFile(
          submissionPath,
          JSON.stringify(normalized, null, 2),
          branchName,
          `chore: add submission record ${submissionId}`,
          null,
          env
        );
        const pr = await createPullRequest({
          title: `Map submission ${submissionId}`,
          body: `Automated map submission ${submissionId}`,
          head: branchName,
          base: env.GITHUB_BASE_BRANCH
        }, env);
        return jsonResponse({ ok: true, submissionId, pullRequestUrl: pr.html_url }, env);
      } catch (err) {
        return errorResponse("GITHUB_ERROR", err.message || "GitHub operation failed", env, 500);
      }
    }
    return new Response("Not Found", { status: 404 });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-3vJjbr/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-3vJjbr/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
