const API_URL = (location.protocol === "file:" || location.port === "5500" || location.port === "4173") ? "http://127.0.0.1:8000" : "";

var loginScreen = document.getElementById("login-screen");
var dashboardScreen = document.getElementById("dashboard-screen");
var loginForm = document.getElementById("login-form");
var loginFeedback = document.getElementById("login-feedback");
var loginBtn = document.getElementById("login-btn");
var logoutBtn = document.getElementById("logout-btn");
var listView = document.getElementById("view-agendamentos");
var formView = document.getElementById("view-novo-agendamento");
var listTitle = document.getElementById("list-title");
var agendamentoForm = document.getElementById("agendamento-form");
var agendamentoFeedback = document.getElementById("agendamento-feedback");
var agendamentoBtn = document.getElementById("agendamento-btn");
var cancelEditBtn = document.getElementById("cancel-edit-btn");
var formTitle = document.getElementById("form-title");
var editingId = document.getElementById("editing-id");
var proximoEventoContent = document.getElementById("proximo-evento-content");
var tabelaBody = document.getElementById("tabela-agendamentos-body");
var tableView = document.getElementById("schedule-table-view");
var cardsView = document.getElementById("schedule-cards-view");
var listState = document.getElementById("list-state");
var scheduleSection = document.querySelector(".schedule-section");
var buscaInput = document.getElementById("busca-agendamentos");
var novoAgendamentoBtn = document.getElementById("novo-agendamento-btn");
var voltarAgendamentosBtn = document.getElementById("voltar-agendamentos-btn");
var operationStatus = document.getElementById("operation-status");
var modalOverlay = document.getElementById("modal-overlay");
var modalTitle = document.getElementById("modal-title");
var modalMessage = document.getElementById("modal-message");
var modalActions = document.getElementById("modal-actions");

var dataEventoInput = document.getElementById("data-evento");
var horaInicioInput = document.getElementById("hora-inicio");
var horaFimInput = document.getElementById("hora-fim");
var nomeEventoInput = document.getElementById("nome-evento");
var participantesInput = document.getElementById("qtd-participantes");
var observacoesInput = document.getElementById("observacoes");
var wizardBackBtn = document.getElementById("wizard-back-btn");
var wizardNextBtn = document.getElementById("wizard-next-btn");
var wizardSteps = document.querySelectorAll("[data-wizard-step]");
var wizardIndicators = document.querySelectorAll("[data-wizard-indicator]");
var availabilityStatus = document.getElementById("availability-status");
var availabilityTimeline = document.getElementById("availability-timeline");
var availabilityDetails = document.getElementById("availability-details");
var selectedDateLabel = document.getElementById("selected-date-label");
var bookingSummaryDate = document.getElementById("booking-summary-date");
var bookingSummaryTime = document.getElementById("booking-summary-time");

var agendamentosCache = [];
var navigationOrigin = null;
var operationStatusTimer = null;
var lastModalFocus = null;
var wizardState = {
  step: 1,
  availability: null,
  availabilityDate: "",
  requestId: 0,
  loading: false
};

var ICONS = {
  plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  retry: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  empty: '<svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2zM8 15h8"/></svg>',
  search: '<svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/></svg>',
  error: '<svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></svg>'
};

function getToken() {
  return localStorage.getItem("access_token");
}

function setToken(token) {
  localStorage.setItem("access_token", token);
}

function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("role");
}

function getRole() {
  return localStorage.getItem("role");
}

function setRole(role) {
  localStorage.setItem("role", role);
}

function decodeTokenPayload(token) {
  try {
    var payload = token.split(".")[1];
    if (!payload) return null;
    payload = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    return JSON.parse(decodeURIComponent(atob(payload).split("").map(function (char) {
      return "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2);
    }).join("")));
  } catch (err) {
    return null;
  }
}

function getCurrentUserId() {
  var payload = decodeTokenPayload(getToken() || "");
  return payload && payload.sub ? String(payload.sub) : "";
}

function isVisualizador() {
  return getRole() === "visualizador";
}

function canCreate() {
  return Boolean(getToken()) && !isVisualizador();
}

function canManage(agendamento) {
  return canCreate() && getCurrentUserId() !== "" && String(agendamento.usuario_id) === getCurrentUserId();
}

