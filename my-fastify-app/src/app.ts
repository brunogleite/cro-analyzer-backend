import Fastify, { FastifyInstance } from "fastify";
import examplePlugin from "./plugins/example.plugin";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(examplePlugin);

  app.get("/", async (request, reply) => {
    return { message: "Hello Fastify + TypeScript!" };
  });

  return app;
}
