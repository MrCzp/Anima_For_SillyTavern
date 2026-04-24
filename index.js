import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { sendMessageAsUser } from '../../../../script.js';
import {
    loginApi, registerApi, avatarsList, avatarGet, avatarsUpdate, avatarsDelete,
    preGeneration, avatarsUpload, validateImage, ttsUpdate, audioLanguageList, audioList,
    ttsTransform, atfDt, modelGenerate, openGenerationSSE, probeApi,
} from './runtime-api.js';
import { t, initLang, getCurrentLang, setLang, updateI18n } from './i18n.js';

/* ───────── Constants ───────── */

const EXTENSION_ROOT = new URL('.', import.meta.url);
const MODULE_NAME = (() => {
    const parts = EXTENSION_ROOT.pathname.split('/scripts/extensions/');
    return parts.length > 1 ? decodeURIComponent(parts[1].replace(/\/$/, '')) : 'third-party/anima';
})();
const LOGO_URL = new URL('./static/logo.png', import.meta.url).pathname;
const SETTINGS_KEY = 'anima';
const DEFAULT_RUNTIME_URL = new URL('./runtime.html', import.meta.url).href;
const DEFAULT_API_BASE = 'https://sumi.sumeruai.com';
const OFFICIAL_AVATAR_IDS = ['1453606505259008', '1453607839064064'];
const SSE_STATUS_MAP = Object.freeze({
    '1': 'check',
    '2': 'style-completed',
    '3': 'model-completed',
    '42': 'style-error',
    '43': 'model-error',
});

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    apiBaseUrl: DEFAULT_API_BASE,
    authToken: '',
    authMailbox: '',
    authPassword: '',
    authUserId: '',
    defaultVoiceId: '1',
    autoLipSync: true,
    useStTts: false,
    runtimeUrl: '',
    popupPosition: null,   // { x, y, w, h }
    bindings: {},
    language: '',          // '' = auto-detect, 'en', 'zh_cn'
});

/* ───────── Helpers ───────── */

/** @param {string} t */
function escapeHtml(t) {
    return String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** @param {string} value */
function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#96;');
}

function getToastr() {
    return /** @type {any} */ (toastr);
}

/** @param {unknown} e */
function errMsg(e) {
    return e instanceof Error ? e.message : String(e);
}

/** @param {number | string | undefined | null} code */
function isOkCode(code) {
    return code === 0 || code === 200 || code === '0' || code === '200';
}

function getExtSettings() {
    return /** @type {Record<string, any>} */ (getContext().extensionSettings);
}

/** @returns {Record<string, any>} */
function ensureSettings() {
    const bucket = getExtSettings();
    const cur = /** @type {Record<string, any>} */ (bucket[SETTINGS_KEY] ?? {});
    let changed = false;
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(cur, k)) {
            cur[k] = v && typeof v === 'object' ? (Array.isArray(v) ? [...v] : { ...v }) : v;
            changed = true;
        }
    }
    if (!cur.bindings || typeof cur.bindings !== 'object') { cur.bindings = {}; changed = true; }
    if (!String(cur.apiBaseUrl || '').trim()) { cur.apiBaseUrl = DEFAULT_API_BASE; changed = true; }
    if (bucket[SETTINGS_KEY] !== cur) { bucket[SETTINGS_KEY] = cur; changed = true; }
    if (changed) getContext().saveSettingsDebounced();
    return /** @type {any} */ (bucket[SETTINGS_KEY]);
}

function getConfig() {
    const s = ensureSettings();
    return { apiBaseUrl: s.apiBaseUrl, authToken: s.authToken, defaultVoiceId: s.defaultVoiceId, autoLipSync: s.autoLipSync };
}

function saveSettings() { getContext().saveSettingsDebounced(); }

/**
 * Get the avatar filename (without extension) for a character.
 * @param {number|null} [cid]
 * @returns {string|null}
 */
function getCharaFilename(cid = null) {
    const ctx = getContext();
    const id = cid ?? (typeof ctx.characterId === 'number' ? ctx.characterId : -1);
    const avatar = ctx.characters?.[id]?.avatar;
    return avatar ? String(avatar).replace(/\.[^/.]+$/, '') : null;
}

/** @returns {{ key: string, label: string, hasChat: boolean }} */
function getBindingMeta() {
    const ctx = getContext();
    const cid = typeof ctx.characterId === 'number' && ctx.characterId >= 0 ? ctx.characterId : null;
    const ch = cid !== null ? ctx.characters?.[cid] : null;
    const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
    const grp = ctx.groupId ? groups.find(g => g.id == ctx.groupId) : null;
    if (grp) return { key: `group:${grp.id}`, label: grp.name || 'Group', hasChat: true };
    if (ch && cid !== null) {
        const fn = getCharaFilename(cid);
        const key = fn ? `character:${fn}` : `character:${cid}`;
        return { key, label: ch.name || 'Character', hasChat: true };
    }
    return { key: 'none', label: 'No chat', hasChat: false };
}

/**
 * Find all binding keys that use the given remote avatar id.
 * @param {string} remoteAvatarId
 * @returns {{ key: string, label: string }[]}
 */
function findBindingsForAvatar(remoteAvatarId) {
    const s = ensureSettings();
    /** @type {{ key: string, label: string }[]} */
    const result = [];
    for (const [key, val] of Object.entries(s.bindings || {})) {
        if (val?.remoteAvatarId === remoteAvatarId) {
            result.push({ key, label: val.avatarLabel || key });
        }
    }
    return result;
}

/**
 * Get a short display name for a binding key like "character:Seraphina_3a7b2c" → character name.
 * @param {string} key
 * @returns {string}
 */
function resolveBindingKeyLabel(key) {
    const ctx = getContext();
    if (key.startsWith('character:')) {
        const fn = key.slice('character:'.length);
        const chars = Array.isArray(ctx.characters) ? ctx.characters : [];
        const ch = chars.find(c => {
            const cf = String(c.avatar || '').replace(/\.[^/.]+$/, '');
            return cf === fn;
        });
        return ch ? String(ch.name) : fn;
    }
    if (key.startsWith('group:')) {
        const gid = key.slice('group:'.length);
        const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
        const g = groups.find(x => x.id == gid);
        return g ? String(g.name) : gid;
    }
    return key;
}

/** @param {string} key */
function getBinding(key) {
    const s = ensureSettings();
    const b = s.bindings?.[key] || {};
    return {
        avatarLabel: b.avatarLabel || '', posterUrl: b.posterUrl || '', modelUrl: b.modelUrl || '',
        modelId: b.modelId || '', voiceId: b.voiceId || '', remoteAvatarId: b.remoteAvatarId || '',
        remoteLanguageId: b.remoteLanguageId || '', remoteVoiceName: b.remoteVoiceName || '',
    };
}

/** @param {string} key @param {any} data */
function setBinding(key, data) {
    const s = ensureSettings();
    s.bindings[key] = data;
    saveSettings();
}

/** @param {string} key */
function clearBinding(key) {
    const s = ensureSettings();
    delete s.bindings[key];
    saveSettings();
}

/* ───────── Popup singleton ───────── */

/** @type {HTMLElement | null} */
let popupEl = null;
/** @type {string} */
let currentView = 'login';
/** @type {string | null} */
let previousView = null;
/** @type {ReturnType<typeof setInterval> | null} */
let runtimeTimer = null;
/** @type {(() => void) | null} */
let cleanupEvents = null;
/** @type {(() => void) | null} */
let cleanupBridge = null;
/** @type {Map<string, { close: () => void }>} */
let generationSSEConnections = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
let generationSSERetryTimers = new Map();
/** @type {any} */
let createWizardState = null;
/** @type {number} */
let replyEventId = 0;

/* ───────── Navigation ───────── */

/** @param {string} name */
function showView(name) {
    if (!popupEl) return;
    previousView = currentView;
    currentView = name;
    const views = popupEl.querySelectorAll('.anima-view');
    views.forEach(v => { /** @type {HTMLElement} */ (v).style.display = 'none'; });
    const target = popupEl.querySelector(`#anima_view_${name}`);
    if (target) /** @type {HTMLElement} */ (target).style.display = '';
    // Sync TTS intercept when view changes
    syncTtsInterceptState();
}

/* ───────── Login ───────── */

/** After successful auth, decide whether to show avatars grid or jump to runtime. */
function navigateAfterLogin() {
    const meta = getBindingMeta();
    const binding = getBinding(meta.key);
    if (meta.hasChat && binding.remoteAvatarId) {
        showView('runtime');
        initRuntime();
    } else {
        showView('avatars');
        void loadAvatarGrid();
    }
}

async function tryAutoLogin() {
    const s = ensureSettings();
    if (s.authToken) {
        const probe = await probeApi(getConfig());
        if (probe.ok) {
            navigateAfterLogin();
            return;
        }
    }
    if (s.authMailbox && s.authPassword) {
        setLoginStatus(t('login.autoSignIn'));
        try {
            await doLogin(s.authMailbox, s.authPassword);
            return;
        } catch { /* fall through to login view */ }
    }
    showView('login');
    if (s.authMailbox && popupEl) {
        const emailInput = /** @type {HTMLInputElement|null} */ (popupEl.querySelector('#anima_login_email'));
        if (emailInput) emailInput.value = s.authMailbox;
    }
}

