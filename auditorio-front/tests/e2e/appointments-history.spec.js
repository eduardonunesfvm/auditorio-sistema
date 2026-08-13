const { test, expect } = require("@playwright/test");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN = "header." + Buffer.from(JSON.stringify({ sub: USER_ID })).toString("base64url") + ".signature";

function event(id, name, date, start, end) {
  return {
    id,
    usuario_id: USER_ID,
    criador: null,
    nome_evento: name,
    data_evento: date,
    hora_inicio: start,
    hora_fim: end,
    quantidade_participantes: 12,
    observacoes: null
  };
}

async function mockApi(page, initialEvents, options = {}) {
  const state = {
    events: initialEvents.slice(),
    listRequests: 0,
    failList: Boolean(options.failList),
    failDelete: Boolean(options.failDelete)
  };
  await page.route("http://127.0.0.1:8000/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/auth/login") {
      return route.fulfill({ json: { access_token: TOKEN, token_type: "bearer", role: options.role || "superintendente" } });
    }
    if (request.method() === "GET" && path === "/agendamentos") {
      state.listRequests += 1;
      if (state.failList) return route.fulfill({ status: 503, json: { detail: "Serviço indisponível" } });
      return route.fulfill({ json: state.events });
    }
    if (request.method() === "DELETE" && path.startsWith("/agendamentos/")) {
      if (state.failDelete) return route.fulfill({ status: 503, json: { detail: "Falha ao excluir" } });
      const id = decodeURIComponent(path.split("/").pop());
      state.events = state.events.filter((item) => item.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  return state;
}

async function login(page, time, events, options) {
  if (time) {
    const fixedTime = new Date(time);
    await page.clock.install({ time: fixedTime });
    await page.clock.pauseAt(fixedTime);
  }
  const state = await mockApi(page, events, options);
  await page.goto("/");
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Senha").fill("123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Status do Auditório", exact: true })).toBeVisible();
  return state;
}

function sampleEvents() {
  return [
    event("history", "Evento finalizado", "2026-08-14", "08:00:00", "09:00:00"),
    event("current", "Evento em andamento", "2026-08-14", "09:30:00", "10:30:00"),
    event("today", "Evento de hoje", "2026-08-14", "14:00:00", "15:00:00"),
    event("scheduled", "Evento de amanhã", "2026-08-15", "09:00:00", "10:00:00")
  ];
}

test("alterna entre próximos e histórico sem reload, com foco e buscas independentes", async ({ page }) => {
  const state = await login(page, "2026-08-14T14:00:00.000Z", sampleEvents());
  const list = page.locator(".schedule-section");

  await expect(list.getByRole("heading", { name: "Próximos agendamentos" })).toBeVisible();
  await expect(list.getByText("Evento em andamento", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("Evento finalizado", { exact: true })).toHaveCount(0);
  await expect(list.getByText("EM ANDAMENTO", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("HOJE", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("AGENDADO", { exact: true }).first()).toBeVisible();

  const search = page.getByLabel("Buscar próximos agendamentos");
  await search.fill("amanhã");
  await expect(list.getByText("Evento de amanhã", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("Evento de hoje", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Ver todo o histórico" }).click();
  const historyTitle = list.getByRole("heading", { name: "Histórico de eventos" });
  await expect(historyTitle).toBeFocused();
  await expect(page.getByLabel("Buscar no histórico")).toHaveValue("");
  await expect(list.getByText("Evento finalizado", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("Evento em andamento", { exact: true })).toHaveCount(0);
  await expect(list.getByText("FINALIZADO", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Status do Auditório" })).toBeVisible();

  await page.getByLabel("Buscar no histórico").fill("14/08");
  const back = page.getByRole("button", { name: "← Voltar aos próximos" });
  await back.click();
  await expect(page.getByRole("button", { name: "Ver todo o histórico" })).toBeFocused();
  await expect(page.getByLabel("Buscar próximos agendamentos")).toHaveValue("amanhã");
  expect(state.listRequests).toBe(1);
});

test("move evento para o histórico no fim exato sem nova requisição", async ({ page }) => {
  const ending = event("ending", "Evento no limite", "2026-08-14", "09:00:00", "10:00:00");
  const state = await login(page, "2026-08-14T13:59:59.000Z", [ending]);
  const list = page.locator(".schedule-section");
  await expect(list.getByText("Evento no limite", { exact: true }).first()).toBeVisible();

  await page.clock.fastForward(1000);
  await expect(list.getByText("Nenhum próximo agendamento", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver todo o histórico" }).click();
  await expect(list.getByText("Evento no limite", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("FINALIZADO", { exact: true }).first()).toBeVisible();
  expect(state.listRequests).toBe(1);
});

test("diferencia vazios, erro com nova tentativa e permissões de visualizador", async ({ page }) => {
  const completed = event("history", "Registro histórico", "2025-01-10", "09:00:00", "10:00:00");
  const state = await login(page, null, [completed], { role: "visualizador", failList: true });
  const list = page.locator(".schedule-section");
  await expect(list.getByText("Não foi possível carregar os agendamentos", { exact: true })).toBeVisible();

  state.failList = false;
  await list.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(list.getByText("Nenhum próximo agendamento", { exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "Agendar Horário" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver todo o histórico" }).click();
  await expect(list.getByText("Registro histórico", { exact: true }).first()).toBeVisible();
  await expect(list.getByRole("button", { name: /Editar|Excluir/ })).toHaveCount(0);
});

test("falha ao excluir mantém o registro histórico e permite nova tentativa", async ({ page }) => {
  const completed = event("history", "Registro para excluir", "2025-01-10", "09:00:00", "10:00:00");
  const state = await login(page, null, [completed], { failDelete: true });
  const list = page.locator(".schedule-section");
  await page.getByRole("button", { name: "Ver todo o histórico" }).click();

  await list.getByRole("button", { name: "Excluir Registro para excluir" }).click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByText("Falha ao excluir", { exact: true })).toBeVisible();
  await expect(list.getByText("Registro para excluir", { exact: true }).first()).toBeVisible();

  state.failDelete = false;
  await list.getByRole("button", { name: "Excluir Registro para excluir" }).click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByText("Agendamento excluído com sucesso.", { exact: true })).toBeVisible();
  await expect(list.getByText("Nenhum evento finalizado", { exact: true })).toBeVisible();
});

for (const width of [901, 900, 601]) {
  test(`largura ${width}px usa tabela sem overflow horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "2026-08-14T14:00:00.000Z", sampleEvents());
    await expect(page.locator("#schedule-table-view")).toBeVisible();
    await expect(page.locator("#schedule-cards-view")).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

for (const width of [600, 390]) {
  test(`largura ${width}px usa cards sem overflow horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "2026-08-14T14:00:00.000Z", sampleEvents());
    await expect(page.locator("#schedule-table-view")).toBeHidden();
    await expect(page.locator("#schedule-cards-view .schedule-item-card")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
