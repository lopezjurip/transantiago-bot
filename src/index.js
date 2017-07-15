"use strict";

const bb = require("bot-brother");
const dedent = require("dedent");
const numeral = require("numeral");
const _ = require("lodash");
const moment = require("moment");
const truncate = require("unicode-byte-truncate");
const fs = require("mz/fs");
const path = require("path");

const configuration = require("./configuration");
const Transantiago = require("./TransantiagoAPI");
const GoogleMaps = require("./GoogleMapsAPI");
const info = require("../package.json");

const config = configuration();

// TODO: Temporal fix. Add pagination.
// See: https://core.telegram.org/method/messages.sendMessage#return-errors
const MAX_BYTES = 4096;

const url = config.get("URL");
const token = config.get("TELEGRAM:TOKEN");
const manager = bb.sessionManager.redis({
  port: config.get("REDIS:PORT"),
  host: config.get("REDIS:HOST"),
});

const transantiago = new Transantiago();
const googleMaps = new GoogleMaps(config.get("GOOGLE:MAPS:KEY"));

const bot = bb({
  key: token,
  sessionManager: manager,
  webHook: {
    url: `${url}/bot${token}`,
    port: config.get("PORT"),
  },
});

// eslint-disable-next-line
console.log(dedent`
  Bot Started with:
  - URL: ${url}
  - PORT: ${config.get("PORT")}
  - TOKEN: ${_.fill([...token], "*", 0, -5).join("")}
`);

bot.command(/.*/).use("before", async ctx => {
  const { name, args } = ctx.command;
  const date = moment().format("YYYY/MM/DD HH:mm:ss");
  // eslint-disable-next-line
  console.log(date, `@${ctx.meta.user.username} (${ctx.meta.user.language_code}):`, `/${name} ${args}`);
});

/**
 * /start
 * Init bot showing this first message.
 */
bot.command("start").invoke(async ctx => {
  const { user } = ctx.meta;

  const txt = await fs.readFile(path.join(__dirname, "..", "docs", "commands.txt"), "utf8");
  const commands = txt.split("\n").filter(Boolean).map(line => `/${line}`).join("\n");

  const message = dedent`
    *¡Transantiago Bot te saluda humano ${user.first_name}!* :oncoming_bus: :wave:

    Este bot es _no-oficial_ y fue desarrollado usando información pública y en tiempo real del Transantiago. :information_desk_person:

    Información y datos para realizar una donación y mantener este proyecto vivo al escribir /about.

    :crystal_ball: Los comandos disponibles son los siguientes:

    ${commands}
  `;
  await ctx.sendMessage(message, { parse_mode: "Markdown" });
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
  const message = dedent`
    *Transantiago Bot (${info.version})*
    *Licencia:* ${info.license}
    *Repositorio:* ${info.repository.url}

    Este bot es _no-oficial_ y no guarda relación con el Transantiago ni el Ministerio de Transportes.

    :bust_in_silhouette: *Autor:*
     • ${info.author.name}
     • ${info.author.email}
     • ${info.author.url}
     • @${info.author.telegram}

    :pray: *Ayúdame a mantener esto con alguna donación:*
    - PayPal ${info.author.paypal}
    - Bitcoin: \`${info.author.btc}\`
    - Ether: \`${info.author.eth}\`
  `;
  await ctx.sendMessage(message, { parse_mode: "Markdown" });
});

/**
 * /cancelar
 * Stop current action. FYI: calling any other /(action) stops the current state.
 */
bot.command("cancelar").invoke(async ctx => {
  ctx.hideKeyboard();
  await ctx.sendMessage(dedent`
    OK, dejaré de hacer lo que estaba haciendo.
    ¿Necesitas ayuda? /help
  `);
});

/**
 * /paradero
 * Ask and get information about the bus stop.
 */
bot
  .command("paradero")
  .invoke(async ctx => {
    if (ctx.command.args.length >= 1) {
      return await ctx.go(ctx.command.args[0]);
    } else {
      return await ctx.sendMessage(dedent`
        ¿Qué paradero quieres consultar?
        Por Ejemplo: /PA692.
        Para cancelar escribe /cancelar.
      `);
    }
  })
  .answer(async ctx => {
    const answer = ctx.answer;
    if (!answer) {
      return await ctx.repeat();
    } else {
      return await ctx.go(answer.toUpperCase());
    }
  });

/**
 * /recorrido
 * Get information about a bus tour.
 */
bot
  .command("recorrido")
  .invoke(async ctx => {
    if (ctx.command.args.length >= 1) {
      return await ctx.go(ctx.command.args[0]);
    } else {
      const message = dedent`
        ¿Qué recorrido quieres consultar?
        Por Ejemplo: /422.
        Para cancelar escribe /cancelar.
      `;
      return await ctx.sendMessage(message);
    }
  })
  .answer(async ctx => {
    const answer = ctx.answer;
    if (!answer) {
      return await ctx.repeat();
    } else {
      return await ctx.go(answer.toUpperCase());
    }
  });

/**
 * /cerca
 * Get near close bus stops.
 * TODO: allow typing an address.
 */
