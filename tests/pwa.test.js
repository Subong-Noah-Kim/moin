import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('manifest declares an installable standalone app with relative scope', async () => {
  const manifest = JSON.parse(await readProjectFile('manifest.webmanifest'));
  assert.equal(manifest.name, 'moin');
  assert.equal(manifest.short_name, 'moin');
  assert.equal(manifest.lang, 'ko');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.background_color, '#fbf7ef');
  assert.equal(manifest.theme_color, '#1f6a53');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/icons\//, 'icon src must be relative for subpath deploys');
  }
  const purposes = manifest.icons.map((icon) => icon.purpose || 'any');
  assert.ok(purposes.includes('maskable'));
});

test('index.html links the manifest, apple touch icon, and theme color', async () => {
  const html = await readProjectFile('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon-180\.png" \/>/);
  assert.match(html, /<meta name="theme-color" content="#1f6a53" \/>/);
});

test('local dev server declares manifest and icon content types', async () => {
  const server = await readProjectFile('server.js');
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json; charset=utf-8'/);
  assert.match(server, /'\.svg': 'image\/svg\+xml'/);
  assert.match(server, /'\.png': 'image\/png'/);
});

test('pages deploy copies the manifest and icons', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp manifest\.webmanifest dist\//);
  assert.match(workflow, /cp -R icons dist\//);
});

test('manifest and apple touch icons exist as PNG files', async () => {
  const manifest = JSON.parse(await readProjectFile('manifest.webmanifest'));
  const iconPaths = manifest.icons.map((icon) => icon.src.replace(/^\.\//, ''));
  iconPaths.push('icons/apple-touch-icon-180.png');
  for (const iconPath of iconPaths) {
    const file = await readFile(new URL(`../${iconPath}`, import.meta.url));
    assert.ok(file.length > 0, `${iconPath} should not be empty`);
    assert.equal(file.subarray(1, 4).toString(), 'PNG', `${iconPath} should be a PNG file`);
  }
});

test('index.html exposes Open Graph and Twitter cards for link previews', async () => {
  const html = await readProjectFile('index.html');
  const base = 'https://subong-noah-kim.github.io/moin/';

  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<meta property="og:site_name" content="moin" \/>/);
  assert.match(html, /<meta property="og:title" content="[^"]+" \/>/);
  assert.match(html, /<meta property="og:description" content="[^"]+" \/>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="${base}" />`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${base}icons/og-image\\.png" />`));
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  assert.match(html, /<meta property="og:locale" content="ko_KR" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, new RegExp(`<meta name="twitter:image" content="${base}icons/og-image\\.png" />`));

  // OG image URL must be absolute so scrapers (KakaoTalk, etc.) can fetch it.
  assert.doesNotMatch(html, /property="og:image" content="\.\//, 'og:image must be an absolute URL');
});

test('the Open Graph preview image exists as a 1200x630 PNG', async () => {
  const svg = await readProjectFile('icons/og-image.svg');
  assert.match(svg, /viewBox="0 0 1200 630"/);

  const png = await readFile(new URL('../icons/og-image.png', import.meta.url));
  assert.ok(png.length > 0);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  // PNG width/height live in the IHDR chunk at bytes 16-23 (big-endian).
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);

  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp -R icons dist\//, 'the icons dir (with og-image.png) must deploy');

  const renderScript = await readProjectFile('scripts/render-app-icons.mjs');
  assert.match(renderScript, /og-image\.svg/, 'the OG image is reproducible via the render script');
});
