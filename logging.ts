import winston from "winston";
const errorLog = "error.log";

const logLevel = process.env.LOG_LEVEL || "info";
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.json(),
  defaultMeta: { service: "smart-craw" },
  transports: [
    //
    // - Write all logs with importance level of `error` or higher to `error.log`
    //   (i.e., error, fatal, but not other levels)
    //
    new winston.transports.File({ filename: errorLog, level: "error" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});
