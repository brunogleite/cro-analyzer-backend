import { FastifyInstance } from "fastify";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { DatabaseServiceImpl } from "../services/database.service";

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseServiceImpl;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const dbService = new DatabaseServiceImpl();

  // Initialize database on plugin registration
  await dbService.initialize();

  // Decorate fastify with database service
  fastify.decorate("db", dbService);

  // Add health check endpoint
  fastify.get("/health/db", async (request, reply) => {
    try {
      const isHealthy = await dbService.healthCheck();
      if (isHealthy) {
        return reply.send({ status: "healthy", database: "connected" });
      } else {
        return reply.code(503).send({ status: "unhealthy", database: "disconnected" });
      }
    } catch (error) {
      return reply.code(503).send({ 
        status: "unhealthy", 
        database: "error",
        error: (error as Error).message 
      });
    }
  });

  // Graceful shutdown
  fastify.addHook("onClose", async () => {
    await dbService.close();
  });
};

export default fp(databasePlugin, {
  name: "database-plugin",
}); 