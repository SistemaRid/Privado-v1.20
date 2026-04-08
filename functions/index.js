const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");

admin.initializeApp();

function formatRidNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(5, "0");
}

exports.sendRidPushNotification = onDocumentCreated("rids/{ridId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const rid = snapshot.data() || {};
  const db = admin.firestore();

  const tokensSnapshot = await db.collection("notificationTokens")
    .where("enabled", "==", true)
    .get();

  if (tokensSnapshot.empty) {
    logger.info("Nenhum token web ativo para notificar.");
    return;
  }

  const tokens = tokensSnapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return String(data.token || doc.id || "").trim();
    })
    .filter(Boolean);

  if (!tokens.length) {
    logger.info("Nenhum token valido encontrado.");
    return;
  }

  const ridNumber = formatRidNumber(rid.ridNumber);
  const emitterName = String(rid.emitterName || "Emissor nao identificado").trim();
  const location = String(rid.location || rid.sector || "Local nao informado").trim();

  const message = {
    data: {
      title: "Nova RID recebida",
      body: `RID #${ridNumber || "-----"} | ${location}`,
      ridId: snapshot.id,
      ridNumber: ridNumber || "",
      url: "./dashboard.html",
      click_action: "./dashboard.html",
      icon: "./icon-192.png",
      tag: snapshot.id
    },
    tokens
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code || "";
    if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await Promise.all(invalidTokens.map((token) => db.collection("notificationTokens").doc(token).delete().catch(() => null)));
  }

  logger.info("Push de RID processado.", {
    totalTokens: tokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount
  });
});
