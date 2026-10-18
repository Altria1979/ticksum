import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const manifest = JSON.parse(await readFile(new URL('../.output/chrome-mv3/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, 'background.js');
assert.equal((manifest.host_permissions ?? []).length, 0, 'Site access must remain optional. Runtime script matches can accidentally promote required permissions.');
assert.equal((manifest.content_scripts ?? []).length, 0, 'Capture scripts must only be dynamically registered after site authorization.');
assert.deepEqual([...manifest.optional_host_permissions].sort(), ['http://*/*', 'https://*/*']);
assert.ok(!manifest.permissions.includes('history'), 'TickSum does not require past browsing history.');
for (const size of [16, 32, 48, 128]) {
  assert.equal(manifest.icons?.[size], `icon/${size}.png`, 'Packaged extension must include its declared PNG icons.');
  const icon = await readFile(new URL(`../.output/chrome-mv3/${manifest.icons[size]}`, import.meta.url));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Icon must be a PNG.');
  assert.equal(icon.readUInt32BE(16), size, 'Icon width must match the manifest.');
  assert.equal(icon.readUInt32BE(20), size, 'Icon height must match the manifest.');
}
process.stdout.write('Manifest verified: MV3, optional site access, no static capture scripts, PNG icons.\n');
