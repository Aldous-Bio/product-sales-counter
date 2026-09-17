/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react-hooks/recommended", "prettier"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: { node: true, browser: true, es2022: true },
  settings: { react: { version: "detect" } },
  ignorePatterns: ["build/", "node_modules/", "extensions/*/dist/"],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
  },
};
