/**
 * Anima Extension — i18n (Internationalization)
 * Supports English and Simplified Chinese.
 */

const TRANSLATIONS = {
    en: {
        // Login
        'login.title': 'Sign in to Anima',
        'login.subtitle': 'Enter your email and password to continue',
        'login.email': 'Email',
        'login.emailPlaceholder': 'you@example.com',
        'login.password': 'Password',
        'login.passwordPlaceholder': 'Password',
        'login.submit': 'Login / Register',
        'login.autoSignIn': 'Auto-signing in...',
        'login.signingIn': 'Signing in...',
        'login.emailRequired': 'Email and password are required.',
        'login.accountCreated': 'Account created.',
        'login.signedIn': 'Signed in.',
        'login.loggedOut': 'Logged out.',

        // Avatar select
        'avatars.tabAll': 'All',
        'avatars.tabOfficial': 'Official',
        'avatars.tabMy': 'My Avatars',
        'avatars.create': 'Create',
        'avatars.loading': 'Loading avatars...',
        'avatars.empty': 'No avatars in this tab.',
        'avatars.loadFailed': 'Failed to load avatars: {0}',
        'avatars.badgeGenerating': 'Generating',
        'avatars.generatingProgress': 'Generating {0}%',
        'avatars.badgeReady': 'Ready',
        'avatars.badgeFailed': 'Failed',
        'avatars.badgeOfficial': 'Official',
        'avatars.estimate': 'Estimated about 5 minutes',
        'avatars.failed': 'Generation failed. Please recreate.',
        'avatars.defaultName': 'My Avatar',
        'avatars.stillGenerating': 'This avatar is still generating.',
        'avatars.notFound': 'Avatar not found.',
        'avatars.openChatFirst': 'Please open a character or group chat first to bind an avatar.',
        'avatars.bound': 'Bound "{0}" to {1}.',
        'avatars.renamed': 'Avatar renamed.',
        'avatars.deleted': 'Avatar deleted.',
        'avatars.deleteConfirm': 'Delete "{0}"? This cannot be undone.',
        'avatars.renameFailed': 'Rename failed',
        'avatars.deleteFailed': 'Delete failed',

        // Create wizard
        'create.title': 'Create Avatar',
        'create.stepPhoto': '1. Photo',
        'create.stepName': '2. Name',
        'create.stepVoice': '3. Voice',
        'create.uploadPrompt': 'Click or drag to upload a portrait photo',
        'create.uploadHint': 'JPG / PNG, under 10 MB, 768×1024 recommended',
        'create.uploading': 'Uploading and validating...',
        'create.uploadDone': 'Photo uploaded and validated.',
        'create.onlyJpgPng': 'Please select a JPG or PNG image.',
        'create.maxSize': 'Image must be under 10 MB.',
        'create.next': 'Next',
        'create.back': 'Back',
        'create.nameLabel': 'Avatar Name',
        'create.namePlaceholder': 'Give your avatar a name',
        'create.langLabel': 'Language',
        'create.langSelect': 'Select language',
        'create.langLoading': 'Loading languages...',
        'create.langFailed': 'Failed to load',
        'create.voiceLabel': 'Voice',
        'create.voiceSelectLang': 'Select a language first',
        'create.voiceLoading': 'Loading voices...',
        'create.voiceSelect': 'Select voice',
        'create.voiceFailed': 'Failed to load',
        'create.submit': 'Create Avatar',
        'create.skip': 'Skip',
        'create.generating': 'Starting model generation...',
        'create.submitted': 'Avatar submitted! Generation started.',
        'create.success': 'Avatar creation started. It will appear when ready.',
        'create.discardConfirm': 'Discard this avatar draft?',

        // Runtime
        'runtime.loading': 'Loading avatar...',
        'runtime.noModel': 'No model URL. Select an avatar with a ready model.',
        'runtime.defaultName': 'Digital Human',
        'runtime.backTitle': 'Back to avatars',
        'runtime.voiceTitle': 'Change voice',

        // Voice panel
        'voice.title': 'Voice',
        'voice.loading': 'Loading voices...',
        'voice.empty': 'No voices available',
        'voice.loadFailed': 'Failed to load voices',
        'voice.updated': 'Voice updated.',
        'voice.localOnly': 'Voice updated (local only).',
        'voice.syncFailed': 'Voice saved locally but failed to sync to server.',
        'voice.male': 'Male',
        'voice.female': 'Female',

        // Settings
        'settings.title': 'Settings',
        'settings.apiUrl': 'API Base URL',
        'settings.defaultVoice': 'Default Voice ID',
        'settings.autoLipSync': 'Auto lip-sync on new replies',
        'settings.useStTts': 'Use SillyTavern TTS audio for lip-sync',
        'settings.useStTtsHint': 'When enabled, intercepts ST TTS audio instead of using Anima\'s built-in TTS. ST TTS playback will be suppressed — audio plays through the avatar only.',
        'settings.authToken': 'Auth Token (read-only)',
        'settings.probe': 'Probe API',
        'settings.probing': 'Probing...',
        'settings.advBinding': 'Advanced Binding',
        'settings.advHint': 'Override binding fields for the current character/group.',
        'settings.modelUrl': 'Model URL',
        'settings.modelId': 'Model ID',
        'settings.voiceId': 'Voice ID',
        'settings.posterUrl': 'Poster URL',
        'settings.saveBinding': 'Save Binding',
        'settings.clearBinding': 'Clear Binding',
        'settings.openChat': 'Open a chat first.',
        'settings.noChat': 'No active chat.',
        'settings.bindSaved': 'Binding saved.',
        'settings.bindCleared': 'Binding cleared.',

        // Bind
        'bind.title': 'Bind to Character',
        'bind.search': 'Search...',
        'bind.cancel': 'Cancel',
        'bind.noChars': 'No characters found',
        'bind.current': 'current',
        'bind.bound': '[bound]',

        // Common
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.close': 'Close',
    },
    zh_cn: {
        // Login
        'login.title': '登录 Anima',
        'login.subtitle': '输入邮箱和密码以继续',
        'login.email': '邮箱',
        'login.emailPlaceholder': 'you@example.com',
        'login.password': '密码',
        'login.passwordPlaceholder': '输入密码',
        'login.submit': '登录/注册',
        'login.autoSignIn': '自动登录中...',
        'login.signingIn': '登录中...',
        'login.emailRequired': '请输入邮箱和密码。',
        'login.accountCreated': '已创建账号。',
        'login.signedIn': '已登录。',
        'login.loggedOut': '已退出。',

        // Avatar select
        'avatars.tabAll': '全部',
        'avatars.tabOfficial': '官方预设',
        'avatars.tabMy': '我的形象',
        'avatars.create': '创建',
        'avatars.loading': '加载形象中...',
        'avatars.empty': '此分类暂无形象。',
        'avatars.loadFailed': '加载失败：{0}',
        'avatars.badgeGenerating': '生成中',
        'avatars.generatingProgress': '生成中 {0}%',
        'avatars.badgeReady': '就绪',
        'avatars.badgeFailed': '失败',
        'avatars.badgeOfficial': '官方',
        'avatars.estimate': '预计约 5 分钟',
        'avatars.failed': '生成失败，请重新创建。',
        'avatars.defaultName': '我的数字人',
        'avatars.stillGenerating': '该形象仍在生成中。',
        'avatars.notFound': '未找到形象。',
        'avatars.openChatFirst': '请先打开一个角色或群组聊天以绑定形象。',
        'avatars.bound': '已将「{0}」绑定到 {1}。',
        'avatars.renamed': '形象已重命名。',
        'avatars.deleted': '形象已删除。',
        'avatars.deleteConfirm': '删除「{0}」？此操作不可撤销。',
        'avatars.renameFailed': '重命名失败',
        'avatars.deleteFailed': '删除失败',

        // Create wizard
        'create.title': '创建数字人',
        'create.stepPhoto': '1. 照片',
        'create.stepName': '2. 命名',
        'create.stepVoice': '3. 音色',
        'create.uploadPrompt': '点击或拖拽上传正面人像照片',
        'create.uploadHint': 'JPG / PNG，10 MB 以内，推荐 768×1024',
        'create.uploading': '上传并校验中...',
        'create.uploadDone': '照片上传并校验通过。',
        'create.onlyJpgPng': '请选择 JPG 或 PNG 格式的图片。',
        'create.maxSize': '图片大小不能超过 10 MB。',
        'create.next': '下一步',
        'create.back': '返回',
        'create.nameLabel': '角色名称',
        'create.namePlaceholder': '为数字人取个名字...',
        'create.langLabel': '语言',
        'create.langSelect': '选择语言',
        'create.langLoading': '加载语言中...',
        'create.langFailed': '加载失败',
        'create.voiceLabel': '音色',
        'create.voiceSelectLang': '请先选择语言',
        'create.voiceLoading': '加载音色中...',
        'create.voiceSelect': '选择音色',
        'create.voiceFailed': '加载失败',
        'create.submit': '创建数字人',
        'create.skip': '跳过',
        'create.generating': '正在提交生成任务...',
        'create.submitted': '已提交！模型生成中。',
        'create.success': '数字人创建已启动，生成完成后将自动出现。',
        'create.discardConfirm': '放弃当前数字人草稿？',

        // Runtime
        'runtime.loading': '加载数字人中...',
        'runtime.noModel': '无模型地址。请选择一个已就绪的形象。',
        'runtime.defaultName': '数字人',
        'runtime.backTitle': '返回形象列表',
        'runtime.voiceTitle': '切换音色',

        // Voice panel
        'voice.title': '音色',
        'voice.loading': '加载音色中...',
        'voice.empty': '暂无可用音色',
        'voice.loadFailed': '加载音色失败',
        'voice.updated': '音色已更新。',
        'voice.localOnly': '音色已本地更新。',
        'voice.syncFailed': '音色已本地保存，但同步到服务器失败。',
        'voice.male': '男声',
        'voice.female': '女声',

        // Settings
        'settings.title': '设置',
        'settings.apiUrl': 'API 地址',
        'settings.defaultVoice': '默认音色 ID',
        'settings.autoLipSync': '新回复时自动唇形同步',
        'settings.useStTts': '使用 SillyTavern TTS 音频进行唇形同步',
        'settings.useStTtsHint': '启用后，将拦截 ST TTS 扩展的音频数据来驱动口型动画，而不使用 Anima 自带的 TTS。ST TTS 的播放将被静音，音频仅通过数字人播放。',
        'settings.authToken': '认证令牌（只读）',
        'settings.probe': '测试 API',
        'settings.probing': '测试中...',
        'settings.advBinding': '高级绑定',
        'settings.advHint': '为当前角色/群组覆盖绑定字段。',
        'settings.modelUrl': '模型地址',
        'settings.modelId': '模型 ID',
        'settings.voiceId': '音色 ID',
        'settings.posterUrl': '封面地址',
        'settings.saveBinding': '保存绑定',
        'settings.clearBinding': '清除绑定',
        'settings.openChat': '请先打开一个聊天。',
        'settings.noChat': '无活跃聊天。',
        'settings.bindSaved': '绑定已保存。',
        'settings.bindCleared': '绑定已清除。',

        // Bind
        'bind.title': '绑定到角色',
        'bind.search': '搜索...',
        'bind.cancel': '取消',
        'bind.noChars': '未找到角色',
        'bind.current': '当前',
        'bind.bound': '[已绑定]',

        // Common
        'common.cancel': '取消',
        'common.delete': '删除',
        'common.close': '关闭',
    },
};

