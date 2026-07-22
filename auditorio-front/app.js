const API_URL = (location.protocol === "file:" || location.port === "5500") ? "http://127.0.0.1:8000" : "";

var loginScreen = document.getElementById("login-screen");
var dashboardScreen = document.getElementById("dashboard-screen");
var loginForm = document.getElementById("login-form");
var loginFeedback = document.getElementById("login-feedback");
var loginBtn = document.getElementById("login-btn");
var logoutBtn = document.getElementById("logout-btn");
var agendamentoForm = document.getElementById("agendamento-form");
var agendamentoFeedback = document.getElementById("agendamento-feedback");
var agendamentoBtn = document.getElementById("agendamento-btn");
var cancelEditBtn = document.getElementById("cancel-edit-btn");
var formTitle = document.getElementById("form-title");
var editingId = document.getElementById("editing-id");
var proximoEventoContent = document.getElementById("proximo-evento-content");
var tabelaBody = document.getElementById("tabela-agendamentos-body");
var buscaInput = document.getElementById("busca-agendamentos");
var modalOverlay = document.getElementById("modal-overlay");
var modalMessage = document.getElementById("modal-message");
var modalActions = document.getElementById("modal-actions");

var agendamentosCache = [];

function showLogin() {
  loginScreen.classList.add("active");
  dashboardScreen.classList.remove("active");
}

function showDashboard() {
  loginScreen.classList.remove("active");
  dashboardScreen.classList.add("active");
  applyRoleRestrictions();
  refreshAll();
}

function getToken() {
  return localStorage.getItem("access_token");
}

function setToken(token) {
  localStorage.setItem("access_token", token);
}

function clearToken() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("role");
}

function getRole() {
  return localStorage.getItem("role");
}

function setRole(role) {
  localStorage.setItem("role", role);
}

function isVisualizador() {
  return getRole() === "visualizador";
}

function setButtonLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Carregando...";
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

function showFeedback(el, message, type) {
  el.textContent = message;
  el.className = "feedback visible " + type;
}

function hideFeedback(el) {
  el.textContent = "";
  el.className = "feedback";
}

function clearForm(form) {
  form.reset();
  editingId.value = "";
  agendamentoBtn.textContent = "Confirmar Agendamento";
  cancelEditBtn.style.display = "none";
  formTitle.textContent = "Novo Agendamento";
}

