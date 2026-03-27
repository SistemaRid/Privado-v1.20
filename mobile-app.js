(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDAcuwo5FZBs5013klfSMfWkQZbFjqYpbw",
    authDomain: "novo-rid-dezembro.firebaseapp.com",
    projectId: "novo-rid-dezembro",
    storageBucket: "novo-rid-dezembro.firebasestorage.app",
    messagingSenderId: "629184938088",
    appId: "1:629184938088:web:3821e7ea07897ae655fbdd"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const db = firebase.firestore();

  const STORAGE_KEYS = {
    auth: "ridMobileOfflineAuth",
    leaders: "ridMobileOfflineLeaders"
  };

  const PAGE_SIZE = 8;
  const CONNECTIVITY_CHECK_INTERVAL = 30000;

  const state = {
    online: navigator.onLine,
    currentUser: null,
    currentUserData: null,
    currentPage: 1,
    cachedRids: [],
    pendingRids: [],
    pendingMaintenances: [],
    leaders: loadStorage(STORAGE_KEYS.leaders, []),
    modalOpen: false,
    maintenanceModalOpen: false,
    ridDraft: null,
    maintenanceDraft: null,
    selectedRidId: null,
    booting: true
  };

  const app = document.getElementById("app");
  const toastRoot = document.getElementById("toast-root");

  function loadStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("Falha ao ler storage:", key, error);
      return fallback;
    }
  }

  function saveStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function captureFormDraft(form) {
    const formData = new FormData(form);
    const draft = {};
    for (const [key, value] of formData.entries()) {
      draft[key] = value;
    }
    return draft;
  }

  function restoreFormDraft(form, draft) {
    if (!form || !draft) return;

    Object.entries(draft).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (!field || typeof field.value === "undefined") return;
      field.value = value;
    });
  }

  function bindDraftPersistence(formId, draftKey) {
    const form = document.getElementById(formId);
    if (!form) return;

    restoreFormDraft(form, state[draftKey]);

    const persistDraft = () => {
      state[draftKey] = captureFormDraft(form);
    };

    form.addEventListener("input", persistDraft);
    form.addEventListener("change", persistDraft);
  }

  function pendingKey(uid) {
    return `ridMobilePending_${uid}`;
  }

  function cacheKey(uid) {
    return `ridMobileCache_${uid}`;
  }

  function syncKey(uid) {
    return `ridMobileLastSync_${uid}`;
  }

  function maintenanceKey(uid) {
    return `ridMobileMaintenances_${uid}`;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString("pt-BR") : "Sem data";
  }

  function formatDateTime(value) {
    const date = toDate(value);
    return date ? date.toLocaleString("pt-BR") : "Sem data";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeCpf(cpf) {
    return String(cpf || "").replace(/\D/g, "");
  }

  function maskCpf(cpf) {
    const digits = normalizeCpf(cpf).slice(0, 11);
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  function cpfToEmail(cpf) {
    return `${normalizeCpf(cpf)}@jdemito.com`;
  }

  async function sha256(text) {
    const payload = new TextEncoder().encode(String(text || ""));
    const digest = await crypto.subtle.digest("SHA-256", payload);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function clearAutoFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && typeof active.blur === "function" && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) {
        active.blur();
      }
    });
  }

  function getOfflineAuth() {
    return loadStorage(STORAGE_KEYS.auth, null);
  }

  function setOfflineAuth(payload) {
    saveStorage(STORAGE_KEYS.auth, payload);
  }

  function clearOfflineAuth() {
    localStorage.removeItem(STORAGE_KEYS.auth);
  }

  function setBooting(booting) {
    state.booting = booting;
    renderBootOverlay();
  }

  function renderBootOverlay() {
    const existing = document.getElementById("boot-overlay");
    if (!state.booting) {
      existing?.remove();
      return;
    }

    if (existing) return;

    const overlay = document.createElement("div");
    overlay.id = "boot-overlay";
    overlay.className = "boot-overlay";
    overlay.innerHTML = `
      <div class="boot-card">
        <div class="boot-spinner"></div>
        <p class="boot-title">Carregando dados</p>
        <p class="boot-copy">Aguarde enquanto o app restaura sua sessão e prepara os dados offline.</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function loadUserCache(uid) {
    state.cachedRids = loadStorage(cacheKey(uid), []);
    state.pendingRids = loadStorage(pendingKey(uid), []);
    state.pendingMaintenances = loadStorage(maintenanceKey(uid), []);
  }

  function persistUserCache() {
    if (!state.currentUser?.uid) return;
    saveStorage(cacheKey(state.currentUser.uid), state.cachedRids);
    saveStorage(pendingKey(state.currentUser.uid), state.pendingRids);
    saveStorage(maintenanceKey(state.currentUser.uid), state.pendingMaintenances);
    localStorage.setItem(syncKey(state.currentUser.uid), new Date().toISOString());
  }

  function getLastSyncAt() {
    if (!state.currentUser?.uid) return null;
    return localStorage.getItem(syncKey(state.currentUser.uid));
  }

  function setLeaders(leaders) {
    state.leaders = leaders;
    saveStorage(STORAGE_KEYS.leaders, leaders);
  }

  function hydrateCachedLeaders() {
    state.leaders = loadStorage(STORAGE_KEYS.leaders, []);
    return state.leaders;
  }

  function sortRidItems(items) {
    return [...items].sort((a, b) => {
      const aTime = toDate(a.createdAt || a.localCreatedAt || a.emissionDate)?.getTime() || 0;
      const bTime = toDate(b.createdAt || b.localCreatedAt || b.emissionDate)?.getTime() || 0;
      return bTime - aTime;
    });
  }

  function getCombinedRids() {
    const remote = (state.cachedRids || []).map((item) => ({ ...item, isPendingLocal: false }));
    const pending = (state.pendingRids || []).map((item) => ({ ...item, isPendingLocal: true }));
    return sortRidItems([...pending, ...remote]);
  }

  function getPaginatedRids() {
    const items = getCombinedRids();
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    state.currentPage = Math.min(Math.max(state.currentPage, 1), totalPages);
    const start = (state.currentPage - 1) * PAGE_SIZE;
    return {
      items: items.slice(start, start + PAGE_SIZE),
      totalItems: items.length,
      totalPages,
      page: state.currentPage
    };
  }

  function isCorrected(status) {
    return String(status || "").toUpperCase() === "CORRIGIDO";
  }

  function isOverdue(status) {
    const normalized = String(status || "").toUpperCase();
    return normalized === "VENCIDO" || normalized.includes("ANDAMENTO");
  }

  function calcStats() {
    const rids = getCombinedRids();
    return {
      total: rids.length,
      corrected: rids.filter((item) => isCorrected(item.status)).length,
      pendingSync: rids.filter((item) => item.isPendingLocal).length,
      overdue: rids.filter((item) => !item.isPendingLocal && isOverdue(item.status)).length
    };
  }

  function getPersonalMonthlyGoal(userData) {
    if (userData?.isAdmin || userData?.isDeveloper) return 8;
    return 4;
  }

  function calcCurrentMonthProgress() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const emittedThisMonth = getCombinedRids().filter((item) => {
      const date = toDate(item.emissionDate || item.localCreatedAt || item.createdAt);
      return date && date.getMonth() === month && date.getFullYear() === year;
    }).length;
    const goal = getPersonalMonthlyGoal(state.currentUserData);

    return {
      emittedThisMonth,
      goal,
      hitGoal: emittedThisMonth >= goal
    };
  }

  async function detectActualConnectivity() {
    if (!navigator.onLine) return false;

    try {
      await fetch(`https://www.gstatic.com/generate_204?network-check=1&t=${Date.now()}`, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store"
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function syncConnectivityState() {
    const actualOnline = await detectActualConnectivity();
    const previous = state.online;
    state.online = actualOnline;

    if (previous !== actualOnline) {
      if (!state.currentUser) {
        renderLogin();
      } else {
        renderApp();
      }
    }

    return actualOnline;
  }

  function getBadgeClass(status, isPendingLocal) {
    if (isPendingLocal) return "pending";
    const normalized = String(status || "").toUpperCase();
    if (normalized === "CORRIGIDO") return "corrected";
    if (normalized === "ENCERRADO" || normalized === "EXCLUIDO") return "closed";
    if (normalized === "VENCIDO" || normalized.includes("ANDAMENTO")) return "overdue";
    return "synced";
  }

  function getStatusLabel(item) {
    if (item.isPendingLocal) return "PENDENTE DE SINCRONIZAÇÃO";
    return String(item.status || "SEM STATUS").toUpperCase();
  }

  function formatRidNumber(ridNumber) {
    const digits = String(ridNumber ?? "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.padStart(5, "0");
  }

  function serializeRid(doc) {
    const data = doc.data();
    return {
      id: doc.id,
      ridNumber: data.ridNumber || null,
      emitterId: data.emitterId || null,
      emitterName: data.emitterName || "",
      emitterCpf: data.emitterCpf || "",
      contractType: data.contractType || "",
      unit: data.unit || "",
      sector: data.sector || "",
      incidentType: data.incidentType || "",
      detectionOrigin: data.detectionOrigin || "",
      location: data.location || "",
      description: data.description || "",
      riskClassification: data.riskClassification || "",
      immediateAction: data.immediateAction || "",
      correctiveActions: data.correctiveActions || "",
      status: data.status || "VENCIDO",
      responsibleLeader: data.responsibleLeader || "",
      responsibleLeaderName: data.responsibleLeaderName || "",
      createdAt: toDate(data.createdAt)?.toISOString() || null,
      emissionDate: toDate(data.emissionDate)?.toISOString() || null,
      conclusionDate: toDate(data.conclusionDate)?.toISOString() || null,
      deleted: Boolean(data.deleted)
    };
  }

  async function refreshLeadersCache() {
    if (!state.online) {
      return hydrateCachedLeaders();
    }

    try {
      const leadersSnapshot = await db.collection("leaders_public").get();
      const leaders = leadersSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((leader) => leader.isDeveloper !== true)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

      setLeaders(leaders);
      return leaders;
    } catch (error) {
      console.warn("Falha ao atualizar líderes, usando cache local:", error);
      return hydrateCachedLeaders();
    }
  }

  async function cacheRemoteData() {
    if (!state.online || !state.currentUser?.uid || !state.currentUserData) return;

    const docs = [];
    const signatures = new Set();
    const pushUnique = (item) => {
      const signature = item.ridNumber ? `RID:${item.ridNumber}` : `DOC:${item.id}`;
      if (signatures.has(signature)) return;
      signatures.add(signature);
      docs.push(item);
    };

    const queries = [db.collection("rids").where("emitterId", "==", state.currentUser.uid).get()];
    if (state.currentUserData.cpf) {
      queries.push(db.collection("rids").where("emitterCpf", "==", state.currentUserData.cpf).get());
    }

    const snapshots = await Promise.all(queries);
    snapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => pushUnique(serializeRid(doc))));

    state.cachedRids = sortRidItems(docs);
    await refreshLeadersCache();
    persistUserCache();
  }

  async function getNextRidNumberSafe() {
    const counterRef = db.collection("counters").doc("rids");
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const data = snapshot.exists ? snapshot.data() || {} : {};
      const current = typeof data.lastNumber === "number"
        ? data.lastNumber
        : (typeof data.value === "number" ? data.value : 0);
      const next = current + 1;
      transaction.set(counterRef, {
        lastNumber: next,
        value: typeof data.value === "number" ? data.value : 0
      }, { merge: true });
      return next;
    });
  }

  function buildRidPayload(formData) {
    const leaderId = formData.get("responsibleLeader") || "";
    const leader = state.leaders.find((item) => item.id === leaderId);
    const status = String(formData.get("status") || "").toUpperCase();

    return {
      emitterId: state.currentUser.uid,
      emitterName: state.currentUserData.name,
      emitterCpf: state.currentUserData.cpf,
      contractType: formData.get("contractType"),
      unit: formData.get("unit"),
      sector: state.currentUserData.sector || "",
      emissionDate: formData.get("emissionDate"),
      incidentType: formData.get("incidentType"),
      detectionOrigin: formData.get("detectionOrigin"),
      location: formData.get("location"),
      description: formData.get("description"),
      riskClassification: formData.get("riskClassification"),
      immediateAction: formData.get("immediateAction"),
      status,
      responsibleLeader: leaderId,
      responsibleLeaderName: leader?.name || "",
      localCreatedAt: new Date().toISOString()
    };
  }

  async function submitRidToFirestore(payload) {
    const ridNumber = await getNextRidNumberSafe();
    const isCorrectedNow = payload.status === "CORRIGIDO";
    const [year, month, day] = String(payload.emissionDate || "").split("-").map(Number);
    const emissionDate = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);

    await db.collection("rids").add({
      ridNumber,
      emitterId: payload.emitterId,
      emitterName: payload.emitterName,
      emitterCpf: payload.emitterCpf,
      contractType: payload.contractType,
      unit: payload.unit,
      sector: payload.sector,
      emissionDate: firebase.firestore.Timestamp.fromDate(emissionDate),
      incidentType: payload.incidentType,
      detectionOrigin: payload.detectionOrigin,
      location: payload.location,
      description: payload.description,
      riskClassification: payload.riskClassification,
      immediateAction: payload.immediateAction,
      status: isCorrectedNow ? "CORRIGIDO" : "VENCIDO",
      responsibleLeader: payload.responsibleLeader || "",
      responsibleLeaderName: payload.responsibleLeaderName || "",
      emailSent: false,
      emailSentAt: null,
      lastNotifiedLeader: null,
      deadline: null,
      conclusion: null,
      correctiveActions: null,
      observations: null,
      conclusionDate: isCorrectedNow ? firebase.firestore.FieldValue.serverTimestamp() : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function savePendingRid(payload) {
    state.pendingRids.unshift({
      ...payload,
      localId: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      pendingSync: true,
      localCreatedAt: new Date().toISOString()
    });

    persistUserCache();
  }

  function buildMaintenancePayload(formData) {
    const assignedTo = formData.get("assignedTo") || "";
    const leader = state.leaders.find((item) => item.id === assignedTo);

    return {
      requesterId: state.currentUser.uid,
      requesterName: state.currentUserData.name,
      requesterSector: state.currentUserData.sector || "",
      kind: formData.get("kind"),
      assignedTo,
      assignedToName: leader?.name || "",
      item: formData.get("item"),
      location: formData.get("location"),
      priority: formData.get("priority"),
      description: formData.get("description"),
      localCreatedAt: new Date().toISOString()
    };
  }

  async function submitMaintenanceToFirestore(payload) {
    await db.collection("maintenances").add({
      maintenanceNumber: `MAN-${Date.now()}`,
      requesterId: payload.requesterId,
      requesterName: payload.requesterName,
      requesterSector: payload.requesterSector,
      equipment: payload.item,
      sector: payload.requesterSector,
      location: payload.location,
      description: `[${payload.kind}] ${payload.description}`,
      priority: payload.priority,
      status: "ABERTA",
      assignedTo: payload.assignedTo || "",
      assignedToName: payload.assignedToName || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      source: "mobile-offline"
    });
  }

  function savePendingMaintenance(payload) {
    state.pendingMaintenances.unshift({
      ...payload,
      localId: `maint-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    });
    persistUserCache();
  }

  async function syncPendingMaintenances() {
    if (!state.online || !state.pendingMaintenances.length) return;

    const pendingItems = [...state.pendingMaintenances];
    for (const item of pendingItems) {
      try {
        await submitMaintenanceToFirestore(item);
        state.pendingMaintenances = state.pendingMaintenances.filter((entry) => entry.localId !== item.localId);
      } catch (error) {
        console.error("Falha ao sincronizar melhoria pendente:", error);
      }
    }

    persistUserCache();
  }

  async function handleMaintenanceSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(form);
      if (!String(formData.get("assignedTo") || "").trim()) {
        showToast("Selecione um líder responsável.", "error");
        submitButton.disabled = false;
        return;
      }

      const payload = buildMaintenancePayload(formData);
      if (state.online) {
        await submitMaintenanceToFirestore(payload);
        showToast("Sugestão enviada com sucesso.", "success");
      } else {
        savePendingMaintenance(payload);
        showToast("Sugestão salva no celular. Ela será enviada quando a internet voltar.", "info");
      }

      state.maintenanceDraft = null;
      closeModal();
    } catch (error) {
      console.error("Erro ao salvar melhoria:", error);
      showToast(`Erro ao salvar sugestão: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function handleRidSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const status = String(formData.get("status") || "").toUpperCase();
    const leaderId = formData.get("responsibleLeader") || "";

    if (status === "VENCIDO" && !leaderId) {
      showToast("Para RID vencido, selecione um líder.", "error");
      return;
    }

    submitButton.disabled = true;
    const payload = buildRidPayload(formData);

    try {
      savePendingRid(payload);
      showToast(
        state.online
          ? "RID salva no celular. Clique em sincronizar para enviar."
          : "RID salva no celular. Sincronize quando voltar a internet.",
        "info"
      );
      state.currentPage = 1;
      state.ridDraft = null;
      closeModal();
    } catch (error) {
      console.error("Erro ao enviar RID:", error);
      showToast(`Erro ao salvar RID: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function syncPendingRid(localId) {
    const pending = state.pendingRids.find((item) => item.localId === localId);
    if (!pending) return;
    if (!state.online) {
      showToast("Conecte-se à internet para sincronizar.", "error");
      return;
    }

    try {
      await submitRidToFirestore(pending);
      state.pendingRids = state.pendingRids.filter((item) => item.localId !== localId);
      await cacheRemoteData();
      persistUserCache();
      renderApp();
      showToast("RID sincronizada com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao sincronizar RID:", error);
      showToast(`Falha ao sincronizar: ${error.message}`, "error");
    }
  }

  async function syncAllPendingRids() {
    if (!state.pendingRids.length) {
      showToast("Nenhum RID pendente para sincronizar.", "info");
      return;
    }

    if (!state.online) {
      showToast("Você está offline.", "error");
      return;
    }

    for (const item of [...state.pendingRids]) {
      await syncPendingRid(item.localId);
    }
  }

  async function refreshData() {
    if (!state.online) {
      showToast("Atualização disponível somente online.", "error");
      return;
    }

    try {
      await cacheRemoteData();
      renderApp();
      showToast("RIDs atualizados e cache local renovado.", "success");
    } catch (error) {
      console.error("Falha ao atualizar dados:", error);
      showToast(`Erro ao atualizar: ${error.message}`, "error");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await syncConnectivityState();
      const cpf = form.cpf.value;
      const password = form.password.value;

      if (state.online) {
        const email = cpfToEmail(cpf);
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const userDoc = await db.collection("users").doc(credential.user.uid).get();
        if (!userDoc.exists) {
          throw new Error("Usuário não encontrado na base.");
        }

        state.currentUser = { uid: credential.user.uid };
        state.currentUserData = { id: credential.user.uid, ...userDoc.data() };
        loadUserCache(credential.user.uid);

        setOfflineAuth({
          uid: credential.user.uid,
          cpf: normalizeCpf(cpf),
          passwordHash: await sha256(password),
          userData: state.currentUserData
        });

        await cacheRemoteData();
        renderApp();
        showToast("Login realizado.", "success");
      } else {
        const offlineAuth = getOfflineAuth();
        if (!offlineAuth) {
          throw new Error("Sem cache local. Faça o primeiro login com internet.");
        }

        const cpfMatches = offlineAuth.cpf === normalizeCpf(cpf);
        const passwordMatches = offlineAuth.passwordHash === await sha256(password);
        if (!cpfMatches || !passwordMatches) {
          throw new Error("CPF ou senha não conferem com o cache local.");
        }

        state.currentUser = { uid: offlineAuth.uid };
        state.currentUserData = offlineAuth.userData;
        loadUserCache(offlineAuth.uid);
        renderApp();
        showToast("Modo offline liberado com dados locais.", "info");
      }
    } catch (error) {
      console.error("Erro de login:", error);
      showToast(error.message || "Falha ao entrar.", "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function logout() {
    try {
      if (state.online) {
        await auth.signOut();
      }
    } catch (error) {
      console.warn("Falha ao sair do Firebase:", error);
    } finally {
      clearOfflineAuth();
      state.currentUser = null;
      state.currentUserData = null;
      state.cachedRids = [];
      state.pendingRids = [];
      state.pendingMaintenances = [];
      state.currentPage = 1;
      state.modalOpen = false;
      state.maintenanceModalOpen = false;
      renderLogin();
    }
  }

  function openRidModal() {
    state.modalOpen = true;
    state.maintenanceModalOpen = false;
    state.selectedRidId = null;
    renderApp();
  }

  function openMaintenanceModal() {
    state.maintenanceModalOpen = true;
    state.modalOpen = false;
    state.selectedRidId = null;
    renderApp();
  }

  function closeModal() {
    state.modalOpen = false;
    state.maintenanceModalOpen = false;
    state.ridDraft = null;
    state.maintenanceDraft = null;
    state.selectedRidId = null;
    renderApp();
  }

  function openRidDetails(ridId) {
    state.selectedRidId = ridId;
    renderApp();
  }

  function getSelectedRid() {
    if (!state.selectedRidId) return null;
    return getCombinedRids().find((item) => {
      if (item.localId && item.localId === state.selectedRidId) return true;
      return item.id === state.selectedRidId;
    }) || null;
  }

  function renderLogin() {
    const offlineAuth = getOfflineAuth();
    const offlineReady = Boolean(offlineAuth?.uid && offlineAuth?.cpf);
    app.innerHTML = `
      <main class="app-shell">
        <section class="login-shell">
          <article class="hero-card">
            <div class="brand-mark">
              <img class="brand-mark-image" src="icon-192.png" alt="RID">
            </div>
            <h1 class="hero-title">Sistema RID's</h1>
            <p class="hero-copy">
              Fa&ccedil;a o primeiro acesso com internet para baixar seus RIDs. Depois disso, o mesmo CPF e senha podem liberar o modo offline neste aparelho.
            </p>
            <div class="row-actions">
              <span class="offline-ready-pill ${offlineReady ? "ready" : "not-ready"}">
                ${offlineReady ? "Pronto para abrir sem internet" : "Ainda n&atilde;o est&aacute; pronto sem internet"}
              </span>
              ${offlineAuth ? `<span class="tiny-pill online">Cache pronto para ${maskCpf(offlineAuth.cpf)}</span>` : ""}
            </div>
            <form id="login-form" class="form-grid">
              <div class="field">
                <label for="cpf">CPF</label>
                <input id="cpf" name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" required>
              </div>
              <div class="field">
                <label for="password">Senha</label>
                <input id="password" name="password" type="password" inputmode="numeric" maxlength="6" placeholder="******" required>
              </div>
              <div class="actions">
                <button class="btn btn-primary" type="submit">Entrar</button>
              </div>
              <p class="helper-text">
                Sem internet e sem cache anterior, o login offline n&atilde;o consegue validar o usu&aacute;rio.
              </p>
            </form>
            <span class="status-pill login-status-pill ${state.online ? "online" : "offline"}">${state.online ? "Online" : "Offline"}</span>
          </article>
        </section>
      </main>
    `;

    document.getElementById("login-form").addEventListener("submit", handleLogin);
    clearAutoFocus();
  }

  function renderRidCard(item) {
    const badgeClass = getBadgeClass(item.status, item.isPendingLocal);
    const immediateAction = String(item.immediateAction || "").trim();
    const correctiveActions = String(item.correctiveActions || "").trim();
    const correctedAtCreation =
      String(item.status || "").toUpperCase() === "CORRIGIDO" &&
      !correctiveActions &&
      immediateAction;
    const syncButton = item.isPendingLocal ? `
      <button
        class="btn btn-small ${state.online ? "btn-primary" : "btn-soft"}"
        data-sync-rid="${escapeHtml(item.localId)}"
        ${state.online ? "" : "disabled"}
      >
        Sincronizar
      </button>
    ` : "";

    return `
      <article class="rid-card" data-open-rid="${escapeHtml(item.localId || item.id)}" style="cursor:pointer;">
        <div class="rid-head">
          <div>
            <h3 class="rid-title">${item.ridNumber ? `RID #${escapeHtml(formatRidNumber(item.ridNumber))}` : "RID pendente"}</h3>
          </div>
          <span class="badge ${badgeClass}">${getStatusLabel(item)}</span>
        </div>
        <div class="rid-meta">
          <span class="muted">${formatDate(item.emissionDate || item.localCreatedAt || item.createdAt)}</span>
        </div>
        ${correctedAtCreation ? `
          <p class="rid-local-note" style="color:#8a6717;">
            <strong>Ação imediata:</strong> ${escapeHtml(immediateAction)}
          </p>
        ` : ""}
        ${correctiveActions ? `
          <p class="rid-local-note" style="color:#35653b;">
            <strong>Ação corretiva:</strong> ${escapeHtml(correctiveActions)}
          </p>
        ` : ""}
        <div class="rid-foot">
          ${item.isPendingLocal
            ? '<span class="muted">Salva localmente no aparelho.</span>'
            : '<span></span>'}
          ${syncButton}
        </div>
      </article>
    `;
  }

  function renderPagination(pageData) {
    if (pageData.totalPages <= 1) return "";

    return `
      <div class="pagination">
        <button class="btn btn-soft btn-small" data-page-nav="prev" ${pageData.page === 1 ? "disabled" : ""}>Anterior</button>
        <span class="muted">Página ${pageData.page} de ${pageData.totalPages}</span>
        <button class="btn btn-soft btn-small" data-page-nav="next" ${pageData.page === pageData.totalPages ? "disabled" : ""}>Próxima</button>
      </div>
    `;
  }

  function renderRidModal() {
    if (!state.modalOpen) return "";

    const today = new Date().toISOString().slice(0, 10);
    const leaderOptions = state.leaders.length
      ? state.leaders.map((leader) => `<option value="${escapeHtml(leader.id)}">${escapeHtml(leader.name || "Líder")}</option>`).join("")
      : '<option value="">Nenhum líder disponível no cache</option>';

    return `
      <div class="modal-root" id="rid-modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>Novo RID</h2>
            <button type="button" class="close-btn" data-close-modal="true">×</button>
          </div>
          <form id="rid-form" class="form-grid">
            <div class="field">
              <label>Emitente</label>
              <input value="${escapeHtml(state.currentUserData.name || "")}" readonly>
            </div>
            <div class="field">
              <label>Tipo de contrato</label>
              <select name="contractType" required>
                <option value="">Selecione...</option>
                <option value="Funcionário">Funcionário</option>
                <option value="Terceiro Contratado">Terceiro Contratado</option>
                <option value="Terceiro Eventual">Terceiro Eventual</option>
                <option value="Visitante">Visitante</option>
              </select>
            </div>
            <div class="field">
              <label>Unidade</label>
              <select name="unit" required>
                <option value="">Selecione...</option>
                <option value="CALTINS">CALTINS</option>
                <option value="CALTINS XAMBIOA II">CALTINS XAMBIOA II</option>
                <option value="FORMACAL">FORMACAL</option>
                <option value="GESSOTINS">GESSOTINS</option>
                <option value="MINERAX">MINERAX</option>
                <option value="NATICAL">NATICAL</option>
                <option value="SUPERCAL">SUPERCAL</option>
              </select>
            </div>
            <div class="field">
              <label>Data</label>
              <input type="date" name="emissionDate" value="${today}" required>
            </div>
            <div class="field">
              <label>Incidente ou desvio</label>
              <select name="incidentType" required>
                <option value="">Selecione...</option>
                <option value="Condição de Risco">Condição de Risco</option>
                <option value="Desvio Comportamental">Desvio Comportamental</option>
                <option value="Dano Material">Dano Material</option>
                <option value="Quase acidente">Quase acidente</option>
              </select>
            </div>
            <div class="field">
              <label>Origem da detecção</label>
              <select name="detectionOrigin" required>
                <option value="">Selecione...</option>
                <option value="CSL">CSL</option>
                <option value="Inspeção programada">Inspeção programada</option>
                <option value="Inspeção não programada">Inspeção não programada</option>
                <option value="Observação Comportamental">Observação Comportamental</option>
                <option value="Constatação espontânea">Constatação espontânea</option>
                <option value="Auditoria">Auditoria</option>
              </select>
            </div>
            <div class="field">
              <label>Local</label>
              <input name="location" required placeholder="Local da ocorrência">
            </div>
            <div class="field">
              <label>Descrição</label>
              <textarea name="description" required placeholder="Descreva a ocorrência"></textarea>
            </div>
            <div class="field">
              <label>Classificação de risco</label>
              <select name="riskClassification" required>
                <option value="">Selecione...</option>
                <option value="Baixo">Baixo</option>
                <option value="Médio">Médio</option>
                <option value="Alto">Alto</option>
                <option value="Crítico">Crítico</option>
              </select>
            </div>
            <div class="field">
              <label>Ação imediata</label>
              <textarea name="immediateAction" required placeholder="Descreva a ação imediata"></textarea>
            </div>
            <div class="field">
              <label>Status inicial</label>
              <select name="status" required>
                <option value="">Selecione...</option>
                <option value="CORRIGIDO">CORRIGIDO</option>
                <option value="VENCIDO">VENCIDO</option>
              </select>
            </div>
            <div class="field">
              <label>Líder responsável</label>
              <select name="responsibleLeader">
                <option value="">Designar depois</option>
                ${leaderOptions}
              </select>
              <p class="helper-text">
                Se o status for VENCIDO, o líder é obrigatório. A lista é carregada do cache local quando estiver offline.
              </p>
            </div>
            <div class="actions">
              <button class="btn btn-success" type="submit">Salvar no celular</button>
              <button class="btn btn-soft" type="button" data-close-modal="true">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderMaintenanceModal() {
    if (!state.maintenanceModalOpen) return "";

    const leaderOptions = state.leaders.length
      ? state.leaders.map((leader) => `<option value="${escapeHtml(leader.id)}">${escapeHtml(leader.name || "Líder")}</option>`).join("")
      : '<option value="">Nenhum líder disponível no cache</option>';

    return `
      <div class="modal-root" id="maintenance-modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>Melhorias</h2>
            <button type="button" class="close-btn" data-close-modal="true">×</button>
          </div>
          <form id="maintenance-form" class="form-grid">
            <div class="field">
              <label>Tipo</label>
              <select name="kind" required>
                <option value="">Selecione...</option>
                <option value="Melhoria">Melhoria</option>
                <option value="Manutenção">Manutenção</option>
              </select>
            </div>
            <div class="field">
              <label>Equipamento ou item</label>
              <input name="item" required placeholder="Ex: corrimão, motor, iluminação">
            </div>
            <div class="field">
              <label>Local</label>
              <input name="location" required placeholder="Onde precisa da ação">
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select name="priority" required>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA" selected>Média</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Crítica</option>
              </select>
            </div>
            <div class="field">
              <label>Designar para</label>
              <select name="assignedTo" required>
                <option value="">Selecione um líder...</option>
                ${leaderOptions}
              </select>
              <p class="helper-text">A lista usa o cache local quando estiver offline.</p>
            </div>
            <div class="field">
              <label>Descrição</label>
              <textarea name="description" required placeholder="Descreva a melhoria ou manutenção necessária"></textarea>
            </div>
            <div class="actions">
              <button class="btn btn-success" type="submit">Enviar sugestão</button>
              <button class="btn btn-soft" type="button" data-close-modal="true">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderRidDetailsModal() {
    const item = getSelectedRid();
    if (!item) return "";

    const immediateAction = String(item.immediateAction || "").trim();
    const correctiveActions = String(item.correctiveActions || "").trim();
    const correctedAtCreation =
      String(item.status || "").toUpperCase() === "CORRIGIDO" &&
      !correctiveActions &&
      immediateAction;

    return `
      <div class="modal-root" id="rid-details-modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>${item.ridNumber ? `RID #${escapeHtml(formatRidNumber(item.ridNumber))}` : "RID pendente"}</h2>
            <button type="button" class="close-btn" data-close-modal="true">×</button>
          </div>
          <div class="form-grid" style="margin-top:0;">
            <div class="field">
              <label>Status</label>
              <div class="badge ${getBadgeClass(item.status, item.isPendingLocal)}" style="width:max-content;">
                ${getStatusLabel(item)}
              </div>
            </div>
            <div class="field">
              <label>Descrição</label>
              <div class="muted" style="color:#213043;">${escapeHtml(item.description || "Sem descrição")}</div>
            </div>
            ${correctedAtCreation ? `
              <div class="field">
                <label>Ação imediata</label>
                <div class="muted" style="color:#8a6717;">${escapeHtml(immediateAction)}</div>
              </div>
            ` : ""}
            ${correctiveActions ? `
              <div class="field">
                <label>Ação corretiva</label>
                <div class="muted" style="color:#35653b;">${escapeHtml(correctiveActions)}</div>
              </div>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function renderApp() {
    const pageData = getPaginatedRids();
    const stats = calcStats();
    const monthProgress = calcCurrentMonthProgress();

    app.innerHTML = `
      <main class="app-shell">
        <section class="mobile-shell">
          <header class="topbar panel">
            <div class="topbar-meta">
              <h1 style="font-size:1.1rem; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(state.currentUserData.name || "Usuário")}
              </h1>
              <span class="muted" style="font-size:0.84rem;">${escapeHtml(state.currentUserData.userType || "Funcionário")}</span>
              <span class="muted" style="font-size:0.84rem;">${escapeHtml(state.currentUserData.sector || "Sem setor")}</span>
            </div>
            <div class="topbar-actions">
              <span class="status-pill ${state.online ? "online" : "offline"}">${state.online ? "Online" : "Offline"}</span>
              <button class="btn btn-danger btn-small" id="logout-btn">Sair</button>
            </div>
          </header>

          ${!state.online ? `
            <div class="offline-banner">
              Sem internet: seus RIDs vieram do cache local. Novos RIDs ficam pendentes até você clicar em sincronizar.
            </div>
          ` : ""}

          <section class="section">
            <div class="section-header">
              <h2 class="section-title" style="white-space:nowrap;">Meu desempenho</h2>
            </div>
            <div class="stats-grid">
              <article class="stats-card red-soft">
                <div class="stats-label">Total</div>
                <div class="stats-value">${stats.total}</div>
                <div class="stats-foot">Inclui pendentes locais</div>
              </article>
              <article class="stats-card blue-soft">
                <div class="stats-label">Corrigidos</div>
                <div class="stats-value">${stats.corrected}</div>
                <div class="stats-foot">RIDs concluídos na base</div>
              </article>
              <article class="stats-card green-soft">
                <div class="stats-label">Pendentes sync</div>
                <div class="stats-value">${stats.pendingSync}</div>
                <div class="stats-foot">Salvos no aparelho</div>
              </article>
              <article class="stats-card yellow-soft">
                <div class="stats-label">Em aberto</div>
                <div class="stats-value">${stats.overdue}</div>
                <div class="stats-foot">RIDs vencidos ou em andamento</div>
              </article>
            </div>
            <div style="
              margin-top:10px;
              font-size:0.78rem;
              line-height:1.35;
              padding:10px 12px;
              border-radius:999px;
              background:${monthProgress.hitGoal ? "#eef9ea" : "#fff7e8"};
              border:1px solid ${monthProgress.hitGoal ? "#cfe8c8" : "#f1ddb0"};
              color:${monthProgress.hitGoal ? "#35653b" : "#8a6717"};
            ">
              Você emitiu <strong>${monthProgress.emittedThisMonth}</strong> RID${monthProgress.emittedThisMonth === 1 ? "" : "s"} no mês atual.
              Sua meta é <strong>${monthProgress.goal}</strong>.
              <strong>${monthProgress.hitGoal ? "Meta atingida" : "Meta não atingida"}</strong>.
            </div>
          </section>

          <section class="section">
            <div class="section-header">
              <div style="width:100%;">
                <h2 class="section-title" style="white-space:nowrap; margin-bottom:10px;">Meus RIDs</h2>
                <div class="page-actions" style="display:flex; gap:8px; flex-wrap:nowrap;">
                  <button class="btn btn-success btn-small" id="new-rid-btn" style="flex:1;">Novo RID</button>
                  <button class="btn btn-soft btn-small" id="maintenance-btn" style="flex:1;">Melhorias</button>
                </div>
              </div>
            </div>
            <article class="panel">
              ${pageData.totalItems
                ? `<div class="rid-list">${pageData.items.map(renderRidCard).join("")}</div>${renderPagination(pageData)}`
                : `<div class="empty-state">Nenhum RID disponível no cache local.</div>`}
            </article>
          </section>
        </section>
        ${renderRidModal()}
        ${renderMaintenanceModal()}
        ${renderRidDetailsModal()}
      </main>
    `;

    bindAppEvents();
    clearAutoFocus();
  }

  function bindAppEvents() {
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    document.getElementById("new-rid-btn")?.addEventListener("click", openRidModal);
    document.getElementById("maintenance-btn")?.addEventListener("click", openMaintenanceModal);
    document.getElementById("rid-form")?.addEventListener("submit", handleRidSubmit);
    document.getElementById("maintenance-form")?.addEventListener("submit", handleMaintenanceSubmit);
    bindDraftPersistence("rid-form", "ridDraft");
    bindDraftPersistence("maintenance-form", "maintenanceDraft");

    document.querySelectorAll("[data-sync-rid]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        syncPendingRid(button.dataset.syncRid);
      });
    });

    document.querySelectorAll("[data-open-rid]").forEach((card) => {
      card.addEventListener("click", () => openRidDetails(card.dataset.openRid));
    });

    document.querySelectorAll("[data-page-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentPage += button.dataset.pageNav === "next" ? 1 : -1;
        renderApp();
      });
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });

    document.getElementById("rid-modal")?.addEventListener("click", (event) => {
      if (event.target.id === "rid-modal") closeModal();
    });

    document.getElementById("rid-details-modal")?.addEventListener("click", (event) => {
      if (event.target.id === "rid-details-modal") closeModal();
    });

    document.getElementById("maintenance-modal")?.addEventListener("click", (event) => {
      if (event.target.id === "maintenance-modal") closeModal();
    });
  }

  async function bootstrapFromFirebaseSession() {
    const sessionUser = auth.currentUser;
    if (!sessionUser || !state.online) return false;

    const userDoc = await db.collection("users").doc(sessionUser.uid).get();
    if (!userDoc.exists) return false;

    state.currentUser = { uid: sessionUser.uid };
    state.currentUserData = { id: sessionUser.uid, ...userDoc.data() };
    loadUserCache(sessionUser.uid);
    await cacheRemoteData();
    await syncPendingMaintenances();
    renderApp();
    return true;
  }

  function updateConnectivity(nextOnline) {
    state.online = nextOnline;
    if (!state.currentUser) {
      renderLogin();
      return;
    }

    renderApp();
    showToast(nextOnline ? "Internet disponível." : "Modo offline ativo.", nextOnline ? "success" : "info");

    if (nextOnline) {
      cacheRemoteData()
        .then(async () => {
          await syncPendingMaintenances();
          renderApp();
        })
        .catch((error) => {
          console.error("Falha ao atualizar dados ao reconectar:", error);
          showToast("Não foi possível atualizar os RIDs ao reconectar.", "error");
        });
    }
  }

  function updateConnectivity(nextOnline) {
    state.online = nextOnline;
    if (!state.currentUser) {
      renderLogin();
    } else {
      renderApp();
    }

    syncConnectivityState().then((actualOnline) => {
      showToast(actualOnline ? "Internet disponível." : "Modo offline ativo.", actualOnline ? "success" : "info");

      if (actualOnline && state.currentUser) {
        cacheRemoteData()
          .then(async () => {
            await syncPendingMaintenances();
            renderApp();
          })
          .catch((error) => {
            console.error("Falha ao atualizar dados ao reconectar:", error);
            showToast("Não foi possível atualizar os RIDs ao reconectar.", "error");
          });
      }
    });
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("Falha ao registrar service worker:", error);
    }
  }

  async function init() {
    renderLogin();
    setBooting(true);
    setTimeout(() => {
      if (state.booting) setBooting(false);
    }, 4000);
    await registerServiceWorker();
    await syncConnectivityState();

    window.addEventListener("online", () => updateConnectivity(true));
    window.addEventListener("offline", () => updateConnectivity(false));
    window.addEventListener("focus", () => {
      syncConnectivityState();
    });

    setInterval(() => {
      syncConnectivityState();
    }, CONNECTIVITY_CHECK_INTERVAL);

    try {
      const offlineAuth = getOfflineAuth();
      if (offlineAuth?.uid && offlineAuth?.userData) {
        state.currentUser = { uid: offlineAuth.uid };
        state.currentUserData = offlineAuth.userData;
        loadUserCache(offlineAuth.uid);

        if (state.online) {
          cacheRemoteData()
            .then(async () => {
              await syncPendingMaintenances();
              setBooting(false);
              renderApp();
            })
            .catch((error) => {
              console.error("Falha ao atualizar cache do auto login:", error);
              setBooting(false);
              renderApp();
            });
        } else {
          setBooting(false);
          renderApp();
        }
        return;
      }

      const restored = await bootstrapFromFirebaseSession();
      if (!restored) {
        const offlineAuth = getOfflineAuth();
        if (offlineAuth && !state.online) {
          state.currentUser = { uid: offlineAuth.uid };
          state.currentUserData = offlineAuth.userData;
          loadUserCache(offlineAuth.uid);
          setBooting(false);
          renderApp();
        } else if (offlineAuth && state.online) {
          state.currentUser = { uid: offlineAuth.uid };
          state.currentUserData = offlineAuth.userData;
          loadUserCache(offlineAuth.uid);
          renderApp();
          cacheRemoteData()
            .then(async () => {
              await syncPendingMaintenances();
              setBooting(false);
              renderApp();
            })
            .catch((error) => {
              console.error("Falha ao atualizar cache inicial:", error);
              setBooting(false);
            });
        } else {
          setBooting(false);
        }
      } else {
        setBooting(false);
      }
    } catch (error) {
      console.error("Falha ao iniciar app mobile:", error);
      showToast("Não foi possível restaurar a sessão.", "error");
    }
  }

  init();
})();



