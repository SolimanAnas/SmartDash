import * as esbuild from 'esbuild';
import fs from 'fs';

const [jsRes, cssRes] = await Promise.all([
  esbuild.build({
    entryPoints: ['src/app.js'],
    bundle: true, minify: true, format: 'iife',
    loader: { '.json': 'json' },
    legalComments: 'none', write: false,
  }),
  esbuild.build({
    entryPoints: ['src/style.css'],
    loader: { '.css': 'css' },
    minify: true, write: false,
  }),
]);

const js = jsRes.outputFiles[0].text;
const css = cssRes.outputFiles[0].text;
let html = fs.readFileSync('src/index.html', 'utf8');
html = html.replace('/*CSS*/', () => css);
html = html.replace('/*BUNDLE*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/dcas-airport-platform.html', html);
fs.writeFileSync('../index.html', html);

['manifest.json', 'sw.js', '404.html'].forEach((f) => {
  if (fs.existsSync('src/' + f)) {
    fs.copyFileSync('src/' + f, 'dist/' + f);
    fs.copyFileSync('src/' + f, '../' + f);
  }
});
console.log('Built dist/dcas-airport-platform.html', html.length, 'bytes  (js', js.length, 'bytes  css', css.length, 'bytes)');
