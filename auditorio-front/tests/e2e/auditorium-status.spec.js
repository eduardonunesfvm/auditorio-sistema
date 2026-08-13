const { test, expect } = require("@playwright/test");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN = "header." + Buffer.from(JSON.stringify({ sub: USER_ID })).toString("base64url") + ".signature";

function event(id, name, start, end) {
  return {
    id,
    usuario_id: USER_ID,
    criador: null,
    nome_evento: name,
    data_evento: "2026-08-14",
    hora_inicio: start,
    hora_fim: end,
    quantidade_participantes: 10,
    observacoes: null
  };
}

async function mockStatusApi(page, events) {
  const state = { listRequests: 0, nextRequests: 0, failList: false };
  await page.route("http://127.0.0.1:8000/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/auth/login") {
      return route.fulfill({ json: { access_token: TOKEN, token_type: "bearer", role: "superintendente" } });
    }
    if (request.method() === "GET" && path === "/agendamentos") {
      state.listRequests += 1;
      if (state.failList) return route.fulfill({ status: 503, json: { detail: "Serviço indisponível" } });
      return route.fulfill({ json: events });
    }
    if (request.method() === "GET" && path === "/agendamentos/proximo") {
      state.nextRequests += 1;
      return route.fulfill({ json: null });
    }
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  return state;
}

async function loginAt(page, time, events) {
  const fixedTime = new Date(time);
  await page.clock.install({ time: fixedTime });
  await page.clock.pauseAt(fixedTime);
  const state = await mockStatusApi(page, events);
  await page.goto("/");
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Senha").fill("123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Status do Auditório" })).toBeVisible();
  return state;
}

test("mostra evento ativo, progresso acessível e transiciona no fim sem nova requisição", async ({ page }) => {
  const events = [
    event("current", "Reunião em andamento", "09:00:00", "10:00:00"),
    event("next", "Planejamento", "10:30:00", "11:30:00")
  ];
  const state = await loginAt(page, "2026-08-14T13:59:59.000Z", events);

  await expect(page.getByText("EM ANDAMENTO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Reunião em andamento", { exact: true }).first()).toBeVisible();
  const progress = page.getByRole("progressbar", { name: "Progresso do evento" });
  await expect(progress).toHaveAttribute("aria-valuenow", "99");
  await expect(page.getByText(/Próximo:.*Planejamento/)).toBeVisible();

  await page.clock.fastForward(1000);
  await expect(page.getByText("PRÓXIMO EVENTO", { exact: true })).toBeVisible();
  await expect(page.getByText("Planejamento", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("EVENTO FINALIZADO", { exact: true })).toBeVisible();
  await expect(progress).toHaveCount(0);
  expect(state.listRequests).toBe(1);
  expect(state.nextRequests).toBe(0);

  await page.clock.fastForward(3000);
  await expect(page.getByText("EVENTO FINALIZADO", { exact: true })).toBeHidden();
});

test("evento contíguo aparece imediatamente e retorno à aba reavalia o estado", async ({ page }) => {
  const events = [
    event("first", "Primeiro evento", "09:00:00", "10:00:00"),
    event("second", "Segundo evento", "10:00:00", "11:00:00")
  ];
  await loginAt(page, "2026-08-14T13:59:59.000Z", events);
  await page.clock.fastForward(1000);
  await expect(page.getByText("Segundo evento", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("EM ANDAMENTO", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Segundo evento", { exact: true }).first()).toBeVisible();
});

test("mantém o último status válido quando uma atualização falha", async ({ page }) => {
  const events = [event("current", "Evento preservado", "09:00:00", "11:00:00")];
  const state = await loginAt(page, "2026-08-14T14:00:00.000Z", events);
  await expect(page.getByText("Evento preservado", { exact: true }).first()).toBeVisible();

  state.failList = true;
  await page.evaluate(() => refreshAll());
  await expect(page.getByText("Evento preservado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Exibindo a última informação carregada/)).toBeVisible();
});

for (const width of [901, 900, 601, 600, 390]) {
  test(`card não produz overflow horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await loginAt(page, "2026-08-14T14:00:00.000Z", [
      event("current", "Evento institucional com um título longo para validar a responsividade", "09:00:00", "11:00:00")
    ]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
