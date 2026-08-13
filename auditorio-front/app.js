const API_URL = (location.protocol === "file:" || location.port === "5500" || location.port === "4173") ? "http://127.0.0.1:8000" : "";
const INTERVALO_MINUTOS = 30;

var loginScreen = document.getElementById("login-screen");
var dashboardScreen = document.getElementById("dashboard-screen");
var loginForm = document.getElementById("login-form");
var loginFeedback = document.getElementById("login-feedback");
var loginBtn = document.getElementById("login-btn");
var logoutBtn = document.getElementById("logout-btn");
var themeToggle = document.getElementById("theme-toggle");
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
var auditoriumStatusFeedback = document.getElementById("auditorium-status-feedback");
var auditoriumStatusLive = document.getElementById("auditorium-status-live");
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
var timeOptionsStatus = document.getElementById("time-options-status");
var timeOptionsAlert = document.getElementById("time-options-alert");
var reservedTimesContent = document.getElementById("reserved-times-content");
var datePicker = document.getElementById("date-picker");
var datePickerTrigger = document.getElementById("date-picker-trigger");
var datePickerDisplay = document.getElementById("date-picker-display");
var datePickerPopover = document.getElementById("date-picker-popover");
var calendarMonthLabel = document.getElementById("calendar-month-label");
var calendarGrid = document.getElementById("calendar-grid");
var calendarPrevious = document.getElementById("calendar-previous");
var calendarNext = document.getElementById("calendar-next");
var calendarToday = document.getElementById("calendar-today");

var agendamentosCache = [];
var hasLoadedAgendamentos = false;
var statusDataStale = false;
var previousAuditoriumStatus = null;
var statusFeedbackTimer = null;
var reportedOverlapKeys = {};
var navigationOrigin = null;
var operationStatusTimer = null;
var lastModalFocus = null;
var wizardState = {
  step: 1,
  availability: null,
  availabilityDate: "",
  requestId: 0,
  loading: false,
  abortController: null,
  availabilityStart: NaN,
  availabilityEnd: NaN,
  blockedIntervals: [],
  validStartOptions: [],
  validEndOptions: [],
  editSchedule: null,
  pendingEditSelection: null,
  reservedTimesExpanded: false
};

var calendarState = {
  viewYear: 0,
  viewMonth: 0,
  focusedDate: ""
};
var memoryStorage = {};
var statusTimerController = AuditoriumStatus.createStatusTimerController({
  onTick: function () { refreshAuditoriumStatus(); }
});

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

function safeStorageGet(key) {
  try {
    var value = localStorage.getItem(key);
    return value == null ? (memoryStorage[key] || null) : value;
  } catch (error) {
    return memoryStorage[key] || null;
  }
}

function safeStorageSet(key, value) {
  memoryStorage[key] = String(value);
  try { localStorage.setItem(key, String(value)); } catch (error) {}
}