/** @param {string} text @param {boolean} [isError] */
function setLoginStatus(text, isError = false) {
    if (!popupEl) return;
    const el = popupEl.querySelector('#anima_login_status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
}

/** @param {string} mailbox @param {string} password */
async function doLogin(mailbox, password) {
    const config = { ...getConfig(), authToken: '' };
    let result = await loginApi(mailbox, password, config);
    let registered = false;

    if (!(result?.code === 0 || result?.code === 200)) {
        result = await registerApi(mailbox, password, mailbox.split('@')[0] || 'User', config);
        registered = true;
        if (!(result?.code === 0 || result?.code === 200)) {
            throw new Error(result?.msg || 'Login/register failed');
        }
    }

    const token = result?.data?.accessToken;
    if (!token) throw new Error('No access token returned');

    const s = ensureSettings();
    s.authToken = token;
    s.authMailbox = mailbox;
    s.authPassword = password;
    s.authUserId = String(result?.data?.user?.id || '');
    saveSettings();

    getToastr().info(registered ? t('login.accountCreated') : t('login.signedIn'));
    navigateAfterLogin();
}

function doLogout() {
    const s = ensureSettings();
    s.authToken = '';
    s.authPassword = '';
    s.authUserId = '';
    saveSettings();
    showView('login');
    getToastr().info(t('login.loggedOut'));
}

/* ───────── Avatar Grid ───────── */

/** @type {any[]} */
let avatarListCache = [];
/** @type {string} */
let activeTab = 'all';

async function loadAvatarGrid() {
    if (!popupEl) return;
    const grid = popupEl.querySelector('#anima_avatars_grid');
    if (!grid) return;
    grid.innerHTML = `<div class="anima-avatars__empty">${escapeHtml(t('avatars.loading'))}</div>`;

    try {
        const config = getConfig();
        const myAvatars = await avatarsList(config);
        const previousById = new Map(avatarListCache.map(a => [String(a.avatarsId || a.id || ''), a]));

        // Fetch official avatars
        const officialAvatars = [];
        for (const id of OFFICIAL_AVATAR_IDS) {
            try {
                const detail = await avatarGet(id, config);
                if (detail) officialAvatars.push({ ...detail, _isOfficial: true });
            } catch { /* skip unavailable */ }
        }

        // Merge, deduplicate
        const seen = new Set();
        avatarListCache = [];
        for (const a of officialAvatars) {
            const aid = String(a.avatarsId || a.id || '');
            if (aid && !seen.has(aid)) {
                seen.add(aid);
                avatarListCache.push(normalizeAvatarEntry({ ...a, _isOfficial: true }, previousById.get(aid)));
            }
        }
        for (const a of myAvatars) {
            const aid = String(a.avatarsId || a.id || '');
            if (aid && !seen.has(aid)) {
                seen.add(aid);
                avatarListCache.push(normalizeAvatarEntry(a, previousById.get(aid)));
            }
        }
        for (const [aid, existing] of previousById.entries()) {
            if (!aid || seen.has(aid) || !existing?.generating) continue;
            seen.add(aid);
            avatarListCache.push(normalizeAvatarEntry(existing, existing));
        }

        renderAvatarGrid();
        watchGeneratingAvatars();
    } catch (error) {
        grid.innerHTML = `<div class="anima-avatars__empty">${escapeHtml(t('avatars.loadFailed', errMsg(error)))}</div>`;
    }
}

function renderAvatarGrid() {
    if (!popupEl) return;
    const grid = popupEl.querySelector('#anima_avatars_grid');
    if (!grid) return;

    const filtered = avatarListCache.filter(a => {
        if (activeTab === 'official') return a._isOfficial || OFFICIAL_AVATAR_IDS.includes(String(a.avatarsId || ''));
        if (activeTab === 'my') return !a._isOfficial && !OFFICIAL_AVATAR_IDS.includes(String(a.avatarsId || ''));
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="anima-avatars__empty">${escapeHtml(t('avatars.empty'))}</div>`;
        return;
    }

    const meta = getBindingMeta();
    const currentBinding = getBinding(meta.key);

    grid.innerHTML = filtered.map(a => {
        const aid = String(a.avatarsId || a.id || '');
        const name = String(a.nickname || a.name || t('avatars.defaultName'));
        const img = String(a.avatarImg || a.photoLink || a.image || '');
        const isOfficial = a._isOfficial || OFFICIAL_AVATAR_IDS.includes(aid);
        const hasModel = Boolean(a.downloadLink || a.modelUrl);
        const generating = Boolean(a.generating);
        const hasError = Boolean(a._error);
        const progress = Math.max(0, Math.min(Number(a.progress || 0), 100));
        const isSelected = currentBinding.remoteAvatarId === aid;

        // Find which ST characters are bound to this avatar
        const boundTo = findBindingsForAvatar(aid);
        const boundLabels = boundTo.map(b => resolveBindingKeyLabel(b.key));

        let badge = '';
        if (generating) badge = `<span class="anima-avatar-card__badge anima-avatar-card__badge--generating">${escapeHtml(t('avatars.badgeGenerating'))}</span>`;
        else if (hasError) badge = `<span class="anima-avatar-card__badge anima-avatar-card__badge--error">${escapeHtml(t('avatars.badgeFailed'))}</span>`;
        else if (hasModel) badge = `<span class="anima-avatar-card__badge anima-avatar-card__badge--ready">${escapeHtml(t('avatars.badgeReady'))}</span>`;
        else if (isOfficial) badge = `<span class="anima-avatar-card__badge anima-avatar-card__badge--official">${escapeHtml(t('avatars.badgeOfficial'))}</span>`;

        const boundBadge = boundLabels.length > 0
            ? `<div class="anima-avatar-card__bound" title="Bound to: ${escapeHtml(boundLabels.join(', '))}">
                <i class="fa-solid fa-link"></i> ${escapeHtml(boundLabels.slice(0, 2).join(', '))}${boundLabels.length > 2 ? '…' : ''}
               </div>`
            : '';

        const imgHtml = img
            ? `<img class="anima-avatar-card__img" src="${escapeHtml(img)}" alt="${escapeHtml(name)}" loading="lazy" />`
            : `<div class="anima-avatar-card__img-placeholder"><i class="fa-solid fa-user"></i></div>`;
        const overlayHtml = generating
            ? `<div class="anima-avatar-card__generating-overlay">
                <div class="anima-avatar-card__spinner"></div>
                <span class="anima-avatar-card__generating-label">${escapeHtml(progress > 0 ? t('avatars.generatingProgress', String(progress)) : t('avatars.badgeGenerating'))}</span>
                <div class="anima-avatar-card__generating-progress">
                    <div class="anima-avatar-card__generating-progress-fill ${progress > 0 ? '' : 'is-indeterminate'}" style="width:${progress > 0 ? progress : 36}%"></div>
                </div>
            </div>`
            : '';
        const descHtml = `<div class="anima-avatar-card__desc">${escapeHtml(generating ? t('avatars.estimate') : hasError ? t('avatars.failed') : '')}</div>`;

        const editActions = isOfficial ? '' : `
                <button class="anima-avatar-card__action-btn" data-action="rename" data-id="${escapeHtml(aid)}" title="Rename"><i class="fa-solid fa-pencil"></i></button>
                <button class="anima-avatar-card__action-btn" data-action="delete" data-id="${escapeHtml(aid)}" title="Delete"><i class="fa-solid fa-trash"></i></button>`;
        const actions = `
            <div class="anima-avatar-card__actions">
                <button class="anima-avatar-card__action-btn" data-action="bind" data-id="${escapeHtml(aid)}" title="Bind to character"><i class="fa-solid fa-link"></i></button>
                ${editActions}
            </div>`;

        return `
            <div class="anima-avatar-card ${isSelected ? 'is-selected' : ''} ${generating ? 'is-generating' : ''}" data-avatar-id="${escapeHtml(aid)}">
                ${imgHtml}
                ${overlayHtml}
                ${actions}
                <div class="anima-avatar-card__info">
                    <div class="anima-avatar-card__name" data-name-id="${escapeHtml(aid)}">${escapeHtml(name)}</div>
                    ${badge}
                    ${descHtml}
                    ${boundBadge}
                </div>
            </div>`;
    }).join('');

    // Bind card clicks — single click opens runtime (or prompts bind if unbound)
    grid.querySelectorAll('.anima-avatar-card').forEach(card => {
        const aid = card.getAttribute('data-avatar-id');
        if (!aid) return;

        // Click → open / bind-then-open
        card.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest('[data-action]')) return;
            void openOrBindAvatar(aid);
        });

        // Right-click → always show bind dialog
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            void bindAvatar(aid);
        });

        // Long-press (mobile) → bind dialog
        /** @type {ReturnType<typeof setTimeout>|null} */
        let lpTimer = null;
        card.addEventListener('touchstart', () => {
            lpTimer = setTimeout(() => { lpTimer = null; void bindAvatar(aid); }, 600);
        }, { passive: true });
        card.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        card.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
    });

    // Bind action buttons
    grid.querySelectorAll('[data-action="bind"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = /** @type {HTMLElement} */ (btn).getAttribute('data-id');
            if (id) void bindAvatar(id);
        });
    });
    grid.querySelectorAll('[data-action="rename"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = /** @type {HTMLElement} */ (btn).getAttribute('data-id');
            if (id) startInlineRename(id);
        });
    });
    grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = /** @type {HTMLElement} */ (btn).getAttribute('data-id');
            if (id) void confirmDeleteAvatar(id);
        });
    });
}

/* ───────── Avatar Selection → Binding ───────── */

/**
 * Build binding data from an avatar detail object.
 * @param {any} detail
 * @returns {Record<string, string>}
 */
function buildBindingData(detail) {
    const modelUrl = String(detail.downloadLink || detail.modelUrl || detail.modelDownloadLink || '');
    const posterUrl = String(detail.avatarImg || detail.photoLink || detail.image || detail.lookImg || '');
    const modelId = String(detail.modelId || '');
    const voiceId = String(detail.voiceId || detail.ttsId || detail.tts?.[0]?.ttsId || detail.builtinTts?.[0]?.ttsId || ensureSettings().defaultVoiceId || '1');

    return {
        avatarLabel: String(detail.nickname || detail.name || ''),
        posterUrl,
        modelUrl,
        modelId,
        voiceId,
        remoteAvatarId: String(detail.avatarsId || detail.id || ''),
        remoteLanguageId: String(detail.tts?.[0]?.languageId || ''),
        remoteVoiceName: '',
    };
}

/**
 * Single-click handler: if avatar is already bound → open runtime directly.
 * If not bound → show character selector first, then open runtime.
 * @param {string} avatarId
 */
async function openOrBindAvatar(avatarId) {
    try {
        const detail = await avatarGet(avatarId, getConfig());
        if (!detail) { getToastr().warning(t('avatars.notFound')); return; }
        if (detail.generating) { getToastr().info(t('avatars.stillGenerating')); return; }

        const aid = String(detail.avatarsId || avatarId);
        const bindingData = buildBindingData(detail);
        const existingBindings = findBindingsForAvatar(aid);
        const meta = getBindingMeta();

        if (existingBindings.length > 0) {
            // Already bound — find matching binding for current character, or use first
            const matchCurrent = existingBindings.find(b => b.key === meta.key);

            if (matchCurrent) {
                // Bound to current character — just refresh & open
                setBinding(matchCurrent.key, bindingData);
                openRuntimeForBinding(matchCurrent.key);
            } else {
                // Bound to a different character — use the first existing binding's key
                const fallbackKey = existingBindings[0].key;
                // Also bind to current character if a chat is open
                if (meta.hasChat) {
                    setBinding(meta.key, bindingData);
                    openRuntimeForBinding(meta.key);
                } else {
                    // No active chat — refresh the existing binding and use it directly
                    setBinding(fallbackKey, bindingData);
                    openRuntimeForBinding(fallbackKey);
                }
            }
        } else {
            // Not bound — bind to current character directly, or show selector if no chat
            if (!meta.hasChat) {
                const target = await showCharacterSelector();
                if (!target) return;
                setBinding(target.key, buildBindingData(detail));
                getToastr().info(t('avatars.bound', detail.nickname || 'avatar', target.label));
                renderAvatarGrid();
                openRuntimeForBinding(target.key);
                return;
            }
            setBinding(meta.key, bindingData);
            getToastr().info(t('avatars.bound', detail.nickname || 'avatar', meta.label));
            renderAvatarGrid();
            openRuntimeForBinding(meta.key);
        }
    } catch (error) {
        getToastr().error(errMsg(error), 'Open avatar');
    }
}

/**
 * Right-click / long-press / bind-button handler: always show character selector.
 * @param {string} avatarId
 */
async function bindAvatar(avatarId) {
    try {
        const detail = await avatarGet(avatarId, getConfig());
        if (!detail) { getToastr().warning(t('avatars.notFound')); return; }
        if (detail.generating) { getToastr().info(t('avatars.stillGenerating')); return; }

        const target = await showCharacterSelector();
        if (!target) return;

        setBinding(target.key, buildBindingData(detail));
        getToastr().info(t('avatars.bound', detail.nickname || 'avatar', target.label));
        renderAvatarGrid();

        // If bound to current character, open runtime
        const meta = getBindingMeta();
        if (meta.key === target.key) {
            openRuntimeForBinding(target.key);
        }
    } catch (error) {
        getToastr().error(errMsg(error), 'Bind avatar');
    }
}

/**
 * Open the runtime view for a specific binding key.
 * @param {string} [bindingKey]
 */
function openRuntimeForBinding(bindingKey) {
    showView('runtime');
    initRuntime(bindingKey);
}

/**
 * Show a modal that lets the user pick a character or group to bind to.
 * Returns { key, label } or null if cancelled.
 * @returns {Promise<{ key: string, label: string } | null>}
 */
function showCharacterSelector() {
    return new Promise(resolve => {
        const ctx = getContext();
        const chars = Array.isArray(ctx.characters) ? ctx.characters : [];
        const groups = Array.isArray(ctx.groups) ? ctx.groups : [];

        // Build option list
        /** @type {{ key: string, label: string, avatar: string, isCurrent: boolean }[]} */
        const options = [];
        const meta = getBindingMeta();

        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (!ch || !ch.name) continue;
            const fn = String(ch.avatar || '').replace(/\.[^/.]+$/, '');
            const key = fn ? `character:${fn}` : `character:${i}`;
            const existing = getBinding(key);
            options.push({
                key,
                label: String(ch.name) + (existing.remoteAvatarId ? ` ${t('bind.bound')}` : ''),
                avatar: ch.avatar ? `/characters/${ch.avatar}` : '',
                isCurrent: key === meta.key,
            });
        }

        for (const g of groups) {
            if (!g || !g.name) continue;
            const key = `group:${g.id}`;
            const existing = getBinding(key);
            options.push({
                key,
                label: String(g.name) + (existing.remoteAvatarId ? ` ${t('bind.bound')}` : ''),
                avatar: '',
                isCurrent: key === meta.key,
            });
        }

        // Create modal
        const overlay = document.createElement('div');
        overlay.className = 'anima-confirm';
        overlay.innerHTML = `
            <div class="anima-chara-selector">
                <div class="anima-chara-selector__header">
                    <h4>${escapeHtml(t('bind.title'))}</h4>
                    <input type="text" class="anima-chara-selector__search" placeholder="${escapeHtml(t('bind.search'))}" />
                </div>
                <div class="anima-chara-selector__list"></div>
                <div class="anima-chara-selector__footer">
                    <button class="anima-btn" data-cancel>${escapeHtml(t('bind.cancel'))}</button>
                </div>
            </div>`;

        const list = /** @type {HTMLElement} */ (overlay.querySelector('.anima-chara-selector__list'));
        const search = /** @type {HTMLInputElement} */ (overlay.querySelector('.anima-chara-selector__search'));

        /** @param {string} filter */
        function renderList(filter = '') {
            const f = filter.toLowerCase();
            const filtered = f ? options.filter(o => o.label.toLowerCase().includes(f)) : options;
            list.innerHTML = filtered.length === 0
                ? '<div class="anima-chara-selector__empty">' + escapeHtml(t('bind.noChars')) + '</div>'
                : filtered.map(o => {
                    const imgHtml = o.avatar
                        ? `<img class="anima-chara-selector__avatar" src="${escapeHtml(o.avatar)}" alt="" />`
                        : `<div class="anima-chara-selector__avatar anima-chara-selector__avatar--placeholder"><i class="fa-solid fa-user"></i></div>`;
                    return `<div class="anima-chara-selector__item ${o.isCurrent ? 'is-current' : ''}" data-key="${escapeHtml(o.key)}" data-label="${escapeHtml(o.label.replace(/ \[bound\]$/, ''))}">
                        ${imgHtml}
                        <span class="anima-chara-selector__name">${escapeHtml(o.label)}</span>
                        ${o.isCurrent ? '<span class="anima-chara-selector__current-tag">' + escapeHtml(t('bind.current')) + '</span>' : ''}
                    </div>`;
                }).join('');

            list.querySelectorAll('.anima-chara-selector__item').forEach(item => {
                item.addEventListener('click', () => {
                    const key = item.getAttribute('data-key');
                    const label = item.getAttribute('data-label');
                    overlay.remove();
                    resolve(key && label ? { key, label } : null);
                });
            });
        }

        renderList();
        search.addEventListener('input', () => renderList(search.value));
        overlay.querySelector('[data-cancel]')?.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });

        document.body.appendChild(overlay);
        search.focus();
    });
}

/* ───────── Inline Rename ───────── */

/** @param {string} avatarId */
function startInlineRename(avatarId) {
    if (!popupEl) return;
    const nameEl = popupEl.querySelector(`[data-name-id="${avatarId}"]`);
    if (!nameEl) return;
    const currentName = nameEl.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'anima-avatar-card__name-input';
    input.value = currentName;
    input.maxLength = 50;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
        const newName = input.value.trim();
        if (!newName || newName === currentName) {
            input.outerHTML = `<div class="anima-avatar-card__name" data-name-id="${escapeHtml(avatarId)}">${escapeHtml(currentName)}</div>`;
            return;
        }
        try {
            await avatarsUpdate({ avatarsId: avatarId, nickname: newName }, getConfig());
            const a = avatarListCache.find(x => String(x.avatarsId || x.id) === avatarId);
            if (a) a.nickname = newName;
            input.outerHTML = `<div class="anima-avatar-card__name" data-name-id="${escapeHtml(avatarId)}">${escapeHtml(newName)}</div>`;
            getToastr().info(t('avatars.renamed'));
        } catch (error) {
            getToastr().error(errMsg(error), t('avatars.renameFailed'));
            input.outerHTML = `<div class="anima-avatar-card__name" data-name-id="${escapeHtml(avatarId)}">${escapeHtml(currentName)}</div>`;
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentName; input.blur(); }
    });
}

/* ───────── Delete Avatar ───────── */

/** @param {string} avatarId */
async function confirmDeleteAvatar(avatarId) {
    const avatar = avatarListCache.find(a => String(a.avatarsId || a.id) === avatarId);
    const name = avatar?.nickname || 'this avatar';

    const confirmed = await showConfirm(t('avatars.deleteConfirm', name));
    if (!confirmed) return;

    try {
        closeGenerationSSE(avatarId);
        await avatarsDelete(avatarId, getConfig());
        avatarListCache = avatarListCache.filter(a => String(a.avatarsId || a.id) !== avatarId);
        renderAvatarGrid();
        getToastr().info(t('avatars.deleted'));
    } catch (error) {
        getToastr().error(errMsg(error), t('avatars.deleteFailed'));
    }
}

/** @param {string} message @returns {Promise<boolean>} */
function showConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'anima-confirm';
        overlay.innerHTML = `
            <div class="anima-confirm__box">
                <div class="anima-confirm__text">${escapeHtml(message)}</div>
                <div class="anima-confirm__actions">
                    <button class="anima-btn" data-result="false">${escapeHtml(t('common.cancel'))}</button>
                    <button class="anima-btn anima-btn--danger" data-result="true">${escapeHtml(t('common.delete'))}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            const btn = /** @type {HTMLElement} */ (e.target).closest('[data-result]');
            if (!btn) return;
            overlay.remove();
            resolve(btn.getAttribute('data-result') === 'true');
        });
    });
}