/** @type {string} */
let currentLang = 'en';

/**
 * Initialize language from settings or browser.
 * @param {string} [lang]
 */
export function initLang(lang) {
    if (lang && TRANSLATIONS[lang]) {
        currentLang = lang;
    } else {
        const nav = (navigator.language || '').toLowerCase();
        currentLang = nav.startsWith('zh') ? 'zh_cn' : 'en';
    }
}

/** @returns {string} */
export function getCurrentLang() {
    return currentLang;
}

/**
 * Set language and return the new lang key.
 * @param {string} lang
 * @returns {string}
 */
export function setLang(lang) {
    if (TRANSLATIONS[lang]) currentLang = lang;
    return currentLang;
}

/**
 * Translate a key. Supports {0}, {1} placeholders.
 * @param {string} key
 * @param {...string} args
 * @returns {string}
 */
export function t(key, ...args) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    for (let i = 0; i < args.length; i++) {
        text = text.replace(`{${i}}`, args[i]);
    }
    return text;
}

/**
 * Update all DOM elements inside a root that have data-i18n attributes.
 * Supports:
 *   data-i18n="key"              → textContent
 *   data-i18n-placeholder="key"  → placeholder
 *   data-i18n-title="key"        → title
 *   data-i18n-html="key"         → innerHTML (use carefully)
 * @param {Element|Document} root
 */
export function updateI18n(root) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) /** @type {HTMLInputElement} */ (el).placeholder = t(key);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) /** @type {HTMLElement} */ (el).title = t(key);
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) el.innerHTML = t(key);
    });
}
