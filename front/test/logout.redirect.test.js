const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('logout handler redirects to login route', () => {
  const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
  const source = fs.readFileSync(appJsPath, 'utf8');

  assert.match(
    source,
    /\$\('logoutBtn'\)\.addEventListener\('click',[\s\S]*?window\.location\.hash\s*=\s*['\"]#login['\"]/,
    'Expected logout success path to redirect to #login'
  );
});