/**
 * @param {any} avatar
 * @param {any} [existing]
 */
function normalizeAvatarEntry(avatar, existing = null) {
    const merged = { ...(existing || {}), ...(avatar || {}) };
    const aid = String(merged.avatarsId || merged.id || '');
    const modelUrl = String(merged.downloadLink || merged.modelUrl || '');
    const status = String(merged.avatarsStatus ?? merged.status ?? '');
    const isOfficial = Boolean(merged._isOfficial) || OFFICIAL_AVATAR_IDS.includes(aid);
    const isFailed = Boolean(merged._error) || status === '42' || status === '43' || status === 'style-error' || status === 'model-error';
    const isDone = isOfficial || Boolean(modelUrl.trim()) || status === '1' || status === '2' || status === '3';
    const isGenerating = !isOfficial && !isDone && !isFailed && (Boolean(merged.generating) || !status || status === '0');
    return {
        ...merged,
        id: aid,
        avatarsId: aid,
        nickname: String(merged.nickname || merged.name || existing?.nickname || existing?.name || t('avatars.defaultName')),
        avatarImg: String(merged.avatarImg || merged.photoLink || merged.image || existing?.avatarImg || existing?.photoLink || existing?.image || ''),
        modelUrl,
        generating: isGenerating,
        progress: isGenerating ? Number(merged.progress || existing?.progress || 0) : isDone ? 100 : 0,
        _error: isFailed,
        _isOfficial: isOfficial,
    };
}

