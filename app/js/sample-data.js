/* 此文件由 scripts/embed-sample.js 自动生成，请勿手动修改。 */
/* 内容与根目录 sample.jsonl 完全一致，用于双击打开时无需读取本地文件。 */
(function (root, factory) {
  var value = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = value;
  } else {
    root.LogSample = value;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return "{\"timestamp\":\"2026-11-17T09:00:00+08:00\",\"level\":\"INFO\",\"service\":\"gateway\",\"status\":200,\"duration_ms\":40,\"message\":\"GET /health\"}\n{\"timestamp\":\"2026-11-17T09:01:00+08:00\",\"level\":\"WARN\",\"service\":\"orders\",\"status\":200,\"duration_ms\":1000,\"message\":\"慢请求达到阈值\"}\n{\"timestamp\":\"2026-11-17T09:02:00+08:00\",\"level\":\"ERROR\",\"service\":\"orders\",\"status\":500,\"duration_ms\":1500,\"message\":\"支付失败，provider 返回 \\\"timeout\\\"\"}\n{\"timestamp\":\"2026-11-17T09:03:00+08:00\",\"level\":\"INFO\",\"service\":\"users\",\"status\":200,\"duration_ms\":80,\"message\":\"读取资料\"}\n{\"timestamp\":\"2026-11-17T09:04:00+08:00\",\"level\":\"ERROR\",\"service\":\"gateway\",\"status\":502,\"duration_ms\":2200,\"message\":\"upstream reset\\n请检查连接\"}\n{\"timestamp\":\"2026-11-17T09:05:00+08:00\",\"level\":\"WARN\",\"service\":\"users\",\"status\":429,\"duration_ms\":120,\"message\":\"请求限流\"}\n{\"timestamp\":\"2026-11-17T09:06:00+08:00\",\"level\":\"INFO\",\"service\":\"orders\",\"status\":201,\"duration_ms\":300,\"message\":\"订单创建成功\"}\n{\"timestamp\":\"2026-11-17T09:07:00+08:00\",\"level\":\"ERROR\",\"service\":\"users\",\"status\":503,\"duration_ms\":760,\"message\":\"服务暂时不可用\"}\nnot-json\n{\"timestamp\":\"2026-11-17T09:08:00+08:00\",\"level\":\"INFO\",\"service\":\"users\",\"status\":200,\"duration_ms\":\"unknown\",\"message\":\"耗时字段无效\"}\n";
});
