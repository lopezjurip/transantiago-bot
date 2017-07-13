const path = require("path");
const nconf = require("nconf");
const dotenv = require("dotenv");

const SEPARATOR = ":";

// From /config/*.json
function fromJSON(name) {
  return path.join(__dirname, "..", "config", `${name}.json`);
}

// Method to create a sub-configuration from this object
nconf.Provider.prototype.sub = function sub(...args) {
  const generated = new nconf.Provider();
  generated.defaults(this.get(args.join(SEPARATOR)));
  return generated;
};

module.exports = function configuration(subtree = null) {
  dotenv.config();

  const config = new nconf.Provider({ separator: SEPARATOR });

  // Priorize cli arguments and then enviorement.
  config.argv().env("__");

  // Sane defaults
  config.defaults({
    NODE_ENV: "development",
  });

  // Check and set NODE_ENV
  const enviorement = config.get("NODE_ENV");

  // Load from enviorement file
  config.file("enviorement", {
    file: fromJSON(enviorement),
  });

  // Default fallback
  config.file("default", {
    file: fromJSON("default"),
  });

  // Throw error if missing
  config.required(["URL", "TELEGRAM:TOKEN"]);

  // Return a sub-tree of the config object is needed
  return subtree ? config.sub(subtree) : config;
};
