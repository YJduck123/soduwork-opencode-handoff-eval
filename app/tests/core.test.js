'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../js/core.js');
const embeddedSample = require('../js/sample-data.js');

const root = path.resolve(__dirname, '..');
const sampleText = fs.readFileSync(path.join(root, 'sample.jsonl'), 'utf8');

function record(overrides) {
  return Object.assign({
    timestamp: '2026-11-17T09:00:00+08:00',
    level: 'INFO',
    service: 'gateway',
    status: 200,
    duration_ms: 100,
    message: 'ok'
  }, overrides);
}

test('内嵌示例与 sample.jsonl 完全一致，且示例文件保持原样', () => {
  assert.equal(embeddedSample, sampleText);
  assert.equal(sampleText.includes('not-json'), true);
  assert.equal(sampleText.includes('"duration_ms":"unknown"'), true);
});

test('示例日志：跳过第 9、10 行，保留引号和换行原文', () => {
  const result = core.parseJSONL(sampleText);

  assert.equal(result.scannedLines, 10);
  assert.equal(result.records.length, 8);
  assert.deepEqual(result.errors.map((error) => error.line), [9, 10]);
  assert.match(result.errors[0].reason, /JSON/);
  assert.match(result.errors[1].reason, /duration_ms/);
  assert.match(result.errors[1].reason, /string/);
  assert.equal(result.errors[0].preview, 'not-json');

  assert.equal(result.records[2].message, '支付失败，provider 返回 "timeout"');
  assert.equal(result.records[4].message, 'upstream reset\n请检查连接');
  assert.deepEqual(Object.keys(result.records[0]), [
    'timestamp', 'level', 'service', 'status', 'duration_ms', 'message'
  ]);
});

test('示例统计：8 条、3 个 ERROR、3 个慢请求、平均 750ms', () => {
  const records = core.parseJSONL(sampleText).records;
  const stats = core.computeStats(records);

  assert.equal(stats.count, 8);
  assert.equal(stats.errorCount, 3);
  assert.equal(stats.slowCount, 3);
  assert.equal(stats.avgDuration, 750);
  assert.equal(core.formatAverage(stats.avgDuration), '750.0 ms');
});

test('示例筛选：ERROR 的慢请求与平均值正确', () => {
  const records = core.parseJSONL(sampleText).records;
  const filtered = core.filterRecords(records, { level: 'ERROR', service: '', keyword: '' });
  const stats = core.computeStats(filtered);

  assert.equal(stats.count, 3);
  assert.equal(stats.errorCount, 3);
  assert.equal(stats.slowCount, 2);
  assert.equal(core.formatAverage(stats.avgDuration), '1486.7 ms');
});

test('类型错误逐行隔离，后续有效行仍会保留', () => {
  const text = [
    JSON.stringify(record({ message: 'first' })),
    JSON.stringify(record({ status: '200' })),
    JSON.stringify({ timestamp: 't', level: 'INFO', status: 200, duration_ms: 1, message: 'missing service' }),
    JSON.stringify(record({ duration_ms: 'unknown' })),
    JSON.stringify(record({ timestamp: 123 })),
    JSON.stringify(record({ message: null })),
    JSON.stringify([record()]),
    JSON.stringify('plain string'),
    '{bad json}',
    '   ',
    JSON.stringify(record({ message: 'last' }))
  ].join('\n');

  const result = core.parseJSONL(text);

  assert.equal(result.scannedLines, 10);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].message, 'first');
  assert.equal(result.records[1].message, 'last');
  assert.deepEqual(result.errors.map((error) => error.line), [2, 3, 4, 5, 6, 7, 8, 9]);

  const reasons = result.errors.map((error) => error.reason).join('\n');
  assert.match(reasons, /status 应为数字/);
  assert.match(reasons, /service 字段缺失/);
  assert.match(reasons, /duration_ms 应为数字/);
  assert.match(reasons, /timestamp 应为字符串/);
  assert.match(reasons, /message 应为字符串/);
  assert.match(reasons, /JSON 对象/);
  assert.match(reasons, /不是有效的 JSON/);
});

test('坏行行号按原始物理行计算，空行不吞掉行号', () => {
  const result = core.parseJSONL('\n\nnot-json\n' + JSON.stringify(record({ message: 'after' })));
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 3);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].message, 'after');
});

test('支持 BOM 与 CRLF，空行静默跳过', () => {
  const text = '\uFEFF' + JSON.stringify(record({ message: 'one' })) + '\r\n\r\n' +
    JSON.stringify(record({ message: 'two' })) + '\r\n';
  const result = core.parseJSONL(text);

  assert.equal(result.scannedLines, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.errors.length, 0);
});

test('非文本输入返回明确错误而不是抛异常', () => {
  const result = core.parseJSONL(null);
  assert.equal(result.records.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 0);
  assert.match(result.errors[0].reason, /不是文本/);
});