/** @param {string} avatarId */
function clearGenerationRetry(avatarId) {
    const timer = generationSSERetryTimers.get(avatarId);
    if (!timer) return;
    clearTimeout(timer);
    generationSSERetryTimers.delete(avatarId);
}

/** @param {string} avatarId */
function closeGenerationSSE(avatarId) {
    clearGenerationRetry(avatarId);
    const connection = generationSSEConnections.get(avatarId);
    if (!connection) return;
    connection.close();
    generationSSEConnections.delete(avatarId);
}

function closeAllGenerationSSE() {
    Array.from(generationSSEConnections.keys()).forEach(closeGenerationSSE);
}

/** @param {string} avatarId */
function scheduleGenerationReconnect(avatarId) {
    const target = avatarListCache.find(a => String(a.avatarsId || a.id || '') === avatarId);
    if (!target?.generating) return;
    clearGenerationRetry(avatarId);
    generationSSERetryTimers.set(avatarId, setTimeout(() => {
        connectGenerationSSE(avatarId);
    }, 5000));
}

/** @param {string} avatarId */
function connectGenerationSSE(avatarId) {
    if (generationSSEConnections.has(avatarId)) return;
    const userId = String(ensureSettings().authUserId || '').trim();
    if (!userId) return;
    generationSSEConnections.set(avatarId, openGenerationSSE(userId, avatarId, getConfig(), {
        onStatus: (status) => {
            const avatar = avatarListCache.find(a => String(a.avatarsId || a.id || '') === avatarId);
            if (!avatar) {
                closeGenerationSSE(avatarId);
                return;
            }
            if (status === 'model-completed') {
                avatar.generating = false;
                avatar.progress = 100;
                avatar._error = false;
                closeGenerationSSE(avatarId);
                renderAvatarGrid();
                void loadAvatarGrid();
                return;
            }
            if (status === 'style-error' || status === 'model-error' || status.includes('error')) {
                avatar.generating = false;
                avatar.progress = 0;
                avatar._error = true;
                closeGenerationSSE(avatarId);
                renderAvatarGrid();
                void loadAvatarGrid();
            }
        },
        onError: () => {
            closeGenerationSSE(avatarId);
            scheduleGenerationReconnect(avatarId);
        },
    }));
}

/** @param {{ avatarId?: string, name?: string, previewUrl?: string, photoUrl?: string }} draft */
function upsertPendingAvatarCard(draft) {
    const avatarId = String(draft?.avatarId || '');
    if (!avatarId) return;
    const pending = normalizeAvatarEntry({
        avatarsId: avatarId,
        nickname: String(draft.name || t('avatars.defaultName')),
        avatarImg: String(draft.previewUrl || draft.photoUrl || ''),
        image: String(draft.previewUrl || draft.photoUrl || ''),
        avatarsStatus: '0',
        generating: true,
        progress: 0,
    }, avatarListCache.find(a => String(a.avatarsId || a.id || '') === avatarId));
    avatarListCache = [pending, ...avatarListCache.filter(a => String(a.avatarsId || a.id || '') !== avatarId)];
}

/* ───────── SSE Generation Tracking ───────── */

function watchGeneratingAvatars() {
    const generatingIds = new Set(avatarListCache
        .filter(a => !a._isOfficial && a.generating)
        .map(a => String(a.avatarsId || a.id || ''))
        .filter(Boolean));

    generatingIds.forEach(connectGenerationSSE);
    Array.from(generationSSEConnections.keys())
        .filter(id => !generatingIds.has(id))
        .forEach(closeGenerationSSE);
}

/* ───────── Create Wizard ───────── */

function initCreateWizard() {
    createWizardState = {
        avatarId: null,
        photoUrl: null,
        previewUrl: null,
        photoFile: null,
        name: '',
        languageId: '',
        voiceId: '',
        step: 1,
    };

    // Reset DOM elements from previous wizard session
    if (popupEl) {
        const preview = /** @type {HTMLImageElement|null} */ (popupEl.querySelector('#anima_upload_preview'));
        const placeholder = popupEl.querySelector('#anima_upload_placeholder');
        const status = popupEl.querySelector('#anima_upload_status');
        const nextBtn = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step1_next'));
        const fileInput = /** @type {HTMLInputElement|null} */ (popupEl.querySelector('#anima_upload_input'));
        const nameInput = /** @type {HTMLInputElement|null} */ (popupEl.querySelector('#anima_create_name'));
        const step2Next = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step2_next'));
        const step3Submit = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step3_submit'));
        const voiceStatus = popupEl.querySelector('#anima_create_voice_status');
        const langSelect = /** @type {HTMLSelectElement|null} */ (popupEl.querySelector('#anima_create_language'));
        const voiceSelect = /** @type {HTMLSelectElement|null} */ (popupEl.querySelector('#anima_create_voice'));

        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        if (placeholder) /** @type {HTMLElement} */ (placeholder).style.display = '';
        if (status) { status.textContent = ''; status.classList.remove('is-error'); }
        if (nextBtn) nextBtn.disabled = true;
        if (fileInput) fileInput.value = '';
        if (nameInput) nameInput.value = '';
        if (step2Next) step2Next.disabled = true;
        if (step3Submit) step3Submit.disabled = false;
        if (voiceStatus) { voiceStatus.textContent = ''; voiceStatus.classList.remove('is-error'); }
        if (langSelect) langSelect.value = '';
        if (voiceSelect) voiceSelect.innerHTML = `<option value="">${escapeHtml(t('create.voiceSelectLang'))}</option>`;
    }

    showView('create');
    showCreateStep(1);
    void loadCreateLanguages();
}

/** @param {number} step */
function showCreateStep(step) {
    if (!popupEl) return;
    createWizardState.step = step;
    for (let i = 1; i <= 3; i++) {
        const el = popupEl.querySelector(`#anima_create_step${i}`);
        if (el) /** @type {HTMLElement} */ (el).style.display = i === step ? '' : 'none';
    }
    // Update step indicators
    popupEl.querySelectorAll('.anima-step').forEach(s => {
        const sn = Number(s.getAttribute('data-step'));
        s.classList.toggle('anima-step--active', sn === step);
        s.classList.toggle('anima-step--done', sn < step);
    });
}

/** @param {Element|null} el @param {string} text @param {boolean} [isError] */
function setCreateStatus(el, text, isError = false) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
}

