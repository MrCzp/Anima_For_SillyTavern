/**
 * Anima Runtime API — all remote Anima endpoints used by the extension.
 * Used both from runtime.html (iframe) and from index.js (main page).
 * @module runtime-api
 */

/**
 * @typedef {{ apiBaseUrl?: string, authToken?: string, defaultVoiceId?: string, autoLipSync?: boolean }} RuntimeConfig
 * @typedef {{ signal?: AbortSignal }} RequestOptions
 */

/**
 * @param {RuntimeConfig} config
 * @returns {Record<string, string>}
 */
function buildHeaders(config) {
    const headers = /** @type {Record<string, string>} */ ({
        'Content-Type': 'application/json',
    });
    const token = String(config?.authToken || '').trim();
    if (token) headers.Authorization = token;
    return headers;
}

/**
 * @param {RuntimeConfig} config
 * @param {boolean} [jsonContentType]
 * @returns {Record<string, string>}
 */
function buildAuthHeaders(config, jsonContentType = false) {
    const headers = /** @type {Record<string, string>} */ ({ Accept: 'application/json' });
    if (jsonContentType) headers['Content-Type'] = 'application/json';
    const token = String(config?.authToken || '').trim();
    if (token) headers.Authorization = token;
    return headers;
}

/** @param {RuntimeConfig} config */
function getBase(config) {
    return String(config?.apiBaseUrl || '').trim().replace(/\/$/, '');
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} payload
 * @param {RuntimeConfig} config
 * @param {RequestOptions} [options]
 */
async function postJson(path, payload, config, options = {}) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
        signal: options.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * @param {string} path
 * @param {RuntimeConfig} config
 * @param {RequestOptions} [options]
 */
async function getJson(path, config, options = {}) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: buildAuthHeaders(config),
        signal: options.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/** @param {number | undefined} code */
function isOk(code) { return code === 0 || code === 200; }

/** @param {any} p */
function msg(p) { return String(p?.msg || p?.message || 'Unknown Anima API error.'); }

// ───────────── Auth ─────────────

/** @param {string} mailbox @param {string} password @param {RuntimeConfig} config */
export async function loginApi(mailbox, password, config) {
    return postJson('/web-api/portrait/user/login', { mailbox, password }, config);
}

/** @param {string} mailbox @param {string} password @param {string} nickname @param {RuntimeConfig} config */
export async function registerApi(mailbox, password, nickname, config) {
    return postJson('/web-api/portrait/user/register', {
        nickname,
        mailbox,
        password,
        invitationUserId: 0,
        productType: '3',
    }, config);
}

// ───────────── Avatars ─────────────

/** @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function avatarsList(config, options) {
    const p = await postJson('/web-api/portrait/avatars/list', {}, config, options);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return Array.isArray(p?.data?.userAvatarsList) ? p.data.userAvatarsList : [];
}

/** @param {string} avatarId @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function avatarGet(avatarId, config, options) {
    const p = await getJson(`/web-api/portrait/avatars/get/${encodeURIComponent(String(avatarId))}`, config, options);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p?.data || null;
}

/** @param {Record<string, unknown>} payload @param {RuntimeConfig} config */
export async function avatarsUpdate(payload, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/avatars/update`, {
        method: 'PUT',
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p;
}

/** @param {string} avatarId @param {RuntimeConfig} config */
export async function avatarsDelete(avatarId, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/avatars/delete/${encodeURIComponent(String(avatarId))}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(config),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p;
}

/** @param {string} nickname @param {RuntimeConfig} config */
export async function preGeneration(nickname, config) {
    const p = await postJson('/web-api/portrait/avatars/pre/generation', { nickname }, config);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return String(p?.data || '');
}

/** @param {FormData} formData @param {RuntimeConfig} config */
export async function avatarsUpload(formData, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/avatars/upload`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: formData,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return String(p?.data || '');
}