function apiHeaders() {
  var headers = { "Content-Type": "application/json" };
  if (getToken()) headers.Authorization = "Bearer " + getToken();
  return headers;
}

function escapeHtml(value) {
  var div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  var parts = String(dateStr).substring(0, 10).split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(dateStr);
}

function formatTime(timeStr) {
  return timeStr ? String(timeStr).substring(0, 5) : "-";
}

function participantLabel(value) {
  if (value == null) return "Não informado";
  return value + (Number(value) === 1 ? " participante" : " participantes");
}

function setButtonLoading(button, loading, loadingText) {
  if (loading) {
    button.disabled = true;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (loadingText || "Carregando...");
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

function showFeedback(element, message, type) {
  element.textContent = message;
  element.className = "feedback visible " + type;
}

function hideFeedback(element) {
  element.textContent = "";
  element.className = "feedback";
}

function showOperationStatus(message, type, shouldFocus) {
  clearTimeout(operationStatusTimer);
  operationStatus.textContent = message;
  operationStatus.className = "operation-status " + type;
  operationStatus.hidden = false;
  if (shouldFocus) {
    operationStatus.tabIndex = -1;
    operationStatus.focus();
  }
  operationStatusTimer = setTimeout(function () {
    operationStatus.hidden = true;
    operationStatus.removeAttribute("tabindex");
  }, 6000);
}

function hideOperationStatus() {
  clearTimeout(operationStatusTimer);
  operationStatus.hidden = true;
}

function showLogin() {
  loginScreen.classList.add("active");
  dashboardScreen.classList.remove("active");
  setTimeout(function () { document.getElementById("login").focus(); }, 0);
}

function showDashboard() {
  loginScreen.classList.remove("active");
  dashboardScreen.classList.add("active");
  applyRoleRestrictions();
  showView("view-agendamentos");
  refreshAll();
}

function showView(viewId) {
  listView.classList.toggle("hidden", viewId !== "view-agendamentos");
  formView.classList.toggle("hidden", viewId !== "view-novo-agendamento");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function applyRoleRestrictions() {
  novoAgendamentoBtn.hidden = !canCreate();
  scheduleSection.classList.toggle("role-readonly", isVisualizador());
  if (isVisualizador() && !formView.classList.contains("hidden")) showView("view-agendamentos");
}

function resetAvailability() {
  wizardState.requestId += 1;
  wizardState.availability = null;
  wizardState.availabilityDate = "";
  wizardState.loading = false;
  availabilityStatus.textContent = "Selecione uma data para consultar os horários.";
  availabilityStatus.className = "";
  availabilityTimeline.hidden = true;
  availabilityTimeline.innerHTML = "";
  availabilityDetails.innerHTML = "";
}

function setWizardStep(step, shouldFocus) {
  wizardState.step = step;
  wizardSteps.forEach(function (section) {
    section.hidden = Number(section.dataset.wizardStep) !== step;
  });
  wizardIndicators.forEach(function (indicator) {
    var indicatorStep = Number(indicator.dataset.wizardIndicator);
    indicator.classList.toggle("active", indicatorStep === step);
    indicator.classList.toggle("completed", indicatorStep < step);
    if (indicatorStep === step) indicator.setAttribute("aria-current", "step");
    else indicator.removeAttribute("aria-current");
  });
  wizardBackBtn.hidden = step === 1;
  wizardNextBtn.hidden = step === 3;
  agendamentoBtn.hidden = step !== 3;
  if (step === 3) updateBookingSummary();
  if (shouldFocus) {
    var heading = document.getElementById("wizard-step-" + step + "-title");
    heading.tabIndex = -1;
    heading.focus();
  }
}

function resetFormState() {
  agendamentoForm.reset();
  editingId.value = "";
  formTitle.textContent = "Novo Agendamento";
  agendamentoBtn.textContent = "Confirmar Agendamento";
  hideFeedback(agendamentoFeedback);
  resetAvailability();
  setWizardStep(1, false);
}

function openFormForCreate() {
  if (!canCreate()) return;
  navigationOrigin = { type: "new" };
  resetFormState();
  showView("view-novo-agendamento");
  dataEventoInput.focus();
}

function restoreListFocus() {
  var target = null;
  if (navigationOrigin && navigationOrigin.type === "edit") {
    target = document.querySelector('[data-action="edit"][data-id="' + CSS.escape(navigationOrigin.id) + '"]');
  } else if (navigationOrigin && navigationOrigin.type === "new" && !novoAgendamentoBtn.hidden) {
    target = novoAgendamentoBtn;
  }
  (target || listTitle).focus();
  navigationOrigin = null;
}

function returnToList(restoreFocus) {
  resetFormState();
  showView("view-agendamentos");
  if (restoreFocus) setTimeout(restoreListFocus, 0);
}

function handleAuthError(statusCode) {
  if (statusCode !== 401) return false;
  clearSession();
  agendamentosCache = [];
  showLogin();
  return true;
}

async function responseErrorDetails(response, fallback) {
  var data = await response.json().catch(function () { return null; });
  var detail = data && data.detail;
  if (detail && typeof detail === "object") {
    return {
      code: detail.code || "",
      message: detail.message || fallback
    };
  }
  return {
    code: data && data.code ? data.code : "",
    message: detail || (data && data.message) || fallback
  };
}

async function responseError(response, fallback) {
  return (await responseErrorDetails(response, fallback)).message;
}

function renderNextEventLoading() {
  proximoEventoContent.innerHTML = '<div class="next-event-loading" aria-label="Carregando próximo evento"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-line"></span></div>';
}

function renderProximoEvento(evento, hasError) {
  if (hasError) {
    proximoEventoContent.innerHTML = '<p class="next-event-neutral">Não foi possível consultar o próximo evento.</p>';
    return;
  }
  if (!evento) {
    proximoEventoContent.innerHTML = '<p class="next-event-neutral">Nenhum evento futuro agendado.</p>';
    return;
  }
  proximoEventoContent.innerHTML =
    '<div class="next-event-name">' + escapeHtml(evento.nome_evento) + '</div>' +
    '<div class="next-event-meta">' +
      '<span>' + ICONS.calendar + escapeHtml(formatDate(evento.data_evento)) + '</span>' +
      '<span>' + ICONS.clock + escapeHtml(formatTime(evento.hora_inicio) + " - " + formatTime(evento.hora_fim)) + '</span>' +
      '<span>' + ICONS.users + escapeHtml(participantLabel(evento.quantidade_participantes)) + '</span>' +
    '</div>';
}

function hideListPresentations() {
  tableView.hidden = true;
  cardsView.hidden = true;
}

function renderLoadingState() {
  hideListPresentations();
  listState.hidden = false;
  listState.className = "list-state loading-state";
  listState.setAttribute("aria-busy", "true");
  listState.innerHTML =
    '<span class="sr-only">Carregando agendamentos.</span>' +
    '<div class="skeleton-table" aria-hidden="true">' +
      '<span class="skeleton skeleton-row"></span><span class="skeleton skeleton-row"></span><span class="skeleton skeleton-row"></span>' +
    '</div>' +
    '<div class="skeleton-cards" aria-hidden="true">' +
      '<span class="skeleton skeleton-card"></span><span class="skeleton skeleton-card"></span>' +
    '</div>';
}

function renderMessageState(kind, title, description, actionHtml) {
  hideListPresentations();
  listState.hidden = false;
  listState.className = "list-state message-state " + kind;
  listState.setAttribute("aria-busy", "false");
  listState.innerHTML = ICONS[kind] + '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(description) + '</p>' + (actionHtml || "");
}

function actionButtons(agendamento) {
  if (!canManage(agendamento)) return "";
  var id = escapeHtml(agendamento.id);
  return '<div class="row-actions">' +
    '<button type="button" class="btn btn-action btn-edit" data-action="edit" data-id="' + id + '" aria-label="Editar ' + escapeHtml(agendamento.nome_evento) + '">' + ICONS.edit + 'Editar</button>' +
    '<button type="button" class="btn btn-action btn-delete" data-action="delete" data-id="' + id + '" aria-label="Excluir ' + escapeHtml(agendamento.nome_evento) + '">' + ICONS.trash + 'Excluir</button>' +
  '</div>';
}

function renderTable(agendamentos) {
  var html = "";
  for (var i = 0; i < agendamentos.length; i++) {
    var item = agendamentos[i];
    html += '<tr>' +
      '<td><span class="event-name">' + escapeHtml(item.nome_evento) + '</span></td>' +
      '<td class="cell-nowrap">' + escapeHtml(formatDate(item.data_evento)) + '</td>' +
      '<td class="cell-nowrap">' + escapeHtml(formatTime(item.hora_inicio) + " - " + formatTime(item.hora_fim)) + '</td>' +
      '<td class="cell-center">' + escapeHtml(item.quantidade_participantes == null ? "-" : item.quantidade_participantes) + '</td>' +
      '<td class="cell-actions">' + actionButtons(item) + '</td>' +
    '</tr>';
  }
  tabelaBody.innerHTML = html;
}

function renderCards(agendamentos) {
  var html = "";
  for (var i = 0; i < agendamentos.length; i++) {
    var item = agendamentos[i];
    var actions = actionButtons(item);
    html += '<article class="schedule-item-card">' +
      '<h3>' + escapeHtml(item.nome_evento) + '</h3>' +
      '<div class="schedule-card-meta">' +
        '<span>' + ICONS.calendar + escapeHtml(formatDate(item.data_evento)) + '</span>' +
        '<span>' + ICONS.clock + escapeHtml(formatTime(item.hora_inicio) + " - " + formatTime(item.hora_fim)) + '</span>' +
        '<span>' + ICONS.users + escapeHtml(participantLabel(item.quantidade_participantes)) + '</span>' +
      '</div>' +
      (actions ? '<div class="schedule-card-actions">' + actions + '</div>' : "") +
    '</article>';
  }
  cardsView.innerHTML = html;
}

function filterAgendamentos(query) {
  var normalized = String(query || "").trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return agendamentosCache.slice();
  return agendamentosCache.filter(function (item) {
    return String(item.nome_evento || "").toLocaleLowerCase("pt-BR").indexOf(normalized) !== -1 ||
      formatDate(item.data_evento).indexOf(normalized) !== -1;
  });
}

function renderAgendamentos() {
  var query = buscaInput.value.trim();
  if (agendamentosCache.length === 0) {
    var createAction = canCreate()
      ? '<button type="button" class="btn btn-primary" data-action="create">' + ICONS.plus + 'Agendar Horário</button>'
      : "";
    renderMessageState("empty", "Nenhum agendamento cadastrado", "Os novos agendamentos aparecerão aqui.", createAction);
    return;
  }
  var filtered = filterAgendamentos(query);
  if (filtered.length === 0) {
    renderMessageState("search", "Nenhum agendamento encontrado", "Tente buscar por outro nome ou data.", "");
    return;
  }
  listState.hidden = true;
  listState.setAttribute("aria-busy", "false");
  tableView.hidden = false;
  cardsView.hidden = false;
  renderTable(filtered);
  renderCards(filtered);
}

async function loadProximoEvento() {
  renderNextEventLoading();
  try {
    var response = await fetch(API_URL + "/agendamentos/proximo", { headers: apiHeaders() });
    if (!response.ok) {
      if (handleAuthError(response.status)) return;
      throw new Error("Falha ao consultar próximo evento");
    }
    renderProximoEvento(await response.json(), false);
  } catch (err) {
    renderProximoEvento(null, true);
  }
}

async function loadAgendamentos() {
  renderLoadingState();
  try {
    var response = await fetch(API_URL + "/agendamentos", { headers: apiHeaders() });
    if (!response.ok) {
      if (handleAuthError(response.status)) return;
      throw new Error(await responseError(response, "Não foi possível carregar os agendamentos."));
    }
    var data = await response.json();
    agendamentosCache = Array.isArray(data) ? data : [];
    renderAgendamentos();
  } catch (err) {
    renderMessageState(
      "error",
      "Não foi possível carregar os agendamentos",
      "Verifique sua conexão e tente novamente.",
      '<button type="button" class="btn btn-outline" data-action="retry">' + ICONS.retry + 'Tentar novamente</button>'
    );
  }
}

function refreshAll() {
  return Promise.all([loadProximoEvento(), loadAgendamentos()]);
}

function timeToMinutes(value) {
  var parts = String(value || "").split(":");
  if (parts.length < 2) return NaN;
  return Number(parts[0]) * 60 + Number(parts[1]) + Number(parts[2] || 0) / 60;
}

function minutesToTimeLabel(totalMinutes) {
  var hours = Math.floor(totalMinutes / 60);
  var minutes = Math.round(totalMinutes % 60);
  return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
}

function timelineMarkers(start, end) {
  var duration = end - start;
  var step = duration > 600 ? 180 : 120;
  var markers = [start];
  for (var marker = start + step; marker < end; marker += step) {
    if (end - marker >= step / 2) markers.push(marker);
  }
  markers.push(end);
  return markers;
}

function operatingPeriods(availability) {
  var start = timeToMinutes(availability.jornada.inicio);
  var end = timeToMinutes(availability.jornada.fim);
  var blocks = (availability.bloqueios || []).slice().sort(function (a, b) {
    return timeToMinutes(a.inicio) - timeToMinutes(b.inicio);
  });
  var periods = [];
  var cursor = start;
  blocks.forEach(function (block) {
    var blockStart = timeToMinutes(block.inicio);
    var blockEnd = timeToMinutes(block.fim);
    if (cursor < blockStart) periods.push({ inicio: cursor, fim: blockStart });
    cursor = Math.max(cursor, blockEnd);
  });
  if (cursor < end) periods.push({ inicio: cursor, fim: end });
  return periods;
}

function validateSelectedTime() {
  if (!wizardState.availability || wizardState.availabilityDate !== dataEventoInput.value) {
    return "Consulte a disponibilidade da data antes de escolher o horário.";
  }

  var start = timeToMinutes(horaInicioInput.value);
  var end = timeToMinutes(horaFimInput.value);
  if (isNaN(start) || isNaN(end)) return "Informe os horários de início e fim.";
  if (start >= end) return "O horário de fim deve ser posterior ao horário de início.";

  var fitsOperatingPeriod = operatingPeriods(wizardState.availability).some(function (period) {
    return start >= period.inicio && end <= period.fim;
  });
  if (!fitsOperatingPeriod) {
    return "Escolha um horário entre 07:00 e 11:00 ou entre 13:00 e 20:00.";
  }

  var overlaps = (wizardState.availability.ocupados || []).some(function (occupied) {
    return start < timeToMinutes(occupied.fim) && end > timeToMinutes(occupied.inicio);
  });
  if (overlaps) return "O intervalo escolhido já está ocupado. Selecione outro horário.";
  return "";
}

function renderAvailability(data) {
  var dayStart = timeToMinutes(data.jornada.inicio);
  var dayEnd = timeToMinutes(data.jornada.fim);
  var duration = dayEnd - dayStart;
  var markers = timelineMarkers(dayStart, dayEnd);
  var segments = [];

  (data.bloqueios || []).forEach(function (block) {
    segments.push({
      className: "timeline-segment lunch",
      inicio: block.inicio,
      fim: block.fim,
      label: "Pausa para almoço"
    });
  });
  (data.ocupados || []).forEach(function (occupied) {
    segments.push({
      className: "timeline-segment occupied",
      inicio: occupied.inicio,
      fim: occupied.fim,
      label: "Horário ocupado"
    });
  });

  var trackHtml = '<div class="timeline-track" role="img" aria-label="Linha do tempo das ' +
    escapeHtml(formatTime(data.jornada.inicio)) + ' às ' + escapeHtml(formatTime(data.jornada.fim)) + '">';
  markers.slice(1, -1).forEach(function (marker) {
    var position = ((marker - dayStart) / duration) * 100;
    trackHtml += '<span class="timeline-grid-line" style="left:' + position + '%" aria-hidden="true"></span>';
  });
  segments.forEach(function (segment) {
    var left = ((timeToMinutes(segment.inicio) - dayStart) / duration) * 100;
    var width = ((timeToMinutes(segment.fim) - timeToMinutes(segment.inicio)) / duration) * 100;
    trackHtml += '<span class="' + segment.className + '" style="left:' + left + '%;width:' + width + '%" title="' +
      escapeHtml(segment.label + ": " + formatTime(segment.inicio) + "–" + formatTime(segment.fim)) + '"></span>';
  });
  trackHtml += '</div><div class="timeline-labels">';
  markers.forEach(function (marker) {
    var position = ((marker - dayStart) / duration) * 100;
    trackHtml += '<span style="left:' + position + '%">' + minutesToTimeLabel(marker) + '</span>';
  });
  trackHtml += '</div>';

  availabilityTimeline.innerHTML = trackHtml;
  availabilityTimeline.hidden = false;
  availabilityStatus.className = "availability-success";
  availabilityStatus.textContent = data.ocupados.length
    ? data.ocupados.length + (data.ocupados.length === 1 ? " reserva ocupa parte deste dia." : " reservas ocupam parte deste dia.")
    : "Todo o expediente está livre nesta data.";

  if (!data.ocupados.length) {
    availabilityDetails.innerHTML = '<p class="availability-empty">Nenhum horário reservado.</p>';
    return;
  }
  availabilityDetails.innerHTML = '<strong>Intervalos ocupados</strong><ul>' + data.ocupados.map(function (occupied) {
    return '<li>' + escapeHtml(formatTime(occupied.inicio) + "–" + formatTime(occupied.fim)) + '</li>';
  }).join("") + '</ul>';
}

async function loadAvailability() {
  var dateValue = dataEventoInput.value;
  if (!dateValue) {
    resetAvailability();
    return false;
  }

  var requestId = wizardState.requestId + 1;
  wizardState.requestId = requestId;
  wizardState.loading = true;
  wizardState.availability = null;
  wizardState.availabilityDate = "";
  availabilityStatus.className = "availability-loading";
  availabilityStatus.textContent = "Consultando disponibilidade...";
  availabilityTimeline.hidden = true;
  availabilityDetails.innerHTML = "";
  wizardNextBtn.disabled = true;

  var params = new URLSearchParams({ data: dateValue });
  if (editingId.value) params.set("agendamento_id", editingId.value);

  try {
    var response = await fetch(API_URL + "/agendamentos/disponibilidade?" + params.toString(), {
      headers: apiHeaders()
    });
    if (!response.ok) {
      if (handleAuthError(response.status)) return false;
      throw new Error(await responseError(response, "Não foi possível consultar a disponibilidade."));
    }
    var data = await response.json();
    if (requestId !== wizardState.requestId) return false;
    wizardState.availability = data;
    wizardState.availabilityDate = dateValue;
    renderAvailability(data);
    return true;
  } catch (err) {
    if (requestId !== wizardState.requestId) return false;
    availabilityStatus.className = "availability-error";
    availabilityStatus.textContent = err.message;
    availabilityDetails.innerHTML = '<button type="button" class="btn btn-outline btn-small" data-action="retry-availability">Tentar novamente</button>';
    return false;
  } finally {
    if (requestId === wizardState.requestId) {
      wizardState.loading = false;
      wizardNextBtn.disabled = false;
    }
  }
}

function buildPayload() {
  var quantity = parseInt(participantesInput.value, 10);
  return {
    nome_evento: nomeEventoInput.value.trim(),
    data_evento: dataEventoInput.value,
    hora_inicio: horaInicioInput.value,
    hora_fim: horaFimInput.value,
    quantidade_participantes: isNaN(quantity) ? null : quantity,
    observacoes: observacoesInput.value.trim() || null
  };
}

function updateBookingSummary() {
  bookingSummaryDate.textContent = dataEventoInput.value ? formatDate(dataEventoInput.value) : "Data não informada";
  bookingSummaryTime.textContent = horaInicioInput.value && horaFimInput.value
    ? formatTime(horaInicioInput.value) + "–" + formatTime(horaFimInput.value) + " · horário de Campo Grande"
    : "Horário não informado";
}

async function advanceWizard() {
  hideFeedback(agendamentoFeedback);
  if (wizardState.step === 1) {
    if (!dataEventoInput.value) {
      showFeedback(agendamentoFeedback, "Selecione a data do evento.", "error");
      dataEventoInput.focus();
      return;
    }
    if (!wizardState.availability || wizardState.availabilityDate !== dataEventoInput.value) {
      var loaded = await loadAvailability();
      if (!loaded) {
        showFeedback(agendamentoFeedback, "Consulte a disponibilidade antes de continuar.", "error");
        return;
      }
    }
    selectedDateLabel.textContent = "Data selecionada: " + formatDate(dataEventoInput.value) + ".";
    setWizardStep(2, true);
    return;
  }

  if (wizardState.step === 2) {
    var scheduleError = validateSelectedTime();
    if (scheduleError) {
      showFeedback(agendamentoFeedback, scheduleError, "error");
      horaInicioInput.focus();
      return;
    }
    setWizardStep(3, true);
  }
}

function findAgendamento(id) {
  return agendamentosCache.find(function (item) { return String(item.id) === String(id); }) || null;
}

function openEditForm(id) {
  var item = findAgendamento(id);
  if (!item || !canManage(item)) return;
  navigationOrigin = { type: "edit", id: String(id) };
  resetFormState();
  editingId.value = item.id;
  nomeEventoInput.value = item.nome_evento || "";
  dataEventoInput.value = item.data_evento || "";
  horaInicioInput.value = item.hora_inicio ? item.hora_inicio.substring(0, 5) : "";
  horaFimInput.value = item.hora_fim ? item.hora_fim.substring(0, 5) : "";
  participantesInput.value = item.quantidade_participantes == null ? "" : item.quantidade_participantes;
  observacoesInput.value = item.observacoes || "";
  formTitle.textContent = "Editar Agendamento";
  agendamentoBtn.textContent = "Salvar Alterações";
  showView("view-novo-agendamento");
  setWizardStep(1, false);
  loadAvailability();
  dataEventoInput.focus();
}

function showModal(title, message, buttons) {
  lastModalFocus = document.activeElement;
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalActions.innerHTML = "";
  buttons.forEach(function (item) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn " + (item.className || "btn-outline");
    button.textContent = item.text;
    button.addEventListener("click", function () {
      hideModal();
      if (item.callback) item.callback();
    });
    modalActions.appendChild(button);
  });
  modalOverlay.classList.add("active");
  modalOverlay.setAttribute("aria-hidden", "false");
  setTimeout(function () { modalActions.querySelector("button").focus(); }, 0);
}

function hideModal() {
  modalOverlay.classList.remove("active");
  modalOverlay.setAttribute("aria-hidden", "true");
  if (lastModalFocus && document.contains(lastModalFocus)) lastModalFocus.focus();
}

function confirmDelete(id) {
  var item = findAgendamento(id);
  if (!item || !canManage(item)) return;
  showModal(
    "Excluir agendamento",
    'Tem certeza que deseja excluir "' + item.nome_evento + '"? Esta ação não pode ser desfeita.',
    [
      { text: "Cancelar", className: "btn-outline" },
      { text: "Excluir", className: "btn-danger-solid", callback: function () { deleteAgendamento(id); } }
    ]
  );
}

async function deleteAgendamento(id) {
  try {
    var response = await fetch(API_URL + "/agendamentos/" + encodeURIComponent(id), { method: "DELETE", headers: apiHeaders() });
    if (!response.ok) {
      if (handleAuthError(response.status)) return;
      throw new Error(await responseError(response, "Não foi possível excluir o agendamento."));
    }
    await refreshAll();
    showOperationStatus("Agendamento excluído com sucesso.", "success", true);
  } catch (err) {
    showOperationStatus(err.message, "error", true);
  }
}

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  hideFeedback(loginFeedback);
  var login = document.getElementById("login").value.trim();
  var senha = document.getElementById("senha").value;
  if (!login || !senha) {
    showFeedback(loginFeedback, "Preencha login e senha.", "error");
    return;
  }
  setButtonLoading(loginBtn, true, "Entrando...");
  try {
    var response = await fetch(API_URL + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: login, senha: senha })
    });
    if (!response.ok) throw new Error(await responseError(response, "Login ou senha inválidos."));
    var data = await response.json();
    if (!data.access_token) throw new Error("Token não recebido do servidor.");
    setToken(data.access_token);
    setRole(data.role || "superintendente");
    loginForm.reset();
    showDashboard();
  } catch (err) {
    showFeedback(loginFeedback, err.message, "error");
  } finally {
    setButtonLoading(loginBtn, false);
  }
});

