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

  if (typeof firebase.auth !== "function" || typeof firebase.firestore !== "function") return;

  const auth = firebase.auth();
  const db = firebase.firestore();
  const SESSION_KEY = "ridManagementTrackedLoginUid";
  const currentPage = window.location.pathname.split(/[\\/]/).pop() || "";

  if (currentPage === "mobile.html") return;

  auth.onAuthStateChanged(async (user) => {
    if (!user?.uid) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    const trackedUid = sessionStorage.getItem(SESSION_KEY);
    if (trackedUid === user.uid) return;

    try {
      const profile = window.ridUserProfileResolver?.resolveUserProfile
        ? await window.ridUserProfileResolver.resolveUserProfile(db, user)
        : null;
      const targetUserId = profile?.id || user.uid;

      await db.collection("users").doc(targetUserId).set({
        lastManagementLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastManagementLoginPage: currentPage || "dashboard.html"
      }, { merge: true });
      sessionStorage.setItem(SESSION_KEY, user.uid);
    } catch (error) {
      console.error("Falha ao registrar ultimo login de gestao:", error);
    }
  });
})();
