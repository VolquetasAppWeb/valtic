module.exports = {
  extends: ["@valtic/eslint-config/base.js"],
  parserOptions: {
    project: "tsconfig.json",
    sourceType: "module",
  },
  env: {
    node: true,
    jest: true,
  },
};
