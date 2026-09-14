import express from "express";
import path from "node:path";
import { createRequire } from "node:module";
import { Router } from "express";

import { getOpenApiDocument } from "./openapi.js";

const require = createRequire(import.meta.url);

/**
 * `swagger-ui-dist` ships the compiled Swagger UI assets (JS/CSS bundles).
 * They are served locally - no CDN - so the documentation works offline and
 * stays on-origin, which keeps the security headers (Helmet CSP) satisfied
 * without inline scripts.
 */
const SWAGGER_UI_DIST_PATH = path.dirname(require.resolve("swagger-ui-dist/package.json"));

/**
 * The Swagger UI bootstrap page. All scripts and stylesheets are on-origin and
 * the initializer is an external file (no inline script), so it works with the
 * default Helmet Content-Security-Policy.
 */
const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hisab Split Bill API - OpenAPI Documentation</title>
    <link rel="stylesheet" href="assets/swagger-ui.css" />
    <link rel="icon" type="image/png" href="assets/favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="assets/favicon-16x16.png" sizes="16x16" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="assets/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="assets/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script src="swagger-initializer.js" charset="UTF-8"></script>
  </body>
</html>
`;

/**
 * External initializer (served from this router rather than inline) that
 * points Swagger UI at the raw OpenAPI document on the same route prefix.
 */
const SWAGGER_UI_INITIALIZER_JS = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: "openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    displayRequestDuration: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout",
  });
};
`;

const docsRoutes = Router();

/** Interactive Swagger UI for the OpenAPI specification. */
docsRoutes.get("/", (_req, res) => {
  res.type("html").send(SWAGGER_UI_HTML);
});

/** The raw OpenAPI 3.0.3 document as JSON. */
docsRoutes.get("/openapi.json", (_req, res) => {
  res.json(getOpenApiDocument());
});

/** Swagger UI's app initializer, kept out of the HTML so no inline script is needed. */
docsRoutes.get("/swagger-initializer.js", (_req, res) => {
  res.type("application/javascript").send(SWAGGER_UI_INITIALIZER_JS);
});

/** Local Swagger UI assets (bundle, preset, stylesheet, favicons). */
docsRoutes.use(
  "/assets",
  express.static(SWAGGER_UI_DIST_PATH, { index: false, dotfiles: "ignore" }),
);

export default docsRoutes;
