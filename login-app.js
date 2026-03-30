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

  const dom = {
    bootOverlay: document.getElementById("bootOverlay"),
    loginForm: document.getElementById("loginForm"),
    loginCpf: document.getElementById("loginCpf"),
    loginPassword: document.getElementById("loginPassword"),
    loginSubmitButton: document.getElementById("loginSubmitButton"),
    loginFeedback: document.getElementById("loginFeedback")
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

  function getNextPage() {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get("next") || "dashboard.html").trim();
    if (!next || /^(https?:)?\/\//i.test(next) || next.includes("login.html")) {
      return "dashboard.html";
    }
    return next;
  }

  function showFeedback(message) {
    dom.loginFeedback.textContent = message;
    dom.loginFeedback.classList.add("visible");
  }

  function consumeStoredFeedback() {
    const message = sessionStorage.getItem("ridLoginFeedback");
    if (!message) return;
    sessionStorage.removeItem("ridLoginFeedback");
    showFeedback(message);
  }

  function hideBoot() {
    dom.bootOverlay.style.display = "none";
  }

  function redirectAuthenticatedUser() {
    window.location.replace(getNextPage());
  }

  dom.loginCpf.addEventListener("input", () => {
    dom.loginCpf.value = maskCpf(dom.loginCpf.value);
  });

  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    dom.loginFeedback.classList.remove("visible");
    dom.loginSubmitButton.disabled = true;
    dom.loginSubmitButton.textContent = "Entrando...";
    try {
      await auth.signInWithEmailAndPassword(cpfToEmail(dom.loginCpf.value), dom.loginPassword.value);
      redirectAuthenticatedUser();
    } catch (error) {
      showFeedback("Nao foi possivel entrar. Confira CPF e senha.");
    } finally {
      dom.loginSubmitButton.disabled = false;
      dom.loginSubmitButton.textContent = "Entrar";
    }
  });

  auth.onAuthStateChanged((user) => {
    consumeStoredFeedback();
    if (user) {
      redirectAuthenticatedUser();
      return;
    }
    hideBoot();
  });
})();
