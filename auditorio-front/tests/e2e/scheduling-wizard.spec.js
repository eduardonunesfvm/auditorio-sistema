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
    submitCount: 0,
    submitPayloads: []
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
      const date = url.searchParams.get("data");
      const delay = options.delayByDate && options.delayByDate[date];
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (options.errorDates && options.errorDates.includes(date)) {
        return route.fulfill({ status: 503, json: { detail: "Serviço indisponível" } });
      }
      const occupied = options.occupiedByDate && options.occupiedByDate[date]
        ? options.occupiedByDate[date]
        : options.occupied || [];
      const availability = {
        ...EMPTY_AVAILABILITY,
        data: date,
        jornada: options.jornada || EMPTY_AVAILABILITY.jornada,
        ocupados: occupied.map((item, index) => ({
          id: item.id || `reserved-${date}-${index}`,
          nome_evento: item.nome_evento || `Evento reservado ${index + 1}`,
          ...item
        }))
      };
      return route.fulfill({ json: options.invalidAvailability ? { data: date } : availability }).catch(() => {});
    }
    if (method === "POST" && url.pathname === "/agendamentos/criar_agendamento") {
      state.submitCount += 1;
      state.submitPayloads.push(request.postDataJSON());
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
  await selectDate(page, "2027-05-10");
  await expect(page.locator(".timeline-segment.lunch")).toBeVisible();
  await expect(page.locator(".timeline-labels")).toContainText("20:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Horário de Início/).selectOption("09:00");
  await page.getByLabel(/Horário de Fim/).selectOption("10:00");
  await page.getByRole("button", { name: "Continuar" }).click();
}


test("conclui as três etapas e não oferece término após a pausa para almoço", async ({ page }) => {
  const state = await mockApi(page);
  await login(page);

  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  await expect(page.locator(".timeline-segment.lunch")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel(/Horário de Início/).selectOption("10:00");
  await expect(page.locator('#hora-fim option[value="11:00"]')).toHaveCount(1);
  await expect(page.locator('#hora-fim option[value="13:00"]')).toHaveCount(0);

  await page.getByLabel(/Horário de Início/).selectOption("09:00");
  await page.getByLabel(/Horário de Fim/).selectOption("10:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Nome do Evento/).fill("Reunião de planejamento");
  await page.getByLabel(/Participantes/).fill("20");
  await page.getByLabel(/Observações/).fill("Levar o projetor.");
  await page.getByRole("button", { name: "Confirmar Agendamento" }).click();

  await expect(page.getByText("Agendamento criado com sucesso.")).toBeVisible();
  expect(state.submitPayloads[0].hora_inicio).toBe("09:00");
  expect(state.submitPayloads[0].hora_fim).toBe("10:00");
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


test("edição consulta disponibilidade excluindo o próprio agendamento e preserva horário legado", async ({ page }) => {
  const event = {
    id: EVENT_ID,
    usuario_id: USER_ID,
    criador: null,
    nome_evento: "Evento existente",
    data_evento: "2027-05-10",
    hora_inicio: "14:10:00",
    hora_fim: "15:05:00",
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
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel(/Horário de Início/)).toHaveValue("14:10");
  await expect(page.getByLabel(/Horário de Fim/)).toHaveValue("15:05");
  await expect(page.locator('#hora-inicio option[value="14:10"]')).toHaveCount(1);
});


test("funções puras geram e normalizam opções de horário", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(() => ({
    parsed: timeToMinutes("08:30"),
    formatted: minutesToTimeLabel(510),
    generated: generateTimeOptions(480, 570, 30).map(minutesToTimeLabel),
    normalized: normalizeIntervals([
      { inicio: "09:00", fim: "10:00" },
      { inicio: "08:00", fim: "09:00" },
      { inicio: "08:30", fim: "09:30" },
      { inicio: "09:00", fim: "10:00" }
    ]),
    starts: calculateValidStartOptions(480, 960, [
      { inicio: 600, fim: 660 },
      { inicio: 840, fim: 900 }
    ], 30).map(minutesToTimeLabel),
    ends: calculateValidEndOptions(690, 480, 960, [
      { inicio: 600, fim: 660 },
      { inicio: 840, fim: 900 }
    ], 30).map(minutesToTimeLabel),
    noFinish: calculateValidEndOptions(600, 480, 960, [
      { inicio: 610, fim: 660 }
    ], 30),
    timelineAtTen: timePositionPercent(600, 420, 1200),
    timelineAtSixteen: timePositionPercent(960, 420, 1200),
    leapFebruary: buildCalendarDays(2028, 2).some((day) => day.value === "2028-02-29"),
    commonFebruary: buildCalendarDays(2027, 2).some((day) => day.value === "2027-02-29")
  }));

  expect(result.parsed).toBe(510);
  expect(result.formatted).toBe("08:30");
  expect(result.generated).toEqual(["08:00", "08:30", "09:00", "09:30"]);
  expect(result.normalized).toEqual([{ inicio: 480, fim: 600 }]);
  expect(result.starts).toContain("09:30");
  expect(result.starts).not.toContain("10:00");
  expect(result.ends).toEqual(["12:00", "12:30", "13:00", "13:30", "14:00"]);
  expect(result.noFinish).toEqual([]);
  expect(result.timelineAtTen).toBeCloseTo(23.0769, 3);
  expect(result.timelineAtSixteen).toBeCloseTo(69.2307, 3);
  expect(result.leapFebruary).toBeTruthy();
  expect(result.commonFebruary).toBeFalsy();
});


test("selects acompanham carregamento, início e troca de data", async ({ page }) => {
  await mockApi(page, {
    delayByDate: { "2027-05-10": 500 },
    occupiedByDate: {
      "2027-05-10": [{ inicio: "10:00", fim: "11:00" }],
      "2027-05-11": []
    }
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();

  await expect(page.getByLabel(/Horário de Início/)).toBeDisabled();
  await expect(page.getByLabel(/Horário de Fim/)).toBeDisabled();
  await selectDate(page, "2027-05-10");
  await expect(page.getByText("Consultando horários disponíveis...")).toBeAttached();
  expect(await page.getByLabel(/Horário de Início/).isDisabled()).toBeTruthy();
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  await expect(page.getByLabel(/Horário de Fim/)).toBeDisabled();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Horário de Início/).selectOption("09:00");
  await expect(page.getByLabel(/Horário de Fim/)).toBeEnabled();
  await page.getByLabel(/Horário de Fim/).selectOption("10:00");
  await page.getByLabel(/Horário de Início/).selectOption("09:30");
  await expect(page.getByLabel(/Horário de Fim/)).toHaveValue("");

  await page.getByRole("button", { name: "Anterior" }).click();
  await selectDate(page, "2027-05-11");
  await expect(page.getByLabel(/Horário de Início/)).toHaveValue("");
  await expect(page.getByLabel(/Horário de Fim/)).toHaveValue("");
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
});


test("diferencia ausência de horários e erro de consulta", async ({ page }) => {
  await mockApi(page, {
    occupiedByDate: {
      "2027-05-12": [
        { inicio: "07:00", fim: "11:00" },
        { inicio: "13:00", fim: "20:00" }
      ]
    },
    errorDates: ["2027-05-13"]
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();

  await selectDate(page, "2027-05-12");
  await expect(page.getByText("Não há horários disponíveis para esta data.").first()).toBeVisible();
  await expect(page.getByLabel(/Horário de Início/)).toBeDisabled();
  await selectDate(page, "2027-05-13");
  await expect(page.getByText("Não foi possível consultar os horários. Tente novamente.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByLabel(/Horário de Início/)).toBeDisabled();
});


test("resposta antiga ou cancelada não substitui a data mais recente", async ({ page }) => {
  const state = await mockApi(page, {
    delayByDate: { "2027-05-14": 250 },
    occupiedByDate: {
      "2027-05-14": [
        { inicio: "07:00", fim: "11:00" },
        { inicio: "13:00", fim: "20:00" }
      ],
      "2027-05-15": []
    }
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();

  await selectDate(page, "2027-05-14");
  await expect(page.getByText("Consultando horários disponíveis...")).toBeAttached();
  await selectDate(page, "2027-05-15");
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  await expect(page.locator('#hora-inicio option[value="07:00"]')).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(page.getByText("Não foi possível consultar os horários. Tente novamente.")).toHaveCount(0);
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  expect(state.availabilityRequests.some((url) => url.includes("2027-05-14"))).toBeTruthy();
  expect(state.availabilityRequests.some((url) => url.includes("2027-05-15"))).toBeTruthy();
});


test("não avança nem envia opções neutras", async ({ page }) => {
  const state = await mockApi(page);
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("Informe os horários de início e fim.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Defina o horário" })).toBeVisible();
  expect(state.submitCount).toBe(0);
});


test("selects nativos mantêm labels e navegação por teclado", async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/Horário de Início/)).toBeFocused();
  const focusStyle = await page.getByLabel(/Horário de Início/).evaluate((select) => {
    const style = getComputedStyle(select);
    return { outline: style.outlineStyle, boxShadow: style.boxShadow };
  });
  expect(focusStyle.outline !== "none" || focusStyle.boxShadow !== "none").toBeTruthy();
  await page.getByLabel(/Horário de Início/).selectOption("09:00");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/Horário de Fim/)).toBeFocused();
});


for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 360, height: 800 }
]) {
  test(`indicador de etapas fica centralizado em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await login(page);
    await page.getByRole("button", { name: "Agendar Horário" }).first().click();

    const geometry = await page.evaluate(() => {
      const card = document.querySelector(".form-card").getBoundingClientRect();
      const items = Array.from(document.querySelectorAll(".wizard-progress li"));
      const circles = items.map((item) => item.querySelector("span").getBoundingClientRect());
      const labels = items.map((item) => item.querySelector("strong").getBoundingClientRect());
      const connectors = items.slice(0, -1).map((item) => {
        const itemRect = item.getBoundingClientRect();
        const style = getComputedStyle(item, "::after");
        return {
          start: itemRect.left + parseFloat(style.left),
          end: itemRect.right - parseFloat(style.right)
        };
      });
      const centers = circles.map((circle) => circle.left + circle.width / 2);
      const panel = document.querySelector(".availability-panel").getBoundingClientRect();
      const axis = document.querySelector(".availability-axis").getBoundingClientRect();
      return {
        cardCenter: card.left + card.width / 2,
        centers,
        circleLefts: circles.map((circle) => circle.left),
        circleRights: circles.map((circle) => circle.right),
        circleBottoms: circles.map((circle) => circle.bottom),
        labelLefts: labels.map((label) => label.left),
        labelTops: labels.map((label) => label.top),
        connectors,
        axisCenter: axis.left + axis.width / 2,
        panelCenter: panel.left + panel.width / 2,
        axisWidth: axis.width,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });

    expect(Math.abs((geometry.centers[0] + geometry.centers[2]) / 2 - geometry.cardCenter)).toBeLessThanOrEqual(1);
    expect(Math.abs((geometry.centers[1] - geometry.centers[0]) - (geometry.centers[2] - geometry.centers[1]))).toBeLessThanOrEqual(1);
    geometry.connectors.forEach((connector, index) => {
      expect(Math.abs(connector.start - geometry.circleRights[index])).toBeLessThanOrEqual(1);
      expect(Math.abs(connector.end - geometry.circleLefts[index + 1])).toBeLessThanOrEqual(1);
    });
    if (viewport.width > 600) {
      geometry.labelLefts.forEach((left, index) => expect(left).toBeGreaterThan(geometry.circleRights[index]));
      expect(geometry.axisWidth).toBeCloseTo(720, 0);
    } else {
      geometry.labelTops.forEach((top, index) => expect(top).toBeGreaterThanOrEqual(geometry.circleBottoms[index]));
    }
    expect(Math.abs(geometry.axisCenter - geometry.panelCenter)).toBeLessThanOrEqual(1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
  });
}


test("calendário sincroniza formatos, navega por teclado e restaura o foco", async ({ page }) => {
  const state = await mockApi(page);
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();

  const trigger = page.locator("#date-picker-trigger");
  await trigger.click();
  await expect(page.locator("#date-picker-popover")).toBeVisible();
  const initialDate = await page.evaluate(() => todayIso());
  await expect(page.locator(`[data-calendar-date="${initialDate}"]`)).toBeFocused();

  await page.keyboard.press("ArrowRight");
  const selectedDate = await page.evaluate((value) => addDaysToIso(value, 1), initialDate);
  await page.keyboard.press("Enter");
  await expect(page.locator("#date-picker-popover")).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("#data-evento")).toHaveValue(selectedDate);
  await expect(page.locator("#date-picker-display")).toHaveText(await page.evaluate((value) => formatDate(value), selectedDate));
  await expect.poll(() => state.availabilityRequests.some((url) => url.includes(selectedDate))).toBeTruthy();

  await trigger.click();
  const selectedMonth = await page.locator("#calendar-month-label").textContent();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.locator("#calendar-month-label")).not.toHaveText(selectedMonth);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.locator("#data-evento")).toHaveValue(selectedDate);
  await expect(page.locator(`[data-calendar-date="${initialDate}"]`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});


test("lista reservas ordenadas, deduplicadas e sem nova consulta ao avançar", async ({ page }) => {
  const state = await mockApi(page, {
    occupied: [
      { id: "r4", nome_evento: "Quarto", inicio: "17:00", fim: "18:00" },
      { id: "r2", nome_evento: "Segundo", inicio: "09:00", fim: "10:00" },
      { id: "r1", nome_evento: "Primeiro", inicio: "07:00", fim: "08:00" },
      { id: "r3", nome_evento: "Terceiro", inicio: "14:00", fim: "15:00" },
      { id: "r2", nome_evento: "Segundo duplicado", inicio: "09:00", fim: "10:00" }
    ]
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  await expect(page.locator(".timeline-segment.occupied")).toHaveCount(5);
  const requestsBeforeAdvance = state.availabilityRequests.length;
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Horários já reservados" })).toBeVisible();
  await expect(page.locator(".reserved-times-list li")).toHaveCount(3);
  await expect(page.locator(".reserved-times-list li").first()).toContainText("07:00–08:00");
  await page.getByRole("button", { name: "Ver todas (4)" }).click();
  await expect(page.locator(".reserved-times-list li")).toHaveCount(4);
  await expect(page.getByText("Segundo duplicado")).toHaveCount(0);
  expect(state.availabilityRequests.length).toBe(requestsBeforeAdvance);
});


test("timeline usa a mesma escala proporcional e compartilha o eixo do painel", async ({ page }) => {
  await mockApi(page, {
    jornada: { inicio: "07:00", fim: "20:00" },
    occupied: [{ id: "r1", nome_evento: "Reunião", inicio: "10:00", fim: "11:00" }]
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  const occupied = page.locator(".timeline-segment.occupied");
  await expect(occupied).toBeVisible();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector(".availability-panel").getBoundingClientRect();
    const axis = document.querySelector(".availability-axis").getBoundingClientRect();
    const heading = document.querySelector(".availability-heading").getBoundingClientRect();
    const track = document.querySelector(".timeline-track").getBoundingClientRect();
    const segment = document.querySelector(".timeline-segment.occupied");
    return {
      panelCenter: panel.left + panel.width / 2,
      axisCenter: axis.left + axis.width / 2,
      axisWidth: axis.width,
      panelWidth: panel.width,
      leftMargin: axis.left - panel.left,
      rightMargin: panel.right - axis.right,
      headingLeft: heading.left,
      trackLeft: track.left,
      left: parseFloat(segment.style.left),
      width: parseFloat(segment.style.width),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  expect(Math.abs(geometry.panelCenter - geometry.axisCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.leftMargin - geometry.rightMargin)).toBeLessThanOrEqual(1);
  expect(geometry.axisWidth).toBeLessThan(geometry.panelWidth);
  expect(geometry.axisWidth).toBeCloseTo(720, 0);
  expect(Math.abs(geometry.headingLeft - geometry.trackLeft)).toBeLessThanOrEqual(1);
  expect(geometry.left).toBeCloseTo(23.0769, 2);
  expect(geometry.width).toBeCloseTo(7.6923, 2);
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
});


test("avisos distinguem conflito, almoço e são limpos por intervalo válido", async ({ page }) => {
  await mockApi(page, {
    occupied: [{ id: "r1", nome_evento: "Ocupado", inicio: "09:00", fim: "10:00" }]
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.evaluate(() => {
    horaInicioInput.appendChild(new Option("09:00", "09:00"));
    horaFimInput.appendChild(new Option("10:00", "10:00"));
    horaInicioInput.value = "09:00";
    horaFimInput.disabled = false;
    horaFimInput.value = "10:00";
  });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("alert")).toHaveText("O intervalo selecionado coincide com um agendamento existente.");

  await page.evaluate(() => {
    horaInicioInput.appendChild(new Option("10:00", "10:00"));
    horaFimInput.appendChild(new Option("13:00", "13:00"));
    horaInicioInput.value = "10:00";
    horaFimInput.value = "13:00";
  });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("alert")).toHaveText("O evento não pode atravessar o horário de almoço.");

  await page.getByLabel(/Horário de Início/).selectOption("10:00");
  await page.getByLabel(/Horário de Fim/).selectOption("11:00");
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.getByText("Intervalo disponível selecionado.")).toBeVisible();
});


test("tema respeita o sistema, persiste escolha manual e mantém logout", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await mockApi(page);
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const toggle = page.getByRole("button", { name: "Ativar modo claro" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("auditorio_theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});


test("aplicação continua funcional quando localStorage está indisponível", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("storage unavailable"); };
    Storage.prototype.setItem = () => { throw new Error("storage unavailable"); };
    Storage.prototype.removeItem = () => { throw new Error("storage unavailable"); };
  });
  await mockApi(page);
  await login(page);
  await page.locator("#theme-toggle").click();
  await expect(page.getByRole("heading", { name: "Agendamentos do Auditório" })).toBeVisible();
});


async function expectDesktopLayoutToFit(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const metrics = await page.evaluate(() => {
    const actions = document.querySelector(".form-actions").getBoundingClientRect();
    const card = document.querySelector(".form-card");
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      actionTop: actions.top,
      actionBottom: actions.bottom,
      cardOverflowY: getComputedStyle(card).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY
    };
  });
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.actionTop).toBeGreaterThanOrEqual(0);
  expect(metrics.actionBottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(["auto", "scroll", "hidden"]).not.toContain(metrics.cardOverflowY);
  expect(metrics.bodyOverflowY).not.toBe("hidden");
}


async function selectDate(page, value) {
  await page.locator("#data-evento").evaluate((input, selectedDate) => {
    input.value = selectedDate;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}


for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 900 }
]) {
  test(`as três etapas cabem sem scroll em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, {
      occupied: [
        { inicio: "08:00", fim: "09:00" },
        { inicio: "14:00", fim: "15:00" },
        { inicio: "17:00", fim: "18:00" }
      ]
    });
    await login(page);
    await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
    await expect(page.locator(".timeline-segment.occupied")).toHaveCount(3);
    await expectDesktopLayoutToFit(page);

    await page.getByRole("button", { name: "Continuar" }).click();
    await expectDesktopLayoutToFit(page);
    await page.getByLabel(/Horário de Início/).selectOption("09:00");
    await page.getByLabel(/Horário de Fim/).selectOption("10:00");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expectDesktopLayoutToFit(page);
  });
}


