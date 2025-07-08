import Fastify, { FastifyInstance } from "fastify";
import examplePlugin from "./plugins/example.plugin";
import databasePlugin from "./plugins/database.plugin";
import croServicePlugin from "./plugins/cro.service.plugin";
import authPlugin from "./plugins/auth.plugin";
import croRoutes from "./routes/cro.route";
import authRoutes from "./routes/auth.route";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // Register plugins
  app.register(examplePlugin);
  app.register(databasePlugin);
  app.register(authPlugin);
  app.register(croServicePlugin);

  // Register routes
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(croRoutes, { prefix: "/api/cro" });

  app.get("/", async (request, reply) => {
    return { message: "Hello Fastify + TypeScript!" };
  });

  return app;
}