/** @param {FormData} formData @param {RuntimeConfig} config */
export async function validateImage(formData, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/avatars/validate/image`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: formData,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p?.data;
}

// ───────────── TTS / Voice ─────────────

/** @param {Record<string, unknown>} payload @param {RuntimeConfig} config */
export async function ttsUpdate(payload, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/avatars/tts/update`, {
        method: 'PUT',
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p;
}

/** @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function audioLanguageList(config, options) {
    const p = await getJson('/web-api/portrait/audio/language/list', config, options);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return Array.isArray(p?.data) ? p.data : [];
}

/** @param {string|number} languageId @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function audioList(languageId, config, options) {
    const p = await postJson('/web-api/portrait/audio/list', {
        languageId: Number(languageId) || String(languageId || '').trim() || undefined,
    }, config, options);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return Array.isArray(p?.data) ? p.data : [];
}

/** @param {string} content @param {string|number} voiceId @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function ttsTransform(content, voiceId, config, options = {}) {
    return postJson('/web-api/portrait/tts/transform', {
        content,
        voiceId: Number(voiceId) || 1,
    }, config, options);
}

/** @param {string} dialogueBase64 @param {string} modelId @param {string} traceId @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function atfDt(dialogueBase64, modelId, traceId, config, options = {}) {
    return postJson('/web-api/portrait/atf/dt', {
        status: 'start',
        dialogueBase64,
        lastDialogueBase64: '',
        modelId,
        traceId,
    }, config, options);
}

// ───────────── Model Generation ─────────────

// ───────────── ASR (Speech‑to‑Text) ─────────────

/** @param {string} audioBase64 raw base64 (no data‑URI prefix) @param {RuntimeConfig} config @param {RequestOptions} [options] */
export async function asrBase64(audioBase64, config, options = {}) {
    const p = await postJson('/web-api/portrait/asr/base64', { audioBase64 }, config, options);
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p;
}

// ───────────── Model Generation ─────────────

/** @param {FormData} formData @param {RuntimeConfig} config */
export async function modelGenerate(formData, config) {
    const base = getBase(config);
    if (!base) throw new Error('Anima API base URL is not configured.');
    const response = await fetch(`${base}/web-api/portrait/model/generate`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: formData,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const p = await response.json();
    if (!isOk(p?.code)) throw new Error(msg(p));
    return p;
}

// ───────────── SSE ─────────────

const SSE_STATUS_MAP = Object.freeze({
    '1': 'check',
    '2': 'style-completed',
    '3': 'model-completed',
    '42': 'style-error',
    '43': 'model-error',
});

/**
 * Open an SSE connection to track avatar generation progress.
 * @param {string} userId
 * @param {string} avatarId
 * @param {RuntimeConfig} config
 * @param {{ onStatus?: (status: string) => void, onError?: (err: Error) => void }} [callbacks]
 * @returns {{ close: () => void }}
 */
export function openGenerationSSE(userId, avatarId, config, callbacks = {}) {
    const base = getBase(config);
    const url = `${base}/web-api/portrait/sse/connect/${encodeURIComponent(userId)}?businessId=${encodeURIComponent(avatarId)}`;
    const es = new EventSource(url);
    es.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const payloadBusinessId = String(data?.businessId || data?.data?.businessId || '');
            if (payloadBusinessId && payloadBusinessId !== String(avatarId)) return;
            const rawStatus = String(data?.status || data?.type || data?.event || '');
            const status = /** @type {Record<string, string>} */ (SSE_STATUS_MAP)[rawStatus] || rawStatus;
            callbacks.onStatus?.(status);
            if (status === 'model-completed' || status.includes('error')) {
                es.close();
            }
        } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
        callbacks.onError?.(new Error('SSE connection error'));
        es.close();
    };
    return { close: () => es.close() };
}

// ───────────── Probe ─────────────

/** @param {RuntimeConfig} config */
export async function probeApi(config) {
    try {
        const p = await getJson('/web-api/portrait/audio/language/list', config);
        const code = p?.code;
        const ok = isOk(code);
        return { ok, detail: ok ? `API reachable (code ${code}).` : `API responded with code ${code}: ${msg(p)}` };
    } catch (error) {
        return { ok: false, detail: `API probe failed: ${error instanceof Error ? error.message : String(error)}` };
    }
}
