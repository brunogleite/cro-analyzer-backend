import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import examplePlugin from "./plugins/example.plugin";
import databasePlugin from "./plugins/database.plugin";
import croServicePlugin from "./plugins/cro.service.plugin";
import authPlugin from "./plugins/auth.plugin";
import croRoutes from "./routes/cro.route";
import authRoutes from "./routes/auth.route";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
          },
          // Exclude request body from logs for security
          body: req.body ? '[REDACTED]' : undefined,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  });

  // Register CORS
  app.register(cors, {
    origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
