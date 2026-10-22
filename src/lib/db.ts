import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function client(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set — point it at a MySQL/MariaDB connection string (see .env.example).",
    );
  }
  globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  return globalForPrisma.prisma;
}

/**
 * The database, connected on first use rather than on import: `next build`
 * imports every route to collect page data, and on Hostinger the first
 * build can run before DATABASE_URL has been entered. A missing
 * DATABASE_URL still fails loudly, on the first request that needs it.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const prisma = client();
    const value = Reflect.get(prisma, property, prisma);
    return typeof value === "function" ? value.bind(prisma) : value;
  },
});
