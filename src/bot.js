"use strict";

const bb = require("bot-brother");
const dedent = require("dedent");
const moment = require("moment");
const fs = require("mz/fs");
const path = require("path");

const featureCards = require("./features/cards");
const featureBusTour = require("./features/busTour");
const featureBusStop = require("./features/busStop");
const featureBusStopNear = require("./features/busStopNear");

module.exports = function createBot(options) {
  const { manager, config, info } = options;
  const token = config.get("TELEGRAM:TOKEN");
  const COMMANDS_PATH = path.join(__dirname, "..", "docs", "commands.txt");

  const bot = bb({
    key: token,
    sessionManager: manager,
    webHook: {
      url: `${config.get("URL")}/bot${token}`,
      port: config.get("PORT"),
    },
  });

  bot.texts({
    start: dedent`
      *¡Transantiago Bot te saluda humano <%= user.first_name %>* :oncoming_bus: :wave:

      Este bot es _no-oficial_ y fue desarrollado usando información pública y en tiempo real del Transantiago. :information_desk_person:

      Información y datos para realizar una donación y mantener este proyecto vivo al escribir /about.

      :crystal_ball: Los comandos disponibles son los siguientes:
      <% commands.forEach(command => { %>
      /<%= command -%>
      <% }); -%>
    `,
    about: dedent`
      *<%= info.name %> (<%= info.version %>)*
      *Licencia:* <%= info.license %>
      *Repositorio:* <%= info.repository.url %>

      Este bot es _no-oficial_ y no guarda relación con el Transantiago ni el Ministerio de Transportes.

      :bust_in_silhouette: *Autor:*
       • <%= info.author.name %>
       • <%= info.author.email %>
       • <%= info.author.url %>
       • @<%= info.author.telegram %>

      :pray: *Ayúdame a mantener esto con alguna donación:*
      - PayPal:
        <%= info.author.paypal %>
      - Bitcoin:
        \`<%= info.author.btc %>\`
      - Ether:
        \`<%= info.author.eth %>\`
    `,
    cancel: dedent`
      OK, dejaré de hacer lo que estaba haciendo.
      ¿Necesitas ayuda? Escribe /help.
    `,
    menu: {
      back: ":arrow_backward: Volver",
      next: ":arrow_forward: Ver más",
    },
  });

  bot.command(/.*/).use("before", async ctx => {
    // eslint-disable-next-line
    console.log(dedent`
      ${moment().format("YYYY/MM/DD HH:mm:ss")}
      USER: ${JSON.stringify(ctx.meta.user)}
      CHAT: ${JSON.stringify(ctx.meta.chat)}
      FROM: ${JSON.stringify(ctx.meta.from)}
      CMD: ${JSON.stringify(ctx.command)}
      ANSWER: ${JSON.stringify(ctx.answer)}
      CALLBACK: ${JSON.stringify(ctx.callbackData)}
      ---
    `);
  });

  /**
   * /start
   * Init bot showing this first message.
   */
  bot.command("start").invoke(async ctx => {
    const txt = await fs.readFile(COMMANDS_PATH, "utf8");
    // Use String.raw to fix scape problem.
    ctx.data.commands = txt.replace("_", String.raw`\_`).split("\n").filter(Boolean);
    ctx.data.user = ctx.meta.user;
    await ctx.sendMessage("start", { parse_mode: "Markdown" });
  });

  /**
   * /help
   * Help message, in this case we just redirect to /start
   */
  bot.command("help").invoke(async ctx => {
    await ctx.go("start");
  });

  /**
   * /about
   * Show information from `package.json` like version, author and donation addresses.
   */
  bot.command("about").invoke(async ctx => {
    ctx.data.info = info;
    await ctx.sendMessage("about", { parse_mode: "Markdown" });
  });

  /**
   * /cancelar
   * Stop current action. FYI: calling any other /(action) stops the current state.
   */
  bot.command("cancelar").invoke(async ctx => {
    ctx.hideKeyboard();
    await ctx.sendMessage("cancel", { parse_mode: "Markdown" });
  });

  featureCards(bot, options);
  featureBusTour(bot, options);
  featureBusStop(bot, options);
  featureBusStopNear(bot, options);
};