logoutBtn.addEventListener("click", function () {
  clearSession();
  agendamentosCache = [];
  resetFormState();
  hideOperationStatus();
  showLogin();
});

novoAgendamentoBtn.addEventListener("click", openFormForCreate);

voltarAgendamentosBtn.addEventListener("click", function () {
  returnToList(true);
});

cancelEditBtn.addEventListener("click", function () {
  returnToList(true);
});

dataEventoInput.addEventListener("change", function () {
  horaInicioInput.value = "";
  horaFimInput.value = "";
  hideFeedback(agendamentoFeedback);
  loadAvailability();
});

wizardNextBtn.addEventListener("click", advanceWizard);

wizardBackBtn.addEventListener("click", function () {
  hideFeedback(agendamentoFeedback);
  if (wizardState.step > 1) setWizardStep(wizardState.step - 1, true);
});

agendamentoForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  hideFeedback(agendamentoFeedback);
  if (!canCreate()) {
    showFeedback(agendamentoFeedback, "Sua conta possui apenas permissão de visualização.", "error");
    return;
  }

  var scheduleError = validateSelectedTime();
  if (scheduleError) {
    setWizardStep(2, true);
    showFeedback(agendamentoFeedback, scheduleError, "error");
    return;
  }

  var payload = buildPayload();
  if (!payload.nome_evento || payload.nome_evento.length < 3 || payload.quantidade_participantes == null) {
    showFeedback(agendamentoFeedback, "Informe um nome com pelo menos 3 caracteres e a quantidade de participantes.", "error");
    nomeEventoInput.focus();
    return;
  }

  var id = editingId.value;
  var isEditing = Boolean(id);
  setButtonLoading(agendamentoBtn, true, isEditing ? "Salvando..." : "Confirmando...");
  try {
    var response = await fetch(
      isEditing ? API_URL + "/agendamentos/" + encodeURIComponent(id) : API_URL + "/agendamentos/criar_agendamento",
      { method: isEditing ? "PUT" : "POST", headers: apiHeaders(), body: JSON.stringify(payload) }
    );
    if (!response.ok) {
      if (handleAuthError(response.status)) return;
      var apiError = await responseErrorDetails(response, "Não foi possível salvar o agendamento.");
      if (response.status === 409 && apiError.code === "schedule_conflict") {
        horaInicioInput.value = "";
        horaFimInput.value = "";
        await loadAvailability();
        setWizardStep(2, true);
        showFeedback(agendamentoFeedback, apiError.message, "error");
        return;
      }
      if (response.status === 400 && apiError.code === "invalid_schedule_window") {
        setWizardStep(2, true);
        showFeedback(agendamentoFeedback, apiError.message, "error");
        return;
      }
      throw new Error(apiError.message);
    }
    resetFormState();
    showView("view-agendamentos");
    await refreshAll();
    showOperationStatus(isEditing ? "Agendamento atualizado com sucesso." : "Agendamento criado com sucesso.", "success", true);
    navigationOrigin = null;
  } catch (err) {
    showFeedback(agendamentoFeedback, err.message, "error");
  } finally {
    setButtonLoading(agendamentoBtn, false);
  }
});

scheduleSection.addEventListener("click", function (event) {
  var button = event.target.closest("button[data-action]");
  if (!button) return;
  var action = button.dataset.action;
  if (action === "create") openFormForCreate();
  if (action === "retry") refreshAll();
  if (action === "edit") openEditForm(button.dataset.id);
  if (action === "delete") confirmDelete(button.dataset.id);
});

availabilityDetails.addEventListener("click", function (event) {
  var button = event.target.closest('[data-action="retry-availability"]');
  if (button) loadAvailability();
});

buscaInput.addEventListener("input", renderAgendamentos);

modalOverlay.addEventListener("click", function (event) {
  if (event.target === modalOverlay) hideModal();
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && modalOverlay.classList.contains("active")) {
    hideModal();
    return;
  }
  if (event.key === "Tab" && modalOverlay.classList.contains("active")) {
    var focusable = modalActions.querySelectorAll("button:not(:disabled)");
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

(function init() {
  if (getToken()) showDashboard();
  else showLogin();
})();
