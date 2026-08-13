const test = require("node:test");
const assert = require("node:assert/strict");
const statusEngine = require("../../auditorium-status.js");

function appointment(id, date, start, end) {
  return { id, data_evento: date, hora_inicio: start, hora_fim: end, nome_evento: id };
}

function at(date, time) {
  return statusEngine.auditoriumWallTimeToTimestamp(date, time);
}

test("separa evento em andamento, futuros e finalizados no limite exato", () => {
  const events = [
    appointment("futuro", "2026-08-15", "09:00", "10:00"),
    appointment("finalizado", "2026-08-14", "09:00", "10:00"),
    appointment("andamento", "2026-08-14", "09:30", "10:30")
  ];
  const result = statusEngine.partitionAppointments(events, at("2026-08-14", "10:00"));
  assert.deepEqual(result.upcoming.map((entry) => entry.appointment.id), ["andamento", "futuro"]);
  assert.deepEqual(result.history.map((entry) => entry.appointment.id), ["finalizado"]);
  assert.equal(result.upcoming[0].status, "EM_ANDAMENTO");
  assert.equal(result.history[0].status, "FINALIZADO");
});

test("ordena próximos crescentes e histórico do término mais recente", () => {
  const events = [
    appointment("antigo", "2026-08-12", "08:00", "09:00"),
    appointment("depois", "2026-08-15", "15:00", "16:00"),
    appointment("recente", "2026-08-13", "14:00", "16:00"),
    appointment("antes", "2026-08-15", "09:00", "10:00")
  ];
  const result = statusEngine.partitionAppointments(events, at("2026-08-14", "10:00"));
  assert.deepEqual(result.upcoming.map((entry) => entry.appointment.id), ["antes", "depois"]);
  assert.deepEqual(result.history.map((entry) => entry.appointment.id), ["recente", "antigo"]);
});

test("desempata por identificador de forma determinística", () => {
  const events = [
    appointment("b", "2026-08-15", "09:00", "10:00"),
    appointment("a", "2026-08-15", "09:00", "10:00")
  ];
  const result = statusEngine.partitionAppointments(events, at("2026-08-14", "10:00"));
  assert.deepEqual(result.upcoming.map((entry) => entry.appointment.id), ["a", "b"]);
});

test("distingue hoje e agendado no fuso de Campo Grande", () => {
  const result = statusEngine.partitionAppointments([
    appointment("hoje", "2026-08-14", "18:00", "19:00"),
    appointment("amanha", "2026-08-15", "07:00", "08:00")
  ], Date.parse("2026-08-14T14:00:00Z"));
  assert.equal(result.upcoming[0].status, "HOJE");
  assert.equal(result.upcoming[1].status, "AGENDADO");
});

test("lista vazia e intervalo inválido não quebram o particionamento", () => {
  assert.deepEqual(statusEngine.partitionAppointments([], at("2026-08-14", "10:00")).upcoming, []);
  const result = statusEngine.partitionAppointments([
    appointment("invalido", "2026-08-14", "10:00", "09:00")
  ], at("2026-08-14", "10:00"));
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.upcoming, []);
  assert.deepEqual(result.history, []);
});
