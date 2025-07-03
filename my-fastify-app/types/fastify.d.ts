import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    utility(): string;
  }
}
