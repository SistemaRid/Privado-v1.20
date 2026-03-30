(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDAcuwo5FZBs5013klfSMfWkQZbFjqYpbw",
    authDomain: "novo-rid-dezembro.firebaseapp.com",
    projectId: "novo-rid-dezembro",
    storageBucket: "novo-rid-dezembro.firebasestorage.app",
    messagingSenderId: "629184938088",
    appId: "1:629184938088:web:3821e7ea07897ae655fbdd"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const db = firebase.firestore();

  const state = {
    currentUser: null,
    currentUserData: null,
    allRids: [],
    filters: {},
    draftFilters: {},
    unsubRids: null,
    selectedRidId: null
  };

  const dom = {
    bootOverlay: document.getElementById("bootOverlay"),
    authOverlay: document.getElementById("authOverlay"),
    loginForm: document.getElementById("loginForm"),
    loginCpf: document.getElementById("loginCpf"),
    loginPassword: document.getElementById("loginPassword"),
    loginSubmitButton: document.getElementById("loginSubmitButton"),
    loginFeedback: document.getElementById("loginFeedback"),
    pageShell: document.getElementById("pageShell"),
    welcomeText: document.getElementById("welcomeText"),
    logoutButton: document.getElementById("logoutButton"),
    toggleFiltersButton: document.getElementById("toggleFiltersButton"),
    filtersPanel: document.getElementById("filtersPanel"),
    filterStatus: document.getElementById("filterStatus"),
    filterRisk: document.getElementById("filterRisk"),
    searchInput: document.getElementById("searchInput"),
    clearFiltersButton: document.getElementById("clearFiltersButton"),
    applyFiltersButton: document.getElementById("applyFiltersButton"),
    totalCount: document.getElementById("totalCount"),
    pendingCount: document.getElementById("pendingCount"),
    overdueCount: document.getElementById("overdueCount"),
    correctedMonthCount: document.getElementById("correctedMonthCount"),
    correctedTotalCount: document.getElementById("correctedTotalCount"),
    designatedCount: document.getElementById("designatedCount"),
    designatedList: document.getElementById("designatedList"),
    designatedModal: document.getElementById("designatedModal"),
    designatedModalTitle: document.getElementById("designatedModalTitle"),
    designatedModalBody: document.getElementById("designatedModalBody"),
    designatedModalClose: document.getElementById("designatedModalClose")
  };

  function updateRoleNavigation() {
    document.querySelectorAll('[data-admin-only-nav="designated"]').forEach((element) => {
      element.classList.toggle("hidden-state", !(state.currentUserData?.isAdmin || state.currentUserData?.isDeveloper));
    });
    document.querySelectorAll('[data-developer-only-nav="control-center"]').forEach((element) => {
      element.classList.toggle("hidden-state", !state.currentUserData?.isDeveloper);
    });
    document.querySelectorAll('[data-privileged-nav="changes"]').forEach((element) => {
      element.classList.toggle("hidden-state", !state.currentUserData?.isDeveloper);
    });
    document.querySelectorAll('[data-developer-only-nav="requests"]').forEach((element) => {
      element.classList.toggle("hidden-state", !state.currentUserData?.isDeveloper);
    });
  }

  function maskCpf(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function cpfToEmail(cpf) {
    return String(cpf || "").replace(/\D/g, "") + "@jdemito.com";
  }

  function redirectToLogin(message) {
    if (message) sessionStorage.setItem("ridLoginFeedback", message);
    const currentPage = window.location.pathname.split(/[\\/]/).pop() || "dashboard.html";
    const next = currentPage === "login.html" ? "dashboard.html" : currentPage;
    window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeStatus(status) {
    return String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function toDateSafe(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    const date = toDateSafe(value);
    return date ? date.toLocaleDateString("pt-BR") : "Sem data";
  }

  function formatDateTime(value) {
    const date = toDateSafe(value);
    return date ? date.toLocaleString("pt-BR") : "Sem data";
  }

  function formatRidNumber(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "-";
    return digits.padStart(5, "0");
  }

  function formatField(value, fallback = "-") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function getStatusTone(status) {
    const normalized = normalizeStatus(status);
    if (normalized === "CORRIGIDO") return "bg-green-50 text-green-700 border-green-100";
    if (normalized === "VENCIDO") return "bg-red-50 text-red-700 border-red-100";
    if (normalized === "ENCERRADO") return "bg-slate-100 text-slate-700 border-slate-200";
    return "bg-amber-50 text-amber-700 border-amber-100";
  }

  function resetFilters() {
    state.draftFilters = { status: "", risk: "", search: "" };
    state.filters = { ...state.draftFilters };
    dom.filterStatus.value = "";
    dom.filterRisk.value = "";
    dom.searchInput.value = "";
  }

  function getDesignatedRids() {
    const search = String(state.filters.search || "").trim().toLowerCase();

    return state.allRids
      .filter((rid) => !rid.deleted)
      .filter((rid) => rid.responsibleLeader === state.currentUser?.uid)
      .filter((rid) => {
        if (state.filters.status && normalizeStatus(rid.status) !== normalizeStatus(state.filters.status)) return false;
        if (state.filters.risk && normalizeStatus(rid.riskClassification) !== normalizeStatus(state.filters.risk)) return false;
        if (!search) return true;
        const haystack = [
          rid.ridNumber,
          rid.location,
          rid.description,
          rid.sector,
          rid.emitterName,
          rid.status,
          rid.riskClassification
        ].join(" ").toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => (toDateSafe(b.emissionDate || b.createdAt)?.getTime() || 0) - (toDateSafe(a.emissionDate || a.createdAt)?.getTime() || 0));
  }

  function renderStats(rids) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    dom.totalCount.textContent = String(rids.length);
    dom.pendingCount.textContent = String(rids.filter((rid) => {
      const status = normalizeStatus(rid.status);
      return status !== "CORRIGIDO" && status !== "ENCERRADO";
    }).length);
    dom.overdueCount.textContent = String(rids.filter((rid) => normalizeStatus(rid.status) === "VENCIDO").length);
    const correctedAll = rids.filter((rid) => {
      const status = normalizeStatus(rid.status);
      return status === "CORRIGIDO" || status === "ENCERRADO";
    });
    dom.correctedTotalCount.textContent = String(correctedAll.length);
    dom.correctedMonthCount.textContent = String(correctedAll.filter((rid) => {
      const date = toDateSafe(rid.conclusionDate || rid.updatedAt || rid.createdAt);
      return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length);
  }

  function renderList() {
    const rids = getDesignatedRids();
    renderStats(rids);
    dom.designatedCount.textContent = `${rids.length} registro${rids.length === 1 ? "" : "s"}`;

    if (!rids.length) {
      dom.designatedList.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">Voce nao possui RIDs designados no momento.</div>`;
      return;
    }

    dom.designatedList.innerHTML = rids.map((rid) => `
      <article class="designated-row rounded-2xl border border-gray-100 bg-white px-5 py-4" data-designated-rid="${escapeHtml(rid.id)}">
        <div class="grid grid-cols-1 md:grid-cols-[140px_160px_150px_minmax(0,1fr)_160px_150px] gap-4 items-center">
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">RID</div>
            <div class="text-sm font-bold text-gray-900">#${escapeHtml(formatRidNumber(rid.ridNumber))}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">Data de emissao</div>
            <div class="text-sm text-gray-700">${escapeHtml(formatDate(rid.emissionDate || rid.createdAt))}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">Setor</div>
            <div class="text-sm text-gray-700">${escapeHtml(formatField(rid.sector))}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">Local</div>
            <div class="text-sm text-gray-700">${escapeHtml(formatField(rid.location))}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">Status</div>
            <span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(rid.status)}">${escapeHtml(formatField(rid.status, "EM ANDAMENTO"))}</span>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 md:hidden">Emitente</div>
            <div class="text-sm text-gray-700">${escapeHtml(formatField(rid.emitterName))}</div>
          </div>
        </div>
      </article>
    `).join("");
  }

  function openModal(ridId) {
    const rid = state.allRids.find((item) => item.id === ridId);
    if (!rid) return;
    state.selectedRidId = ridId;
    dom.designatedModalTitle.textContent = `RID #${formatRidNumber(rid.ridNumber)}`;
    const fields = [
      ["Status", formatField(rid.status, "EM ANDAMENTO")],
      ["Emitente", formatField(rid.emitterName)],
      ["Responsavel designado", formatField(rid.responsibleLeaderName)],
      ["Setor", formatField(rid.sector)],
      ["Local", formatField(rid.location)],
      ["Tipo", formatField(rid.incidentType)],
      ["Origem da deteccao", formatField(rid.detectionOrigin)],
      ["Classificacao de risco", formatField(rid.riskClassification)],
      ["Data de emissao", formatDateTime(rid.emissionDate || rid.createdAt)],
      ["Prazo", formatDate(rid.deadline)],
      ["Data de conclusao", formatDate(rid.conclusionDate)],
      ["Descricao", formatField(rid.description)],
      ["Acao imediata", formatField(rid.immediateAction)],
      ["Acoes corretivas", formatField(rid.correctiveActions)]
    ];

    dom.designatedModalBody.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${fields.map(([label, value], index) => `
          <div class="${index >= 11 ? "md:col-span-2" : ""}">
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400">${escapeHtml(label)}</div>
            <div class="mt-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(value)}</div>
          </div>
        `).join("")}
      </div>
    `;
    dom.designatedModal.classList.add("visible");
  }

  function closeModal() {
    dom.designatedModal.classList.remove("visible");
    state.selectedRidId = null;
  }

  function showLogin() {
    dom.bootOverlay.classList.add("hidden-state");
    dom.authOverlay.classList.add("visible");
    dom.pageShell.classList.add("hidden-state");
    dom.loginFeedback.classList.add("hidden-state");
  }

  function showPage() {
    dom.bootOverlay.classList.add("hidden-state");
    dom.authOverlay.classList.remove("visible");
    dom.pageShell.classList.remove("hidden-state");
    updateRoleNavigation();
    dom.welcomeText.textContent = `Bem-vindo, ${state.currentUserData?.name || "gestor"}. Aqui voce acompanha os RIDs designados ao seu perfil.`;
    renderList();
    lucide.createIcons();
  }

  function listenRids() {
    if (typeof state.unsubRids === "function") state.unsubRids();
    state.unsubRids = db.collection("rids").onSnapshot((snapshot) => {
      state.allRids = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (state.currentUserData?.isAdmin || state.currentUserData?.isDeveloper) renderList();
    });
  }

  function bindEvents() {
    dom.loginCpf.addEventListener("input", () => {
      dom.loginCpf.value = maskCpf(dom.loginCpf.value);
    });

    dom.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      dom.loginFeedback.classList.add("hidden-state");
      dom.loginSubmitButton.disabled = true;
      dom.loginSubmitButton.textContent = "Entrando...";
      try {
        await auth.signInWithEmailAndPassword(cpfToEmail(dom.loginCpf.value), dom.loginPassword.value);
      } catch (error) {
        dom.loginFeedback.textContent = "CPF ou senha incorretos.";
        dom.loginFeedback.classList.remove("hidden-state");
      } finally {
        dom.loginSubmitButton.disabled = false;
        dom.loginSubmitButton.textContent = "Entrar";
      }
    });

    dom.logoutButton.addEventListener("click", async () => {
      await auth.signOut();
    });

    dom.toggleFiltersButton.addEventListener("click", () => {
      dom.filtersPanel.classList.toggle("visible");
    });

    dom.applyFiltersButton.addEventListener("click", () => {
      state.draftFilters = {
        status: dom.filterStatus.value || "",
        risk: dom.filterRisk.value || "",
        search: dom.searchInput.value || ""
      };
      state.filters = { ...state.draftFilters };
      renderList();
      dom.filtersPanel.classList.remove("visible");
    });

    dom.clearFiltersButton.addEventListener("click", () => {
      resetFilters();
      renderList();
      dom.filtersPanel.classList.remove("visible");
    });

    dom.designatedModalClose.addEventListener("click", closeModal);
    dom.designatedModal.addEventListener("click", (event) => {
      if (event.target === dom.designatedModal) closeModal();
    });

    document.addEventListener("click", (event) => {
      const card = event.target.closest("[data-designated-rid]");
      if (card) {
        openModal(card.getAttribute("data-designated-rid"));
        return;
      }

      if (!event.target.closest(".filter-popover")) {
        dom.filtersPanel.classList.remove("visible");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        dom.filtersPanel.classList.remove("visible");
      }
    });
  }

  auth.onAuthStateChanged(async (user) => {
    state.currentUser = user;

    if (!user) {
      state.currentUserData = null;
      state.allRids = [];
      if (typeof state.unsubRids === "function") state.unsubRids();
      state.unsubRids = null;
      closeModal();
      redirectToLogin();
      return;
    }

    const userDoc = await db.collection("users").doc(user.uid).get();
    state.currentUserData = userDoc.exists ? { id: user.uid, ...userDoc.data() } : null;

    if (!state.currentUserData?.isAdmin && !state.currentUserData?.isDeveloper) {
      sessionStorage.setItem("ridLoginFeedback", "Somente administradores ou desenvolvedores podem acessar esta tela.");
      await auth.signOut();
      return;
    }

    resetFilters();
    listenRids();
    showPage();
  });

  bindEvents();
  lucide.createIcons();
})();