function safeStorageRemove(key) {
  delete memoryStorage[key];
  try { localStorage.removeItem(key); } catch (error) {}
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function updateThemeControl() {
  var dark = currentTheme() === "dark";
  var label = dark ? "Ativar modo claro" : "Ativar modo escuro";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.setAttribute("title", label);
}

function applyTheme(theme, persist) {
  var value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", value);
  if (persist) safeStorageSet("auditorio_theme", value);
  updateThemeControl();
}

function getToken() {
  return safeStorageGet("access_token");
}

function setToken(token) {
  safeStorageSet("access_token", token);
}

function clearSession() {
  safeStorageRemove("access_token");
  safeStorageRemove("role");
}

function getRole() {
  return safeStorageGet("role");
}

function setRole(role) {
  safeStorageSet("role", role);
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

function daysInMonth(year, month) {
  return new Date(year, month, 0, 12).getDate();
}

function parseIsoDate(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  var parsed = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parsed.month < 1 || parsed.month > 12 || parsed.day < 1 || parsed.day > daysInMonth(parsed.year, parsed.month)) return null;
  return parsed;
}

function datePartsToIso(year, month, day) {
  return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function dateToIso(date) {
  return datePartsToIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function isoToLocalDate(value) {
  var parsed = parseIsoDate(value);
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 12) : null;
}

function todayIso() {
  return dateToIso(new Date());
}

function addDaysToIso(value, amount) {
  var date = isoToLocalDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return dateToIso(date);
}

function addMonthsToIso(value, amount) {
  var parsed = parseIsoDate(value);
  if (!parsed) return "";
  var target = new Date(parsed.year, parsed.month - 1 + amount, 1, 12);
  var day = Math.min(parsed.day, daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return datePartsToIso(target.getFullYear(), target.getMonth() + 1, day);
}

function buildCalendarDays(year, month) {
  var first = new Date(year, month - 1, 1, 12);
  first.setDate(first.getDate() - first.getDay());
  var days = [];
  for (var index = 0; index < 42; index += 1) {
    var date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index, 12);
    days.push({
      value: dateToIso(date),
      day: date.getDate(),
      currentMonth: date.getMonth() === month - 1
    });
  }
  return days;
}

function updateDatePickerDisplay() {
  var hasDate = Boolean(parseIsoDate(dataEventoInput.value));
  datePickerDisplay.textContent = hasDate ? formatDate(dataEventoInput.value) : "Selecione uma data";
  datePickerDisplay.classList.toggle("date-picker-placeholder", !hasDate);
}

function renderCalendar(focusDay) {
  var monthDate = new Date(calendarState.viewYear, calendarState.viewMonth - 1, 1, 12);
  calendarMonthLabel.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthDate)
    .replace(/^./, function (letter) { return letter.toUpperCase(); });
  var selected = dataEventoInput.value;
  var today = todayIso();
  var dayButtons = buildCalendarDays(calendarState.viewYear, calendarState.viewMonth).map(function (item) {
    var date = isoToLocalDate(item.value);
    var label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
    var classes = ["calendar-day"];
    if (!item.currentMonth) classes.push("adjacent-month");
    if (item.value === today) classes.push("today");
    if (item.value === selected) classes.push("selected");
    return '<button type="button" role="gridcell" class="' + classes.join(" ") + '" data-calendar-date="' + item.value + '"' +
      ' aria-label="' + escapeHtml(label) + '" aria-selected="' + (item.value === selected ? "true" : "false") + '"' +
      ' tabindex="' + (item.value === calendarState.focusedDate ? "0" : "-1") + '">' + item.day + '</button>';
  });
  var weeks = [];
  for (var week = 0; week < 6; week += 1) {
    weeks.push('<div class="calendar-week" role="row">' + dayButtons.slice(week * 7, week * 7 + 7).join("") + '</div>');
  }
  calendarGrid.innerHTML = weeks.join("");
  if (focusDay) {
    requestAnimationFrame(function () {
      var target = calendarGrid.querySelector('[data-calendar-date="' + CSS.escape(calendarState.focusedDate) + '"]');
      if (target) target.focus();
    });
  }
}

function openCalendar() {
  var base = parseIsoDate(dataEventoInput.value) || parseIsoDate(todayIso());
  calendarState.viewYear = base.year;
  calendarState.viewMonth = base.month;
  calendarState.focusedDate = dataEventoInput.value || todayIso();
  renderCalendar(false);
  datePickerPopover.hidden = false;
  datePickerTrigger.setAttribute("aria-expanded", "true");
  requestAnimationFrame(function () {
    var target = calendarGrid.querySelector('[data-calendar-date="' + CSS.escape(calendarState.focusedDate) + '"]');
    if (target) target.focus();
  });
}

function closeCalendar(restoreFocus) {
  if (datePickerPopover.hidden) return;
  datePickerPopover.hidden = true;
  datePickerTrigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) datePickerTrigger.focus();
}

function showCalendarDate(value, focusDay) {
  var parsed = parseIsoDate(value);
  if (!parsed) return;
  calendarState.focusedDate = value;
  calendarState.viewYear = parsed.year;
  calendarState.viewMonth = parsed.month;
  renderCalendar(focusDay);
}

