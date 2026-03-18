import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.tsx"],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "app/**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

export default config;
