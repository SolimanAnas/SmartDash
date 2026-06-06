import * as esbuild from 'esbuild';
import fs from 'fs';

const [jsRes, cssRes] = await Promise.all([
  esbuild.build({
    entryPoints: ['src/app.js'],
    bundle: true,
    minify: true,
    format: 'iife',
    loader: {
      '.json': 'json'
    },
    legalComments: 'none',
    write: false
  }),

  esbuild.build({
    entryPoints: ['src/style.css'],
    loader: {
      '.css': 'css'
    },
    minify: true,
    write: false
  })
]);

const js = jsRes.outputFiles[0].text;
const css = cssRes.outputFiles[0].text;

/*
 * Load the NEW source HTML from:
 * proj/src/index.html
 */
let html = fs.readFileSync('src/index.html', 'utf8');

/*
 * Inject bundled CSS and JS
 */
html = html.replace('/*CSS*/', css);
html = html.replace('/*BUNDLE*/', js);

/*
 * Create dist folder
 */
fs.mkdirSync('dist', { recursive: true });

/*
 * Build artifact
 */
fs.writeFileSync(
  'dist/dcas-airport-platform.html',
  html,
  'utf8'
);

/*
 * Publish directly to repository root
 * (GitHub Pages serves this file)
 */
fs.writeFileSync(
  '../index.html',
  html,
  'utf8'
);

/*
 * Copy supporting files
 */
for (const file of ['manifest.json', 'sw.js', '404.html']) {
  const srcFile = `src/${file}`;

  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, `dist/${file}`);
    fs.copyFileSync(srcFile, `../${file}`);
  }
}

/*
 * Copy icons
 */
if (fs.existsSync('src/icons')) {
  fs.mkdirSync('dist/icons', { recursive: true });
  fs.mkdirSync('../icons', { recursive: true });

  for (const file of fs.readdirSync('src/icons')) {
    fs.copyFileSync(
      `src/icons/${file}`,
      `dist/icons/${file}`
    );

    fs.copyFileSync(
      `src/icons/${file}`,
      `../icons/${file}`
    );
  }
}

console.log(
  'Built dist/dcas-airport-platform.html',
  html.length,
  'bytes (js',
  js.length,
  'bytes css',
  css.length,
  'bytes)'
);