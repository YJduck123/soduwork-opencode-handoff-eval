/* 日志拾光 · 核心逻辑
 * 纯函数，不依赖 DOM，可在浏览器和 Node 中直接使用。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LogCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STRING_FIELDS = ['timestamp', 'level', 'service', 'message'];
  var NUMBER_FIELDS = ['status', 'duration_ms'];
  var SLOW_THRESHOLD_MS = 1000;

  var LEVEL_ORDER = ['ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'TRACE'];

  function describeType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * 校验一条已解析的 JSON 值，返回 { ok, record } 或 { ok: false, reason }。
   * 只保留约定的六个字段，避免界面意外渲染额外内容。
   */
  function validateRecord(value) {
    if (!isPlainObject(value)) {
      return { ok: false, reason: '内容不是 JSON 对象（实际为 ' + describeType(value) + '）' };
    }

    for (var i = 0; i < STRING_FIELDS.length; i++) {
      var name = STRING_FIELDS[i];
      var field = value[name];
      if (!Object.prototype.hasOwnProperty.call(value, name)) {
        return { ok: false, reason: name + ' 字段缺失' };
      }
      if (typeof field !== 'string') {
        return {
          ok: false,
          reason: name + ' 应为字符串，实际为 ' + describeType(field)
        };
      }
    }

    for (var j = 0; j < NUMBER_FIELDS.length; j++) {
      var numberName = NUMBER_FIELDS[j];
      var numberValue = value[numberName];
      if (!Object.prototype.hasOwnProperty.call(value, numberName)) {
        return { ok: false, reason: numberName + ' 字段缺失' };
      }
      if (typeof numberValue !== 'number') {
        return {
          ok: false,
          reason: numberName + ' 应为数字，实际为 ' + describeType(numberValue)
        };
      }
      if (!Number.isFinite(numberValue)) {
        return { ok: false, reason: numberName + ' 应为有限数字' };
      }
    }

    return {
      ok: true,
      record: {
        timestamp: value.timestamp,
        level: value.level,
        service: value.service,
        status: value.status,
        duration_ms: value.duration_ms,
        message: value.message
      }
    };
  }

  function previewOf(line) {
    var compact = line.replace(/\s+/g, ' ').trim();
    return compact.length > 120 ? compact.slice(0, 120) + '…' : compact;
  }

  /**
   * 解析 JSONL 文本。
   * - 空行静默跳过；
   * - JSON 错误或字段类型错误只跳过该行，并记录真实行号；
   * - 不会因为坏行丢掉整份文件。
   */
  function parseJSONL(text) {
    var records = [];
    var errors = [];
    var scannedLines = 0;

    if (typeof text !== 'string') {
      return {
        records: records,
        errors: [{ line: 0, reason: '输入内容不是文本', preview: '' }],
        scannedLines: 0
      };
    }

    var normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var lines = normalized.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.trim() === '') continue;
      scannedLines++;

      var parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        errors.push({
          line: i + 1,
          reason: '不是有效的 JSON',
          preview: previewOf(line)
        });
        continue;
      }

      var checked = validateRecord(parsed);
      if (!checked.ok) {
        errors.push({
          line: i + 1,
          reason: checked.reason,
          preview: previewOf(line)
        });
        continue;
      }
      records.push(checked.record);
    }

    return { records: records, errors: errors, scannedLines: scannedLines };
  }

  function computeStats(records) {
    var totalDuration = 0;
    var errorCount = 0;
    var slowCount = 0;

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      totalDuration += record.duration_ms;
      if (String(record.level).toUpperCase() === 'ERROR') errorCount++;
      if (record.duration_ms >= SLOW_THRESHOLD_MS) slowCount++;
    }

    return {
      count: records.length,
      errorCount: errorCount,
      slowCount: slowCount,
      avgDuration: records.length > 0 ? totalDuration / records.length : null
    };
  }

  /**
   * 级别、服务、关键词三者同时生效（AND）。
   * 关键词在 service 和 message 中不区分大小写匹配，首尾空白忽略。
   */
  function filterRecords(records, filters) {
    var level = filters && filters.level ? String(filters.level).toUpperCase() : '';
    var service = filters && filters.service ? String(filters.service) : '';
    var keyword = filters && filters.keyword ? String(filters.keyword).trim().toLowerCase() : '';

    return records.filter(function (record) {
      if (level && String(record.level).toUpperCase() !== level) return false;
      if (service && record.service !== service) return false;
      if (keyword) {
        var serviceText = String(record.service).toLowerCase();
        var messageText = String(record.message).toLowerCase();
        if (serviceText.indexOf(keyword) === -1 && messageText.indexOf(keyword) === -1) {
          return false;
        }
      }
      return true;
    });
  }

  function severityRank(level) {
    var index = LEVEL_ORDER.indexOf(String(level).toUpperCase());
    return index === -1 ? LEVEL_ORDER.length : index;
  }

  function availableLevels(records) {
    var seen = Object.create(null);
    records.forEach(function (record) {
      var level = String(record.level).toUpperCase();
      if (level) seen[level] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      var rankDiff = severityRank(a) - severityRank(b);
      return rankDiff !== 0 ? rankDiff : a.localeCompare(b, 'zh-Hans-CN');
    });
  }

  function availableServices(records) {
    var seen = Object.create(null);
    records.forEach(function (record) {
      if (record.service) seen[record.service] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hans-CN');
    });
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function formatDuration(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return round1(value) + ' ms';
  }

  function formatAverage(value) {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return value.toFixed(1) + ' ms';
  }

  function formatTimestamp(value) {
    return String(value).replace('T', ' ');
  }

  var CSV_COLUMNS = ['timestamp', 'level', 'service', 'status', 'duration_ms', 'message'];

  function csvCell(value) {
    var text = value === null || typeof value === 'undefined' ? '' : String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function toCsv(records) {
    var rows = [CSV_COLUMNS.join(',')];
    (records || []).forEach(function (record) {
      rows.push(CSV_COLUMNS.map(function (column) {
        return csvCell(record[column]);
      }).join(','));
    });
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
  }

  return {
    SLOW_THRESHOLD_MS: SLOW_THRESHOLD_MS,
    parseJSONL: parseJSONL,
    validateRecord: validateRecord,
    computeStats: computeStats,
    filterRecords: filterRecords,
    availableLevels: availableLevels,
    availableServices: availableServices,
    formatDuration: formatDuration,
    formatAverage: formatAverage,
    formatTimestamp: formatTimestamp,
    toCsv: toCsv
  };
});