/** @param {File} file */
async function handlePhotoUpload(file) {
    if (!popupEl || !createWizardState) return;
    const status = popupEl.querySelector('#anima_upload_status');
    const preview = /** @type {HTMLImageElement|null} */ (popupEl.querySelector('#anima_upload_preview'));
    const placeholder = popupEl.querySelector('#anima_upload_placeholder');
    const nextBtn = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step1_next'));

    if (!file || !file.type.match(/^image\/(jpeg|png)$/)) {
        setCreateStatus(status, t('create.onlyJpgPng'), true);
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        setCreateStatus(status, t('create.maxSize'), true);
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = () => {
        createWizardState.previewUrl = /** @type {string} */ (reader.result || '');
        if (preview) { preview.src = /** @type {string} */ (reader.result); preview.style.display = ''; }
        if (placeholder) /** @type {HTMLElement} */ (placeholder).style.display = 'none';
    };
    reader.readAsDataURL(file);

    setCreateStatus(status, t('create.uploading'));
    if (nextBtn) nextBtn.disabled = true;

    try {
        const config = getConfig();
        // Step 1: Create avatar placeholder
        const avatarId = await preGeneration('New Avatar', config);
        createWizardState.avatarId = avatarId;

        // Mark as custom style
        await avatarsUpdate({ avatarsId: avatarId, selectTemplateImg: 'custom-style' }, config);

        // Upload photo
        const formData = new FormData();
        formData.append('file', file);
        formData.append('avatarsId', avatarId);
        const photoUrl = await avatarsUpload(formData, config);
        createWizardState.photoUrl = photoUrl;
        createWizardState.photoFile = file;

        // Validate
        const vForm = new FormData();
        vForm.append('file', file);
        await validateImage(vForm, config);

        setCreateStatus(status, t('create.uploadDone'));
        if (nextBtn) nextBtn.disabled = false;
    } catch (error) {
        setCreateStatus(status, errMsg(error), true);
        if (nextBtn) nextBtn.disabled = true;
    }
}

async function loadCreateLanguages() {
    if (!popupEl) return;
    const langSelect = /** @type {HTMLSelectElement|null} */ (popupEl.querySelector('#anima_create_language'));
    if (!langSelect) return;
    try {
        const languages = await audioLanguageList(getConfig());
        langSelect.innerHTML = `<option value="">${escapeHtml(t('create.langSelect'))}</option>` +
            languages.map(/** @param {any} l */ (l) => `<option value="${escapeHtml(String(l.id || ''))}">${escapeHtml(String(l.name || l.code || 'Unknown'))}</option>`).join('');
    } catch {
        langSelect.innerHTML = `<option value="">${escapeHtml(t('create.langFailed'))}</option>`;
    }
}

/** @param {string} languageId */
async function loadCreateVoices(languageId) {
    if (!popupEl) return;
    const voiceSelect = /** @type {HTMLSelectElement|null} */ (popupEl.querySelector('#anima_create_voice'));
    if (!voiceSelect) return;
    if (!languageId) { voiceSelect.innerHTML = `<option value="">${escapeHtml(t('create.voiceSelectLang'))}</option>`; return; }
    voiceSelect.innerHTML = `<option value="">${escapeHtml(t('create.voiceLoading'))}</option>`;
    try {
        const voices = await audioList(languageId, getConfig());
        voiceSelect.innerHTML = `<option value="">${escapeHtml(t('create.voiceSelect'))}</option>` +
            voices.map(/** @param {any} v */ (v) => {
                const vid = String(v.id || v.ttsId || '');
                const name = String(v.audioName || v.ttsName || 'Voice');
                const sex = v.sex === '0' || v.ttsSex === '0' ? ' (M)' : v.sex === '1' || v.ttsSex === '1' ? ' (F)' : '';
                return `<option value="${escapeHtml(vid)}">${escapeHtml(name + sex)}</option>`;
            }).join('');
    } catch {
        voiceSelect.innerHTML = `<option value="">${escapeHtml(t('create.voiceFailed'))}</option>`;
    }
}

async function submitCreateWizard() {
    if (!popupEl || !createWizardState?.avatarId) return;
    const status = popupEl.querySelector('#anima_create_voice_status');
    const submitBtn = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step3_submit'));
    const skipBtn = /** @type {HTMLButtonElement|null} */ (popupEl.querySelector('#anima_step3_skip'));
    if (submitBtn) submitBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;

    try {
        const config = getConfig();
        const ws = createWizardState;

        // Save name
        if (ws.name) await avatarsUpdate({ avatarsId: ws.avatarId, nickname: ws.name }, config);

        // Bind voice — auto-assign first available if user skipped
        let langId = ws.languageId;
        let vId = ws.voiceId;
        if (!langId || !vId) {
            try {
                const languages = await audioLanguageList(config);
                if (languages?.length) {
                    langId = String(languages[0].id || '');
                    const voices = await audioList(langId, config);
                    if (voices?.length) {
                        vId = String(voices[0].id || voices[0].ttsId || '');
                    }
                }
            } catch { /* best effort — avatar still gets created without voice */ }
        }
        if (langId && vId) {
            await ttsUpdate({
                avatarsId: ws.avatarId,
                languageId: langId,
                ttsId: vId,
                action: 'add',
            }, config);
        }

        // Trigger model generation
        setCreateStatus(status, t('create.generating'));
        const genForm = new FormData();
        genForm.append('avatarsId', ws.avatarId);
        if (ws.photoUrl) genForm.append('url', ws.photoUrl);
        genForm.append('modelType', '0');
        genForm.append('sex', '0');
        genForm.append('video', '0');
        await modelGenerate(genForm, config);

        setCreateStatus(status, t('create.submitted'));
        getToastr().info(t('create.success'));
        upsertPendingAvatarCard(ws);
        showView('avatars');
        renderAvatarGrid();
        watchGeneratingAvatars();
        createWizardState = null;

        // Go back to avatar list and refresh
        void loadAvatarGrid();
    } catch (error) {
        setCreateStatus(status, errMsg(error), true);
        if (submitBtn) submitBtn.disabled = false;
        if (skipBtn) skipBtn.disabled = false;
    }
}

async function cleanupDraftAvatar() {
    if (!createWizardState?.avatarId) return;
    const confirmed = await showConfirm(t('create.discardConfirm'));
    if (confirmed) {
        closeGenerationSSE(String(createWizardState.avatarId));
        try { await avatarsDelete(createWizardState.avatarId, getConfig()); } catch { /* best effort */ }
        createWizardState = null;
    }
    return confirmed;
}

/* ───────── Runtime (3D Avatar Display) ───────── */

/** @type {string|undefined} */
let activeBindingKey;

/**
 * Tell the runtime iframe to fully destroy its renderer and reset state.
 * Also resets the iframe tracking data so the next initRuntime() reloads fresh.
 */
function destroyRuntimeIframe() {
    if (!popupEl) return;
    // Clear external TTS queue to avoid stale audio going to a new iframe
    externalTtsQueue.length = 0;
    externalTtsProcessing = false;
    const frame = /** @type {HTMLIFrameElement|null} */ (popupEl.querySelector('#anima_runtime_frame'));
    if (frame?.contentWindow && frame.dataset.runtimeReady === 'true') {
        try {
            frame.contentWindow.postMessage({ type: 'anima-runtime-control', command: 'destroy' }, '*');
        } catch { /* sandboxed */ }
    }
    // Reset iframe tracking so next initRuntime() does a full reload
    if (frame) {
        delete frame.dataset.runtimeReady;
        delete frame.dataset.runtimeSrc;
    }
}

/** @param {string} [overrideKey] */
function initRuntime(overrideKey) {
    if (!popupEl) return;
    activeBindingKey = overrideKey || undefined;
    const key = activeBindingKey || getBindingMeta().key;
    const binding = getBinding(key);
    const frame = /** @type {HTMLIFrameElement|null} */ (popupEl.querySelector('#anima_runtime_frame'));
    const empty = popupEl.querySelector('#anima_runtime_empty');
    const nameEl = popupEl.querySelector('#anima_runtime_avatar_name');

    if (nameEl) nameEl.textContent = binding.avatarLabel || t('runtime.defaultName');

    // Auto-fill voiceId from remote avatar if missing
    if (!binding.voiceId && binding.remoteAvatarId) {
        void avatarGet(binding.remoteAvatarId, getConfig()).then(detail => {
            if (!detail) return;
            const vid = String(detail.voiceId || detail.ttsId || detail.tts?.[0]?.ttsId || detail.builtinTts?.[0]?.ttsId || '');
            if (vid) {
                const b = getBinding(key);
                b.voiceId = vid;
                setBinding(key, b);
                sendRuntimePayload();
            }
        }).catch(() => {});
    }

    if (!binding.modelUrl && !binding.posterUrl) {
        if (frame) frame.style.display = 'none';
        if (empty) /** @type {HTMLElement} */ (empty).textContent = t('runtime.noModel');
        return;
    }

    const runtimeUrl = ensureSettings().runtimeUrl || DEFAULT_RUNTIME_URL;
    if (frame) {
        frame.style.display = '';
        if (empty) /** @type {HTMLElement} */ (empty).style.display = 'none';
        // Always reload the iframe to ensure clean state for the new avatar
        frame.dataset.runtimeSrc = runtimeUrl;
        frame.src = runtimeUrl;
        frame.onload = () => {
            frame.dataset.runtimeReady = 'true';
            sendRuntimePayload();
        };
    }

    startRuntimeSync();
    syncTtsInterceptState();
}

function sendRuntimePayload() {
    if (!popupEl) return;
    const frame = /** @type {HTMLIFrameElement|null} */ (popupEl.querySelector('#anima_runtime_frame'));
    if (!frame?.contentWindow || frame.dataset.runtimeReady !== 'true') return;

    const key = activeBindingKey || getBindingMeta().key;
    const binding = getBinding(key);
    const s = ensureSettings();
    const ctx = getContext();
    const chatEntries = Array.isArray(ctx.chat) ? ctx.chat : [];
    const messages = chatEntries.slice(-6).map(item => ({
        role: item?.is_system ? 'system' : item?.is_user ? 'user' : 'assistant',
        name: String(item?.name || ''),
        text: String(item?.mes || ''),
    }));

    frame.contentWindow.postMessage({
        type: 'anima-runtime-update',
        binding: {
            key,
            avatarLabel: binding.avatarLabel,
            avatarName: binding.avatarLabel || t('runtime.defaultName'),
            posterUrl: binding.posterUrl,
            modelUrl: binding.modelUrl,
            modelId: binding.modelId,
            remoteAvatarId: binding.remoteAvatarId,
            voiceId: binding.voiceId || s.defaultVoiceId,
        },
        config: {
            apiBaseUrl: s.apiBaseUrl,
            authToken: s.authToken,
            defaultVoiceId: s.defaultVoiceId,
            autoLipSync: s.useStTts ? false : s.autoLipSync,
            useStTts: s.useStTts,
        },
        status: {
            isBusy: Boolean(ctx.streamingProcessor && !ctx.streamingProcessor.isStopped),
            replyEventId,
        },
        conversation: { messages, activeName: binding.avatarLabel || t('runtime.defaultName') },
    }, '*');
}

function startRuntimeSync() {
    stopRuntimeSync();
    runtimeTimer = setInterval(() => {
        if (currentView === 'runtime') sendRuntimePayload();
    }, 2000);
}

function stopRuntimeSync() {
    if (runtimeTimer) { clearInterval(runtimeTimer); runtimeTimer = null; }
}

/* ───────── Event Listeners (SillyTavern) ───────── */

function bindSTEvents() {
    unbindSTEvents();
    const ctx = getContext();
    /** @type {[string, () => void][]} */
    const handlers = [];

    const onReply = () => {
        replyEventId++;
        sendRuntimePayload();
    };
    const onGenStart = () => sendRuntimePayload();
    const onStreamToken = () => sendRuntimePayload();
    const onGenEnd = () => sendRuntimePayload();
    const onChatChanged = () => {
        replyEventId = 0;
        activeBindingKey = undefined; // reset to use current character's binding
        const meta = getBindingMeta();
        const binding = getBinding(meta.key);
        if (binding.remoteAvatarId) {
            // This character has a bound avatar — auto-open popup and show runtime
            if (!popupEl) openPopup(); // this also calls tryAutoLogin which navigates
            else {
                // Destroy old runtime before loading new avatar
                stopRuntimeSync();
                destroyRuntimeIframe();
                showView('runtime');
                initRuntime();
            }
        } else {
            // No binding — just refresh if runtime is showing
            if (currentView === 'runtime') {
                stopRuntimeSync();
                destroyRuntimeIframe();
                showView('avatars');
                void loadAvatarGrid();
            }
        }
    };

    handlers.push([ctx.eventTypes.MESSAGE_RECEIVED, onReply]);
    handlers.push([ctx.eventTypes.GENERATION_STARTED, onGenStart]);
    handlers.push([ctx.eventTypes.STREAM_TOKEN_RECEIVED, onStreamToken]);
    handlers.push([ctx.eventTypes.GENERATION_STOPPED, onGenEnd]);
    handlers.push([ctx.eventTypes.GENERATION_ENDED, onGenEnd]);
    handlers.push([ctx.eventTypes.CHAT_CHANGED, onChatChanged]);

    for (const [evt, fn] of handlers) ctx.eventSource.on(evt, fn);
    cleanupEvents = () => { for (const [evt, fn] of handlers) ctx.eventSource.removeListener(evt, fn); };
}

function unbindSTEvents() { cleanupEvents?.(); cleanupEvents = null; }

/* ───────── Runtime Bridge (postMessage from iframe) ───────── */

function attachBridge() {
    detachBridge();
    /** @param {MessageEvent} event */
    const onMessage = (event) => {
        if (!popupEl) return;
        const frame = /** @type {HTMLIFrameElement|null} */ (popupEl.querySelector('#anima_runtime_frame'));
        if (!frame || event.source !== frame.contentWindow) return;
        if (event.data?.type === 'anima-runtime-report') {
            const statusEl = popupEl.querySelector('#anima_runtime_status_text');
            if (statusEl) statusEl.textContent = String(event.data.status || 'Idle');
            return;
        }
        if (event.data?.type === 'anima-runtime-tts-done') {
            // Current external TTS chunk finished playing in iframe — advance the queue
            externalTtsProcessing = false;
            processExternalTtsQueue();
            return;
        }
        if (event.data?.type !== 'anima-runtime-command') return;

        const { command, text } = event.data;
        if (command === 'chat-send' && text) {
            void handleRuntimeChatSend(String(text));
        }
        if (command === 'interrupt') {
            // Clear external TTS queue so stale audio doesn't play after re-asking
            externalTtsQueue.length = 0;
            externalTtsProcessing = false;
            // Stop SillyTavern's generation if in progress
            try {
                const ctx = getContext();
                if (ctx.streamingProcessor && !ctx.streamingProcessor.isStopped) {
                    ctx.streamingProcessor.isStopped = true;
                    if (typeof ctx.streamingProcessor.onStopStreaming === 'function') {
                        ctx.streamingProcessor.onStopStreaming();
                    }
                }
                // Also try the stop button click as fallback
                document.querySelector('#mes_stop')?.dispatchEvent(new Event('click', { bubbles: true }));
            } catch { /* ignore */ }
        }
    };
    window.addEventListener('message', onMessage);
    cleanupBridge = () => window.removeEventListener('message', onMessage);
}

/**
 * Receives text from the runtime iframe chat bar and sends it into ST chat.
 * Flow: inject user message → trigger AI generation → after reply, force lip-sync.
 * @param {string} text
 */
async function handleRuntimeChatSend(text) {
    try {
        const ctx = getContext();
        // Use ST slash commands to send user message + trigger AI reply
        if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
            await ctx.executeSlashCommandsWithOptions(`/send ${text}`);
            await ctx.executeSlashCommandsWithOptions('/trigger await=true');
        } else {
            // Fallback: manipulate textarea directly
            const textarea = document.querySelector('#send_textarea');
            if (textarea) {
                /** @type {HTMLTextAreaElement} */ (textarea).value = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#send_but')?.dispatchEvent(new Event('click', { bubbles: true }));
                // Wait a bit for generation to complete
                await new Promise(r => setTimeout(r, 500));
            }
        }
        // After AI reply, push latest messages to iframe
        sendRuntimePayload();
        // Only send explicit lipsync if autoLipSync is off and useStTts is off
        // (when useStTts is on, the TTS event handler drives lip-sync)
        const s = ensureSettings();
        if (!s.autoLipSync && !s.useStTts) {
            const frame = /** @type {HTMLIFrameElement|null} */ (popupEl?.querySelector('#anima_runtime_frame'));
            if (frame?.contentWindow) {
                frame.contentWindow.postMessage({ type: 'anima-runtime-control', command: 'lipsync' }, '*');
            }
        }
    } catch (err) {
        console.warn('[Anima] handleRuntimeChatSend error:', err);
    }
}

