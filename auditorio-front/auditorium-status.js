(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AuditoriumStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TIME_ZONE = "America/Campo_Grande";
  var SAFETY_INTERVAL_MS = 30000;
  var MAX_TIMEOUT_MS = 2147483647;
  var zonedFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  var displayDateFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  var displayTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  function formatterParts(timestamp) {
    var values = {};
    zonedFormatter.formatToParts(new Date(timestamp)).forEach(function (part) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    });
    return values;
  }

  function auditoriumWallTimeToTimestamp(dateValue, timeValue) {
    var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
    var timeMatch = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(timeValue || ""));
    if (!dateMatch || !timeMatch) return NaN;

    var year = Number(dateMatch[1]);
    var month = Number(dateMatch[2]);
    var day = Number(dateMatch[3]);
    var hour = Number(timeMatch[1]);
    var minute = Number(timeMatch[2]);
    var second = Number(timeMatch[3] || 0);
    var millisecond = Number((timeMatch[4] || "0").padEnd(3, "0"));
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return NaN;

    var offset = timeMatch[5];
    if (offset) {
      var normalizedOffset = offset === "Z" || offset.indexOf(":") !== -1
        ? offset
        : offset.slice(0, 3) + ":" + offset.slice(3);
      return Date.parse(dateMatch[0] + "T" + timeMatch[1] + ":" + timeMatch[2] + ":" +
        String(second).padStart(2, "0") + "." + String(millisecond).padStart(3, "0") + normalizedOffset);
    }

    var wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    var candidate = wallTimeAsUtc;
    for (var attempt = 0; attempt < 3; attempt += 1) {
      var parts = formatterParts(candidate);
      var representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
      candidate = candidate + (wallTimeAsUtc - representedAsUtc);
    }
    var finalParts = formatterParts(candidate);
    if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day ||
        finalParts.hour !== hour || finalParts.minute !== minute || finalParts.second !== second) return NaN;
    return candidate;
  }

  function buildAppointmentInterval(appointment) {
    var item = appointment || {};
    var start = auditoriumWallTimeToTimestamp(item.data_evento, item.hora_inicio);
    var end = auditoriumWallTimeToTimestamp(item.data_evento, item.hora_fim);
    return {
      appointment: item,
      start: start,
      end: end,
      valid: Number.isFinite(start) && Number.isFinite(end) && end > start
    };
  }

  function classifyAppointments(appointments, nowValue) {
    var now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
    if (!Number.isFinite(now)) now = Date.now();
    var intervals = (Array.isArray(appointments) ? appointments : [])
      .map(buildAppointmentInterval)
      .filter(function (interval) { return interval.valid; })
      .sort(function (left, right) { return left.start - right.start || left.end - right.end; });
    var currentCandidates = intervals.filter(function (interval) {
      return interval.start <= now && now < interval.end;
    });
    var current = currentCandidates.length ? currentCandidates[currentCandidates.length - 1] : null;
    var future = intervals.filter(function (interval) { return interval.start > now; });
    var next = future.length ? future[0] : null;
    var completed = intervals.filter(function (interval) { return interval.end <= now; });

    return {
      state: current ? "EM_ANDAMENTO" : (next ? "PROXIMO_EVENTO" : "DISPONIVEL"),
      now: now,
      current: current,
      next: next,
      lastCompleted: completed.length ? completed.sort(function (left, right) { return right.end - left.end; })[0] : null,
      overlaps: currentCandidates.length > 1 ? currentCandidates : [],
      invalidCount: (Array.isArray(appointments) ? appointments.length : 0) - intervals.length
    };
  }

  function calculateEventProgress(interval, nowValue) {
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) return 0;
    var now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
    if (!Number.isFinite(now)) return 0;
    return Math.min(100, Math.max(0, ((now - interval.start) / (interval.end - interval.start)) * 100));
  }

  function formatRemainingTime(targetValue, nowValue) {
    var target = targetValue instanceof Date ? targetValue.getTime() : Number(targetValue);
    var now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
    if (!Number.isFinite(target) || !Number.isFinite(now)) return "—";
    var totalMinutes = Math.max(0, Math.ceil((target - now) / 60000));
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    if (days) return days + (days === 1 ? " dia" : " dias") + (hours ? " e " + hours + " h" : "");
    if (hours) return hours + " h" + (minutes ? " " + minutes + " min" : "");
    return totalMinutes + " min";
  }

  function formatAuditoriumDate(timestamp) {
    return Number.isFinite(timestamp) ? displayDateFormatter.format(new Date(timestamp)) : "—";
  }

  function formatAuditoriumTime(timestamp) {
    return Number.isFinite(timestamp) ? displayTimeFormatter.format(new Date(timestamp)) : "—";
  }

  function getNextBoundary(status) {
    if (!status) return null;
    if (status.current) return status.current.end;
    if (status.next) return status.next.start;
    return null;
  }

  function createStatusTimerController(options) {
    var settings = options || {};
    var getNow = settings.getNow || Date.now;
    var setTimeoutFn = settings.setTimeoutFn || setTimeout;
    var clearTimeoutFn = settings.clearTimeoutFn || clearTimeout;
    var setIntervalFn = settings.setIntervalFn || setInterval;
    var clearIntervalFn = settings.clearIntervalFn || clearInterval;
    var onTick = settings.onTick || function () {};
    var transitionTimer = null;
    var safetyTimer = null;

    function scheduleBoundary(boundary) {
      if (transitionTimer !== null) clearTimeoutFn(transitionTimer);
      transitionTimer = null;
      if (!Number.isFinite(boundary)) return;
      var delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, boundary - getNow()));
      transitionTimer = setTimeoutFn(function () {
        transitionTimer = null;
        onTick("boundary");
      }, delay);
    }

    function start(boundary) {
      if (safetyTimer === null) {
        safetyTimer = setIntervalFn(function () { onTick("safety"); }, SAFETY_INTERVAL_MS);
      }
      scheduleBoundary(boundary);
    }

    function stop() {
      if (transitionTimer !== null) clearTimeoutFn(transitionTimer);
      if (safetyTimer !== null) clearIntervalFn(safetyTimer);
      transitionTimer = null;
      safetyTimer = null;
    }

    return { start: start, scheduleBoundary: scheduleBoundary, stop: stop };
  }

  return {
    TIME_ZONE: TIME_ZONE,
    SAFETY_INTERVAL_MS: SAFETY_INTERVAL_MS,
    auditoriumWallTimeToTimestamp: auditoriumWallTimeToTimestamp,
    buildAppointmentInterval: buildAppointmentInterval,
    classifyAppointments: classifyAppointments,
    calculateEventProgress: calculateEventProgress,
    formatRemainingTime: formatRemainingTime,
    formatAuditoriumDate: formatAuditoriumDate,
    formatAuditoriumTime: formatAuditoriumTime,
    getNextBoundary: getNextBoundary,
    createStatusTimerController: createStatusTimerController
  };
});
