import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", ".orq/**", "drizzle/**", "next-env.d.ts", ".pglite/**"] },
];

export default config;
