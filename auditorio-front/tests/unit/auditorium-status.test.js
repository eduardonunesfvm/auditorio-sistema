const test = require("node:test");
const assert = require("node:assert/strict");
const statusEngine = require("../../auditorium-status.js");

function appointment(id, date, start, end) {
  return { id, data_evento: date, hora_inicio: start, hora_fim: end, nome_evento: id };
}

function at(date, time) {
  return statusEngine.auditoriumWallTimeToTimestamp(date, time);
}

test("classifica os limites do intervalo semiaberto", () => {
  const event = appointment("evento", "2026-08-14", "07:30", "10:00");
  assert.equal(statusEngine.classifyAppointments([event], at("2026-08-14", "07:29:59.999")).state, "PROXIMO_EVENTO");
  assert.equal(statusEngine.classifyAppointments([event], at("2026-08-14", "07:30")).state, "EM_ANDAMENTO");
  assert.equal(statusEngine.classifyAppointments([event], at("2026-08-14", "09:59:59.999")).state, "EM_ANDAMENTO");
  assert.equal(statusEngine.classifyAppointments([event], at("2026-08-14", "10:00")).state, "DISPONIVEL");
});

test("ordena eventos e ignora eventos passados ao escolher o próximo", () => {
  const events = [
    appointment("tarde", "2026-08-14", "15:00", "16:00"),
    appointment("passado", "2026-08-13", "09:00", "10:00"),
    appointment("manha", "2026-08-14", "11:00", "12:00")
  ];
  const result = statusEngine.classifyAppointments(events, at("2026-08-14", "10:00"));
  assert.equal(result.next.appointment.id, "manha");
});

test("evento contíguo assume imediatamente o estado em andamento", () => {
  const events = [
    appointment("anterior", "2026-08-14", "09:00", "10:00"),
    appointment("atual", "2026-08-14", "10:00", "11:00")
  ];
  const result = statusEngine.classifyAppointments(events, at("2026-08-14", "10:00"));
  assert.equal(result.state, "EM_ANDAMENTO");
  assert.equal(result.current.appointment.id, "atual");
  assert.equal(result.lastCompleted.appointment.id, "anterior");
});

test("em sobreposição seleciona o início mais recente", () => {
  const result = statusEngine.classifyAppointments([
    appointment("longo", "2026-08-14", "09:00", "11:00"),
    appointment("recente", "2026-08-14", "09:30", "10:30")
  ], at("2026-08-14", "10:00"));
  assert.equal(result.current.appointment.id, "recente");
  assert.equal(result.overlaps.length, 2);
});

test("lista vazia e intervalos inválidos produzem disponível", () => {
  assert.equal(statusEngine.classifyAppointments([], at("2026-08-14", "10:00")).state, "DISPONIVEL");
  const result = statusEngine.classifyAppointments([appointment("invalido", "2026-08-14", "10:00", "09:00")], at("2026-08-14", "10:00"));
  assert.equal(result.state, "DISPONIVEL");
  assert.equal(result.invalidCount, 1);
});

test("datas usam Campo Grande e offsets explícitos são respeitados", () => {
  assert.equal(at("2026-08-14", "10:00"), Date.parse("2026-08-14T10:00:00-04:00"));
  assert.equal(at("2026-08-14", "10:00:00-03:00"), Date.parse("2026-08-14T10:00:00-03:00"));
  assert.equal(statusEngine.formatAuditoriumTime(at("2026-08-14", "10:00:00-03:00")), "09:00");
  assert.equal(statusEngine.formatAuditoriumDate(at("2026-08-14", "10:00:00-03:00")), "14/08/2026");
  assert.notEqual(at("2026-08-14", "23:30"), at("2026-08-15", "23:30"));
});

test("calcula progresso limitado e tolera duração inválida", () => {
  const interval = statusEngine.buildAppointmentInterval(appointment("evento", "2026-08-14", "09:00", "11:00"));
  assert.equal(statusEngine.calculateEventProgress(interval, interval.start), 0);
  assert.equal(statusEngine.calculateEventProgress(interval, at("2026-08-14", "10:00")), 50);
  assert.equal(statusEngine.calculateEventProgress(interval, interval.start - 1), 0);
  assert.equal(statusEngine.calculateEventProgress(interval, interval.end + 1), 100);
  assert.equal(statusEngine.calculateEventProgress({ start: 1, end: 1 }, 1), 0);
});

test("formata tempo restante em minutos, horas e dias", () => {
  assert.equal(statusEngine.formatRemainingTime(35 * 60000, 0), "35 min");
  assert.equal(statusEngine.formatRemainingTime(80 * 60000, 0), "1 h 20 min");
  assert.equal(statusEngine.formatRemainingTime((2 * 1440 + 60) * 60000, 0), "2 dias e 1 h");
  assert.equal(statusEngine.formatRemainingTime(0, 0), "0 min");
});

test("controlador mantém um intervalo, substitui limites e limpa timers", () => {
  let now = 1000;
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const clearedTimeouts = [];
  const ticks = [];
  const controller = statusEngine.createStatusTimerController({
    getNow: () => now,
    setTimeoutFn: (callback, delay) => { const id = nextId++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeoutFn: (id) => { clearedTimeouts.push(id); timeouts.delete(id); },
    setIntervalFn: (callback, delay) => { const id = nextId++; intervals.set(id, { callback, delay }); return id; },
    clearIntervalFn: (id) => intervals.delete(id),
    onTick: (reason) => ticks.push(reason)
  });
  controller.start(5000);
  controller.start(7000);
  assert.equal(intervals.size, 1);
  assert.equal(timeouts.size, 1);
  assert.equal(clearedTimeouts.length, 1);
  assert.equal([...timeouts.values()][0].delay, 6000);
  [...intervals.values()][0].callback();
  assert.deepEqual(ticks, ["safety"]);
  controller.stop();
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
});
