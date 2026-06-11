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
