/* eslint no-console:0 no-unused-vars:0 */

"use strict";

const bb = require("bot-brother");
const redis = require("redis");
const Bluebird = require("bluebird");
const dedent = require("dedent");
const _ = require("lodash");
const moment = require("moment");

Bluebird.promisifyAll(redis.RedisClient.prototype);
Bluebird.promisifyAll(redis.Multi.prototype);

const configuration = require("./configuration");
const Transantiago = require("./api/Transantiago");
const GoogleMaps = require("./api/GoogleMaps");
const BIP = require("./api/BIP");
const info = require("../package.json");
const createBot = require("./bot");

const config = configuration();

const transantiago = new Transantiago();
const googleMaps = new GoogleMaps(config.get("GOOGLE:MAPS:KEY"));
const bip = new BIP();
const client = redis.createClient({
  port: config.get("REDIS:PORT"),
  host: config.get("REDIS:HOST"),
});
const manager = bb.sessionManager.redis({ client });

const bot = createBot({
  manager,
  config,
  transantiago,
  googleMaps,
  bip,
  info,
});

console.log(dedent`
  Bot Started with:
  - NODE_ENV: ${config.get("NODE_ENV")}
  - URL: ${config.get("URL")}
  - PORT: ${config.get("PORT")}
  - TOKEN: ${_.fill([...config.get("TELEGRAM:TOKEN")], "*", 0, -5).join("")}
  - STARTED: ${moment().format()}
`);