function detachBridge() { cleanupBridge?.(); cleanupBridge = null; }

/* ───────── ST TTS Intercept ───────── */

/** @type {boolean} */
let ttsInterceptActive = false;
/** @type {(() => void) | null} */
let ttsInterceptCleanup = null;
/** @type {(() => void) | null} */
let ttsEventCleanup = null;

/**
 * Convert a Blob to raw base64 (no data: prefix).
 * @param {Blob|string} blobOrStr
 * @returns {Promise<string>}
 */
function blobToRawBase64(blobOrStr) {
    if (typeof blobOrStr === 'string') {
        // Already a data URI or base64 string
        if (blobOrStr.includes(',')) return Promise.resolve(blobOrStr.split(',')[1]);
        return Promise.resolve(blobOrStr);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = /** @type {string} */ (reader.result);
            resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blobOrStr);
    });
}

/**
 * Queue for external TTS audio chunks.
 * When ST TTS sends multiple segments (multi-voice, paragraphs), we queue them
 * so each lip-sync completes before the next starts.
 * @type {{ audioBase64: string, text: string }[]}
 */
const externalTtsQueue = [];
let externalTtsProcessing = false;

/**
 * Send one audio chunk to the runtime iframe for atfDt lip-sync.
 * @param {string} audioBase64
 * @param {string} text
 * @param {string} [mimeType]
 */
function sendExternalTtsToRuntime(audioBase64, text, mimeType) {
    const frame = /** @type {HTMLIFrameElement|null} */ (popupEl?.querySelector('#anima_runtime_frame'));
    console.info('[Anima] sendExternalTtsToRuntime:', { hasFrame: !!frame, ready: frame?.dataset?.runtimeReady, b64Len: audioBase64?.length });
    if (!frame?.contentWindow || frame.dataset.runtimeReady !== 'true') return;
    frame.contentWindow.postMessage({
        type: 'anima-runtime-control',
        command: 'external-tts',
        audioBase64,
        text,
        mimeType: mimeType || 'audio/mpeg',
    }, '*');
}

/**
 * Process external TTS queue one at a time. The runtime iframe reports back
 * 'external-tts-done' when the current playback finishes.
 */
function processExternalTtsQueue() {
    if (externalTtsProcessing || externalTtsQueue.length === 0) return;
    externalTtsProcessing = true;
    const item = externalTtsQueue.shift();
    sendExternalTtsToRuntime(item.audioBase64, item.text, item.mimeType);
}

/**
 * Patch the ST TTS audio element to suppress playback.
 * Can be called multiple times safely — only patches once.
 *
 * Strategy: Replace the #tts_audio element in the DOM with a neutered clone.
 * ST's module-scoped `audioElement` still references the ORIGINAL object, so:
 *  - We keep the original object alive but detached from DOM.
 *  - Override play() on the original to be a no-op + dispatch 'ended' so the queue advances.
 *  - Set volume=0, muted=true as safety belts.
 *
 * @returns {boolean} true if patched successfully
 */
function patchTtsAudioElement() {
    const el = /** @type {HTMLAudioElement|null} */ (document.getElementById('tts_audio'));
    if (!el) {
        console.warn('[Anima] #tts_audio element not found — TTS intercept cannot patch audio');
        return false;
    }
    if (el._animaPatched) return true; // Already patched

    // ── Save originals ──
    el._animaOrigPlay = el.play.bind(el);
    el._animaOrigAutoplay = el.autoplay;
    el._animaOrigMuted = el.muted;
    el._animaOrigVolume = el.volume;
    el._animaPatched = true;

    // ── Neuter the audio element ──
    el.autoplay = false;
    el.muted = true;
    el.volume = 0;

    // ── Override play() ──
    // When intercepting: don't play; just dispatch 'ended' so ST's queue advances.
    el.play = function () {
        if (ttsInterceptActive) {
            console.info('[Anima] #tts_audio.play() intercepted — suppressing');
            // Use queueMicrotask to dispatch ended as soon as possible but still async
            // so ST's completeCurrentAudioJob listener (added right after src set) is ready.
            queueMicrotask(() => {
                this.pause();
                try { this.currentTime = 0; } catch { /* empty src */ }
                this.dispatchEvent(new Event('ended'));
            });
            return Promise.resolve();
        }
        return el._animaOrigPlay();
    };

    // Log when src is set to confirm interception status
    el._animaSrcDebug = () => {
        console.info('[Anima] #tts_audio src attr changed to:', el.getAttribute('src')?.slice(0, 60));
    };
    el.addEventListener('loadstart', () => {
        if (ttsInterceptActive) {
            console.warn('[Anima] #tts_audio loadstart fired while intercepting! src:', el.src?.slice(0, 60));
        }
    });

    // ── MutationObserver on src attribute ──
    // Catches `audioElement.src = ...` which internally sets the 'src' attribute.
    // When we see a real src being set while intercepting, we immediately clear it.
    el._animaSrcObserver = new MutationObserver((mutations) => {
        if (!ttsInterceptActive) return;
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'src') {
                const val = el.getAttribute('src');
                if (val && val !== '' && val !== 'about:blank') {
                    // Clear src so no audio loads; play() override handles ended dispatch.
                    el.removeAttribute('src');
                    el.load(); // Reset internal state
                }
            }
        }
    });
    el._animaSrcObserver.observe(el, { attributes: true, attributeFilter: ['src'] });

    // ── Fallback: force-pause if audio somehow starts playing ──
    el._animaOnPlaying = () => {
        if (ttsInterceptActive) {
            el.pause();
            try { el.currentTime = 0; } catch { /* ok */ }
        }
    };
    el.addEventListener('playing', el._animaOnPlaying, { capture: true });

    console.info('[Anima] Patched #tts_audio element for intercept');
    return true;
}

/**
 * Unpatch the ST TTS audio element.
 */
function unpatchTtsAudioElement() {
    const el = /** @type {HTMLAudioElement|null} */ (document.getElementById('tts_audio'));
    if (!el || !el._animaPatched) return;

    // Restore play()
    if (el._animaOrigPlay) {
        el.play = el._animaOrigPlay;
    }
    // Disconnect observer
    if (el._animaSrcObserver) {
        el._animaSrcObserver.disconnect();
    }
    // Restore audio properties
    el.autoplay = el._animaOrigAutoplay ?? true;
    el.muted = el._animaOrigMuted ?? false;
    el.volume = el._animaOrigVolume ?? 1;
    // Remove playing listener
    if (el._animaOnPlaying) {
        el.removeEventListener('playing', el._animaOnPlaying, { capture: true });
    }

    delete el._animaOrigPlay;
    delete el._animaOrigAutoplay;
    delete el._animaOrigMuted;
    delete el._animaOrigVolume;
    delete el._animaSrcObserver;
    delete el._animaOnPlaying;
    delete el._animaPatched;

    console.info('[Anima] Unpatched #tts_audio element');
}

/**
 * Enable TTS interception: patches #tts_audio and listens for TTS events.
 */