bot
  .command("cerca")
  .invoke(async ctx => {
    return await ctx.sendMessage(dedent`
      Puedes:
      :round_pushpin: Mandanos tu ubicación por Telegram.
      :pencil2: Escribir una dirección en el chat.

      Si quieres cancelar esta acción, escribe /cancelar.
    `);
  })
  .answer(async ctx => {
    const answer = ctx.answer;
    let { location } = ctx.message;

    if (!(answer && answer.length) && !location) {
      return await ctx.repeat();
    } else if (answer && answer.length && !location) {
      ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
      const results = await googleMaps.getPlacesByAddress(answer);
      if (!(results && results.length)) {
        const message = `No pudimos encontrar un lugar con ese nombre.`;
        return await ctx.sendMessage(message, { parse_mode: "Markdown" });
      }

      const result = results[0];
      const message = `Buscando cerca de ${result["formatted_address"]}...`;
      await ctx.sendMessage(message, { parse_mode: "Markdown" });

      location = result.geometry.location;
    }

    ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
    const response = await transantiago.getStops(location);

    const stops = _(response).filter("cod").sortBy("cod");

    const list = stops
      .map(
        stop => dedent`
        :busstop: /${stop["cod"]} _(${numeral(stop["distancia"]).format("0.[00]")} km)_
        ${stop["name"]}
      `
      )
      .join("\n\n");

    const message = dedent`
      :information_desk_person: Encontré esto:

      ${list}

      :bus: ¿Qué paradero quieres revisar?
    `;

    const keyboard = stops
      .map(stop => ({
        [stop["cod"]]: {
          go: stop["cod"],
          // args: [stop["cod"]],
        },
      }))
      .chunk(3)
      .concat([[{ Cancelar: { go: "cancelar" } }]]) // Add a last button.
      .value();

    ctx.keyboard(keyboard);
    return await ctx.sendMessage(message, { parse_mode: "Markdown" });
  });

/**
 * /(BUS_STOP)
 * Example: /PA692
 * Get buses and their plate and time.
 * TODO: check regex.
 */
bot
  .command(/^[a-zA-Z]{2}[0-9]+/) // Match first 2 alphabetic digits and the rest must be numbers.
  .invoke(async ctx => {
    const id = ctx.command.name.toUpperCase().trim();

    ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
    const response = await transantiago.getStop(id);

    if (!response) {
      const message = `No encontramos paraderos para ${id}.`;
      return await ctx.sendMessage(message, { parse_mode: "Markdown" });
    }

    const services = _(response["servicios"]["item"])
      .sortBy("servicio")
      .map(service => {
        const name = service["servicio"];
        const to = service["destino"] || ":question:";

        const buses = [1, 2]
          .filter(n => service[`distanciabus${n}`])
          .map(n => {
            const plate = service[`ppubus${n}`];
            const distance = numeral(service[`distanciabus${n}`]).divide(1000);
            const time = service[`horaprediccionbus${n}`];
            return dedent`
              ↳ \`${plate}\` _(${distance.format("0.[00]")} km)_:
              *${time}*
            `;
          })
          .join("\n");

        const lines = [`:bus: /${name} → ${to}`, buses, service["respuestaServicio"]];
        return lines.filter(Boolean).join("\n");
      })
      .join("\n\n");

    const message = dedent`
      :busstop: *Paradero ${response["paradero"]}*
      ${response["nomett"]}
      _Actualizado: ${response["horaprediccion"]}_

      ${services}
    `;

    await ctx.sendMessage(truncate(message, MAX_BYTES), { parse_mode: "Markdown" });
    if (response["x"] && response["y"]) {
      await ctx.sendLocation(response["x"], response["y"]);
    }
  });

/**
 * /(BUS)
 * Example: /422 /D18
 * Get bus complete tour.
 * TODO: check regex and paginate long responses.
 */
bot
  .command(/^[a-zA-Z0-9]{1}[0-9]+/) // TODO: refine this
  .invoke(async ctx => {
    const id = ctx.command.name.toUpperCase().trim();

    ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
    const response = await transantiago.getTours(id);

    if (!response) {
      const message = `No encontramos recorridos para ${id}.`;
      return ctx.sendMessage(message, { parse_mode: "Markdown" });
    }

    const tours = _(response).map(tour => {
      const code = tour["cod"];
      const to = tour["destino"];
      const times = tour["horarios"]
        .map(schedule => {
          const day = schedule["tipoDia"];
          const start = schedule["inicio"];
          const end = schedule["fin"];
          return dedent`
          :calendar: ${day}
          • ${start} - ${end}`;
        })
        .join("\n\n");

      const stops = _(tour["paradas"])
        .map(
          stop => dedent`
            :busstop: /${stop["cod"]} (${_.capitalize(stop["comuna"])})
            ${stop["name"]}
          `
        )
        .join("\n\n");

      return dedent`
        :bus: *Recorrido* *${code} → ${to}*

        ${times}

        ${stops}
      `;
    });

    for (const message of tours) {
      await ctx.sendMessage(truncate(message, MAX_BYTES), { parse_mode: "Markdown" });
    }
  });