test("estados dinâmicos e validações cabem no desktop principal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApi(page, {
    delayByDate: { "2027-05-16": 120 },
    occupiedByDate: {
      "2027-05-16": [],
      "2027-05-17": [
        { inicio: "07:00", fim: "11:00" },
        { inicio: "13:00", fim: "20:00" }
      ]
    },
    errorDates: ["2027-05-18"]
  });
  await login(page);
  await page.getByRole("button", { name: "Agendar Horário" }).first().click();

  await selectDate(page, "2027-05-16");
  await expect(page.getByText("Consultando disponibilidade...")).toBeVisible();
  await expectDesktopLayoutToFit(page);
  await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Informe os horários de início e fim.")).toBeVisible();
  await expectDesktopLayoutToFit(page);

  await page.getByLabel(/Horário de Início/).selectOption("09:00");
  await page.getByLabel(/Horário de Fim/).selectOption("10:00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar Agendamento" }).click();
  await expect(page.getByText(/Informe um nome com pelo menos 3 caracteres/)).toBeVisible();
  await expectDesktopLayoutToFit(page);

  await page.getByRole("button", { name: "Anterior" }).click();
  await page.getByRole("button", { name: "Anterior" }).click();
  await selectDate(page, "2027-05-17");
  await expect(page.getByText("Não há horários disponíveis para esta data.").first()).toBeVisible();
  await expectDesktopLayoutToFit(page);
  await selectDate(page, "2027-05-18");
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expectDesktopLayoutToFit(page);
});