function enableTtsIntercept() {
    if (ttsInterceptActive) return;
    ttsInterceptActive = true;

    // 1. Patch the audio element
    patchTtsAudioElement();

    // 2. Listen for TTS_AUDIO_READY to capture audio data
    const ctx = getContext();
    /** @param {any} eventData */
    const onTtsAudioReady = async (eventData) => {
        console.info('[Anima] tts_audio_ready fired', { interceptActive: ttsInterceptActive, hasPopup: !!popupEl, view: currentView });
        if (!ttsInterceptActive) return;
        if (!popupEl || currentView !== 'runtime') return;

        // Ensure patch is applied (handles case where #tts_audio was created after enable)
        patchTtsAudioElement();

        try {
            const audioBlob = eventData?.audio;
            console.info('[Anima] audioBlob type:', typeof audioBlob, audioBlob instanceof Blob ? `Blob(${audioBlob.size}, ${audioBlob.type})` : String(audioBlob).slice(0, 80));
            if (!audioBlob) return;
            const base64 = await blobToRawBase64(audioBlob);
            console.info('[Anima] base64 length:', base64?.length || 0);
            if (!base64) return;
            const text = String(eventData?.text || '');

            // Determine MIME type
            const mimeType = (audioBlob instanceof Blob && audioBlob.type) ? audioBlob.type : (eventData?.mimeType || 'audio/mpeg');

            // Queue and process
            externalTtsQueue.push({ audioBase64: base64, text, mimeType });
            processExternalTtsQueue();
        } catch (err) {
            console.warn('[Anima] TTS intercept error:', err);
        }
    };

    ctx.eventSource.on('tts_audio_ready', onTtsAudioReady);

    ttsEventCleanup = () => {
        ctx.eventSource.removeListener('tts_audio_ready', onTtsAudioReady);
    };

    ttsInterceptCleanup = () => {
        unpatchTtsAudioElement();
    };

    console.info('[Anima] ST TTS intercept enabled');
}

/**
 * Disable TTS interception and restore normal ST TTS playback.
 */
function disableTtsIntercept() {
    if (!ttsInterceptActive) return;
    ttsInterceptActive = false;
    externalTtsQueue.length = 0;
    externalTtsProcessing = false;

    ttsEventCleanup?.();
    ttsEventCleanup = null;
    ttsInterceptCleanup?.();
    ttsInterceptCleanup = null;

    console.info('[Anima] ST TTS intercept disabled');
}

/**
 * Sync intercept state based on current settings and view.
 */
function syncTtsInterceptState() {
    const s = ensureSettings();
    const shouldBeActive = s.useStTts && popupEl && currentView === 'runtime';
    if (shouldBeActive && !ttsInterceptActive) {
        enableTtsIntercept();
    } else if (!shouldBeActive && ttsInterceptActive) {
        disableTtsIntercept();
    }
}

/* ───────── Voice Panel (Anima-style) ───────── */

function getActiveKey() {
    return activeBindingKey || getBindingMeta().key;
}

async function openVoicePanel() {
    if (!popupEl) return;
    const overlay = popupEl.querySelector('#anima_voice_overlay');
    const panel = popupEl.querySelector('#anima_voice_panel');
    const list = popupEl.querySelector('#anima_voice_list');
    if (!panel || !list) return;

    // Show with animation
    if (overlay) { /** @type {HTMLElement} */ (overlay).style.display = ''; requestAnimationFrame(() => overlay.classList.add('is-open')); }
    /** @type {HTMLElement} */ (panel).style.display = '';
    requestAnimationFrame(() => panel.classList.add('is-open'));

    list.innerHTML = '<div class="vs-loading">' + escapeHtml(t('voice.loading')) + '</div>';

    try {
        const config = getConfig();
        const languages = await audioLanguageList(config);
        const key = getActiveKey();
        const currentVoiceId = getBinding(key).voiceId;

        // Load all languages' voices in parallel
        const groups = await Promise.all(languages.map(async (/** @type {any} */ lang) => {
            const langId = String(lang.id || '');
            const langName = String(lang.name || lang.code || 'Unknown');
            try {
                const voices = await audioList(langId, config);
                return { langId, langName, voices: Array.isArray(voices) ? voices : [] };
            } catch {
                return { langId, langName, voices: [] };
            }
        }));

        // Render grouped voice list
        let html = '';
        for (const group of groups) {
            if (group.voices.length === 0) continue;
            html += `<div class="vs-lang-group">`;
            html += `<div class="vs-lang-label">${escapeHtml(group.langName)}</div>`;
            html += `<div class="vs-voice-list">`;
            for (const v of group.voices) {
                const vid = String(v.id || v.ttsId || '');
                const name = String(v.audioName || v.ttsName || 'Voice');
                const sex = v.sex === '0' || v.ttsSex === '0' ? 'male' : 'female';
                const sexSymbol = sex === 'female' ? '♀' : '♂';
                const desc = sex === 'female' ? t('voice.female') : t('voice.male');
                const active = vid === currentVoiceId ? 'is-active' : '';
                html += `<div class="vs-voice-item ${active}" data-voice-id="${escapeHtml(vid)}" data-lang-id="${escapeHtml(group.langId)}">`;
                html += `<div class="vs-voice-icon ${sex}">${sexSymbol}</div>`;
                html += `<div class="vs-voice-info"><div class="vs-voice-name">${escapeHtml(name)}</div><div class="vs-voice-desc">${escapeHtml(desc)}</div></div>`;
                html += `<div class="vs-voice-check"></div>`;
                html += `</div>`;
            }
            html += `</div></div>`;
        }

        if (!html) {
            list.innerHTML = '<div class="vs-loading">' + escapeHtml(t('voice.empty')) + '</div>';
            return;
        }

        list.innerHTML = html;

        // Bind click handlers
        list.querySelectorAll('.vs-voice-item').forEach(item => {
            item.addEventListener('click', () => {
                const vid = item.getAttribute('data-voice-id');
                const langId = item.getAttribute('data-lang-id');
                if (!vid) return;
                const k = getActiveKey();
                const b = getBinding(k);
                b.voiceId = vid;
                if (langId) b.remoteLanguageId = langId;
                setBinding(k, b);
                list.querySelectorAll('.vs-voice-item').forEach(x => x.classList.remove('is-active'));
                item.classList.add('is-active');
                sendRuntimePayload();

                // Sync voice selection to server
                if (b.remoteAvatarId && langId && vid) {
                    ttsUpdate({
                        avatarsId: b.remoteAvatarId,
                        languageId: langId,
                        ttsId: vid,
                        action: 'add',
                    }, getConfig()).then(() => {
                        getToastr().info(t('voice.updated'));
                    }).catch(err => {
                        console.warn('[Anima] ttsUpdate failed:', err);
                        getToastr().warning(t('voice.syncFailed'));
                    });
                } else {
                    getToastr().info(t('voice.localOnly'));
                }
            });
        });
    } catch (err) {
        list.innerHTML = '<div class="vs-loading" style="color:#e74c3c">' + escapeHtml(t('voice.loadFailed')) + '</div>';
    }
}

function closeVoicePanel() {
    if (!popupEl) return;
    const overlay = popupEl.querySelector('#anima_voice_overlay');
    const panel = popupEl.querySelector('#anima_voice_panel');
    if (overlay) overlay.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
    // Hide after transition
    setTimeout(() => {
        if (overlay) /** @type {HTMLElement} */ (overlay).style.display = 'none';
        if (panel) /** @type {HTMLElement} */ (panel).style.display = 'none';
    }, 300);
}

/* ───────── Settings View ───────── */

function initSettingsView() {
    if (!popupEl) return;
    const s = ensureSettings();

    setChecked('#anima_s_auto_lipsync', s.autoLipSync);
    setChecked('#anima_s_use_st_tts', s.useStTts);
}

/** @param {string} sel @param {any} val */
function setVal(sel, val) {
    if (!popupEl) return;
    const el = /** @type {HTMLInputElement|null} */ (popupEl.querySelector(sel));
    if (el) el.value = String(val || '');
}

/** @param {string} sel @param {any} val */
function setChecked(sel, val) {
    if (!popupEl) return;
    const el = /** @type {HTMLInputElement|null} */ (popupEl.querySelector(sel));
    if (el) el.checked = Boolean(val);
}

/** @param {string} sel */
function getVal(sel) {
    if (!popupEl) return '';
    const el = /** @type {HTMLInputElement|null} */ (popupEl.querySelector(sel));
    return el ? el.value.trim() : '';
}

/* ───────── Draggable Popup ───────── */

/** Keep at least 48px of the titlebar visible on every viewport edge. */
/** @param {number} x @param {number} y @param {number} w @param {number} h */
function clampToViewport(x, y, w, h) {
    const minVisible = 48;
    return {
        x: Math.max(-(w - minVisible), Math.min(x, window.innerWidth - minVisible)),
        y: Math.max(0, Math.min(y, window.innerHeight - minVisible)),
    };
}

function openPopup() {
    if (popupEl) { popupEl.style.display = ''; return; }

    const wrapper = document.createElement('div');
    wrapper.className = 'anima-popup';
    wrapper.id = 'anima_popup_root';

    // Position
    const s = ensureSettings();
    const pos = s.popupPosition;
    if (pos) {
        const clamped = clampToViewport(pos.x, pos.y, pos.w || 560, pos.h || 750);
        wrapper.style.left = `${clamped.x}px`;
        wrapper.style.top = `${clamped.y}px`;
        wrapper.style.width = `${pos.w}px`;
        wrapper.style.height = `${pos.h}px`;
    } else {
        wrapper.style.left = `${Math.max(0, (window.innerWidth - 560) / 2)}px`;
        wrapper.style.top = `${Math.max(0, (window.innerHeight - 750) / 2)}px`;
    }

    document.body.appendChild(wrapper);
    popupEl = wrapper;

    // Load HTML template
    void loadPopupContent();
}

async function loadPopupContent() {
    if (!popupEl) return;
    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'panel', {}, false);
    popupEl.innerHTML = html;
    popupEl.querySelectorAll('.anima-logo-icon, .anima-logo-login').forEach((img) => {
        if (img instanceof HTMLImageElement) {
            img.src = LOGO_URL;
        }
    });

    // Apply i18n to static elements
    updateI18n(popupEl);
    // Update language toggle button label
    const langBtn = popupEl.querySelector('#anima_lang_toggle');
    if (langBtn) langBtn.textContent = getCurrentLang() === 'zh_cn' ? 'EN' : '中文';

    // Wire up common UI
    wireUpPopup();
    bindSTEvents();
    attachBridge();

    // Try auto login
    void tryAutoLogin();
}

