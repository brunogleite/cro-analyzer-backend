import { FastifyInstance } from "fastify";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { AuthServiceImpl } from "../services/auth.service";
import { JWTPayload } from "../services/auth.service";

declare module "fastify" {
  interface FastifyInstance {
    auth: AuthServiceImpl;
  }
  
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Initialize auth service
  const userRepository = fastify.db.getUserRepository();
  const authService = new AuthServiceImpl(userRepository);
  
  fastify.decorate("auth", authService);

  // Authentication middleware
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      // Skip authentication for public routes
      const publicRoutes = [
        '/api/auth/login',
        '/api/auth/register',
        '/health',
        '/health/db',
        '/'
      ];
      
      if (publicRoutes.includes(request.url)) {
        return;
      }

      // Verify JWT token
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Missing authentication token'
        });
      }

      const payload = await authService.verifyToken(token);
      request.user = payload;
    } catch (error) {
      reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid authentication token'
      });
    }
  });

  // Role-based authorization decorator
  fastify.decorate('requireRole', (roles: string[]) => {
    return async (request: any, reply: any) => {
      if (!request.user) {
        return reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      if (!roles.includes(request.user.role)) {
        return reply.code(403).send({ 
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
      }
    };
  });

  // Admin-only decorator
  fastify.decorate('requireAdmin', async (request: any, reply: any) => {
    if (!request.user) {
      return reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (request.user.role !== 'admin') {
      return reply.code(403).send({ 
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }
  });
};

export default fp(authPlugin, {
  name: "auth-plugin",
}); 