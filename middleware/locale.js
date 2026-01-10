const SUPPORTED_LOCALES = ['en', 'ar'];
const DEFAULT_LOCALE = 'en';

const STATIC_MESSAGES = {
    internalError: {
        en: 'Something went wrong. Please try again later.',
        ar: 'حدث خطأ ما. يرجى المحاولة لاحقاً.',
    },
    serverError: {
        en: 'Server Error',
        ar: 'خطأ في الخادم'
    }
};

/**
 * Middleware to pin the active locale for each request.
 * Sources: query `lang`, header `x-locale`, then `accept-language`.
 * Falls back to DEFAULT_LOCALE but never to a mixed language.
 */
module.exports = function localeMiddleware(req, res, next) {
    const fromQuery = typeof req.query?.lang === 'string' ? req.query.lang : null;
    const fromHeader = req.get('x-locale');
    const fromAccept = req.get('accept-language');

    const pick = (value) => {
        if (!value) return null;
        const cleaned = value.split(',')[0].trim().toLowerCase();
        return SUPPORTED_LOCALES.includes(cleaned) ? cleaned : null;
    };

    const locale = pick(fromQuery) || pick(fromHeader) || pick(fromAccept) || DEFAULT_LOCALE;

    const translate = (key, fallback) => {
        const dict = STATIC_MESSAGES[key];
        if (dict && dict[locale]) return dict[locale];
        // Do not switch language; if missing, return fallback or key itself
        return fallback || key;
    };

    req.locale = locale;
    req.t = translate;
    res.locals.locale = locale;
    res.locals.t = translate;
    next();
};
