"use strict";

const bb = require("bot-brother");
const redis = require("redis");
const Bluebird = require("bluebird");
const dedent = require("dedent");
const numeral = require("numeral");
const _ = require("lodash");
const moment = require("moment");
const fs = require("mz/fs");
const path = require("path");

Bluebird.promisifyAll(redis.RedisClient.prototype);
Bluebird.promisifyAll(redis.Multi.prototype);

const configuration = require("./configuration");
const Transantiago = require("./TransantiagoAPI");
const GoogleMaps = require("./GoogleMapsAPI");
const info = require("../package.json");

const config = configuration();

const transantiago = new Transantiago();
const googleMaps = new GoogleMaps(config.get("GOOGLE:MAPS:KEY"));
const client = redis.createClient({
  port: config.get("REDIS:PORT"),
  host: config.get("REDIS:HOST"),
});

const url = config.get("URL");
const token = config.get("TELEGRAM:TOKEN");
const manager = bb.sessionManager.redis({ client });

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
  menu: {
    back: ":arrow_backward: Volver",
    next: ":arrow_forward: Ver más",
  },
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
      :information_desk_person: Encontré <%= paging.total %> paraderos ordenados por cercanía.
      :book: Mostrando página <%= paging.current + 1 %> de <%= paging.pages %>:
      <% stops.forEach(stop => { %>
      :busstop: /<%= stop["cod"] -%> _(<%= stop["distancia"] -%> km)_
      <%= stop["name"] -%>
      <% stop["servicios"].forEach(service => { %>
        ↳ :bus: <%= service["cod"] %> <%= service["destino"] -%>
      <% }); %>
      <% }); %>
    `,
  },
  stop: {
    ask: dedent`
      ¿Qué paradero quieres consultar?
      Por Ejemplo: /<%= example %>.
      Para cancelar escribe /cancelar.
    `,
    notFound: dedent`
      No pudimos encontrar un paradero llamado <%= name %>.
    `,
    found: dedent`
      :busstop: *Paradero <%= stop["paradero"] %>*
      <%= stop["nomett"] %>
      _Actualizado: <%= stop["horaprediccion"] -%>_
      <% services.forEach(service => { -%>
      <% if (service["destino"]) { %>
      :bus: /<%= service["servicio"] %> → <%= service["destino"] %>
      <% } else { -%>
      :bus: /<%= service["servicio"] %> → :question:
      <% } -%>
      <% service["buses"].forEach(bus => { -%>
        ↳ \`<%= bus["plate"] %>\` _( km):_
             <%= bus["time"] %>
      <% }) -%>
      <% if (service["respuestaServicio"]) { -%>
      <%= service["respuestaServicio"] %>
      <% } -%>
      <% }); %>
    `,
  },
  tour: {
    ask: dedent`
      ¿Qué recorrido quieres consultar?
      Por Ejemplo: /<%= example %>.
      Para cancelar escribe /cancelar.
    `,
    notFound: dedent`
      No pudimos encontrar un recorrido llamado <%= name %>.
    `,
    found: dedent`
      :bus: *Recorrido <%= name %>*
      ¿En qué dirección te interesa saber?
      <% tours.forEach(tour => { %>
      :checkered_flag: *<%= tour["destino"] -%>* (:busstop:<%= tour["paradas"].length -%>)
      <% tour["horarios"].forEach(schedule => { -%>
        ↳ :calendar: <%= schedule["tipoDia"] %>
                    <%= schedule["inicio"] %> - <%= schedule["fin"] %>
      <% }) -%>
      <% }) %>
    `,
    stops: dedent`
      :bus: *Recorrido <%= name %>* destino *<%= to %>* (:busstop:<%= paging.total %>)
      :book: Mostrando página <%= paging.current + 1 %> de <%= paging.pages %>:
      <% stops.forEach(stop => { %>
      :busstop: /<%= stop["cod"] %>
      *<%= stop["name"] -%>*
      _Por ahí también pasa:_
       ↳ <% stop["servicios"].forEach(service => { -%>
        :bus: /<%= service["cod"] -%>
      <% }); %>
      <% }); %>
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
 * /paradero
 * Ask and get information about the bus stop.
 */
bot.command("paradero_posicion").invoke(async ctx => {
  if (ctx.command.args.length >= 2) {
    const [latitude, longitude] = ctx.command.args;
    await ctx.sendLocation(latitude, longitude);
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
 */
bot
  .command("cerca")
  .invoke(async ctx => {
    await ctx.sendMessage("near.ask", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[]] },
    });
  })
  .answer(handleNear)
  .callback(async ctx => {
    const { near: { pages, paging } } = ctx.session;
    const { i: current } = ctx.callbackData;

    ctx.data.stops = pages[current];
    ctx.data.paging = Object.assign({}, paging, {
      current,
    });

    const buttons = _(pages[current])
      .map(stop => ({
        [`:busstop: /${stop["cod"]}`]: { go: stop["cod"] },
      }))
      .chunk(2)
      .value();

    ctx.inlineKeyboard([
      ...buttons,
      [
        current > 0 && {
          "menu.back": { callbackData: { i: current - 1 } },
        },
        current < ctx.data.paging.pages - 1 && {
          "menu.next": { callbackData: { i: current + 1 } },
        },
      ].filter(Boolean),
    ]);

    await ctx.updateText("near.found", {
      parse_mode: "Markdown",
      // reply_markup: { inline_keyboard: [[]] }, // HACK
    });
  });

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
      servicios: _.sortBy(stop["servicios"], "cod"),
    })
  );

  const latitude = location.latitude || location.lat;
  const longitude = location.longitude || location.lng;

  const pages = stops.chunk(config.get("PAGINATION:SIZE")).value(); // paginate
  const current = 0;

  ctx.data.stops = pages[current];
  ctx.data.paging = {
    total: stops.size(),
    pages: pages.length,
    current,
  };

  ctx.session.near = {
    answer,
    latitude,
    longitude,
    pages,
    paging: ctx.data.paging,
  };

  const buttons = _(pages[current])
    .map(stop => ({
      [`:busstop: /${stop["cod"]}`]: { go: stop["cod"] },
    }))
    .chunk(2)
    .value();

  ctx.inlineKeyboard([
    ...buttons,
    [
      current > 0 && {
        "menu.back": { callbackData: { i: current - 1 } },
      },
      current < ctx.data.paging.pages - 1 && {
        "menu.next": { callbackData: { i: current + 1 } },
      },
    ].filter(Boolean),
  ]);

  return await ctx.sendMessage("near.found", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[]] },
  });
}

async function handleBusStop(ctx, id = undefined) {
  id = id || ctx.command.name.toUpperCase().trim();

  ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
  const response = await transantiago.getStop(id);

  if (!response) {
    ctx.data.name = id;
    return await ctx.sendMessage("stop.notFound", { parse_mode: "Markdown" });
  }

  ctx.data.stop = response;
  ctx.data.services = _(response["servicios"]["item"])
    .sortBy("servicio")
    .map(service =>
      Object.assign(service, {
        // TODO: do not depend on [1, 2]
        buses: [1, 2].filter(n => service[`distanciabus${n}`]).map(n => ({
          plate: service[`ppubus${n}`],
          distance: numeral(service[`distanciabus${n}`]).divide(1000).format("0.[00]"),
          time: service[`horaprediccionbus${n}`],
        })),
      })
    )
    .value();
  const date = moment().format("HH:mm:ss");
  const inline = [
    [
      {
        [`:arrows_counterclockwise: Actualizar (${date})`]: { go: id },
      },
    ],
  ];
  if (response["x"] && response["y"]) {
    inline.push([
      {
        "Mostrar en el mapa": { go: "paradero_posicion$invoke", args: [response["x"], response["y"]] },
      },
    ]);
  }
  ctx.inlineKeyboard(inline);

  if (ctx.isRedirected) {
    await ctx.updateText("stop.found", {
      parse_mode: "Markdown",
      // reply_markup: { inline_keyboard: [[]] },
    });
  } else {
    await ctx.sendMessage("stop.found", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[]] },
    });
  }
}

async function handleBusTour(ctx, id = undefined) {
  id = id || ctx.command.name.toUpperCase().trim();

  ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
  const response = await transantiago.getTours(id);

  if (!response) {
    ctx.data.name = id;
    return await ctx.sendMessage("tour.notFound", { parse_mode: "Markdown" });
  }
  const tours = response;

  ctx.data.name = id;
  ctx.data.tours = tours;

  ctx.session.tour = {
    tours,
  };

  ctx.inlineKeyboard(
    tours.map((tour, index) => [
      {
        [`:checkered_flag: ${tour["destino"]}`]: { callbackData: { index, page: 0 } },
      },
    ])
  );

  return await ctx.sendMessage("tour.found", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[]] },
  });
}

/**
 * /(BUS)
 * Example: /422 /D18
 * Get bus complete tour.
 * TODO: check regex and paginate long responses.
 */
bot
  .command(/^[a-zA-Z0-9]{1}[0-9]+/) // TODO: refine this
  .invoke(handleBusTour)
  .callback(async ctx => {
    const { tour: { tours } } = ctx.session;
    const { index, page: current } = ctx.callbackData;
    const tour = tours[index];
    const stops = _(tour["paradas"]).filter("cod").sortBy("distancia").map(stop =>
      Object.assign(stop, {
        servicios: _.sortBy(stop["servicios"], "cod"),
      })
    );

    const pages = stops.chunk(config.get("PAGINATION:SIZE")).value(); // paginate

    ctx.data.name = tour["cod"];
    ctx.data.to = tour["destino"];
    ctx.data.stops = pages[current];
    ctx.data.paging = {
      total: stops.size(),
      pages: pages.length,
      current,
    };

    ctx.inlineKeyboard([
      [
        current > 0 && {
          "menu.back": { callbackData: { index, page: current - 1 } },
        },
        current < ctx.data.paging.pages - 1 && {
          "menu.next": { callbackData: { index, page: current + 1 } },
        },
      ].filter(Boolean),
    ]);

    await ctx.updateText("tour.stops", {
      parse_mode: "Markdown",
      // reply_markup: { inline_keyboard: [[]] }, // HACK
    });
  });

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
