import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Any arity: a bare client.db() resolves an unasserted name, and
          // client.db("website") hardcodes a production database name that is
          // wrong on staging. Both go through the asserted accessors instead.
          selector: "CallExpression[callee.property.name='db']",
          message:
            "client.db() is banned in apps/admin — use getAdminDb() or getContentDb() from src/service/database.service.ts, which assert the URI-resolved database name. Never hardcode a database name.",
        },
      ],
    },
  },
];

export default eslintConfig;
