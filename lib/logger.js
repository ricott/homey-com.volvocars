'use strict';

// Thin, defensive wrapper around @sentry/node.
//
// Design goals (identical to the sma.modbus app so the two behave the same):
//  - Never break the app. Sentry is initialised lazily inside try/catch, and
//    every exported function is a no-op when Sentry is unavailable or the DSN
//    is not configured. A telemetry failure must never affect device operation
//    or, more importantly, the OAuth2 sign-in / token-refresh flow.
//  - No global process handlers. We use `defaultIntegrations: false` so Sentry
//    does NOT install uncaughtException/unhandledRejection handlers (those can
//    exit the process) - Homey has its own crash reporting. We only send
//    explicit captures.
//  - Anonymous. No PII is sent: `sendDefaultPii` is false and `beforeSend`
//    strips the hostname and any user object down to the pseudonymous Homey id.
//    Tokens, refresh tokens, VINs, coordinates and the VCC API key are never
//    passed to this module.
//
// The DSN is read from env.json as `SENTRY_DSN` via the static `Homey.env`
// (the same accessor this app uses for CLIENT_ID / CLIENT_SECRET). If it is
// empty/missing, telemetry stays disabled and every function is a no-op.

const { formatError } = require('./util');

let Sentry = null;
let enabled = false;
let initialized = false;

// Per-key timestamp of the last sent event, for simple in-memory rate limiting.
const rateLimits = new Map();

/**
 * Initialise Sentry from the app's env.json DSN. Safe to call once from the
 * app's onInit. Returns true when telemetry is active.
 * @param {import('homey').Homey} homey
 * @returns {boolean}
 */
function init(homey) {
    if (initialized) {
        return enabled;
    }
    initialized = true;

    try {
        // Read the DSN from env.json. Prefer the instance accessor, but fall
        // back to the static `Homey.env` - which is what the rest of this app
        // uses (Homey.env.CLIENT_ID) and the reliable way to read env.json in
        // SDK v3. `homey.env` is often undefined, which would otherwise leave
        // the DSN unread and silently disable telemetry.
        let dsn = (homey && homey.env && homey.env.SENTRY_DSN) || '';
        if (!dsn) {
            try {
                const Homey = require('homey');
                dsn = (Homey && Homey.env && Homey.env.SENTRY_DSN) || '';
            } catch (_) {
                // Not running under the Homey runtime (e.g. a local unit test).
            }
        }
        if (!dsn || typeof dsn !== 'string' || dsn.trim() === '') {
            return false; // Not configured -> disabled.
        }

        // Lazy require so a load/compat failure disables telemetry instead of
        // crashing the app.
        Sentry = require('@sentry/node');

        const appVersion = (homey.manifest && homey.manifest.version) || 'unknown';
        let homeyVersion = 'unknown';
        try {
            homeyVersion = homey.version || 'unknown';
        } catch (_) { /* ignore */ }

        Sentry.init({
            dsn: dsn.trim(),
            release: appVersion,
            // NOTE: intentionally not setting `environment` to the Homey firmware
            // version - that lands every event under an environment like "12.9.0",
            // which Sentry's default (environment-filtered) view can hide. Firmware
            // is a tag below instead, so events show up and stay filterable.
            // Explicit captures only; keep the footprint minimal and never touch
            // global process handlers.
            defaultIntegrations: false,
            tracesSampleRate: 0,
            sendDefaultPii: false,
            beforeSend(event) {
                try {
                    delete event.server_name; // don't leak the hostname
                    // Keep only the (pseudonymous) Homey id for counting distinct
                    // affected Homeys, and force ip_address to null so Sentry does
                    // not geolocate from the request IP.
                    const id = event.user && event.user.id;
                    event.user = { id: id || undefined, ip_address: null };
                } catch (_) { /* ignore */ }
                return event;
            }
        });

        try {
            Sentry.setTags({ appVersion, homeyVersion, nodeVersion: process.version });
        } catch (_) { /* ignore */ }

        // Identify events by the unique Homey id so Sentry's "Users" count reflects
        // how many distinct Homeys are affected. Fetched in the background (async);
        // the first telemetry event is typically minutes away, so it is set in time.
        try {
            if (homey && homey.cloud && typeof homey.cloud.getHomeyId === 'function') {
                Promise.resolve(homey.cloud.getHomeyId())
                    .then((id) => {
                        if (id) {
                            Sentry.setUser({ id: String(id), ip_address: null });
                        }
                    })
                    .catch(() => { /* ignore - user id is best effort */ });
            }
        } catch (_) { /* ignore */ }

        enabled = true;
        return true;
    } catch (_) {
        // Any failure (missing package, incompatible Node, bad DSN) -> disabled.
        Sentry = null;
        enabled = false;
        return false;
    }
}

function isEnabled() {
    return enabled;
}

/**
 * Record a breadcrumb - contextual trail attached to the next captured event.
 * Cheap and NOT rate-limited (breadcrumbs are only transmitted when an actual
 * event is captured), so use it to leave a trail of transient conditions
 * (e.g. network blips during token refresh) that explain a later failure.
 * No-op when disabled.
 * @param {object} args
 * @param {string} [args.category]
 * @param {string} args.message
 * @param {string} [args.level]
 * @param {object} [args.data]
 */
function addBreadcrumb({ category = 'app', message, level = 'info', data = {} } = {}) {
    if (!enabled || !Sentry || !message) {
        return;
    }
    try {
        Sentry.addBreadcrumb({ category, message, level, data });
    } catch (_) {
        // never throw
    }
}