function resetEditState() {
  clearForm(agendamentoForm);
  hideFeedback(agendamentoFeedback);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  var parts = dateStr.split("-");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function formatTime(timeStr) {
  if (!timeStr) return "-";
  return timeStr.substring(0, 5);
}

function apiHeaders() {
  var headers = { "Content-Type": "application/json" };
  var token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

function handleAuthError(status) {
  if (status === 401) {
    clearToken();
    showLogin();
  }
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function buildBody(nomeEvento, dataEvento, horaInicio, horaFim, qtdParticipantes, observacoes) {
  var body = {
    nome_evento: nomeEvento,
    data_evento: dataEvento,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
  };

  var qtd = parseInt(qtdParticipantes, 10);
  if (!isNaN(qtd) && qtd > 0) {
    body.quantidade_participantes = qtd;
  } else {
    body.quantidade_participantes = null;
  }

  if (observacoes) {
    body.observacoes = observacoes;
  } else {
    body.observacoes = null;
  }

  return body;
}

function showModal(message, buttons) {
  modalMessage.textContent = message;
  modalActions.innerHTML = "";

  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    var btn = document.createElement("button");
    btn.className = "btn " + (b.cls || "btn-outline");
    btn.textContent = b.text;
    btn.addEventListener("click", function (cb) {
      return function () {
        hideModal();
        if (cb) cb();
      };
    }(b.callback));
    modalActions.appendChild(btn);
  }

  modalOverlay.classList.add("active");
}

function hideModal() {
  modalOverlay.classList.remove("active");
}

function showAlertModal(message) {
  showModal(message, [{ text: "OK", cls: "btn-primary", callback: null }]);
}

function showConfirmModal(message, onConfirm) {
  showModal(message, [
    { text: "Cancelar", cls: "btn-outline", callback: null },
    { text: "Confirmar", cls: "btn-danger", callback: onConfirm },
  ]);
}

modalOverlay.addEventListener("click", function (e) {
  if (e.target === modalOverlay) {
    hideModal();
  }
});

function renderProximoEvento(evento) {
  if (!evento) {
    proximoEventoContent.innerHTML = '<p class="empty-state">Nenhum evento proximo agendado.</p>';
    return;
  }

  proximoEventoContent.innerHTML =
    '<div class="proximo-evento-details">' +
      '<div class="detail-item">' +
        '<span class="detail-label">Evento</span>' +
        '<span class="detail-value highlight">' + escapeHtml(evento.nome_evento) + '</span>' +
      '</div>' +
      '<div class="detail-item">' +
        '<span class="detail-label">Data</span>' +
        '<span class="detail-value">' + formatDate(evento.data_evento) + '</span>' +
      '</div>' +
      '<div class="detail-item">' +
        '<span class="detail-label">Horario</span>' +
        '<span class="detail-value">' + formatTime(evento.hora_inicio) + ' - ' + formatTime(evento.hora_fim) + '</span>' +
      '</div>' +
      '<div class="detail-item">' +
        '<span class="detail-label">Participantes</span>' +
        '<span class="detail-value">' + (evento.quantidade_participantes != null ? evento.quantidade_participantes : "-") + '</span>' +
      '</div>' +
    '</div>';
}

function renderTabela(agendamentos) {
  if (!agendamentos || agendamentos.length === 0) {
    tabelaBody.innerHTML = '<tr class="empty-row"><td colspan="6" class="empty-state">Nenhum agendamento encontrado.</td></tr>';
    return;
  }

  var isVis = isVisualizador();
  var html = "";
  for (var i = 0; i < agendamentos.length; i++) {
    var ev = agendamentos[i];
    var actions = "";
    if (!isVis) {
      actions =
        '<td class="td-actions">' +
          '<button class="btn btn-sm btn-edit" data-id="' + ev.id + '" title="Editar">Editar</button>' +
          '<button class="btn btn-sm btn-danger" data-id="' + ev.id + '" title="Excluir">Excluir</button>' +
        '</td>';
    } else {
      actions = '<td class="td-actions"></td>';
    }
    html +=
      '<tr>' +
        '<td>' + escapeHtml(ev.nome_evento) + '</td>' +
        '<td>' + formatDate(ev.data_evento) + '</td>' +
        '<td>' + formatTime(ev.hora_inicio) + '</td>' +
        '<td>' + formatTime(ev.hora_fim) + '</td>' +
        '<td>' + (ev.quantidade_participantes != null ? ev.quantidade_participantes : "-") + '</td>' +
        actions +
      '</tr>';
  }
  tabelaBody.innerHTML = html;
}

function applyRoleRestrictions() {
  var isVis = isVisualizador();
  var formCard = document.querySelector(".card-form");
  var dashboardGrid = document.querySelector(".dashboard-grid");
  var dashboardLeft = document.querySelector(".dashboard-col-left");

  if (formCard) {
    formCard.style.display = isVis ? "none" : "";
  }
  if (dashboardLeft) {
    dashboardLeft.style.display = isVis ? "none" : "";
  }
  if (dashboardGrid) {
    if (isVis) {
      dashboardGrid.classList.add("visualizador-layout");
    } else {
      dashboardGrid.classList.remove("visualizador-layout");
    }
  }
}

function filtrarAgendamentos(query) {
  if (!query) return agendamentosCache;

  var q = query.toLowerCase().trim();
  return agendamentosCache.filter(function (ev) {
    return ev.nome_evento.toLowerCase().indexOf(q) !== -1
      || (ev.data_evento && ev.data_evento.indexOf(q) !== -1);
  });
}

async function loadProximoEvento() {
  try {
    var res = await fetch(API_URL + "/agendamentos/proximo", {
      method: "GET",
      headers: apiHeaders(),
    });

    if (!res.ok) {
      handleAuthError(res.status);
      renderProximoEvento(null);
      return;
    }

    var data = await res.json();
    renderProximoEvento(data || null);
  } catch (err) {
    renderProximoEvento(null);
  }
}

async function loadAgendamentos() {
  try {
    var res = await fetch(API_URL + "/agendamentos", {
      method: "GET",
      headers: apiHeaders(),
    });

    if (!res.ok) {
      handleAuthError(res.status);
      agendamentosCache = [];
    } else {
      var data = await res.json();
      agendamentosCache = Array.isArray(data) ? data : [];
    }
  } catch (err) {
    agendamentosCache = [];
  }

  var query = buscaInput.value;
  var filtrados = filtrarAgendamentos(query);
  renderTabela(filtrados);
}

function refreshAll() {
  loadProximoEvento();
  loadAgendamentos();
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  hideFeedback(loginFeedback);

  var login = document.getElementById("login").value.trim();
  var senha = document.getElementById("senha").value.trim();

  if (!login || !senha) {
    showFeedback(loginFeedback, "Preencha todos os campos.", "error");
    return;
  }

  setButtonLoading(loginBtn, true);

  try {
    var res = await fetch(API_URL + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: login, senha: senha }),
    });

    if (!res.ok) {
      var data = await res.json().catch(function () { return null; });
      var msg = data?.detail || data?.message || "Credenciais invalidas.";
      throw new Error(msg);
    }

    var data = await res.json();
    var token = data.access_token;

    if (!token) {
      throw new Error("Token nao recebido do servidor.");
    }

    setToken(token);
    if (data.role) {
      setRole(data.role);
    }
    clearForm(loginForm);
    showDashboard();
  } catch (err) {
    showFeedback(loginFeedback, err.message, "error");
  } finally {
    setButtonLoading(loginBtn, false);
  }
});

logoutBtn.addEventListener("click", function () {
  clearToken();
  resetEditState();
  agendamentosCache = [];
  renderProximoEvento(null);
  renderTabela([]);
  showLogin();
});

cancelEditBtn.addEventListener("click", function () {
  resetEditState();
});

agendamentoForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  hideFeedback(agendamentoFeedback);

  if (isVisualizador()) {
    showAlertModal("Sua conta possui apenas permissao de visualizacao. Nao e possivel criar ou editar agendamentos.");
    return;
  }

  var nomeEvento = document.getElementById("nome-evento").value.trim();
  var dataEvento = document.getElementById("data-evento").value;
  var horaInicio = document.getElementById("hora-inicio").value;
  var horaFim = document.getElementById("hora-fim").value;
  var qtdParticipantes = document.getElementById("qtd-participantes").value;
  var observacoes = document.getElementById("observacoes").value.trim();
  var editId = editingId.value;

  if (!nomeEvento || !dataEvento || !horaInicio || !horaFim) {
    showFeedback(agendamentoFeedback, "Preencha todos os campos obrigatorios.", "error");
    return;
  }

  if (horaFim <= horaInicio) {
    showFeedback(agendamentoFeedback, "A hora do fim deve ser posterior a hora de inicio.", "error");
    return;
  }

  var token = getToken();
  if (!token) {
    showFeedback(agendamentoFeedback, "Sessao expirada. Faca login novamente.", "error");
    setTimeout(function () {
      clearToken();
      showLogin();
    }, 1500);
    return;
  }

  setButtonLoading(agendamentoBtn, true);

  var isEditing = !!editId;
  var method = isEditing ? "PUT" : "POST";
  var url = isEditing
    ? API_URL + "/agendamentos/" + encodeURIComponent(editId)
    : API_URL + "/agendamentos/criar_agendamento";

  var body = buildBody(nomeEvento, dataEvento, horaInicio, horaFim, qtdParticipantes, observacoes);

  try {
    var res = await fetch(url, {
      method: method,
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      handleAuthError(res.status);
      var data = await res.json().catch(function () { return null; });
      var msg = data?.detail || data?.message || "Erro ao salvar agendamento.";
      throw new Error(msg);
    }

    showFeedback(agendamentoFeedback, isEditing ? "Agendamento atualizado com sucesso!" : "Agendamento confirmado com sucesso!", "success");
    resetEditState();
    refreshAll();
  } catch (err) {
    showFeedback(agendamentoFeedback, err.message, "error");
  } finally {
    setButtonLoading(agendamentoBtn, false);
  }
});

tabelaBody.addEventListener("click", function (e) {
  var target = e.target;
  if (!target.classList.contains("btn-sm")) return;

  if (isVisualizador()) {
    showAlertModal("Sua conta possui apenas permissao de visualizacao.");
    return;
  }

  var id = target.getAttribute("data-id");
  if (!id) return;

  if (target.classList.contains("btn-edit")) {
    preencherFormularioEdicao(id);
  } else if (target.classList.contains("btn-danger")) {
    confirmarExclusao(id);
  }
});

function preencherFormularioEdicao(id) {
  var ev = null;
  for (var i = 0; i < agendamentosCache.length; i++) {
    if (agendamentosCache[i].id === id) {
      ev = agendamentosCache[i];
      break;
    }
  }

  if (!ev) {
    showFeedback(agendamentoFeedback, "Agendamento nao encontrado.", "error");
    return;
  }

  editingId.value = ev.id;
  document.getElementById("nome-evento").value = ev.nome_evento || "";
  document.getElementById("data-evento").value = ev.data_evento || "";
  document.getElementById("hora-inicio").value = ev.hora_inicio ? ev.hora_inicio.substring(0, 5) : "";
  document.getElementById("hora-fim").value = ev.hora_fim ? ev.hora_fim.substring(0, 5) : "";
  document.getElementById("qtd-participantes").value = ev.quantidade_participantes != null ? ev.quantidade_participantes : "";
  document.getElementById("observacoes").value = ev.observacoes || "";

  agendamentoBtn.textContent = "Salvar Alteracoes";
  cancelEditBtn.style.display = "inline-flex";
  formTitle.textContent = "Editar Agendamento";

  hideFeedback(agendamentoFeedback);
  document.getElementById("nome-evento").focus();
  agendamentoForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function confirmarExclusao(id) {
  showConfirmModal(
    "Tem certeza que deseja excluir este agendamento? Esta acao nao pode ser desfeita.",
    function () {
      excluirAgendamento(id);
    }
  );
}

async function excluirAgendamento(id) {
  try {
    var res = await fetch(API_URL + "/agendamentos/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: apiHeaders(),
    });

    if (!res.ok) {
      handleAuthError(res.status);
      var data = await res.json().catch(function () { return null; });
      var msg = data?.detail || data?.message || "Erro ao excluir agendamento.";
      throw new Error(msg);
    }

    if (editingId.value === id) {
      resetEditState();
    }

    refreshAll();
  } catch (err) {
    showAlertModal("Erro: " + err.message);
  }
}

buscaInput.addEventListener("input", function () {
  var query = buscaInput.value;
  var filtrados = filtrarAgendamentos(query);
  renderTabela(filtrados);
});

(function init() {
  if (getToken()) {
    showDashboard();
  } else {
    showLogin();
  }
})();
