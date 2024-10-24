import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export default function CreateAuthService() {
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRES_IN = '24h';
    const REFRESH_TOKEN_EXPIRES_IN = '7d';

    async function hashPassword(password) {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    }

    async function validatePassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }

    function generateTokens(userId, email, roles) {
        const accessToken = jwt.sign(
            { userId, email, roles },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { userId, tokenType: 'refresh' },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        return { accessToken, refreshToken };
    }

    async function registerUser(userData) {
        try {
            // Validate email format
            if (!isValidEmail(userData.email)) {
                throw new UserException("InvalidEmail");
            }

            // Check if user already exists
            const existingUser = await $db.User.FindOne({ 
                Email: userData.email 
            });
            
            if (existingUser) {
                throw new UserException("UserAlreadyExists");
            }

            // Hash password and create user
            const hashedPassword = await hashPassword(userData.password);
            
            const user = await $db.User.Create({
                Email: userData.email,
                Name: userData.name,
                Password: hashedPassword,
                Preferences: JSON.stringify({}),
                CreatedAt: new Date(),
                ModifiedAt: new Date()
            });

            // Generate initial tokens
            const tokens = generateTokens(user.Id, user.Email, ['user']);

            // Store refresh token
            await storeRefreshToken(user.Id, tokens.refreshToken);

            return {
                user: {
                    id: user.Id,
                    email: user.Email,
                    name: user.Name
                },
                ...tokens
            };
        } catch (error) {
            $log.Error("Registration failed", error);
            throw new UserException("RegistrationFailed");
        }
    }

    async function loginUser(email, password) {
        try {
            // Find user
            const user = await $db.User.FindOne({ 
                Email: email 
            });
            
            if (!user) {
                throw new UserException("InvalidCredentials");
            }

            // Validate password
            const isValid = await validatePassword(password, user.Password);
            if (!isValid) {
                throw new UserException("InvalidCredentials");
            }

            // Get user roles
            const roles = await getUserRoles(user.Id);

            // Generate new tokens
            const tokens = generateTokens(user.Id, user.Email, roles);

            // Store refresh token
            await storeRefreshToken(user.Id, tokens.refreshToken);

            return {
                user: {
                    id: user.Id,
                    email: user.Email,
                    name: user.Name
                },
                ...tokens
            };
        } catch (error) {
            $log.Error("Login failed", error);
            throw new UserException("LoginFailed");
        }
    }

    async function refreshAccessToken(refreshToken) {
        try {
            // Verify refresh token
            const decoded = jwt.verify(refreshToken, JWT_SECRET);
            
            // Check if token is in database and not revoked
            const storedToken = await $db.RefreshToken.FindOne({
                UserId: decoded.userId,
                Token: refreshToken,
                IsRevoked: false
            });

            if (!storedToken) {
                throw new UserException("InvalidRefreshToken");
            }

            // Get user and roles
            const user = await $db.User.FindById(decoded.userId);
            const roles = await getUserRoles(user.Id);

            // Generate new access token
            const accessToken = jwt.sign(
                { userId: user.Id, email: user.Email, roles },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            return { accessToken };
        } catch (error) {
            $log.Error("Token refresh failed", error);
            throw new UserException("TokenRefreshFailed");
        }
    }

    async function logoutUser(userId, refreshToken) {
        try {
            // Revoke refresh token
            await $db.RefreshToken.Update({
                UserId: userId,
                Token: refreshToken
            }, {
                IsRevoked: true,
                RevokedAt: new Date()
            });

            return true;
        } catch (error) {
            $log.Error("Logout failed", error);
            throw new UserException("LogoutFailed");
        }
    }

    async function getUserRoles(userId) {
        try {
            const teamMemberships = await $db.TeamMember.FindAll({
                UserId: userId
            });

            const roles = new Set(['user']);
            
            teamMemberships.forEach(membership => {
                roles.add(membership.Role);
            });

            return Array.from(roles);
        } catch (error) {
            $log.Error("Get user roles failed", error);
            return ['user'];
        }
    }

    // Helper functions
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async function storeRefreshToken(userId, token) {
        await $db.RefreshToken.Create({
            UserId: userId,
            Token: token,
            IssuedAt: new Date(),
            ExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            IsRevoked: false
        });
    }

    return {
        registerUser,
        loginUser,
        refreshAccessToken,
        logoutUser,
        getUserRoles
    };
}