test('慢请求边界：999 不算，1000 与 1001 都算', () => {
  const records = [
    record({ duration_ms: 999, level: 'INFO' }),
    record({ duration_ms: 1000, level: 'error' }),
    record({ duration_ms: 1001, level: 'ERROR' })
  ];
  const stats = core.computeStats(records);

  assert.equal(stats.count, 3);
  assert.equal(stats.slowCount, 2);
  assert.equal(stats.errorCount, 2);
  assert.equal(stats.avgDuration, 1000);
});

test('空结果统计返回 0 和空平均值', () => {
  const stats = core.computeStats([]);
  assert.deepEqual(stats, { count: 0, errorCount: 0, slowCount: 0, avgDuration: null });
  assert.equal(core.formatAverage(stats.avgDuration), '—');
});

test('组合筛选：级别 AND 服务 AND 关键词', () => {
  const records = [
    record({ level: 'ERROR', service: 'orders', message: 'Payment TIMEOUT' }),
    record({ level: 'INFO', service: 'gateway', message: 'GET /health' }),
    record({ level: 'warn', service: 'orders', message: '支付失败\n请检查连接' }),
    record({ level: 'ERROR', service: 'users', message: '读取资料' })
  ];

  assert.equal(core.filterRecords(records, {}).length, 4);
  assert.equal(core.filterRecords(records, undefined).length, 4);
  assert.deepEqual(
    core.filterRecords(records, { level: 'error', service: '', keyword: '' }).map((item) => item.service),
    ['orders', 'users']
  );
  assert.deepEqual(
    core.filterRecords(records, { level: '', service: 'orders', keyword: '' }).map((item) => item.message),
    ['Payment TIMEOUT', '支付失败\n请检查连接']
  );
  assert.equal(core.filterRecords(records, { keyword: 'timeout' }).length, 1);
  assert.equal(core.filterRecords(records, { keyword: 'ORDER' }).length, 2);
  assert.equal(core.filterRecords(records, { keyword: '  支付 ' }).length, 1);
  assert.equal(core.filterRecords(records, { keyword: '请检查' }).length, 1);
  assert.equal(core.filterRecords(records, { level: 'ERROR', service: 'orders', keyword: 'timeout' }).length, 1);
  assert.equal(core.filterRecords(records, { level: 'ERROR', service: 'orders', keyword: 'health' }).length, 0);
  assert.equal(core.filterRecords(records, { keyword: '   ' }).length, 4);
});

test('筛选选项：级别按严重程度，服务去重排序', () => {
  const records = [
    record({ level: 'info', service: 'gateway' }),
    record({ level: 'ERROR', service: 'orders' }),
    record({ level: 'WARN', service: 'gateway' }),
    record({ level: 'CUSTOM', service: 'users' }),
    record({ level: 'DEBUG', service: 'orders' })
  ];

  assert.deepEqual(core.availableLevels(records), ['ERROR', 'WARN', 'INFO', 'DEBUG', 'CUSTOM']);
  assert.deepEqual(core.availableServices(records), ['gateway', 'orders', 'users']);
});

test('CSV：BOM、固定表头顺序与 CRLF 行尾', () => {
  const csv = core.toCsv([record()]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.slice(1), [
    'timestamp,level,service,status,duration_ms,message',
    '2026-11-17T09:00:00+08:00,INFO,gateway,200,100,ok',
    ''
  ].join('\r\n'));
});

test('CSV：逗号、双引号、中文和消息内换行按规则转义', () => {
  const csv = core.toCsv([record({ message: '支付失败, "timeout"\n请检查连接' })]);

  assert.equal(csv.slice(1), [
    'timestamp,level,service,status,duration_ms,message',
    '2026-11-17T09:00:00+08:00,INFO,gateway,200,100,"支付失败, ""timeout""\n请检查连接"',
    ''
  ].join('\r\n'));
});

test('CSV：只导出筛选后的记录，并保持原顺序', () => {
  const records = [
    record({ level: 'INFO', service: 'gateway', message: 'GET /health' }),
    record({ level: 'ERROR', service: 'orders', message: '支付失败' }),
    record({ level: 'ERROR', service: 'users', message: '读取资料' })
  ];
  const csv = core.toCsv(core.filterRecords(records, { level: 'ERROR' })).slice(1);
  const lines = csv.split('\r\n');

  assert.equal(lines.length, 4);
  assert.equal(lines[1].includes('orders'), true);
  assert.equal(lines[2].includes('users'), true);
  assert.equal(csv.includes('gateway'), false);
});

test('CSV：空记录只输出 BOM 和表头', () => {
  assert.equal(
    core.toCsv([]),
    '\uFEFFtimestamp,level,service,status,duration_ms,message\r\n'
  );
});

test('格式化：耗时为一位小数，时间只替换 T', () => {
  assert.equal(core.formatDuration(1500), '1500 ms');
  assert.equal(core.formatDuration(750.04), '750 ms');
  assert.equal(core.formatDuration(750.06), '750.1 ms');
  assert.equal(core.formatDuration(NaN), '—');
  assert.equal(core.formatAverage(1486.666), '1486.7 ms');
  assert.equal(
    core.formatTimestamp('2026-11-17T09:00:00+08:00'),
    '2026-11-17 09:00:00+08:00'
  );
});
