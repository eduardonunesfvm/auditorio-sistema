const { test, expect } = require("@playwright/test");


const USER_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN = "header." + Buffer.from(JSON.stringify({ sub: USER_ID })).toString("base64url") + ".signature";

const EMPTY_AVAILABILITY = {
  data: "2027-05-10",
  timezone: "America/Campo_Grande",
  jornada: { inicio: "07:00", fim: "20:00" },
  bloqueios: [{ inicio: "11:00", fim: "13:00", tipo: "almoco" }],
  ocupados: []
};


async function mockApi(page, options = {}) {
  const state = {
    availabilityRequests: [],
    submitCount: 0
  };
  const events = options.events || [];

  await page.route("http://127.0.0.1:8000/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "POST" && url.pathname === "/auth/login") {
      return route.fulfill({ json: { access_token: TOKEN, token_type: "bearer", role: "superintendente" } });
    }
    if (method === "GET" && url.pathname === "/agendamentos/proximo") {
      return route.fulfill({ json: events[0] || null });
    }
    if (method === "GET" && url.pathname === "/agendamentos") {
      return route.fulfill({ json: events });
    }
    if (method === "GET" && url.pathname === "/agendamentos/disponibilidade") {
      state.availabilityRequests.push(url.toString());
      const availability = {
        ...EMPTY_AVAILABILITY,
        data: url.searchParams.get("data"),
        ocupados: options.occupied || []
      };
      return route.fulfill({ json: availability });
    }
    if (method === "POST" && url.pathname === "/agendamentos/criar_agendamento") {
      state.submitCount += 1;
      if (options.conflictOnSubmit) {
        return route.fulfill({
          status: 409,
          json: {
            detail: {
              code: "schedule_conflict",
              message: "O horário selecionado não está mais disponível."
            }
          }
        });
      }
      return route.fulfill({
        status: 201,
        json: {
          id: EVENT_ID,
          usuario_id: USER_ID,
          criador: null,
          ...request.postDataJSON()
        }
      });
    }
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  return state;
}


async function login(page) {
  await page.goto("/");
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Senha").fill("123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Agendamentos do Auditório" })).toBeVisible();
}


async function advanceToEventDetails(page) {
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await page.getByLabel(/^Data/).fill("2027-05-10");
  await expect(page.locator(".timeline-segment.lunch")).toBeVisible();
  await expect(page.locator(".timeline-labels")).toContainText("20:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Horário de Início/).fill("09:00");
  await page.getByLabel(/Horário de Fim/).fill("10:00");
  await page.getByRole("button", { name: "Continuar" }).click();
}


test("conclui as três etapas e bloqueia a pausa para almoço", async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await page.getByLabel(/^Data/).fill("2027-05-10");
  await expect(page.locator(".timeline-segment.lunch")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel(/Horário de Início/).fill("10:00");
  await page.getByLabel(/Horário de Fim/).fill("13:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(/Escolha um horário entre 07:00 e 11:00/)).toBeVisible();

  await page.getByLabel(/Horário de Início/).fill("09:00");
  await page.getByLabel(/Horário de Fim/).fill("10:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Nome do Evento/).fill("Reunião de planejamento");
  await page.getByLabel(/Participantes/).fill("20");
  await page.getByLabel(/Observações/).fill("Levar o projetor.");
  await page.getByRole("button", { name: "Confirmar Agendamento" }).click();

  await expect(page.getByText("Agendamento criado com sucesso.")).toBeVisible();
});


test("recupera conflito 409 sem perder os dados do evento", async ({ page }) => {
  const state = await mockApi(page, { conflictOnSubmit: true });
  await login(page);
  await advanceToEventDetails(page);

  await page.getByLabel(/Nome do Evento/).fill("Evento concorrente");
  await page.getByLabel(/Participantes/).fill("35");
  await page.getByLabel(/Observações/).fill("Manter estes dados.");
  await page.getByRole("button", { name: "Confirmar Agendamento" }).click();

  await expect(page.getByRole("heading", { name: "Defina o horário" })).toBeVisible();
  await expect(page.getByText("O horário selecionado não está mais disponível.")).toBeVisible();
  await expect(page.getByLabel(/Horário de Início/)).toHaveValue("");
  await expect(page.getByLabel(/Horário de Fim/)).toHaveValue("");
  await expect(page.getByLabel(/Nome do Evento/)).toHaveValue("Evento concorrente");
  await expect(page.getByLabel(/Participantes/)).toHaveValue("35");
  await expect(page.getByLabel(/Observações/)).toHaveValue("Manter estes dados.");
  expect(state.submitCount).toBe(1);
  expect(state.availabilityRequests.length).toBeGreaterThanOrEqual(2);
});


test("edição consulta disponibilidade excluindo o próprio agendamento", async ({ page }) => {
  const event = {
    id: EVENT_ID,
    usuario_id: USER_ID,
    criador: null,
    nome_evento: "Evento existente",
    data_evento: "2027-05-10",
    hora_inicio: "14:00:00",
    hora_fim: "15:00:00",
    quantidade_participantes: 12,
    observacoes: "Observação existente"
  };
  const state = await mockApi(page, { events: [event] });
  await login(page);

  await page.getByRole("button", { name: /Editar Evento existente/ }).first().click();
  await expect(page.getByRole("heading", { name: "Escolha a data" })).toBeVisible();
  await expect(page.locator(".timeline-segment.lunch")).toBeVisible();
  await expect.poll(() => state.availabilityRequests.length).toBeGreaterThan(0);
  expect(state.availabilityRequests[0]).toContain("agendamento_id=" + EVENT_ID);
});
