const API_URL = (location.protocol === "file:" || location.port === "5500") ? "http://127.0.0.1:8000" : "";

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

var agendamentosCache = [];
var navigationOrigin = null;
var operationStatusTimer = null;
var lastModalFocus = null;

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

function resetFormState() {
  agendamentoForm.reset();
  editingId.value = "";
  formTitle.textContent = "Novo Agendamento";
  agendamentoBtn.textContent = "Confirmar Agendamento";
  hideFeedback(agendamentoFeedback);
}

function openFormForCreate() {
  if (!canCreate()) return;
  navigationOrigin = { type: "new" };
  resetFormState();
  showView("view-novo-agendamento");
  document.getElementById("nome-evento").focus();
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

async function responseError(response, fallback) {
  var data = await response.json().catch(function () { return null; });
  return data?.detail || data?.message || fallback;
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

function buildPayload() {
  var quantity = parseInt(document.getElementById("qtd-participantes").value, 10);
  return {
    nome_evento: document.getElementById("nome-evento").value.trim(),
    data_evento: document.getElementById("data-evento").value,
    hora_inicio: document.getElementById("hora-inicio").value,
    hora_fim: document.getElementById("hora-fim").value,
    quantidade_participantes: isNaN(quantity) ? null : quantity,
    observacoes: document.getElementById("observacoes").value.trim() || null
  };
}

function findAgendamento(id) {
  return agendamentosCache.find(function (item) { return String(item.id) === String(id); }) || null;
}

function openEditForm(id) {
  var item = findAgendamento(id);
  if (!item || !canManage(item)) return;
  navigationOrigin = { type: "edit", id: String(id) };
  editingId.value = item.id;
  document.getElementById("nome-evento").value = item.nome_evento || "";
  document.getElementById("data-evento").value = item.data_evento || "";
  document.getElementById("hora-inicio").value = item.hora_inicio ? item.hora_inicio.substring(0, 5) : "";
  document.getElementById("hora-fim").value = item.hora_fim ? item.hora_fim.substring(0, 5) : "";
  document.getElementById("qtd-participantes").value = item.quantidade_participantes == null ? "" : item.quantidade_participantes;
  document.getElementById("observacoes").value = item.observacoes || "";
  formTitle.textContent = "Editar Agendamento";
  agendamentoBtn.textContent = "Salvar Alterações";
  hideFeedback(agendamentoFeedback);
  showView("view-novo-agendamento");
  document.getElementById("nome-evento").focus();
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

agendamentoForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  hideFeedback(agendamentoFeedback);
  if (!canCreate()) {
    showFeedback(agendamentoFeedback, "Sua conta possui apenas permissão de visualização.", "error");
    return;
  }
  var payload = buildPayload();
  if (!payload.nome_evento || !payload.data_evento || !payload.hora_inicio || !payload.hora_fim || payload.quantidade_participantes == null) {
    showFeedback(agendamentoFeedback, "Preencha todos os campos obrigatórios.", "error");
    return;
  }
  if (payload.hora_fim <= payload.hora_inicio) {
    showFeedback(agendamentoFeedback, "O horário de fim deve ser posterior ao horário de início.", "error");
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
      throw new Error(await responseError(response, "Não foi possível salvar o agendamento."));
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
