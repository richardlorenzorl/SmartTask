import jwt from 'jsonwebtoken';

export function createAuthMiddleware(JWT_SECRET) {
    return async function authMiddleware(req, res, next) {
        try {
            // Get token from header
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                throw new Error('No token provided');
            }

            const token = authHeader.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Add user info to request
            req.user = {
                userId: decoded.userId,
                email: decoded.email,
                roles: decoded.roles
            };

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'TokenExpired',
                    message: 'Access token has expired' 
                });
            }

            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'Invalid or missing token' 
            });
        }
    };
}

export function requireRoles(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'Authentication required' 
            });
        }

        const hasRequiredRole = roles.some(role => 
            req.user.roles.includes(role)
        );

        if (!hasRequiredRole) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'Insufficient permissions' 
            });
        }

        next();
    };
}