/**
 * Report a message, rate-limited per `key`. No-op when disabled.
 * @param {string} key                     Unique key for rate limiting (e.g. per session/command).
 * @param {string} message                 Human-readable message / issue title.
 * @param {object} [options]
 * @param {string} [options.level]         Sentry level (default 'warning').
 * @param {object} [options.tags]          Indexed tags (errorType, status, ...).
 * @param {object} [options.extra]         Additional non-indexed context.
 * @param {number} [options.minIntervalMs] Minimum ms between events for this key.
 */
function report(key, message, options = {}) {
    if (!enabled || !Sentry) {
        return;
    }
    const {
        level = 'warning',
        tags = {},
        extra = {},
        minIntervalMs = 6 * 60 * 60 * 1000 // once per 6h per key
    } = options;

    try {
        const now = Date.now();
        const last = rateLimits.get(key) || 0;
        if (now - last < minIntervalMs) {
            return;
        }
        rateLimits.set(key, now);
        Sentry.captureMessage(message, { level, tags, extra });
    } catch (_) {
        // never throw
    }
}

/**
 * Capture an exception. No-op when disabled.
 * @param {Error} error
 * @param {object} [options]
 * @param {object} [options.tags]
 * @param {object} [options.extra]
 */
function captureException(error, options = {}) {
    if (!enabled || !Sentry) {
        return;
    }
    const { tags = {}, extra = {} } = options;
    try {
        Sentry.captureException(error, { tags, extra });
    } catch (_) {
        // never throw
    }
}

/*
 * ------------------------------------------------------------------------
 * Volvo-specific helpers
 *
 * These encode the rate-limit policy and tagging for each class of event so
 * the call sites stay one-liners and every event of a kind is shaped the same.
 * ------------------------------------------------------------------------
 */

/**
 * A token refresh attempt failed. Called from OAuth2Client's error classifier.
 *
 * Every failure leaves a breadcrumb (cheap, gives context to a later expiry),
 * but only `auth`-type failures - the ones that mean the refresh token is dead
 * and the user must re-authorize - are raised as their own Sentry issue. That
 * keeps transient network/server blips out of the issue stream while still
 * surfacing the "why did authentication break?" signal we actually care about.
 *
 * @param {object} args
 * @param {string} args.errorType  'network' | 'server' | 'auth' | 'client' | 'unknown'
 * @param {number} [args.status]   HTTP status of the token endpoint response
 * @param {string} [args.message]  Short, non-sensitive error message
 * @param {string} [args.sessionId] Pseudonymous session id (for the rate-limit key)
 */
function reportRefreshTokenError({ errorType = 'unknown', status, message, sessionId = 'default' } = {}) {
    addBreadcrumb({
        category: 'auth',
        level: errorType === 'auth' ? 'error' : 'warning',
        message: `Token refresh failed (${errorType})`,
        data: { errorType, status: status || null }
    });

    if (errorType !== 'auth') {
        // Transient (network/server) or config (client) issues: breadcrumb only.
        return;
    }

    report(
        `refresh-token-auth-error:${sessionId}`,
        'Refresh token rejected - re-authorization required',
        {
            level: 'error',
            tags: { authErrorType: 'auth', tokenStatus: status ? String(status) : 'none' },
            extra: { message: message || 'unknown' },
            minIntervalMs: 60 * 60 * 1000 // once per hour per session
        }
    );
}

/**
 * An OAuth2 session expired and a device was set unavailable. This is the
 * user-visible impact of an auth failure. Rate-limited per session.
 * @param {object} [args]
 * @param {string} [args.sessionId]
 * @param {object} [args.tags]  e.g. { vehicleType }
 */
function reportSessionExpired({ sessionId = 'default', tags = {} } = {}) {
    report(
        `session-expired:${sessionId}`,
        'OAuth2 session expired - device set unavailable',
        {
            level: 'warning',
            tags: { ...tags, authEvent: 'expired' },
            minIntervalMs: 60 * 60 * 1000 // once per hour per session
        }
    );
}

/**
 * A sign-in flow (pairing) or re-authorization flow (repair) failed. Captured
 * as an exception so the stack/type is preserved. `phase` distinguishes the
 * first-time login from a re-auth, which behave differently in practice.
 * @param {'pair'|'repair'} phase
 * @param {Error|*} error
 */
function reportAuthFlowError(phase, error) {
    captureException(error instanceof Error ? error : new Error(formatError(error)), {
        tags: { authEvent: 'auth-flow', authPhase: phase }
    });
}

/**
 * A user-initiated vehicle command (lock/unlock/engine start, ...) failed.
 * Rate-limited per command so a repeatedly-failing command does not spam.
 * @param {string} command
 * @param {Error|*} error
 */
function reportCommandFailure(command, error) {
    report(
        `command-failure:${command}`,
        `Vehicle command failed: ${command}`,
        {
            level: 'warning',
            tags: { command },
            extra: { message: formatError(error) },
            minIntervalMs: 30 * 60 * 1000 // once per 30 min per command
        }
    );
}

/**
 * The VCC API key is missing from app settings, so every Volvo API call will
 * fail. A configuration problem, reported rarely (once/day) as info.
 */
function reportMissingApiKey() {
    report(
        'missing-vcc-api-key',
        'VCC API key missing from app settings',
        {
            level: 'info',
            minIntervalMs: 24 * 60 * 60 * 1000 // once per day
        }
    );
}

/**
 * Flush pending events (call on app shutdown).
 * @param {number} [timeout]
 */
async function flush(timeout = 2000) {
    if (!enabled || !Sentry) {
        return;
    }
    try {
        await Sentry.flush(timeout);
    } catch (_) {
        // never throw
    }
}

module.exports = {
    init,
    isEnabled,
    addBreadcrumb,
    report,
    captureException,
    reportRefreshTokenError,
    reportSessionExpired,
    reportAuthFlowError,
    reportCommandFailure,
    reportMissingApiKey,
    flush,
};
