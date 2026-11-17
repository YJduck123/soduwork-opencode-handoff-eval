/* 日志拾光 · 界面与交互
 * 只负责 DOM 渲染和事件，解析、统计、筛选全部委托给 js/core.js。
 */
(function () {
  'use strict';

  var core = window.LogCore;
  if (!core) {
    document.body.textContent = '核心脚本加载失败，请确认 js/core.js 与 index.html 在同一目录下。';
    return;
  }

  var state = {
    loaded: false,
    records: [],
    filtered: [],
    errors: [],
    scannedLines: 0
  };

  var els = {};
  var MAX_ISSUES_SHOWN = 200;
  var LEVEL_CLASSES = {
    error: 'level-error',
    warn: 'level-warn',
    warning: 'level-warning',
    info: 'level-info',
    debug: 'level-debug',
    trace: 'level-trace'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError) {
    els.loadStatus.textContent = text;
    els.loadStatus.classList.toggle('is-error', Boolean(isError));
  }

  function setOptions(select, values, allLabel) {
    var fragment = document.createDocumentFragment();
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = allLabel;
    fragment.appendChild(allOption);

    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      fragment.appendChild(option);
    });

    select.replaceChildren(fragment);
    select.value = '';
  }

  function currentFilters() {
    return {
      level: els.levelFilter.value,
      service: els.serviceFilter.value,
      keyword: els.keywordFilter.value
    };
  }

  function levelClass(level) {
    var key = String(level).toLowerCase();
    return LEVEL_CLASSES[key] || 'level-other';
  }

  function renderIssues() {
    var errors = state.errors;
    if (errors.length === 0) {
      els.issuePanel.hidden = true;
      els.issueList.replaceChildren();
      return;
    }

    els.issuePanel.hidden = false;

    var shown = errors.slice(0, MAX_ISSUES_SHOWN);
    var summary = errors.length + ' 行格式不正确，已跳过';
    if (errors.length > MAX_ISSUES_SHOWN) {
      summary += '（以下仅列出前 ' + MAX_ISSUES_SHOWN + ' 行）';
    }
    els.issueSummary.textContent = summary;

    var fragment = document.createDocumentFragment();
    shown.forEach(function (error) {
      var item = document.createElement('li');

      var line = document.createElement('span');
      line.className = 'issue-line';
      line.textContent = error.line > 0 ? '第 ' + error.line + ' 行' : '输入';

      var reason = document.createElement('span');
      reason.className = 'issue-reason';
      reason.textContent = error.reason;

      var preview = document.createElement('code');
      preview.className = 'issue-preview';
      preview.textContent = error.preview || '';

      item.appendChild(line);
      item.appendChild(reason);
      if (error.preview) item.appendChild(preview);
      fragment.appendChild(item);
    });

    els.issueList.replaceChildren(fragment);
  }

  function createCell(text, className) {
    var cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function emptyMessage() {
    if (!state.loaded) {
      return '还没有日志。选择 JSONL 文件、粘贴日志，或载入示例开始排查。';
    }
    if (state.records.length === 0) {
      return '这份内容里没有有效日志，请查看上方被跳过的行。';
    }
    return '没有符合条件的日志。试试清空关键词，或放宽级别与服务筛选。';
  }

  function renderTable(records) {
    var fragment = document.createDocumentFragment();

    if (records.length === 0) {
      var emptyRow = document.createElement('tr');
      emptyRow.className = 'empty-row';
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 6;
      emptyCell.textContent = emptyMessage();
      emptyRow.appendChild(emptyCell);
      fragment.appendChild(emptyRow);
    } else {
      records.forEach(function (record) {
        var row = document.createElement('tr');

        var timeCell = createCell(core.formatTimestamp(record.timestamp), 'time');
        timeCell.title = record.timestamp;

        var levelCell = document.createElement('td');
        var badge = document.createElement('span');
        badge.className = 'level-badge ' + levelClass(record.level);
        badge.textContent = record.level;
        levelCell.appendChild(badge);

        var statusCell = createCell(String(record.status), 'numeric');
        var durationCell = createCell(core.formatDuration(record.duration_ms), 'numeric duration');
        if (record.duration_ms >= core.SLOW_THRESHOLD_MS) {
          durationCell.classList.add('is-slow');
        }

        row.appendChild(timeCell);
        row.appendChild(levelCell);
        row.appendChild(createCell(record.service, 'service'));
        row.appendChild(statusCell);
        row.appendChild(durationCell);
        row.appendChild(createCell(record.message, 'message'));
        fragment.appendChild(row);
      });
    }

    els.tbody.replaceChildren(fragment);
  }

  function render() {
    var filtered = core.filterRecords(state.records, currentFilters());
    var stats = core.computeStats(filtered);
    state.filtered = filtered;

    els.statCount.textContent = String(stats.count);
    els.statError.textContent = String(stats.errorCount);
    els.statSlow.textContent = String(stats.slowCount);
    els.statAvg.textContent = core.formatAverage(stats.avgDuration);

    renderTable(filtered);
    renderIssues();

    if (state.loaded) {
      els.tableSubtitle.textContent = '显示 ' + filtered.length + ' / ' + state.records.length +
        ' 条 · 关键词同时匹配服务名和消息 · 按原始顺序排列';
    } else {
      els.tableSubtitle.textContent = '载入日志后，这里会按筛选结果实时更新。';
    }

    els.exportNote.textContent = '';
    els.exportBtn.disabled = !state.loaded || filtered.length === 0;
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function exportFileName() {
    var now = new Date();
    return '日志拾光-' + now.getFullYear() +
      pad2(now.getMonth() + 1) + pad2(now.getDate()) + '-' +
      pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + '.csv';
  }

  function exportCsv() {
    if (!state.loaded || state.filtered.length === 0) return;

    var canDownload = typeof window.Blob === 'function' && window.URL &&
      typeof window.URL.createObjectURL === 'function';
    if (!canDownload) {
      els.exportNote.textContent = '当前浏览器不支持直接下载，请换用新版浏览器。';
      return;
    }

    var blob = new window.Blob([core.toCsv(state.filtered)], { type: 'text/csv;charset=utf-8' });
    var url = window.URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      if (typeof window.URL.revokeObjectURL === 'function') {
        window.URL.revokeObjectURL(url);
      }
    }, 1000);

    els.exportNote.textContent = '已导出 ' + state.filtered.length + ' 条记录';
  }

  function applyData(result, label) {
    state.loaded = true;
    state.records = result.records;
    state.errors = result.errors;
    state.scannedLines = result.scannedLines;

    if (result.errors.length > 0) {
      els.issueDetails.open = true;
    }

    setOptions(els.levelFilter, core.availableLevels(result.records), '全部级别');
    setOptions(els.serviceFilter, core.availableServices(result.records), '全部服务');
    els.keywordFilter.value = '';

    var hasRecords = result.records.length > 0;
    els.levelFilter.disabled = !hasRecords;
    els.serviceFilter.disabled = !hasRecords;
    els.keywordFilter.disabled = !hasRecords;

    render();

    if (result.scannedLines === 0) {
      setStatus(label + '：没有可读取的内容。', true);
    } else {
      var message = label + '：' + result.scannedLines + ' 行中 ' + result.records.length + ' 条有效';
      if (result.errors.length > 0) {
        message += '，' + result.errors.length + ' 行已跳过。';
      } else {
        message += '，没有格式错误。';
      }
      setStatus(message, !hasRecords);
    }
  }

  function loadText(text, label) {
    applyData(core.parseJSONL(text), label);
  }

  function resetFilters() {
    els.levelFilter.value = '';
    els.serviceFilter.value = '';
    els.keywordFilter.value = '';
    render();
  }

  function handleFile(file) {
    if (!file) return;
    var name = file.name || '未命名文件';

    if (file.size === 0) {
      setStatus('文件「' + name + '」是空的，没有可读取的日志。', true);
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      loadText(String(reader.result), '文件「' + name + '」');
    };
    reader.onerror = function () {
      setStatus('读取文件「' + name + '」失败，请确认文件仍然存在且可访问。', true);
    };
    reader.readAsText(file, 'utf-8');
  }

  function bindEvents() {
    els.fileInput.addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      handleFile(file);
    });

    els.sampleBtn.addEventListener('click', function () {
      if (typeof window.LogSample !== 'string') {
        setStatus('示例数据未加载，请确认 js/sample-data.js 存在。', true);
        return;
      }
      loadText(window.LogSample, '示例数据');
    });

    els.pasteBtn.addEventListener('click', function () {
      var text = els.pasteInput.value;
      if (!text.trim()) {
        setStatus('粘贴内容为空，请先粘贴 JSONL 日志。', true);
        els.pasteInput.focus();
        return;
      }
      loadText(text, '粘贴内容');
    });

    els.levelFilter.addEventListener('change', render);
    els.serviceFilter.addEventListener('change', render);
    els.keywordFilter.addEventListener('input', render);
    els.resetFilters.addEventListener('click', resetFilters);
    els.exportBtn.addEventListener('click', exportCsv);
  }

  function init() {
    els = {
      fileInput: byId('file-input'),
      sampleBtn: byId('sample-btn'),
      pasteInput: byId('paste-input'),
      pasteBtn: byId('paste-btn'),
      loadStatus: byId('load-status'),
      levelFilter: byId('level-filter'),
      serviceFilter: byId('service-filter'),
      keywordFilter: byId('keyword-filter'),
      resetFilters: byId('reset-filters'),
      statCount: byId('stat-count'),
      statError: byId('stat-error'),
      statSlow: byId('stat-slow'),
      statAvg: byId('stat-avg'),
      issuePanel: byId('issue-panel'),
      issueDetails: document.querySelector('#issue-panel details'),
      issueSummary: byId('issue-summary'),
      issueList: byId('issue-list'),
      tableSubtitle: byId('table-subtitle'),
      exportBtn: byId('export-csv-btn'),
      exportNote: byId('export-note'),
      tbody: byId('log-tbody')
    };

    bindEvents();
    render();
  }

  init();
})();
