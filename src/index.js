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
    *Transantiago Bot (<%= info.version %>)*
    *Licencia:* <%= info.license %>
    *Repositorio:* <%= info.repository.url %>

    Este bot es _no-oficial_ y no guarda relación con el Transantiago ni el Ministerio de Transportes.

    :bust_in_silhouette: *Autor:*
     • <%= info.author.name %>
     • <%= info.author.email %>
     • <%= info.author.url %>
     • @<%= info.author.telegram %>

    :pray: *Ayúdame a mantener esto con alguna donación:*
    - PayPal <%= info.author.paypal %>
    - Bitcoin: \`<%= info.author.btc %>\`
    - Ether: \`<%= info.author.eth %>\`
  `,
  cancel: dedent`
    OK, dejaré de hacer lo que estaba haciendo.
    ¿Necesitas ayuda? Escribe /help.
  `,
  near: {
    ask: dedent`
      Puedes:
      :round_pushpin: Mandanos tu ubicación por Telegram.
      :pencil2: Escribir una dirección en el chat.

      Si quieres cancelar esta acción, escribe /cancelar.
    `,
    notFound: dedent`
      No pudimos encontrar un lugar con el nombre:
      <%= name %>
    `,
    finding: dedent`
      Buscando cerca de <%= name %>...
    `,
    found: dedent`
      :information_desk_person: Encontré esto:
      <% stops.forEach(stop => { %>
      :busstop: /<%= stop["cod"] -%> _(<%= stop["distancia"] -%> km)_
      <%= stop["name"] -%>
      <% stop["servicios"].forEach(service => { %>
      ↳ :bus: /<%= service["cod"] %> <%= service["destino"] -%>
      <% }); %>
      <% }); %>
      :bus: ¿Qué paradero quieres revisar?
    `,
  },
  stop: {
    ask: dedent`
      ¿Qué paradero quieres consultar?
      Por Ejemplo: /<%= example %>.
      Para cancelar escribe /cancelar.
    `,
  },
  tour: {
    ask: dedent`
      ¿Qué recorrido quieres consultar?
      Por Ejemplo: /<%= example %>.
      Para cancelar escribe /cancelar.
    `,
  },
});

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
  const txt = await fs.readFile(path.join(__dirname, "..", "docs", "commands.txt"), "utf8");

  ctx.data.commands = txt.split("\n").filter(Boolean);
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

/**
 * /paradero
 * Ask and get information about the bus stop.
 */
bot
  .command("paradero")
  .invoke(async ctx => {
    if (ctx.command.args.length === 0) {
      ctx.data.example = "PA692";
      return await ctx.sendMessage("stop.ask", { parse_mode: "Markdown" });
    } else {
      const [command, ...args] = ctx.command.args;
      return await ctx.go(command, { args });
    }
  })
  .answer(async ctx => {
    if (!ctx.answer) {
      return await ctx.repeat();
    } else {
      const command = ctx.answer.toUpperCase();
      return await ctx.go(command);
    }
  });

/**
 * /recorrido
 * Get information about a bus tour.
 */
bot
  .command("recorrido")
  .invoke(async ctx => {
    if (ctx.command.args.length === 0) {
      ctx.data.example = "422";
      return await ctx.sendMessage("tour.ask", { parse_mode: "Markdown" });
    } else {
      const [command, ...args] = ctx.command.args;
      return await ctx.go(command, { args });
    }
  })
  .answer(async ctx => {
    if (!ctx.answer) {
      return await ctx.repeat();
    } else {
      const command = ctx.answer.toUpperCase();
      return await ctx.go(command);
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
    return await ctx.sendMessage("near.ask", { parse_mode: "Markdown" });
  })
  .answer(handleNear);

async function handleNear(ctx) {
  let { answer, message: { location } } = ctx;

  if (!answer && !location) {
    return await ctx.repeat();
  }

  if (answer && !location) {
    ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
    const results = await googleMaps.getPlacesByAddress(answer);
    if (results.length === 0) {
      ctx.data.name = answer;
      return await ctx.sendMessage("near.notFound", { parse_mode: "Markdown" });
    }

    answer = results[0]["formatted_address"];
    location = results[0].geometry.location;
  }

  if (!answer && location) {
    const results = await googleMaps.getPlacesByCoordinates(location);
    answer = results[0]["formatted_address"];
  }

  ctx.data.name = answer;
  await ctx.sendMessage("near.finding", { parse_mode: "Markdown" });

  ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
  const response = await transantiago.getStops(location);
  const stops = _(response).filter("cod").sortBy("distancia").map(stop =>
    // Can't add 'numeral' helper
    Object.assign(stop, {
      distancia: numeral(stop["distancia"]).format("0.[00]"),
    })
  );

  ctx.data.stops = stops.value();

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
  return await ctx.sendMessage("near.found", { parse_mode: "Markdown" });
}

async function handleBusStop(ctx, id = undefined) {
  id = id || ctx.command.name.toUpperCase().trim();

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
}

async function handleBusTour(ctx, id = undefined) {
  id = id || ctx.command.name.toUpperCase().trim();

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
}

/**
 * /(BUS)
 * Example: /422 /D18
 * Get bus complete tour.
 * TODO: check regex and paginate long responses.
 */
bot
  .command(/^[a-zA-Z0-9]{1}[0-9]+/) // TODO: refine this
  .invoke(handleBusTour);

/**
 * /(BUS_STOP)
 * Example: /PA692
 * Get buses and their plate and time.
 * TODO: check regex.
 */
bot
  .command(/^[a-zA-Z]{2}[0-9]+/) // Match first 2 alphabetic digits and the rest must be numbers.
  .invoke(handleBusStop);

// eslint-disable-next-line
console.log(dedent`
  Bot Started with:
  - URL: ${url}
  - PORT: ${config.get("PORT")}
  - TOKEN: ${_.fill([...token], "*", 0, -5).join("")}
`);
