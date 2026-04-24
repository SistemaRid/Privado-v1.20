(function () {
  if (typeof window === "undefined") return;

  function normalizeCpf(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
  }

  function maskCpf(value) {
    const digits = normalizeCpf(value);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function pickFirstFilled() {
    for (const value of arguments) {
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function readCustomField(userData, key) {
    const value = userData?.customFields?.[key]?.value;
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeResolvedProfile(userData, user, fallbackId) {
    if (!userData) return null;

    const rawCpf = pickFirstFilled(
      userData.cpf,
      userData.document,
      userData.documentCpf,
      readCustomField(userData, "cpf"),
      readCustomField(userData, "documento"),
      normalizeCpf(String(user?.email || "").split("@")[0] || "")
    );

    const normalizedCpf = normalizeCpf(
      rawCpf
    );

    const normalizedEmail = normalizeEmail(
      pickFirstFilled(
        userData.email,
        userData.loginEmail,
        readCustomField(userData, "email"),
        user?.email
      )
    );

    return {
      ...userData,
      id: userData.id || fallbackId || user?.uid || "",
      uid: pickFirstFilled(userData.uid, userData.authUid, userData.userUid, fallbackId, user?.uid),
      name: pickFirstFilled(userData.name, userData.nome, userData.fullName, readCustomField(userData, "name"), readCustomField(userData, "nome"), user?.displayName),
      email: normalizedEmail || null,
      cpf: rawCpf || null,
      cpfMasked: normalizedCpf ? maskCpf(normalizedCpf) : null,
      cpfDigits: normalizedCpf || null,
      sector: pickFirstFilled(userData.sector, userData.area, userData.department, readCustomField(userData, "sector"), readCustomField(userData, "setor")),
      unit: pickFirstFilled(userData.unit, userData.unidade, readCustomField(userData, "unit"), readCustomField(userData, "unidade")),
      contractType: pickFirstFilled(userData.contractType, userData.employmentType, userData.tipoContrato, readCustomField(userData, "contractType"), readCustomField(userData, "employmentType"))
    };
  }

  async function findUserByField(db, field, values, user) {
    for (const rawValue of values) {
      const value = String(rawValue || "").trim();
      if (!value) continue;
      try {
        const snapshot = await db.collection("users")
          .where(field, "==", value)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          return normalizeResolvedProfile({ id: doc.id, ...doc.data() }, user, doc.id);
        }
      } catch (error) {}
    }
    return null;
  }

  async function resolveUserProfile(db, user) {
    if (!db || !user?.uid) return null;

    const byUid = await db.collection("users").doc(user.uid).get();
    if (byUid.exists) {
      return normalizeResolvedProfile({ id: byUid.id, ...byUid.data() }, user, byUid.id);
    }

    const byUidField = await findUserByField(db, "uid", [user.uid], user);
    if (byUidField) return byUidField;

    const byAuthUidField = await findUserByField(db, "authUid", [user.uid], user);
    if (byAuthUidField) return byAuthUidField;

    const byUserUidField = await findUserByField(db, "userUid", [user.uid], user);
    if (byUserUidField) return byUserUidField;

    const authEmail = normalizeEmail(user.email || "");
    const cpfFromEmail = normalizeCpf(authEmail.split("@")[0] || "");

    if (cpfFromEmail.length === 11) {
      const byCpf = await findUserByField(db, "cpf", [maskCpf(cpfFromEmail), cpfFromEmail], user);
      if (byCpf) return byCpf;
    }

    if (authEmail) {
      const byEmail = await findUserByField(db, "email", [authEmail, String(user.email || "").trim()], user);
      if (byEmail) return byEmail;
      const byLoginEmail = await findUserByField(db, "loginEmail", [authEmail], user);
      if (byLoginEmail) return byLoginEmail;
    }

    return normalizeResolvedProfile(null, user, user.uid);
  }

  function getEmitterIdentity(profile, user) {
    const normalizedProfile = normalizeResolvedProfile(profile, user, profile?.id || user?.uid || "");
    const cpfDigits = normalizedProfile?.cpfDigits || normalizeCpf(String(user?.email || "").split("@")[0] || "");
    const rawCpf = pickFirstFilled(normalizedProfile?.cpf, normalizedProfile?.cpfMasked);
    const maskedCpf = cpfDigits ? maskCpf(cpfDigits) : null;
    const email = normalizeEmail(normalizedProfile?.email || user?.email || "");
    const name = pickFirstFilled(normalizedProfile?.name, user?.displayName, email, maskedCpf, "Usuario");

    return {
      emitterId: pickFirstFilled(normalizedProfile?.id, normalizedProfile?.uid, user?.uid),
      emitterUid: pickFirstFilled(normalizedProfile?.uid, user?.uid, normalizedProfile?.id),
      emitterCpf: rawCpf || maskedCpf || "",
      emitterCpfDigits: cpfDigits || "",
      emitterCpfMasked: maskedCpf || "",
      emitterEmail: email || "",
      emitterName: name,
      sector: pickFirstFilled(normalizedProfile?.sector, readCustomField(normalizedProfile, "setor")),
      unit: pickFirstFilled(normalizedProfile?.unit, readCustomField(normalizedProfile, "unidade")),
      contractType: pickFirstFilled(normalizedProfile?.contractType, readCustomField(normalizedProfile, "tipoContrato"))
    };
  }

  window.ridUserProfileResolver = {
    normalizeCpf,
    maskCpf,
    normalizeEmail,
    resolveUserProfile,
    getEmitterIdentity
  };
})();
