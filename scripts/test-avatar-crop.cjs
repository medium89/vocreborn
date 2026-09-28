const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tusova-avatar-test-'));
let rectangle;
try {
  const compiler = path.join(path.dirname(require.resolve('typescript')), '..', 'bin', 'tsc');
  execFileSync(process.execPath, [compiler, path.join(__dirname, '..', 'lib', 'avatar-crop.ts'), '--module', 'commonjs', '--target', 'es2017', '--skipLibCheck', '--outDir', temporary], { cwd: temporary, stdio: 'inherit' });
  rectangle = require(path.join(temporary, 'avatar-crop.js')).avatarCropRectangle;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

assert.deepEqual(rectangle(900, 300, { x: 50, y: 50, zoom: 1 }), { x: 300, y: 0, size: 300 });
assert.deepEqual(rectangle(900, 300, { x: 100, y: 50, zoom: 1 }), { x: 600, y: 0, size: 300 });
assert.deepEqual(rectangle(300, 900, { x: 50, y: 100, zoom: 1 }), { x: 0, y: 600, size: 300 });
assert.deepEqual(rectangle(300, 300, { x: 50, y: 50, zoom: 2 }), { x: 75, y: 75, size: 150 });
for (const [width, height] of [[1, 1], [320, 320], [4032, 3024], [3024, 4032], [12000, 1]]) {
  for (const zoom of [.5, 1, 1.01, 2, 4, 10]) {
    for (const x of [-10, 0, 50, 100, 120]) {
      for (const y of [-10, 0, 50, 100, 120]) {
        const rect = rectangle(width, height, { x, y, zoom });
        assert(rect.size > 0 && rect.size <= Math.min(width, height));
        assert(rect.x >= 0 && rect.y >= 0);
        assert(rect.x + rect.size <= width + 1e-8 && rect.y + rect.size <= height + 1e-8);
      }
    }
  }
}
console.log('Avatar crop: centered, landscape, portrait, zoom, clamping and 750 boundary cases passed.');
