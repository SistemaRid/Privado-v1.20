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
  const ANNOUNCEMENTS_COLLECTION = db.collection("globalAnnouncements");

  const state = {
    currentUser: null,
    currentUserData: null
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
    profileNameStat: document.getElementById("profileNameStat"),
    profileRoleStat: document.getElementById("profileRoleStat"),
    profileSectorStat: document.getElementById("profileSectorStat"),
    goalStat: document.getElementById("goalStat"),
    goalMonthStat: document.getElementById("goalMonthStat"),
    profileName: document.getElementById("profileName"),
    profileCpf: document.getElementById("profileCpf"),
    profileEmail: document.getElementById("profileEmail"),
    profileRole: document.getElementById("profileRole"),
    profileUnit: document.getElementById("profileUnit"),
    profileSector: document.getElementById("profileSector"),
    passwordForm: document.getElementById("passwordForm"),
    currentPassword: document.getElementById("currentPassword"),
    newPassword: document.getElementById("newPassword"),
    confirmPassword: document.getElementById("confirmPassword"),
    passwordSubmitButton: document.getElementById("passwordSubmitButton"),
    passwordFeedback: document.getElementById("passwordFeedback"),
    goalNotice: document.getElementById("goalNotice"),
    goalForm: document.getElementById("goalForm"),
    goalMonth: document.getElementById("goalMonth"),
    goalYear: document.getElementById("goalYear"),
    goalValue: document.getElementById("goalValue"),
    loadGoalButton: document.getElementById("loadGoalButton"),
    saveGoalButton: document.getElementById("saveGoalButton"),
    goalFeedback: document.getElementById("goalFeedback"),
    announcementSection: document.getElementById("announcementSection"),
    announcementNotice: document.getElementById("announcementNotice"),
    announcementForm: document.getElementById("announcementForm"),
    announcementTitle: document.getElementById("announcementTitle"),
    announcementStartDate: document.getElementById("announcementStartDate"),
    announcementMessage: document.getElementById("announcementMessage"),
    announcementDays: document.getElementById("announcementDays"),
    announcementDailyLimit: document.getElementById("announcementDailyLimit"),
    announcementTarget: document.getElementById("announcementTarget"),
    announcementActive: document.getElementById("announcementActive"),
    loadAnnouncementButton: document.getElementById("loadAnnouncementButton"),
    clearAnnouncementButton: document.getElementById("clearAnnouncementButton"),
    saveAnnouncementButton: document.getElementById("saveAnnouncementButton"),
    announcementFeedback: document.getElementById("announcementFeedback"),
    announcementList: document.getElementById("announcementList")
  };

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

  function formatField(value, fallback = "-") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getRoleLabel(user) {
    if (user?.isDeveloper) return "Desenvolvedor";
    if (user?.isAdmin) return "Administrador";
    return "Usuario";
  }

  function getMonthLabel(month) {
    const labels = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return labels[Math.max(0, Number(month) - 1)] || "Mes";
  }

  function getMonthKey(month, year) {
    return `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
  }

  function formatAnnouncementWindow(data) {
    const startDate = String(data?.startDate || "").trim();
    const days = Number(data?.daysVisible || 0);
    if (!startDate || !days) return "janela não definida";
    return `${startDate} por ${days} dia${days === 1 ? "" : "s"}`;
  }

  function getAnnouncementTargetLabel(target) {
    if (target === "dashboard") return "somente PC";
    if (target === "mobile") return "somente mobile";
    return "PC e mobile";
  }

  function formatDateTime(value) {
    const date = value?.toDate ? value.toDate() : new Date(value || "");
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
  }

  function resetAnnouncementForm() {
    dom.announcementTitle.value = "";
    dom.announcementStartDate.value = "";
    dom.announcementMessage.value = "";
    dom.announcementDays.value = "";
    dom.announcementDailyLimit.value = "";
    dom.announcementTarget.value = "all";
    dom.announcementActive.checked = false;
  }

  function renderAnnouncementList(items) {
    if (!items.length) {
      dom.announcementList.innerHTML = '<div class="notice-card text-sm text-gray-500">Nenhum aviso cadastrado ainda.</div>';
      return;
    }

    dom.announcementList.innerHTML = items.map((item) => `
      <article class="border border-gray-200 rounded-2xl bg-white px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-gray-900">${formatField(item.title, "Sem título")}</div>
            <div class="text-xs text-gray-500 mt-1">${escapeHtml(getAnnouncementTargetLabel(item.target))} • ${escapeHtml(formatAnnouncementWindow(item))}</div>
          </div>
          <span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}">
            ${item.isActive ? "Ativo" : "Encerrado"}
          </span>
        </div>
        <div class="text-sm text-gray-600 mt-3 whitespace-pre-wrap">${escapeHtml(item.message || "")}</div>
        <div class="text-[11px] text-gray-400 mt-3">Atualizado em ${escapeHtml(formatDateTime(item.updatedAt))}</div>
        <div class="flex items-center justify-end gap-2 mt-3">
          <button type="button" data-duplicate-announcement="${escapeHtml(item.id)}" class="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">Usar como base</button>
          <button type="button" data-toggle-announcement="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="px-3 py-2 rounded-xl ${item.isActive ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"} text-xs font-semibold">
            ${item.isActive ? "Encerrar" : "Reativar"}
          </button>
        </div>
      </article>
    `).join("");
  }

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

  async function loadGoal() {
    const key = getMonthKey(dom.goalMonth.value, dom.goalYear.value);
    dom.goalFeedback.textContent = "Carregando meta...";
    try {
      const snap = await db.collection("goals").doc(key).get();
      if (snap.exists) {
        const value = snap.data()?.goal ?? "";
        dom.goalValue.value = value;
        dom.goalStat.textContent = String(value);
        dom.goalMonthStat.textContent = `${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}`;
        dom.goalNotice.textContent = `Meta manual cadastrada para ${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}.`;
        dom.goalFeedback.textContent = "Meta carregada com sucesso.";
      } else {
        dom.goalValue.value = "";
        dom.goalStat.textContent = "-";
        dom.goalMonthStat.textContent = `${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}`;
        dom.goalNotice.textContent = `Nenhuma meta manual registrada para ${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}.`;
        dom.goalFeedback.textContent = "Nao existe meta manual para esse mes.";
      }
    } catch (error) {
      dom.goalFeedback.textContent = "Nao foi possivel carregar a meta.";
    }
  }

  async function saveGoal(event) {
    event.preventDefault();
    if (!state.currentUserData?.isDeveloper) {
      dom.goalFeedback.textContent = "Apenas desenvolvedor pode salvar meta manual.";
      return;
    }

    const value = Number(dom.goalValue.value || 0);
    const key = getMonthKey(dom.goalMonth.value, dom.goalYear.value);
    dom.saveGoalButton.disabled = true;
    dom.goalFeedback.textContent = "Salvando meta...";
    try {
      await db.collection("goals").doc(key).set({
        goal: value,
        setBy: state.currentUser.uid,
        setAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      dom.goalStat.textContent = String(value);
      dom.goalMonthStat.textContent = `${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}`;
      dom.goalNotice.textContent = `Meta manual atualizada para ${getMonthLabel(dom.goalMonth.value)} de ${dom.goalYear.value}.`;
      dom.goalFeedback.textContent = "Meta salva com sucesso.";
    } catch (error) {
      dom.goalFeedback.textContent = "Nao foi possivel salvar a meta.";
    } finally {
      dom.saveGoalButton.disabled = false;
    }
  }

  async function loadAnnouncement() {
    dom.announcementFeedback.textContent = "Carregando aviso...";
    try {
      const snap = await ANNOUNCEMENTS_COLLECTION.orderBy("updatedAt", "desc").get();
      const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (!items.length) {
        resetAnnouncementForm();
        dom.announcementNotice.textContent = "Nenhum aviso global configurado no momento.";
        renderAnnouncementList([]);
        dom.announcementFeedback.textContent = "Ainda não existe aviso salvo.";
        return;
      }

      const latest = items[0];
      dom.announcementNotice.textContent = latest.isActive
        ? `Último aviso ativo para ${formatAnnouncementWindow(latest)} em ${getAnnouncementTargetLabel(latest.target)}.`
        : "O último aviso salvo está desativado.";
      renderAnnouncementList(items);
      dom.announcementFeedback.textContent = "Avisos carregados com sucesso.";
    } catch (error) {
      dom.announcementFeedback.textContent = "Não foi possível carregar o aviso.";
    }
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    if (!state.currentUserData?.isDeveloper) {
      dom.announcementFeedback.textContent = "Apenas desenvolvedor pode salvar aviso global.";
      return;
    }

    const title = String(dom.announcementTitle.value || "").trim();
    const message = String(dom.announcementMessage.value || "").trim();
    const startDate = String(dom.announcementStartDate.value || "").trim();
    const daysVisible = Number(dom.announcementDays.value || 0);
    const dailyLimit = Number(dom.announcementDailyLimit.value || 0);
    const target = String(dom.announcementTarget.value || "all");
    const isActive = dom.announcementActive.checked;

    if (!title || !message || !startDate || !daysVisible || !dailyLimit) {
      dom.announcementFeedback.textContent = "Preencha título, mensagem, data de início, dias e vezes por dia.";
      return;
    }

    dom.saveAnnouncementButton.disabled = true;
    dom.announcementFeedback.textContent = "Salvando aviso...";
    try {
      await ANNOUNCEMENTS_COLLECTION.add({
        title,
        message,
        startDate,
        daysVisible,
        dailyLimit,
        target,
        isActive,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: state.currentUser.uid,
        updatedByName: state.currentUserData.name || ""
      });
      resetAnnouncementForm();
      dom.announcementNotice.textContent = isActive
        ? `Aviso ativo para ${formatAnnouncementWindow({ startDate, daysVisible })} em ${getAnnouncementTargetLabel(target)}.`
        : "Aviso salvo, porém desativado.";
      dom.announcementFeedback.textContent = "Aviso salvo com sucesso.";
      await loadAnnouncement();
    } catch (error) {
      dom.announcementFeedback.textContent = "Não foi possível salvar o aviso.";
    } finally {
      dom.saveAnnouncementButton.disabled = false;
    }
  }

  async function toggleAnnouncementStatus(id, nextActive) {
    try {
      await ANNOUNCEMENTS_COLLECTION.doc(id).set({
        isActive: nextActive,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: state.currentUser.uid,
        updatedByName: state.currentUserData?.name || ""
      }, { merge: true });
      dom.announcementFeedback.textContent = nextActive ? "Aviso ativado." : "Aviso desativado.";
      await loadAnnouncement();
    } catch (error) {
      dom.announcementFeedback.textContent = "Não foi possível alterar o status do aviso.";
    }
  }

  async function duplicateAnnouncement(id) {
    try {
      const snap = await ANNOUNCEMENTS_COLLECTION.doc(id).get();
      if (!snap.exists) return;
      const data = snap.data() || {};
      dom.announcementTitle.value = String(data.title || "");
      dom.announcementStartDate.value = String(data.startDate || "");
      dom.announcementMessage.value = String(data.message || "");
      dom.announcementDays.value = data.daysVisible ? String(data.daysVisible) : "";
      dom.announcementDailyLimit.value = data.dailyLimit ? String(data.dailyLimit) : "";
      dom.announcementTarget.value = String(data.target || "all");
      dom.announcementActive.checked = Boolean(data.isActive);
      dom.announcementFeedback.textContent = "Campos preenchidos com base no aviso selecionado.";
    } catch (error) {
      dom.announcementFeedback.textContent = "Não foi possível carregar esse aviso para edição.";
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const currentPassword = String(dom.currentPassword.value || "").trim();
    const newPassword = String(dom.newPassword.value || "").trim();
    const confirmPassword = String(dom.confirmPassword.value || "").trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      dom.passwordFeedback.textContent = "Preencha senha atual, nova senha e confirmacao.";
      return;
    }

    if (newPassword.length < 6) {
      dom.passwordFeedback.textContent = "A nova senha precisa ter pelo menos 6 caracteres.";
      return;
    }

    if (newPassword !== confirmPassword) {
      dom.passwordFeedback.textContent = "A confirmacao da nova senha nao confere.";
      return;
    }

    if (!auth.currentUser) {
      dom.passwordFeedback.textContent = "Sessao invalida. Entre novamente.";
      return;
    }

    const email = auth.currentUser.email || formatField(state.currentUserData?.email, cpfToEmail(state.currentUserData?.cpf));
    dom.passwordSubmitButton.disabled = true;
    dom.passwordFeedback.textContent = "Atualizando senha...";

    try {
      const credential = firebase.auth.EmailAuthProvider.credential(email, currentPassword);
      await auth.currentUser.reauthenticateWithCredential(credential);
      await auth.currentUser.updatePassword(newPassword);
      dom.currentPassword.value = "";
      dom.newPassword.value = "";
      dom.confirmPassword.value = "";
      dom.passwordFeedback.textContent = "Senha alterada com sucesso.";
    } catch (error) {
      dom.passwordFeedback.textContent = "Nao foi possivel trocar a senha. Confira a senha atual.";
    } finally {
      dom.passwordSubmitButton.disabled = false;
    }
  }

  function renderProfile() {
    const user = state.currentUserData || {};
    dom.welcomeText.textContent = `Bem-vindo, ${formatField(user.name, "Usuario")}. Aqui voce acompanha suas configuracoes da gestao.`;
    dom.profileNameStat.textContent = formatField(user.name, "-");
    dom.profileRoleStat.textContent = getRoleLabel(user);
    dom.profileSectorStat.textContent = formatField(user.sector, "-");
    dom.profileName.textContent = formatField(user.name, "-");
    dom.profileCpf.textContent = formatField(user.cpf, "-");
    dom.profileEmail.textContent = formatField(user.email, `${String(user.cpf || "").replace(/\D/g, "")}@jdemito.com`);
    dom.profileRole.textContent = formatField(user.role || getRoleLabel(user), getRoleLabel(user));
    dom.profileUnit.textContent = formatField(user.unit, "-");
    dom.profileSector.textContent = formatField(user.sector, "-");

    if (user.isDeveloper) {
      dom.goalForm.classList.remove("hidden-state");
      dom.announcementSection.classList.remove("hidden-state");
      dom.goalNotice.textContent = "Defina a meta manual que sera usada nas telas administrativas.";
      dom.goalFeedback.textContent = "";
    } else {
      dom.goalForm.classList.add("hidden-state");
      dom.announcementSection.classList.add("hidden-state");
      dom.goalNotice.textContent = "A visualizacao de metas manuais e restrita ao perfil de desenvolvedor.";
      dom.goalFeedback.textContent = "";
      dom.goalStat.textContent = "-";
    }
  }

  function bindListeners() {
    dom.loginCpf.addEventListener("input", () => {
      dom.loginCpf.value = maskCpf(dom.loginCpf.value);
    });

    dom.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      dom.loginFeedback.classList.add("hidden-state");
      dom.loginSubmitButton.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(cpfToEmail(dom.loginCpf.value), dom.loginPassword.value);
      } catch (error) {
        dom.loginFeedback.textContent = "Nao foi possivel entrar. Confira CPF e senha.";
        dom.loginFeedback.classList.remove("hidden-state");
      } finally {
        dom.loginSubmitButton.disabled = false;
      }
    });

    dom.logoutButton.addEventListener("click", async () => {
      await auth.signOut();
    });

    dom.loadGoalButton.addEventListener("click", loadGoal);
    dom.goalForm.addEventListener("submit", saveGoal);
    dom.passwordForm.addEventListener("submit", changePassword);
    dom.loadAnnouncementButton.addEventListener("click", loadAnnouncement);
    dom.clearAnnouncementButton.addEventListener("click", () => {
      resetAnnouncementForm();
      dom.announcementFeedback.textContent = "Campos do aviso limpos.";
    });
    dom.announcementForm.addEventListener("submit", saveAnnouncement);
    dom.announcementList.addEventListener("click", (event) => {
      const toggleButton = event.target.closest("[data-toggle-announcement]");
      if (toggleButton) {
        toggleAnnouncementStatus(toggleButton.dataset.toggleAnnouncement, toggleButton.dataset.nextActive === "true");
        return;
      }

      const duplicateButton = event.target.closest("[data-duplicate-announcement]");
      if (duplicateButton) {
        duplicateAnnouncement(duplicateButton.dataset.duplicateAnnouncement);
      }
    });
  }

  async function handleAuthenticatedUser(user) {
    state.currentUser = user;
    const userDoc = await db.collection("users").doc(user.uid).get();
    state.currentUserData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
    updateRoleNavigation();
    renderProfile();
    dom.authOverlay.classList.remove("visible");
    dom.pageShell.classList.remove("hidden-state");
    dom.bootOverlay.classList.add("hidden-state");
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
    await loadGoal();
    if (state.currentUserData?.isDeveloper) {
      await loadAnnouncement();
    }
  }

  function init() {
    const now = new Date();
    dom.goalMonth.value = String(now.getMonth() + 1);
    dom.goalYear.value = String(now.getFullYear());
    bindListeners();
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        state.currentUser = null;
        state.currentUserData = null;
        redirectToLogin();
        return;
      }

      dom.bootOverlay.classList.remove("hidden-state");
      await handleAuthenticatedUser(user);
    });
  }

  init();
})();
