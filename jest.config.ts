import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs", jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // A local production build copies package metadata into .next/standalone.
  // That output is not a second source tree or a Jest module provider.
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.next/"],
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.tsx", "**/lib/**/*.test.ts"],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "app/**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

export default config;
