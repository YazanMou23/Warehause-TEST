const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src/app');
const codes = ['de', 'ar', 'tr', 'uk'];
const dictionaries = Object.fromEntries(codes.map(code => [code, JSON.parse(fs.readFileSync(path.join(root, 'i18n', code + '.json'), 'utf8'))]));
const keys = Object.keys(dictionaries.de).sort();
for (const code of codes) {
  assert.deepEqual(Object.keys(dictionaries[code]).sort(), keys, `${code}: catalog keys differ`);
  for (const [key, value] of Object.entries(dictionaries[code])) assert.equal(typeof value, 'string', `${code}.${key}`);
}
let references = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && ['t', 'tx'].includes(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        assert(Object.hasOwn(dictionaries.de, node.arguments[0].text), `${file}: missing ${node.arguments[0].text}`);
        references++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
walk(root);
console.log(`${codes.length} catalogs, ${keys.length} keys each, ${references} literal references checked`);
