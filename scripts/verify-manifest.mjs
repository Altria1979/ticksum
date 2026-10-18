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
process.stdout.write('Manifest verified: MV3, optional site access, no static capture scripts.\n');