function selectEventDate(value) {
  if (!parseIsoDate(value)) return;
  var changed = dataEventoInput.value !== value;
  dataEventoInput.value = value;
  updateDatePickerDisplay();
  closeCalendar(true);
  if (!changed) return;
  wizardState.pendingEditSelection = null;
  wizardState.reservedTimesExpanded = false;
  if (wizardState.editSchedule && wizardState.editSchedule.date !== value) wizardState.editSchedule = null;
  resetTimeSelectors("Consultando horários disponíveis...");
  renderReservedTimesState("loading");
  hideFeedback(agendamentoFeedback);
  loadAvailability();
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
  if (wizardState.abortController) wizardState.abortController.abort();
  wizardState.requestId += 1;
  wizardState.availability = null;
  wizardState.availabilityDate = "";
  wizardState.loading = false;
  wizardState.abortController = null;
  wizardState.availabilityStart = NaN;
  wizardState.availabilityEnd = NaN;
  wizardState.blockedIntervals = [];
  wizardState.validStartOptions = [];
  wizardState.validEndOptions = [];
  wizardState.editSchedule = null;
  wizardState.pendingEditSelection = null;
  wizardState.reservedTimesExpanded = false;
  availabilityStatus.textContent = "Selecione uma data para consultar os horários.";
  availabilityStatus.className = "";
  availabilityTimeline.hidden = true;
  availabilityTimeline.innerHTML = "";
  availabilityDetails.innerHTML = "";
  resetTimeSelectors("Selecione uma data para consultar os horários.");
  renderReservedTimesState("initial");
  updateDatePickerDisplay();
  closeCalendar(false);
  wizardNextBtn.disabled = false;
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
  datePickerTrigger.focus();
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
  clearAuditoriumStatus();
  clearSession();
  agendamentosCache = [];
  hasLoadedAgendamentos = false;
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

function renderAuditoriumStatusLoading() {
  proximoEventoContent.setAttribute("aria-busy", "true");
  proximoEventoContent.innerHTML = '<div class="next-event-loading" aria-label="Carregando status do auditório"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-line"></span></div>';
}

function renderAuditoriumStatusError() {
  proximoEventoContent.setAttribute("aria-busy", "false");
  proximoEventoContent.innerHTML =
    '<div class="status-empty status-error">' +
      '<span class="status-badge">INDISPONÍVEL</span>' +
      '<h3>Não foi possível consultar o status do auditório.</h3>' +
      '<p>Verifique sua conexão e tente novamente.</p>' +
    '</div>';
}

function statusMetadata(interval) {
  var appointment = interval.appointment;
  return '<div class="next-event-meta">' +
    '<span>' + ICONS.calendar + escapeHtml(AuditoriumStatus.formatAuditoriumDate(interval.start)) + '</span>' +
    '<span>' + ICONS.clock + escapeHtml(AuditoriumStatus.formatAuditoriumTime(interval.start) + " - " + AuditoriumStatus.formatAuditoriumTime(interval.end)) + '</span>' +
    '<span>' + ICONS.users + escapeHtml(participantLabel(appointment.quantidade_participantes)) + '</span>' +
  '</div>';
}

function staleStatusMessage() {
  return statusDataStale
    ? '<p class="status-stale" role="status">Não foi possível atualizar os dados. Exibindo a última informação carregada.</p>'
    : '';
}

function renderAuditoriumStatus(status) {
  proximoEventoContent.setAttribute("aria-busy", "false");
  if (status.state === "EM_ANDAMENTO") {
    var current = status.current.appointment;
    var progress = AuditoriumStatus.calculateEventProgress(status.current, status.now);
    var roundedProgress = Math.floor(progress);
    var nextSummary = status.next
      ? '<p class="status-next-summary"><strong>Próximo:</strong> ' + escapeHtml(status.next.appointment.nome_evento) +
        ' <span aria-hidden="true">·</span> ' + escapeHtml(AuditoriumStatus.formatAuditoriumTime(status.next.start) + " - " + AuditoriumStatus.formatAuditoriumTime(status.next.end)) + '</p>'
      : '';
    proximoEventoContent.innerHTML =
      '<div class="status-layout status-running">' +
        '<div class="status-primary">' +
          '<span class="status-badge status-badge-running"><span class="status-dot" aria-hidden="true"></span>EM ANDAMENTO</span>' +
          '<h3 class="next-event-name">' + escapeHtml(current.nome_evento) + '</h3>' +
          statusMetadata(status.current) +
        '</div>' +
        '<div class="status-countdown"><strong>Termina em ' + escapeHtml(AuditoriumStatus.formatRemainingTime(status.current.end, status.now)) + '</strong><span>às ' + escapeHtml(AuditoriumStatus.formatAuditoriumTime(status.current.end)) + '</span></div>' +
      '</div>' +
      '<div class="status-progress" role="progressbar" aria-label="Progresso do evento" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + roundedProgress + '">' +
        '<span style="width:' + progress.toFixed(2) + '%"></span>' +
      '</div>' + nextSummary + staleStatusMessage();
    return;
  }

  if (status.state === "PROXIMO_EVENTO") {
    var next = status.next.appointment;
    proximoEventoContent.innerHTML =
      '<div class="status-layout status-upcoming">' +
        '<div class="status-primary">' +
          '<span class="status-badge">PRÓXIMO EVENTO</span>' +
          '<h3 class="next-event-name">' + escapeHtml(next.nome_evento) + '</h3>' +
          statusMetadata(status.next) +
          '<p class="status-availability">O auditório está disponível até o início deste evento.</p>' +
        '</div>' +
        '<div class="status-countdown"><strong>Começa em ' + escapeHtml(AuditoriumStatus.formatRemainingTime(status.next.start, status.now)) + '</strong><span>às ' + escapeHtml(AuditoriumStatus.formatAuditoriumTime(status.next.start)) + '</span></div>' +
      '</div>' + staleStatusMessage();
    return;
  }

  proximoEventoContent.innerHTML =
    '<div class="status-empty status-available">' +
      '<span class="status-badge status-badge-available">AUDITÓRIO DISPONÍVEL</span>' +
      '<h3>Nenhum evento está acontecendo agora.</h3>' +
      '<p>Nenhum próximo evento agendado.</p>' +
    '</div>' + staleStatusMessage();
}

function appointmentIdentity(interval) {
  if (!interval) return "";
  var item = interval.appointment;
  return String(item.id || [item.data_evento, item.hora_inicio, item.hora_fim, item.nome_evento].join("|"));
}

function announceStatusTransition(status) {
  var previous = previousAuditoriumStatus;
  if (!previous) return;
  var previousId = appointmentIdentity(previous.current);
  var currentId = appointmentIdentity(status.current);
  if (previous.current && previousId !== currentId && status.now >= previous.current.end) {
    var ended = previous.current.appointment;
    clearTimeout(statusFeedbackTimer);
    auditoriumStatusFeedback.hidden = false;
    auditoriumStatusFeedback.innerHTML = '<strong>EVENTO FINALIZADO</strong><span>' + escapeHtml(ended.nome_evento) + ' foi encerrado às ' + escapeHtml(AuditoriumStatus.formatAuditoriumTime(previous.current.end)) + '.' +
      (status.current ? ' ' + escapeHtml(status.current.appointment.nome_evento) + ' está em andamento.' : '') + '</span>';
    auditoriumStatusLive.textContent = "";
    statusFeedbackTimer = setTimeout(function () {
      auditoriumStatusFeedback.hidden = true;
      auditoriumStatusFeedback.innerHTML = "";
    }, 3000);
  } else if (!previous.current && status.current) {
    auditoriumStatusLive.textContent = status.current.appointment.nome_evento + " está em andamento.";
  }
}

function reportOverlaps(status) {
  if (!status.overlaps.length) return;
  var key = status.overlaps.map(appointmentIdentity).sort().join("::");
  if (reportedOverlapKeys[key]) return;
  reportedOverlapKeys[key] = true;
  console.warn("Foram encontrados agendamentos simultâneos. O card exibirá o evento de início mais recente.", status.overlaps.map(function (item) { return item.appointment.id; }));
}

function refreshAuditoriumStatus() {
  if (!hasLoadedAgendamentos) return;
  var status = AuditoriumStatus.classifyAppointments(agendamentosCache, Date.now());
  announceStatusTransition(status);
  reportOverlaps(status);
  renderAuditoriumStatus(status);
  previousAuditoriumStatus = status;
  statusTimerController.start(AuditoriumStatus.getNextBoundary(status));
}

function clearAuditoriumStatus() {
  statusTimerController.stop();
  clearTimeout(statusFeedbackTimer);
  statusFeedbackTimer = null;
  previousAuditoriumStatus = null;
  statusDataStale = false;
  reportedOverlapKeys = {};
  auditoriumStatusFeedback.hidden = true;
  auditoriumStatusFeedback.innerHTML = "";
  auditoriumStatusLive.textContent = "";
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

async function loadAgendamentos() {
  if (!hasLoadedAgendamentos) renderAuditoriumStatusLoading();
  renderLoadingState();
  try {
    var response = await fetch(API_URL + "/agendamentos", { headers: apiHeaders() });
    if (!response.ok) {
      if (handleAuthError(response.status)) return;
      throw new Error(await responseError(response, "Não foi possível carregar os agendamentos."));
    }
    var data = await response.json();
    agendamentosCache = Array.isArray(data) ? data : [];
    hasLoadedAgendamentos = true;
    statusDataStale = false;
    renderAgendamentos();
    refreshAuditoriumStatus();
  } catch (err) {
    statusDataStale = hasLoadedAgendamentos;
    if (hasLoadedAgendamentos) refreshAuditoriumStatus();
    else renderAuditoriumStatusError();
    renderMessageState(
      "error",
      "Não foi possível carregar os agendamentos",
      "Verifique sua conexão e tente novamente.",
      '<button type="button" class="btn btn-outline" data-action="retry">' + ICONS.retry + 'Tentar novamente</button>'
    );
  }
}

function refreshAll() {
  return loadAgendamentos();
}

function timeToMinutes(value) {
  var match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(String(value || ""));
  if (!match) return NaN;
  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  var seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return NaN;
  return hours * 60 + minutes + seconds / 60;
}

function minutesToTimeLabel(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "";
  var wholeMinutes = Math.floor(totalMinutes);
  var hours = Math.floor(wholeMinutes / 60);
  var minutes = wholeMinutes % 60;
  return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
}

function generateTimeOptions(start, end, intervalMinutes) {
  var interval = intervalMinutes || INTERVALO_MINUTOS;
  if (!Number.isFinite(start) || !Number.isFinite(end) || interval <= 0 || start > end) return [];
  var options = [];
  for (var minute = start; minute <= end; minute += interval) options.push(minute);
  return options;
}

function intervalValueToMinutes(value) {
  return typeof value === "number" ? value : timeToMinutes(value);
}

function normalizeIntervals(intervals, rangeStart, rangeEnd) {
  var normalized = (Array.isArray(intervals) ? intervals : []).map(function (interval) {
    var start = intervalValueToMinutes(interval && interval.inicio);
    var end = intervalValueToMinutes(interval && interval.fim);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (Number.isFinite(rangeStart)) start = Math.max(start, rangeStart);
    if (Number.isFinite(rangeEnd)) end = Math.min(end, rangeEnd);
    return start < end ? { inicio: start, fim: end } : null;
  }).filter(Boolean).sort(function (a, b) {
    return a.inicio - b.inicio || a.fim - b.fim;
  });

  return normalized.reduce(function (merged, interval) {
    var previous = merged[merged.length - 1];
    if (!previous || interval.inicio > previous.fim) {
      merged.push({ inicio: interval.inicio, fim: interval.fim });
    } else {
      previous.fim = Math.max(previous.fim, interval.fim);
    }
    return merged;
  }, []);
}

function isMinuteBlocked(minute, intervals) {
  return intervals.some(function (interval) {
    return minute >= interval.inicio && minute < interval.fim;
  });
}

function calculateValidEndOptions(start, dayStart, dayEnd, blockedIntervals, intervalMinutes) {
  if (!Number.isFinite(start) || start < dayStart || start >= dayEnd) return [];
  var blocked = normalizeIntervals(blockedIntervals, dayStart, dayEnd);
  if (isMinuteBlocked(start, blocked)) return [];

  var limit = dayEnd;
  for (var index = 0; index < blocked.length; index += 1) {
    if (blocked[index].inicio > start) {
      limit = blocked[index].inicio;
      break;
    }
  }

  return generateTimeOptions(dayStart, dayEnd, intervalMinutes).filter(function (candidate) {
    return candidate > start && candidate <= limit;
  });
}

function calculateValidStartOptions(dayStart, dayEnd, blockedIntervals, intervalMinutes) {
  var blocked = normalizeIntervals(blockedIntervals, dayStart, dayEnd);
  return generateTimeOptions(dayStart, dayEnd, intervalMinutes).filter(function (candidate) {
    return candidate < dayEnd &&
      calculateValidEndOptions(candidate, dayStart, dayEnd, blocked, intervalMinutes).length > 0;
  });
}

function timePositionPercent(value, dayStart, dayEnd) {
  if (!Number.isFinite(value) || !Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) return 0;
  return Math.max(0, Math.min(100, ((value - dayStart) / (dayEnd - dayStart)) * 100));
}

function isIntervalAvailable(start, end, dayStart, dayEnd, blockedIntervals) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < dayStart || end > dayEnd || start >= end) return false;
  return !blockedIntervals.some(function (interval) {
    return start < interval.fim && end > interval.inicio;
  });
}

