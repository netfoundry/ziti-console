"use strict";
const path = require("path");
const fs = require("fs");
const logging = require("./logging");
const logger = logging.logger;
const yargs = require("yargs");

const ENV_PREFIX = "ZC";

//support for iisnode/azure, use PORT as ZC_PORT. Set here so CLI args can override
let isPortEnv = false;
if (process.env.PORT !== undefined) {
    process.env.ZC_PORT = process.env.PORT;
    isPortEnv = true;
}

let argv = yargs
    .usage("Usage: $0 [options]")
    .example("$0 --port 8989 --key someFile.key --cert someFile.cert --settings path/to/settings/dir/ --log-format text", "Start the server on port 8989 with HTTPS, a specific settings directory and log format")
    .option("verbose", {
        alias: "v",
        demandOption: false,
        default: 0,
        describe: "provide debug output, specified once provides debug, twice provides silly levels of output, can be set via ZC_VERBOSE=n",
        type: "boolean",
        count: true,
    })
    .option("log-format", {
        alias: "l",
        demandOption: false,
        default: "json",
        describe: "sets the log output format, can be set via ZC_LOG_FORMAT=format",
        choices: ["json", "text"]
    })
    .option("port", {
        alias: "p",
        demandOption: false,
        default: 1408,
        describe: "the port to start the server on, can be set via ZC_PORT or PORT (iisnode support)",
        type: "number"
    })
    .option("key", {
        alias: "k",
        demandOption: false,
        default: "",
        describe: "the PEM encoded key file to use for HTTPS, can be set via ZC_KEY",
        type: "string"
    })
    .option("cert", {
        alias: "c",
        demandOption: false,
        default: "",
        describe: "the PEM encoded cert or chain file to use for HTTPS, can be set via ZC_CERT",
        type: "string"
    })
    .option("settings", {
        alias: "s",
        demandOption: false,
        default: path.join("..", "ziti"),
        describe: "a path to a custom settings/resource directory, can be set via ZC_SETTINGS",
        type: "string"
    })
    .check((argv /*, alias*/) => {
        logging.setFormat(argv["log-format"]);

        //patch around: https://github.com/yargs/yargs-parser/issues/192
        //count args don't work w/ env variable definitions
        if (argv["verbose"] === 0 && process.env.ZC_VERBOSE !== undefined) {
            argv["verbose"] = parseInt(process.env.ZC_VERBOSE, 10);
        }

        switch (argv["verbose"]) {
            case 1:
                logger.level = "debug";
                break;
            case 2:
                logger.level = "silly";
                break;
            default:
                logger.level = "info";
                break;
        }
        logger.info("logging level set to: " + logger.level);

        if (isPortEnv) {
            logger.info(`environment variable PORT detected, using as ${ENV_PREFIX}_PORT`);
        }

        if (argv["key"] === "" && fs.existsSync("./server.key")) {
            //auto detect behavior
            argv["key"] = "./server.key";
            argv["k"] = argv["key"];
            logger.info("auto detected ./server_key")
        }

        if (argv["cert"] === "" && fs.existsSync("./server.chain.pem")) {
            //auto detect behavior
            argv["cert"] = "./server.chain.pem";
            argv["c"] = argv["cert"];
            logger.info("auto detected ./server.chain.pem")
        }

        if (!Number.isInteger(argv["port"])) {
            logger.error("port must be an integer");
            process.exit(1)
        }

        if (argv["key"] !== "" && !fs.existsSync(argv["key"])) {
            logger.error(`key file [${argv["key"]}] not found`);
            process.exit(1)
        }

        if (argv["cert"] !== "" && !fs.existsSync(argv["cert"])) {
            logger.error(`cert file [${argv["cert"]}] not found`);
            process.exit(1)
        }

        const keys = Object.keys(argv);
        for (const key of keys) {
            if (key === null || key.length === 1 || key === "$0") {
                continue
            }
            logger.debug(`argument - ${key} = ${argv[key] || "<null>"}`)
        }
        return true
    })
    .env(ENV_PREFIX)
    .help('h')
    .alias('h', 'help')
    .epilog('copyright NetFoundry 2019')
    .argv;


module.exports = argv;