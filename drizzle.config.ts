export default {
  dialect: "postgresql" as const,
  schema: "./db/schema.ts",
  out: "netlify/database/migrations",
};
