// size-limit config — resolves hashed entry assets from dist/index.html
// so budgets aren't broken by Vite's content-hash rebuilds.
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "dist/index.html"), "utf8");

const findAsset = (ext) => {
  const re = new RegExp(`assets/[^"]+\\.${ext}`);
  const m = html.match(re);
  if (!m) throw new Error(`Could not find ${ext} entry asset in dist/index.html — did you run \`npm run build\`?`);
  return path.join("dist", m[0]);
};

module.exports = [
  {
    name: "main JS entry (gzip)",
    path: findAsset("js"),
    limit: "450 KB",
    gzip: true,
  },
  {
    name: "main CSS entry (gzip)",
    path: findAsset("css"),
    limit: "95 KB",
    gzip: true,
  },
];
