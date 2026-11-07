// Builds the app into docs/ for GitHub Pages (Settings → Pages → main / docs).
// Usage: npm install && npm run build
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const out = "docs";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: { app: "src/main.jsx" },
  bundle: true,
  minify: process.env.DEBUG ? false : true,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  outdir: out,
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(":") : [],
  logLevel: "info",
});

cpSync("index.html", `${out}/index.html`);
cpSync("public", out, { recursive: true });
cpSync(".nojekyll", `${out}/.nojekyll`);
console.log("Built to docs/");
