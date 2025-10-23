// googleDrive.js
// Autenticação e upload/download para Google Drive usando Google Identity Services
// Inclui suporte a login automático via token guardado

const CLIENT_ID = "783894201201-m32lfnl5a8n746fk0hobehge6oudee1e.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let accessToken = null;

/**
 * Inicializa Google Identity Services
 */
export const initGoogleGIS = () => {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      return reject("Google Identity Services não carregado. Confirma se incluiste o script no HTML.");
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) return reject(resp);
        accessToken = resp.access_token;
        localStorage.setItem("drive_token", accessToken);
        resolve(accessToken);
      },
    });

    resolve();
  });
};

/**
 * Solicita login / acesso ao usuário (popup)
 */
export const requestAccessToken = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("TokenClient não inicializado");
    tokenClient.requestAccessToken({ prompt: "consent" });
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp.error);
      accessToken = resp.access_token;
      localStorage.setItem("drive_token", accessToken);
      resolve(accessToken);
    };
  });
};

/**
 * Tenta login silencioso usando prompt:none
 */
export const trySilentLogin = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("TokenClient não inicializado");
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp.error);
      accessToken = resp.access_token;
      localStorage.setItem("drive_token", accessToken);
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "none" });
  });
};

/**
 * Faz upload ou atualização do ficheiro "finance-data.json" para o Drive
 */
export const uploadToDrive = async (data) => {
  try {
    if (!accessToken) throw new Error("Sem access token. Faz login primeiro.");

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const metadata = { name: "finance-data.json", mimeType: "application/json" };

    const listRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name='finance-data.json' and trashed=false&fields=files(id,name)",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listJson = await listRes.json();

    let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    let method = "POST";

    if (listJson.files && listJson.files.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${listJson.files[0].id}?uploadType=multipart`;
      method = "PATCH";
    }

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    return res.ok;
  } catch (err) {
    console.error("uploadToDrive erro:", err);
    return false;
  }
};

/**
 * Carrega o ficheiro "finance-data.json" do Drive
 */
export const loadFromDrive = async () => {
  try {
    if (!accessToken) throw new Error("Sem access token. Faz login primeiro.");

    const listRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name='finance-data.json' and trashed=false&fields=files(id,name)",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listJson = await listRes.json();

    if (!listJson.files || listJson.files.length === 0) return [];

    const fileId = listJson.files[0].id;

    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return await downloadRes.json();
  } catch (err) {
    console.error("loadFromDrive erro:", err);
    return [];
  }
};
