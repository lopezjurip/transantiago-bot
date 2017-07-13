module.exports = {
  "parserOptions": {
    "ecmaVersion": 2017,
  },
  "env": {
    "node": true,
    "jest": true,
    "es6": true,
  },
  "extends": [
    "eslint:recommended",
    "prettier",
  ],
  "plugins": [
    "prettier",
  ],
  "rules": {
    "prettier/prettier": ["error", {
      "trailingComma": "es5",
      "printWidth": 120,
    }],
  },
};
