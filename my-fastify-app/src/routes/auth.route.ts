import { FastifyInstance } from 'fastify';
import { LoginRequest, CreateUserRequest, ChangePasswordRequest } from '../models/user.model';

export default async function authRoutes(fastify: FastifyInstance) {
  // Register new user
  fastify.post('/register', async (request, reply) => {
    try {
      const userData = request.body as CreateUserRequest;
      
      // Validate required fields
      if (!userData.email || !userData.password || !userData.firstName || !userData.lastName) {
        return reply.code(400).send({
          error: 'Missing required fields',
          message: 'Email, password, firstName, and lastName are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        return reply.code(400).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        });
      }

      // Validate password strength
      if (userData.password.length < 8) {
        return reply.code(400).send({
          error: 'Weak password',
          message: 'Password must be at least 8 characters long'
        });
      }

      const result = await fastify.auth.register(userData);
      
      return reply.code(201).send({
        message: 'User registered successfully',
        ...result
      });
    } catch (error) {
      const message = (error as Error).message;
      
      if (message.includes('already exists')) {
        return reply.code(409).send({
          error: 'User already exists',
          message
        });
      }
      
      return reply.code(500).send({
        error: 'Registration failed',
        message
      });
    }
  });

  // Login user
  fastify.post('/login', async (request, reply) => {
    try {
      const credentials = request.body as LoginRequest;
      
      if (!credentials.email || !credentials.password) {
        return reply.code(400).send({
          error: 'Missing credentials',
          message: 'Email and password are required'
        });
      }

      const result = await fastify.auth.login(credentials);
      
      return reply.send({
        message: 'Login successful',
        ...result
      });
    } catch (error) {
      const message = (error as Error).message;
      
      if (message.includes('Invalid email or password') || message.includes('Account is deactivated')) {
        return reply.code(401).send({
          error: 'Authentication failed',
          message
        });
      }
      
      return reply.code(500).send({
        error: 'Login failed',
        message
      });
    }
  });

  // Get current user profile
  fastify.get('/profile', async (request, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const userRepository = new (await import('../repositories/user.repository')).UserRepository(
        fastify.db.db, 
        fastify.db.config
      );
      
      const user = await userRepository.findById(request.user.userId);
      
      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          message: 'User profile not found'
        });
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get profile',
        message: (error as Error).message
      });
    }
  });

  // Change password
  fastify.post('/change-password', async (request, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const { currentPassword, newPassword } = request.body as ChangePasswordRequest;
      
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({
          error: 'Missing passwords',
          message: 'Current password and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return reply.code(400).send({
          error: 'Weak password',
          message: 'New password must be at least 8 characters long'
        });
      }

      const userRepository = new (await import('../repositories/user.repository')).UserRepository(
        fastify.db.db, 
        fastify.db.config
      );
      
      const user = await userRepository.findById(request.user.userId);
      
      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          message: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await userRepository.verifyPassword(user, currentPassword);
      if (!isValidPassword) {
        return reply.code(400).send({
          error: 'Invalid password',
          message: 'Current password is incorrect'
        });
      }

      // Update password
      await userRepository.changePassword(user.id, newPassword);
      
      return reply.send({
        message: 'Password changed successfully'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to change password',
        message: (error as Error).message
      });
    }
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const newToken = await fastify.auth.refreshToken(request.user.userId);
      
      return reply.send({
        message: 'Token refreshed successfully',
        token: newToken
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to refresh token',
        message: (error as Error).message
      });
    }
  });

  // Admin: Get all users (admin only)
  fastify.get('/users', async (request, reply) => {
    try {
      if (!request.user || request.user.role !== 'admin') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }

      const userRepository = new (await import('../repositories/user.repository')).UserRepository(
        fastify.db.db, 
        fastify.db.config
      );
      
      const query = request.query as any;
      const filters = {
        role: query.role,
        isActive: query.isActive !== undefined ? query.isActive === 'true' : undefined,
        email: query.email,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
      };
      
      const users = await userRepository.find(filters);
      
      // Remove password from response
      const safeUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));
      
      return reply.send(safeUsers);
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get users',
        message: (error as Error).message
      });
    }
  });
} 