function wireUpPopup() {
    if (!popupEl) return;

    // ── Titlebar drag ──
    const titlebar = popupEl.querySelector('#anima_titlebar');
    if (titlebar) {
        let startX = 0, startY = 0, origLeft = 0, origTop = 0;
        /** @param {MouseEvent} e */
        const onMove = (e) => {
            if (!popupEl) return;
            const newX = origLeft + e.clientX - startX;
            const newY = origTop + e.clientY - startY;
            const clamped = clampToViewport(newX, newY, popupEl.offsetWidth, popupEl.offsetHeight);
            popupEl.style.left = `${clamped.x}px`;
            popupEl.style.top = `${clamped.y}px`;
        };
        const onUp = () => {
            popupEl?.classList.remove('is-dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            savePopupPosition();
        };
        titlebar.addEventListener('dblclick', () => {
            if (!popupEl) return;
            const w = popupEl.offsetWidth, h = popupEl.offsetHeight;
            popupEl.style.left = `${Math.max(0, (window.innerWidth - w) / 2)}px`;
            popupEl.style.top = `${Math.max(0, (window.innerHeight - h) / 2)}px`;
            savePopupPosition();
        });
        titlebar.addEventListener('mousedown', (e) => {
            const me = /** @type {MouseEvent} */ (e);
            if (/** @type {HTMLElement} */ (me.target).closest('.anima-btn')) return;
            me.preventDefault();
            popupEl?.classList.add('is-dragging');
            startX = me.clientX; startY = me.clientY;
            origLeft = popupEl?.offsetLeft || 0;
            origTop = popupEl?.offsetTop || 0;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Resize handle ──
    const resizeHandle = popupEl.querySelector('#anima_resize_handle');
    if (resizeHandle) {
        let startX = 0, startY = 0, origW = 0, origH = 0;
        /** @param {MouseEvent} e */
        const onMove = (e) => {
            if (!popupEl) return;
            const maxW = window.innerWidth - popupEl.offsetLeft;
            const maxH = window.innerHeight - popupEl.offsetTop;
            popupEl.style.width = `${Math.max(380, Math.min(origW + e.clientX - startX, maxW))}px`;
            popupEl.style.height = `${Math.max(300, Math.min(origH + e.clientY - startY, maxH))}px`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            savePopupPosition();
        };
        resizeHandle.addEventListener('mousedown', (e) => {
            const me = /** @type {MouseEvent} */ (e);
            me.preventDefault();
            startX = me.clientX; startY = me.clientY;
            origW = popupEl?.offsetWidth || 520;
            origH = popupEl?.offsetHeight || 640;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Close ──
    popupEl.querySelector('#anima_close_button')?.addEventListener('click', closePopup);

    // ── Language toggle ──
    popupEl.querySelector('#anima_lang_toggle')?.addEventListener('click', () => {
        const s = ensureSettings();
        const newLang = getCurrentLang() === 'zh_cn' ? 'en' : 'zh_cn';
        setLang(newLang);
        s.language = newLang;
        saveSettings();
        if (popupEl) updateI18n(popupEl);
        // Update dynamic label
        const langBtn = popupEl?.querySelector('#anima_lang_toggle');
        if (langBtn) langBtn.textContent = newLang === 'zh_cn' ? 'EN' : '中文';
    });

    // ── Settings button ──
    popupEl.querySelector('#anima_settings_button')?.addEventListener('click', () => {
        initSettingsView();
        showView('settings');
    });

    // ── Login ──
    popupEl.querySelector('#anima_login_submit')?.addEventListener('click', async () => {
        const email = getVal('#anima_login_email');
        const pass = /** @type {HTMLInputElement|null} */ (popupEl?.querySelector('#anima_login_password'))?.value || '';
        if (!email || !pass) { setLoginStatus(t('login.emailRequired'), true); return; }
        setLoginStatus(t('login.signingIn'));
        try { await doLogin(email, pass); } catch (error) { setLoginStatus(errMsg(error), true); }
    });
    popupEl.querySelector('#anima_login_password')?.addEventListener('keydown', (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Enter') popupEl?.querySelector('#anima_login_submit')?.dispatchEvent(new Event('click'));
    });

    // ── Avatar tabs ──
    popupEl.querySelectorAll('.anima-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            popupEl?.querySelectorAll('.anima-tab').forEach(tb => tb.classList.remove('anima-tab--active'));
            tab.classList.add('anima-tab--active');
            activeTab = tab.getAttribute('data-tab') || 'all';
            renderAvatarGrid();
        });
    });

    // ── Avatar actions ──
    popupEl.querySelector('#anima_avatar_create_btn')?.addEventListener('click', () => initCreateWizard());
    popupEl.querySelector('#anima_avatar_refresh_btn')?.addEventListener('click', () => void loadAvatarGrid());
    popupEl.querySelector('#anima_avatar_logout_btn')?.addEventListener('click', () => doLogout());

    // ── Create wizard ──
    const uploadArea = popupEl.querySelector('#anima_upload_area');
    const uploadInput = /** @type {HTMLInputElement|null} */ (popupEl.querySelector('#anima_upload_input'));
    if (uploadArea && uploadInput) {
        uploadArea.addEventListener('click', () => uploadInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('is-dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('is-dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('is-dragover');
            const file = /** @type {DragEvent} */ (e).dataTransfer?.files?.[0];
            if (file) void handlePhotoUpload(file);
        });
        uploadInput.addEventListener('change', () => {
            const file = uploadInput.files?.[0];
            if (file) void handlePhotoUpload(file);
        });
    }
    popupEl.querySelector('#anima_step1_next')?.addEventListener('click', () => showCreateStep(2));
    popupEl.querySelector('#anima_step2_prev')?.addEventListener('click', () => showCreateStep(1));
    popupEl.querySelector('#anima_step2_next')?.addEventListener('click', () => {
        if (!createWizardState) return;
        const nameInput = /** @type {HTMLInputElement|null} */ (popupEl?.querySelector('#anima_create_name'));
        createWizardState.name = nameInput?.value.trim() || '';
        showCreateStep(3);
    });
    popupEl.querySelector('#anima_create_name')?.addEventListener('input', (e) => {
        const btn = /** @type {HTMLButtonElement|null} */ (popupEl?.querySelector('#anima_step2_next'));
        if (btn) btn.disabled = !/** @type {HTMLInputElement} */ (e.target).value.trim();
    });
    popupEl.querySelector('#anima_step3_prev')?.addEventListener('click', () => showCreateStep(2));
    popupEl.querySelector('#anima_step3_skip')?.addEventListener('click', () => void submitCreateWizard());
    popupEl.querySelector('#anima_step3_submit')?.addEventListener('click', () => void submitCreateWizard());

    popupEl.querySelector('#anima_create_language')?.addEventListener('change', (e) => {
        const lid = /** @type {HTMLSelectElement} */ (e.target).value;
        if (createWizardState) createWizardState.languageId = lid;
        void loadCreateVoices(lid);
    });
    popupEl.querySelector('#anima_create_voice')?.addEventListener('change', (e) => {
        if (createWizardState) createWizardState.voiceId = /** @type {HTMLSelectElement} */ (e.target).value;
    });

    popupEl.querySelector('#anima_create_back_btn')?.addEventListener('click', async () => {
        if (createWizardState?.avatarId) {
            const discard = await cleanupDraftAvatar();
            if (!discard) return;
        }
        createWizardState = null;
        showView('avatars');
    });

    // ── Runtime ──
    popupEl.querySelector('#anima_runtime_back_btn')?.addEventListener('click', () => {
        stopRuntimeSync();
        destroyRuntimeIframe();
        showView('avatars');
        void loadAvatarGrid();
    });
    popupEl.querySelector('#anima_runtime_voice_btn')?.addEventListener('click', () => void openVoicePanel());
    popupEl.querySelector('#anima_voice_panel_close')?.addEventListener('click', closeVoicePanel);
    popupEl.querySelector('#anima_voice_overlay')?.addEventListener('click', closeVoicePanel);
    popupEl.querySelector('#anima_runtime_lipsync_btn')?.addEventListener('click', () => {
        if (!popupEl) return;
        const frame = /** @type {HTMLIFrameElement|null} */ (popupEl.querySelector('#anima_runtime_frame'));
        if (frame?.contentWindow && frame.dataset.runtimeReady === 'true') {
            frame.contentWindow.postMessage({ type: 'anima-runtime-control', command: 'lipsync' }, '*');
        }
    });

    // ── Settings view ──
    popupEl.querySelector('#anima_settings_back_btn')?.addEventListener('click', () => {
        showView(previousView && previousView !== 'settings' ? previousView : 'avatars');
    });
    popupEl.querySelector('#anima_s_auto_lipsync')?.addEventListener('change', (e) => {
        const s = ensureSettings();
        s.autoLipSync = /** @type {HTMLInputElement} */ (e.target).checked;
        saveSettings();
    });
    popupEl.querySelector('#anima_s_use_st_tts')?.addEventListener('change', (e) => {
        const s = ensureSettings();
        s.useStTts = /** @type {HTMLInputElement} */ (e.target).checked;
        saveSettings();
        syncTtsInterceptState();
    });
}

function savePopupPosition() {
    if (!popupEl) return;
    const s = ensureSettings();
    s.popupPosition = {
        x: popupEl.offsetLeft,
        y: popupEl.offsetTop,
        w: popupEl.offsetWidth,
        h: popupEl.offsetHeight,
    };
    saveSettings();
}

function closePopup() {
    stopRuntimeSync();
    unbindSTEvents();
    detachBridge();
    destroyRuntimeIframe();
    disableTtsIntercept();
    closeAllGenerationSSE();
    if (popupEl) {
        savePopupPosition();
        popupEl.remove();
        popupEl = null;
    }
}

/* ───────── Extension Entry Point ───────── */

function addMenuButton() {
    if (document.getElementById('anima_extension_button')) return;
    const btn = document.createElement('div');
    btn.id = 'anima_extension_button';
    btn.className = 'list-group-item flex-container flexGap5';
    btn.innerHTML = `<div class="extensionsMenuExtensionButton"><img src="${escapeAttr(LOGO_URL)}" style="width:18px;height:18px;object-fit:contain" /></div><span>Anima</span>`;
    btn.addEventListener('click', () => openPopup());
    document.getElementById('extensionsMenu')?.append(btn);
}

jQuery(() => {
    const s = ensureSettings();
    initLang(s.language || '');
    addMenuButton();
    console.info('[Anima] extension loaded (v2 – multi-view + i18n)');
});