for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 }
]) {
  test(`altura reduzida usa somente o scroll da página em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await login(page);
    await advanceToEventDetails(page);
    const metrics = await page.evaluate(() => ({
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      cardOverflowY: getComputedStyle(document.querySelector(".form-card")).overflowY,
      cardScrollHeight: document.querySelector(".form-card").scrollHeight,
      cardClientHeight: document.querySelector(".form-card").clientHeight
    }));
    expect(metrics.bodyOverflowY).not.toBe("hidden");
    expect(["auto", "scroll", "hidden"]).not.toContain(metrics.cardOverflowY);
    expect(metrics.cardScrollHeight).toBeLessThanOrEqual(metrics.cardClientHeight + 1);
    await page.locator(".form-actions").scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Confirmar Agendamento" })).toBeInViewport();
  });
}


for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 800 }
]) {
  test(`mobile empilha campos sem scroll horizontal em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await login(page);
    await page.getByRole("button", { name: "Agendar Horário" }).first().click();
  await selectDate(page, "2027-05-10");
    await expect(page.getByLabel(/Horário de Início/)).toBeEnabled();
    await page.getByRole("button", { name: "Continuar" }).click();

    const metrics = await page.evaluate(() => {
      const start = document.querySelector("#hora-inicio").getBoundingClientRect();
      const end = document.querySelector("#hora-fim").getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        startBottom: start.bottom,
        endTop: end.top,
        separatorDisplay: getComputedStyle(document.querySelector(".time-range-separator")).display,
        cardOverflowY: getComputedStyle(document.querySelector(".form-card")).overflowY
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.startBottom).toBeLessThan(metrics.endTop);
    expect(metrics.separatorDisplay).toBe("none");
    expect(["auto", "scroll", "hidden"]).not.toContain(metrics.cardOverflowY);
    await page.locator(".form-actions").scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeInViewport();
  });
}


test("viewport equivalente a zoom de 200% mantém todo o fluxo acessível", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 });
  await mockApi(page);
  await login(page);
  await advanceToEventDetails(page);
  const overflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowY,
    card: getComputedStyle(document.querySelector(".form-card")).overflowY
  }));
  expect(overflow.body).not.toBe("hidden");
  expect(["auto", "scroll", "hidden"]).not.toContain(overflow.card);
  await page.getByLabel(/Observações/).scrollIntoViewIfNeeded();
  await expect(page.getByLabel(/Observações/)).toBeInViewport();
  await page.locator(".form-actions").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Confirmar Agendamento" })).toBeInViewport();
});
