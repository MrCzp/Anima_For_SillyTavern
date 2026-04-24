import CardManager from './static/lib/card_manager.js';

const JS_VERSION = '1.0.0';
const LOCAL_BASE = new URL('./static/lib/', import.meta.url).href;

/** @type {Map<string, Promise<void>>} */
const scriptCache = new Map();
/** @type {Promise<void> | null} */
let dependenciesPromise = null;

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
    const scriptUrl = new URL(url, document.baseURI);
    scriptUrl.searchParams.set('v', JS_VERSION);
    const key = scriptUrl.pathname;

    const cached = scriptCache.get(key);
    if (cached) {
        return cached;
    }

    const promise = new Promise((resolve, reject) => {
        const fullUrl = scriptUrl.href;
        const existing = Array.from(document.scripts).find((script) => {
            if (!script.src) {
                return false;
            }

            try {
                return new URL(script.src).pathname === key;
            } catch {
                return false;
            }
        });

        if (existing) {
            if (existing.dataset.loaded === '1') {
                resolve(undefined);
                return;
            }

            existing.addEventListener('load', () => resolve(undefined), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${fullUrl}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = fullUrl;
        script.onload = () => {
            script.dataset.loaded = '1';
            resolve(undefined);
        };
        script.onerror = () => reject(new Error(`Failed to load script: ${fullUrl}`));
        document.body.appendChild(script);
    });

    scriptCache.set(key, promise);
    return promise;
}

/**
 * @returns {Promise<void>}
 */
function loadDependencies() {
    if (dependenciesPromise) {
        return dependenciesPromise;
    }

    const scripts = [
        `${LOCAL_BASE}decoderMain.js`,
        `${LOCAL_BASE}mutex.js`,
        `${LOCAL_BASE}decoder.js`,
        // CardManager may choose worker or main-thread rendering depending on runtime support.
        // Preload both paths so Windows desktop does not end up with a blank stage when it falls back.
        `${LOCAL_BASE}numjs.min.js`,
        `${LOCAL_BASE}upng.js`,
        `${LOCAL_BASE}load_data.js`,
        `${LOCAL_BASE}renderer_webgl0.js`,
        `${LOCAL_BASE}renderer_webglW.js`,
        `${LOCAL_BASE}renderer.js`,
        `${LOCAL_BASE}rendererMain.js`,
    ];

    dependenciesPromise = (async () => {
        for (const script of scripts) {
            await loadScript(script);
        }
    })();

    return dependenciesPromise;
}

export default class AvatarJS {
    /**
     * @param {{ canvas: HTMLCanvasElement, canvasWidth?: number, canvasHeight?: number }} canvasOption
     * @param {(payload?: unknown) => void} [onWorkersReady]
     * @param {() => void} [onAnimationReady]
     * @param {() => void} [onPlayEnd]
     * @param {(payload?: unknown) => void} [onError]
     * @param {string} [modelUrl]
     */
    constructor(
        canvasOption,
        onWorkersReady = () => {},
        onAnimationReady = () => {},
        onPlayEnd = () => {},
        onError = () => {},
        modelUrl = '',
    ) {
        this.canvasOption = canvasOption;
        this.modelUrl = modelUrl;
        this.cardManager = null;
        this.fpsTemp = 24;
        this.onWorkerReady = onWorkersReady;
        this.onAnimationReady = onAnimationReady;
        this.onPlayEnd = onPlayEnd;
        this.onError = onError;
        this.pendingReceiveCb = null;
        /** @type {{ atfData: any, append: boolean } | null} */
        this.pendingAtfData = null;
        /** Whether the CardManager workers have finished loading the model and are ready to animate. */
        this.renderersReady = false;
        this.disposed = false;
        this.init();
    }

    /** @returns {Promise<void>} */
    async init() {
        try {
            if (this.disposed) {
                return;
            }

            if (!this.modelUrl) {
                this.onError({ message: 'Missing modelUrl' });
                return;
            }

            if (!this.modelUrl.endsWith('/')) {
                this.modelUrl += '/';
            }

            await loadDependencies();
            if (this.disposed) {
                return;
            }

            const width = this.canvasOption.canvasWidth || this.canvasOption.canvas.offsetWidth || 768;
            const height = this.canvasOption.canvasHeight || this.canvasOption.canvas.offsetHeight || 1024;
            this.canvasOption.canvas.width = width;
            this.canvasOption.canvas.height = height;
            const runtime = this;

            this.cardManager = new CardManager(
                this.canvasOption.canvas,
                () => {
                    if (runtime.disposed) {
                        return;
                    }

                    if (!runtime.cardManager) {
                        return;
                    }

                    runtime.renderersReady = true;
                    runtime.cardManager.enableCameraMotion(false);
                    runtime.onWorkerReady();
                    runtime.cardManager.pauseBodyVideo();

                    // Flush any animation data that arrived before workers were ready
                    if (runtime.pendingAtfData) {
                        const { atfData, append } = runtime.pendingAtfData;
                        runtime.pendingAtfData = null;
                        runtime.fpsTemp = atfData.data.fps || runtime.fpsTemp;
                        runtime.cardManager.setFPS(runtime.fpsTemp);
                        runtime.cardManager.setAnimationJson(atfData, false, append);
                    }
                },
                () => {
                    if (runtime.disposed) {
                        return;
                    }

                    runtime.onAnimationReady();
                    if (runtime.pendingReceiveCb) {
                        const callback = runtime.pendingReceiveCb;
                        runtime.pendingReceiveCb = null;
                        callback();
                    }
                },
                () => {
                    if (runtime.disposed) {
                        return;
                    }

                    if (!runtime.cardManager) {
                        return;
                    }

                    runtime.cardManager.pauseBodyVideo();
                    runtime.onPlayEnd();
                },
                function () {
                    if (!runtime.disposed) {
                        runtime.onError(arguments[0]);
                    }
                },
                () => {},
                () => {},
                `${LOCAL_BASE}decoderWorker.js`,
                `${LOCAL_BASE}rendererWorker.js`,
            );

            if (this.disposed) {
                return;
            }

            this.cardManager.loadModel(this.modelUrl);
        } catch (error) {
            if (!this.disposed) {
                this.onError(error);
            }
        }
    }

    /** @returns {void} */
    startPlay2() {
        if (!this.cardManager) {
            return;
        }

        this.cardManager.startPlay(this.fpsTemp);
    }

    /** @returns {void} */
    startPlay() {
        // Kept for compatibility with the original Anima runtime API.
    }

    /**
     * @param {{ audio?: string, audioArray?: number[], AK?: string, ABI?: string, ATI?: string, API?: string, fps?: number, status?: string }} data
     * @param {boolean} [append]
     * @param {(() => void) | undefined} [onReady]
     * @returns {void}
     */
    receiveData(data, append = false, onReady) {
        if (!this.cardManager) {
            return;
        }

        if (!data?.AK || !data?.ABI || !data?.ATI || !data?.API) {
            return;
        }

        if (onReady) {
            this.pendingReceiveCb = onReady;
        }

        const atfData = /** @type {any} */ ({
            data: {
                AK: data.AK,
                ABI: data.ABI,
                ATI: data.ATI,
                API: data.API,
                fps: data.fps || this.fpsTemp,
                status: data.status || '',
            },
        });

        if (data.audio) {
            atfData.data.audio = data.audio;
        }

        if (data.audioArray) {
            atfData.data.audioArray = data.audioArray;
        }

        // If workers are not ready yet, queue the data to be applied once they are
        if (!this.renderersReady) {
            this.pendingAtfData = { atfData, append };
            return;
        }

        this.fpsTemp = data.fps || this.fpsTemp;
        this.cardManager.setFPS(this.fpsTemp);
        this.cardManager.setAnimationJson(atfData, false, append);
    }

    /** @returns {void} */
    stopPlay() {
        if (!this.cardManager) {
            return;
        }

        this.cardManager.stopPlay();
    }

    /** @returns {void} */
    close() {
        this.disposed = true;
        if (!this.cardManager) {
            return;
        }

        try {
            this.cardManager.stopPlay();
        } catch {
            // ignore shutdown errors from the third-party runtime
        }

        // Terminate ALL workers (main, 1, 2, 3), not just the main one
        try {
            const workers = this.cardManager.workers;
            if (workers && typeof workers === 'object') {
                for (const key of Object.keys(workers)) {
                    try {
                        const w = workers[key];
                        if (w && typeof w.terminate === 'function') {
                            w.terminate();
                        } else if (w && w.worker && typeof w.worker.terminate === 'function') {
                            w.worker.terminate();
                        }
                    } catch { /* best effort */ }
                }
            }
        } catch {
            // Fallback: at least terminate the main worker
            try {
                if (this.cardManager.worker) {
                    this.cardManager.worker.terminate();
                }
            } catch { /* ignore */ }
        }

        // Stop any WebRTC streaming
        try {
            if (this.cardManager.webRTCStreamer) {
                this.cardManager.stopStreaming();
            }
        } catch { /* ignore */ }

        // Release WebGL context
        try {
            const canvas = this.canvasOption?.canvas;
            if (canvas) {
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (gl && typeof gl.getExtension === 'function') {
                    const ext = gl.getExtension('WEBGL_lose_context');
                    if (ext) ext.loseContext();
                }
            }
        } catch { /* ignore */ }

        this.cardManager = null;
        this.renderersReady = false;
        this.pendingAtfData = null;
        this.pendingReceiveCb = null;
    }
}