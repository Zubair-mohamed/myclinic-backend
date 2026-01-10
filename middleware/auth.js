
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        // Set token from Bearer token in header
        token = req.headers.authorization.split(' ')[1];
    }
    
    // Make sure token exists
    if (!token) {
        return res.status(401).json({ error: 'Not authorized to access this route' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user by id from token payload
        req.user = await User.findById(decoded.id);

        if (!req.user) {
             return res.status(401).json({ error: 'Not authorized to access this route, user not found' });
        }

        // Check if account is disabled
        if (req.user.isDisabled) {
            return res.status(403).json({ 
                error: 'Your account has been disabled by the administration. Please contact support. / تم تعطيل حسابك من قبل الإدارة. يرجى التواصل مع الدعم الفني للمساعدة.' 
            });
        }

        next();
    } catch (err) {
        return res.status(401).json({ error: 'Not authorized to access this route' });
    }
};

// Optional protection (attaches user if token exists, otherwise continues as guest)
exports.optionalProtect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id);
        
        // If user is disabled, still allow optional access but mark it
        // (This allows some read-only operations, but most routes will check isDisabled)
        if (req.user && req.user.isDisabled) {
            // Continue but the route handler should check isDisabled if needed
        }
        
        next();
    } catch (err) {
        // Invalid token or no user found, proceed as guest (req.user will be undefined)
        next();
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: `User role '${req.user.role}' is not authorized to access this route`});
        }
        next();
    };
};
