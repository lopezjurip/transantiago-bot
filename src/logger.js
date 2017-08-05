const path = require("path");
const fs = require("fs");
const winston = require("winston");
require("winston-daily-rotate-file");

module.exports = function createLogger(config) {
  const dir = config.get("LOG:DIR");

  const pathAt = (...route) => path.join(__dirname, "..", ...route);

  if (!fs.existsSync(pathAt(dir))) {
    fs.mkdirSync(pathAt(dir));
  }

  /* Levels:
     error: 0 | warn: 1 | info: 2 | verbose: 3 | debug: 4 | silly: 5
  */

  const logger = new winston.Logger({
    level: config.get("LOG:LEVEL"),
    transports: [
      new winston.transports.Console({
        level: "debug",
        colorize: true,
        prettyPrint: true,
        timestamp: true,
      }),
      new winston.transports.DailyRotateFile({
        name: "info-file",
        filename: pathAt(dir, "info.log"),
        level: "info",
        datePattern: "yyyy-MM-dd.",
        prepend: true,
        timestamp: true,
        localTime: true,
      }),
      new winston.transports.DailyRotateFile({
        name: "error-file",
        filename: pathAt(dir, "error.log"),
        level: "error",
        datePattern: "yyyy-MM-dd.",
        prepend: true,
        timestamp: true,
        localTime: true,
        handleExceptions: config.get("LOG:EXCEPTIONS"),
        humanReadableUnhandledException: config.get("LOG:EXCEPTIONS"),
      }),
      new winston.transports.DailyRotateFile({
        name: "warn-file",
        filename: pathAt(dir, "warn.log"),
        level: "warn",
        datePattern: "yyyy-MM-dd.",
        prepend: true,
        timestamp: true,
        localTime: true,
      }),
    ],
  });
  return logger;
};
