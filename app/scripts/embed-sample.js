/* 开发辅助：把 sample.jsonl 原样内嵌成浏览器可直接加载的脚本。
 * 用法：node scripts/embed-sample.js
 * 运行测试时会校验内嵌内容与 sample.jsonl 完全一致。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'sample.jsonl');
const targetPath = path.join(root, 'js', 'sample-data.js');

const sample = fs.readFileSync(sourcePath, 'utf8');
const banner = [
  '/* 此文件由 scripts/embed-sample.js 自动生成，请勿手动修改。 */',
  '/* 内容与根目录 sample.jsonl 完全一致，用于双击打开时无需读取本地文件。 */',
  '(function (root, factory) {',
  '  var value = factory();',
  "  if (typeof module === 'object' && module.exports) {",
  '    module.exports = value;',
  '  } else {',
  '    root.LogSample = value;',
  '  }',
  "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
  "  'use strict';",
  '  return ' + JSON.stringify(sample) + ';',
  '});',
  ''
].join('\n');

fs.writeFileSync(targetPath, banner, 'utf8');
console.log('已写入 ' + path.relative(root, targetPath) + '（' + Buffer.byteLength(sample, 'utf8') + ' 字节）');
