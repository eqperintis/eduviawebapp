import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` runs on every install (including Hostinger's build
// container, which has no database), so a missing DATABASE_URL must not
// fail it. Only the CLI's migrate/studio commands actually connect.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "mysql://localhost:3306/unset",
  },
});