function uniqueSortedMinutes(values) {
  return values.filter(Number.isFinite).filter(function (value, index, items) {
    return items.indexOf(value) === index;
  }).sort(function (a, b) { return a - b; });
}

function populateTimeSelect(select, placeholder, values, selectedValue, enabled) {
  select.innerHTML = "";
  var neutral = document.createElement("option");
  neutral.value = "";
  neutral.textContent = placeholder;
  select.appendChild(neutral);
  values.forEach(function (minute) {
    var value = minutesToTimeLabel(minute);
    var option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = selectedValue && Array.from(select.options).some(function (option) {
    return option.value === selectedValue;
  }) ? selectedValue : "";
  select.disabled = !enabled;
}

function setTimeOptionsStatus(message, type) {
  timeOptionsStatus.textContent = message;
  timeOptionsStatus.className = "time-options-status" + (type ? " " + type : "");
  if (type === "success") clearTimeOptionsAlert();
}

function clearTimeOptionsAlert() {
  timeOptionsAlert.textContent = "";
  timeOptionsAlert.hidden = true;
}

function showTimeOptionsAlert(message) {
  setTimeOptionsStatus("", "");
  timeOptionsAlert.textContent = message;
  timeOptionsAlert.hidden = false;
}

function normalizedReservedTimes(items) {
  var seen = {};
  return (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
    return timeToMinutes(a.inicio) - timeToMinutes(b.inicio) || timeToMinutes(a.fim) - timeToMinutes(b.fim);
  }).filter(function (item) {
    var key = item && item.id ? String(item.id) : [item && item.inicio, item && item.fim, item && item.nome_evento].join("|");
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function renderReservedTimesState(state, items) {
  if (state === "loading") {
    reservedTimesContent.className = "reserved-times-content loading";
    reservedTimesContent.textContent = "Carregando horários reservados...";
    return;
  }
  if (state === "error") {
    reservedTimesContent.className = "reserved-times-content error";
    reservedTimesContent.textContent = "Não foi possível carregar os horários reservados.";
    return;
  }
  if (state === "initial") {
    reservedTimesContent.className = "reserved-times-content";
    reservedTimesContent.textContent = "Selecione uma data para consultar as reservas.";
    return;
  }

  var reservations = normalizedReservedTimes(items);
  reservedTimesContent.className = "reserved-times-content";
  if (!reservations.length) {
    reservedTimesContent.textContent = "Nenhum horário reservado nesta data.";
    return;
  }
  var visible = wizardState.reservedTimesExpanded ? reservations : reservations.slice(0, 3);
  var html = '<ul class="reserved-times-list">' + visible.map(function (item) {
    return '<li><i aria-hidden="true"></i><span><strong>' + escapeHtml(formatTime(item.inicio) + "–" + formatTime(item.fim)) +
      '</strong><span aria-hidden="true"> · </span>' + escapeHtml(item.nome_evento || "Evento reservado") + '</span></li>';
  }).join("") + '</ul>';
  if (reservations.length > 3) {
    html += '<button type="button" class="reserved-times-toggle" data-action="toggle-reserved-times" aria-expanded="' +
      (wizardState.reservedTimesExpanded ? "true" : "false") + '">' +
      (wizardState.reservedTimesExpanded ? "Mostrar menos" : "Ver todas (" + reservations.length + ")") + '</button>';
  }
  reservedTimesContent.innerHTML = html;
}

function resetTimeSelectors(message) {
  populateTimeSelect(horaInicioInput, "Selecione o horário", [], "", false);
  populateTimeSelect(horaFimInput, "Selecione o início", [], "", false);
  clearTimeOptionsAlert();
  setTimeOptionsStatus(message || "Selecione uma data para consultar os horários.", "");
}

function legacyScheduleForCurrentDate() {
  var legacy = wizardState.editSchedule;
  if (!legacy || legacy.date !== dataEventoInput.value) return null;
  var start = timeToMinutes(legacy.start);
  var end = timeToMinutes(legacy.end);
  if (!isIntervalAvailable(
    start,
    end,
    wizardState.availabilityStart,
    wizardState.availabilityEnd,
    wizardState.blockedIntervals
  )) return null;
  return { start: start, end: end, startValue: legacy.start, endValue: legacy.end };
}

function validEndOptionsForStart(startValue) {
  var start = timeToMinutes(startValue);
  var options = calculateValidEndOptions(
    start,
    wizardState.availabilityStart,
    wizardState.availabilityEnd,
    wizardState.blockedIntervals,
    INTERVALO_MINUTOS
  );
  var legacy = legacyScheduleForCurrentDate();
  if (legacy && legacy.startValue === startValue) options.push(legacy.end);
  return uniqueSortedMinutes(options);
}

function updateEndTimeOptions(selectedValue) {
  wizardState.validEndOptions = [];
  if (!selectedValue) {
    populateTimeSelect(horaFimInput, "Selecione o início", [], "", false);
    return;
  }
  var options = validEndOptionsForStart(selectedValue);
  wizardState.validEndOptions = options.map(minutesToTimeLabel);
  populateTimeSelect(horaFimInput, "Selecione o horário", options, "", options.length > 0);
  if (!options.length) showTimeOptionsAlert("Este horário não está mais disponível. Escolha outro intervalo.");
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
  if (isNaN(start) || isNaN(end)) {
    if (Number.isFinite(start) && !wizardState.validEndOptions.length) return "Este horário não está mais disponível. Escolha outro intervalo.";
    return "Informe os horários de início e fim.";
  }
  if (start >= end) return "O horário de fim deve ser posterior ao horário de início.";

  var crossesLunch = (wizardState.availability.bloqueios || []).some(function (block) {
    return start < timeToMinutes(block.fim) && end > timeToMinutes(block.inicio);
  });
  if (crossesLunch) return "O evento não pode atravessar o horário de almoço.";

  var overlaps = (wizardState.availability.ocupados || []).some(function (occupied) {
    return start < timeToMinutes(occupied.fim) && end > timeToMinutes(occupied.inicio);
  });
  if (overlaps) return "O intervalo selecionado coincide com um agendamento existente.";

  if (wizardState.validStartOptions.indexOf(horaInicioInput.value) === -1 ||
      wizardState.validEndOptions.indexOf(horaFimInput.value) === -1) {
    return "Este horário não está mais disponível. Escolha outro intervalo.";
  }

  var fitsOperatingPeriod = operatingPeriods(wizardState.availability).some(function (period) {
    return start >= period.inicio && end <= period.fim;
  });
  if (!fitsOperatingPeriod) {
    return "Escolha um horário entre 07:00 e 11:00 ou entre 13:00 e 20:00.";
  }

  return "";
}

function validateAvailabilityIntervals(intervals) {
  if (!Array.isArray(intervals)) return false;
  return intervals.every(function (interval) {
    var start = timeToMinutes(interval && interval.inicio);
    var end = timeToMinutes(interval && interval.fim);
    return Number.isFinite(start) && Number.isFinite(end) && start < end;
  });
}

function applyAvailableTimeOptions(preferredSelection) {
  var starts = calculateValidStartOptions(
    wizardState.availabilityStart,
    wizardState.availabilityEnd,
    wizardState.blockedIntervals,
    INTERVALO_MINUTOS
  );
  var legacy = legacyScheduleForCurrentDate();
  if (legacy) starts.push(legacy.start);
  starts = uniqueSortedMinutes(starts);
  wizardState.validStartOptions = starts.map(minutesToTimeLabel);
  wizardState.validEndOptions = [];

  if (!starts.length) {
    populateTimeSelect(horaInicioInput, "Selecione o horário", [], "", false);
    populateTimeSelect(horaFimInput, "Selecione o início", [], "", false);
    showTimeOptionsAlert("Não há horários disponíveis para esta data.");
    return false;
  }

  var preferredStart = preferredSelection && preferredSelection.start;
  var selectedStart = wizardState.validStartOptions.indexOf(preferredStart) !== -1 ? preferredStart : "";
  populateTimeSelect(horaInicioInput, "Selecione o horário", starts, selectedStart, true);
  if (!selectedStart) {
    populateTimeSelect(horaFimInput, "Selecione o início", [], "", false);
    setTimeOptionsStatus("Selecione o horário de início.", "success");
    return true;
  }

  var endOptions = validEndOptionsForStart(selectedStart);
  wizardState.validEndOptions = endOptions.map(minutesToTimeLabel);
  var preferredEnd = preferredSelection && preferredSelection.end;
  var selectedEnd = wizardState.validEndOptions.indexOf(preferredEnd) !== -1 ? preferredEnd : "";
  populateTimeSelect(horaFimInput, "Selecione o horário", endOptions, selectedEnd, true);
  setTimeOptionsStatus(
    selectedEnd ? "Horários atuais carregados para edição." : "Selecione o horário de fim.",
    "success"
  );
  return true;
}

function renderAvailability(data, hasAvailableTimes) {
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
    var position = timePositionPercent(marker, dayStart, dayEnd);
    trackHtml += '<span class="timeline-grid-line" style="left:' + position + '%" aria-hidden="true"></span>';
  });
  segments.forEach(function (segment) {
    var left = timePositionPercent(timeToMinutes(segment.inicio), dayStart, dayEnd);
    var right = timePositionPercent(timeToMinutes(segment.fim), dayStart, dayEnd);
    var width = right - left;
    trackHtml += '<span class="' + segment.className + '" style="left:' + left + '%;width:' + width + '%" title="' +
      escapeHtml(segment.label + ": " + formatTime(segment.inicio) + "–" + formatTime(segment.fim)) + '"></span>';
  });
  trackHtml += '</div><div class="timeline-labels">';
  markers.forEach(function (marker) {
    var position = timePositionPercent(marker, dayStart, dayEnd);
    trackHtml += '<span style="left:' + position + '%">' + minutesToTimeLabel(marker) + '</span>';
  });
  trackHtml += '</div>';

  availabilityTimeline.innerHTML = trackHtml;
  availabilityTimeline.hidden = false;
  availabilityDetails.innerHTML = "";
  renderReservedTimesState("success", data.ocupados);
  if (!hasAvailableTimes) {
    availabilityStatus.className = "";
    availabilityStatus.textContent = "Não há horários disponíveis para esta data.";
  } else {
    availabilityStatus.className = "availability-success";
    availabilityStatus.textContent = data.ocupados.length
      ? data.ocupados.length + (data.ocupados.length === 1 ? " reserva ocupa parte deste dia." : " reservas ocupam parte deste dia.")
      : "Todo o expediente está livre nesta data.";
  }
}

async function loadAvailability(options) {
  var dateValue = dataEventoInput.value;
  if (!dateValue) {
    resetAvailability();
    return false;
  }

  if (wizardState.abortController) wizardState.abortController.abort();
  var controller = new AbortController();
  var requestId = wizardState.requestId + 1;
  wizardState.requestId = requestId;
  wizardState.loading = true;
  wizardState.abortController = controller;
  wizardState.availability = null;
  wizardState.availabilityDate = "";
  wizardState.availabilityStart = NaN;
  wizardState.availabilityEnd = NaN;
  wizardState.blockedIntervals = [];
  wizardState.validStartOptions = [];
  wizardState.validEndOptions = [];
  wizardState.reservedTimesExpanded = false;
  availabilityStatus.className = "availability-loading";
  availabilityStatus.textContent = "Consultando disponibilidade...";
  availabilityTimeline.hidden = true;
  availabilityDetails.innerHTML = "";
  resetTimeSelectors("Consultando horários disponíveis...");
  renderReservedTimesState("loading");
  wizardNextBtn.disabled = true;

  var params = new URLSearchParams({ data: dateValue });
  if (editingId.value) params.set("agendamento_id", editingId.value);

  try {
    var response = await fetch(API_URL + "/agendamentos/disponibilidade?" + params.toString(), {
      headers: apiHeaders(),
      signal: controller.signal
    });
    if (!response.ok) {
      if (handleAuthError(response.status)) return false;
      throw new Error(await responseError(response, "Não foi possível consultar a disponibilidade."));
    }
    var data = await response.json();
    if (requestId !== wizardState.requestId) return false;
    var dayStart = timeToMinutes(data && data.jornada && data.jornada.inicio);
    var dayEnd = timeToMinutes(data && data.jornada && data.jornada.fim);
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayStart >= dayEnd ||
        !validateAvailabilityIntervals(data.bloqueios) || !validateAvailabilityIntervals(data.ocupados)) {
      throw new Error("Resposta de disponibilidade inválida.");
    }
    wizardState.availability = data;
    wizardState.availabilityDate = dateValue;
    wizardState.availabilityStart = dayStart;
    wizardState.availabilityEnd = dayEnd;
    wizardState.blockedIntervals = normalizeIntervals(
      data.bloqueios.concat(data.ocupados),
      dayStart,
      dayEnd
    );
    var preferredSelection = options && options.preserveEditSelection
      ? wizardState.pendingEditSelection
      : null;
    var hasAvailableTimes = applyAvailableTimeOptions(preferredSelection);
    if (preferredSelection) wizardState.pendingEditSelection = null;
    renderAvailability(data, hasAvailableTimes);
    return true;
  } catch (err) {
    if (requestId !== wizardState.requestId) return false;
    if (err && err.name === "AbortError") return false;
    availabilityStatus.className = "availability-error";
    availabilityStatus.textContent = "Não foi possível consultar os horários. Tente novamente.";
    availabilityDetails.innerHTML = '<button type="button" class="btn btn-outline btn-small" data-action="retry-availability">Tentar novamente</button>';
    resetTimeSelectors("Não foi possível consultar os horários. Tente novamente.");
    setTimeOptionsStatus("Não foi possível consultar os horários. Tente novamente.", "error");
    showTimeOptionsAlert("Não foi possível confirmar a disponibilidade. Tente novamente.");
    renderReservedTimesState("error");
    return false;
  } finally {
    if (requestId === wizardState.requestId) {
      wizardState.loading = false;
      wizardState.abortController = null;
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
      datePickerTrigger.focus();
      return;
    }
    if (!wizardState.availability || wizardState.availabilityDate !== dataEventoInput.value) {
      var loaded = await loadAvailability({
        preserveEditSelection: Boolean(wizardState.pendingEditSelection)
      });
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
      showTimeOptionsAlert(scheduleError);
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
  updateDatePickerDisplay();
  var editStart = item.hora_inicio ? item.hora_inicio.substring(0, 5) : "";
  var editEnd = item.hora_fim ? item.hora_fim.substring(0, 5) : "";
  wizardState.editSchedule = {
    date: item.data_evento || "",
    start: editStart,
    end: editEnd
  };
  wizardState.pendingEditSelection = { start: editStart, end: editEnd };
  participantesInput.value = item.quantidade_participantes == null ? "" : item.quantidade_participantes;
  observacoesInput.value = item.observacoes || "";
  formTitle.textContent = "Editar Agendamento";
  agendamentoBtn.textContent = "Salvar Alterações";
  showView("view-novo-agendamento");
  setWizardStep(1, false);
  loadAvailability({ preserveEditSelection: true });
  datePickerTrigger.focus();
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
  clearAuditoriumStatus();
  clearSession();
  agendamentosCache = [];
  hasLoadedAgendamentos = false;
  resetFormState();
  hideOperationStatus();
  showLogin();
});

themeToggle.addEventListener("click", function () {
  applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
});

novoAgendamentoBtn.addEventListener("click", openFormForCreate);

voltarAgendamentosBtn.addEventListener("click", function () {
  returnToList(true);
});

cancelEditBtn.addEventListener("click", function () {
  returnToList(true);
});

datePickerTrigger.addEventListener("click", function () {
  if (datePickerPopover.hidden) openCalendar();
  else closeCalendar(true);
});

calendarPrevious.addEventListener("click", function () {
  showCalendarDate(addMonthsToIso(calendarState.focusedDate, -1), true);
});

calendarNext.addEventListener("click", function () {
  showCalendarDate(addMonthsToIso(calendarState.focusedDate, 1), true);
});

calendarToday.addEventListener("click", function () {
  showCalendarDate(todayIso(), true);
});

calendarGrid.addEventListener("click", function (event) {
  var day = event.target.closest("[data-calendar-date]");
  if (day) selectEventDate(day.dataset.calendarDate);
});

calendarGrid.addEventListener("keydown", function (event) {
  var day = event.target.closest("[data-calendar-date]");
  if (!day) return;
  var nextDate = "";
  if (event.key === "ArrowLeft") nextDate = addDaysToIso(day.dataset.calendarDate, -1);
  if (event.key === "ArrowRight") nextDate = addDaysToIso(day.dataset.calendarDate, 1);
  if (event.key === "ArrowUp") nextDate = addDaysToIso(day.dataset.calendarDate, -7);
  if (event.key === "ArrowDown") nextDate = addDaysToIso(day.dataset.calendarDate, 7);
  if (event.key === "PageUp") nextDate = addMonthsToIso(day.dataset.calendarDate, -1);
  if (event.key === "PageDown") nextDate = addMonthsToIso(day.dataset.calendarDate, 1);
  if (!nextDate) return;
  event.preventDefault();
  showCalendarDate(nextDate, true);
});

dataEventoInput.addEventListener("change", function () {
  updateDatePickerDisplay();
  closeCalendar(false);
  wizardState.pendingEditSelection = null;
  wizardState.reservedTimesExpanded = false;
  if (wizardState.editSchedule && wizardState.editSchedule.date !== dataEventoInput.value) {
    wizardState.editSchedule = null;
  }
  resetTimeSelectors(dataEventoInput.value ? "Consultando horários disponíveis..." : "Selecione uma data para consultar os horários.");
  renderReservedTimesState(dataEventoInput.value ? "loading" : "initial");
  hideFeedback(agendamentoFeedback);
  loadAvailability();
});

horaInicioInput.addEventListener("change", function () {
  updateEndTimeOptions(horaInicioInput.value);
  if (!horaInicioInput.value) setTimeOptionsStatus("Selecione o horário de início.", "");
  else if (wizardState.validEndOptions.length) setTimeOptionsStatus("Selecione o horário de fim.", "success");
});

horaFimInput.addEventListener("change", function () {
  if (!horaFimInput.value) {
    setTimeOptionsStatus("Selecione o horário de fim.", "");
    return;
  }
  var error = validateSelectedTime();
  if (error) showTimeOptionsAlert(error);
  else setTimeOptionsStatus("Intervalo disponível selecionado.", "success");
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
    showTimeOptionsAlert(scheduleError);
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
        wizardState.pendingEditSelection = null;
        await loadAvailability();
        setWizardStep(2, true);
        showTimeOptionsAlert("Este horário não está mais disponível. Escolha outro intervalo.");
        showFeedback(agendamentoFeedback, apiError.message, "error");
        return;
      }
      if (response.status === 400 && apiError.code === "invalid_schedule_window") {
        setWizardStep(2, true);
        showTimeOptionsAlert(apiError.message || "Não foi possível confirmar a disponibilidade. Tente novamente.");
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
  if (button) loadAvailability({
    preserveEditSelection: Boolean(wizardState.pendingEditSelection)
  });
});

reservedTimesContent.addEventListener("click", function (event) {
  var button = event.target.closest('[data-action="toggle-reserved-times"]');
  if (!button || !wizardState.availability) return;
  wizardState.reservedTimesExpanded = !wizardState.reservedTimesExpanded;
  renderReservedTimesState("success", wizardState.availability.ocupados);
});

buscaInput.addEventListener("input", renderAgendamentos);

modalOverlay.addEventListener("click", function (event) {
  if (event.target === modalOverlay) hideModal();
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !datePickerPopover.hidden) {
    closeCalendar(true);
    return;
  }
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

document.addEventListener("pointerdown", function (event) {
  if (!datePickerPopover.hidden && !datePicker.contains(event.target)) closeCalendar(false);
});

document.addEventListener("visibilitychange", function () {
  if (!document.hidden && hasLoadedAgendamentos) refreshAuditoriumStatus();
});

window.addEventListener("pagehide", clearAuditoriumStatus);

(function init() {
  updateThemeControl();
  updateDatePickerDisplay();
  if (getToken()) showDashboard();
  else showLogin();
})();
