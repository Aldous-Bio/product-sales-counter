import { PrismaClient } from "@prisma/client";

// Avoid exhausting DB connections when the dev server hot-reloads.
const prisma = global.prismaGlobal ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export default prisma;
