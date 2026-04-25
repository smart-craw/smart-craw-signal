import winston from "winston";
//const errorLog = "error.log";

const logLevel = process.env.LOG_LEVEL || "info";
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.json(),
  defaultMeta: { service: "smart-craw" },
  transports: [
    // I'm paranoid: anywhere that the service can write to the llm can read.  And do I want it reading it's own error logs?
    //new winston.transports.File({ filename: errorLog, level: "error" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});
