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
const Transantiago = require("./api/Transantiago");
const GoogleMaps = require("./api/GoogleMaps");
const BIP = require("./api/BIP");
const info = require("../package.json");

const config = configuration();

const transantiago = new Transantiago();
const googleMaps = new GoogleMaps(config.get("GOOGLE:MAPS:KEY"));
const bip = new BIP();
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
        ↳ \`<%= bus["plate"] %>\` _(<%= bus["distance"] %> km):_
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
      <% }); -%>
      <% }); %>
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
  cards: {
    list: dedent`
      <%if (cards.length > 0) { %>
      *Mis tarjetas:*
      <% cards.forEach(card => { %>
      :ticket: Tarjeta: \`<%= card["id"] %>\`
      :money_with_wings: Saldo: *<%= card["balance"] %> CLP*
      :calendar: Actualizado: <%= card["date"] %>
      <% }); %>
      <% } else { %>
      *No tienes tarjetas guardadas hasta el momento.*
      Presiona el botón de abajo para añadir tu primera tarjeta _BIP_ o _pase escolar_.
      <% } %>
    `,
    add: {
      ask: dedent`
        *Escríbeme el número de 8 dígitos* de la tarjeta BIP o pase escolar.
        Para salir, escribe /cancelar.

        :bulb: Te mandaré un ejemplo.
        El número que necesitas suele estar en el código de barras o verticalmente por detrás.
      `,
      added: dedent`
        *Tarjeta agregada:*
        :ticket: Tarjeta: \`<%= card["id"] %>\`
        :money_with_wings: Saldo: *<%= card["balance"] %> CLP*
        :calendar: Actualizado: <%= card["date"] %>
      `,
      invalid: dedent`
        Has ingresado un número inválido. Mira la tarjeta de ejemplo para ayudarte a identificar el número.
      `,
    },
    remove: {
      ask: dedent`
        <%if (cards.length > 0) { %>
        *¿Qué tarjeta quieres borrar de tu cuenta?*
        <% cards.forEach(card => { %>
        :ticket: Tarjeta: \`<%= card["id"] %>\`
        :money_with_wings: Saldo: *<%= card["balance"] %> CLP*
        :calendar: Actualizado: <%= card["date"] %>
        <% }); %>
        <% } else { %>
        *No tienes tarjetas para borrar hasta el momento.*
        <% } %>
      `,
    },
    state: {
      ask: dedent`
        *Escríbeme el número de 8 dígitos* de la tarjeta BIP o pase escolar.
        Para salir, escribe /cancelar.

        :bulb: Te mandaré un ejemplo.
        El número que necesitas suele estar en el código de barras o verticalmente por detrás.

        :bulb: Si quieres guardar o consultar por tus tarjetas lo puedes hacer desde /mis\_tarjetas.
      `,
      response: dedent`
        <%= card["id"] %>
        <%= card["balance"] %>
        <%= card["date"] %>

        :bulb: Recuerda que puedes guardar tarjetas desde /mis\_tarjetas.
      `,
      invalid: dedent`
        Número de tarjeta inválido, si quieres volver a intentarlo anda a /saldo.
      `,
    },
  },
});

bot.command("mis_tarjetas").invoke(handleCardStatus).callback(handleCardStatus);

async function handleCardStatus(ctx) {
  await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "typing");
  const cards = await Bluebird.map(ctx.session.cards || [], card => bip.getCardState(card["id"]));
  const hasCards = cards.length > 0;

  ctx.session.cards = cards;
  ctx.data.cards = cards;

  const date = moment().format("HH:mm:ss");
  ctx.inlineKeyboard(
    hasCards
      ? [
          [{ [`:arrows_counterclockwise: Actualizar (${date})`]: { callbackData: {} } }],
          [
            { ":x: Borrar": { go: "mis_tarjetas_borrar$callback" } },
            { ":new: Agregar": { go: "mis_tarjetas_agregar" } },
          ],
        ]
      : [[{ ":new: Agregar": { go: "mis_tarjetas_agregar" } }]]
  );

  if (ctx.command.type === "callback") {
    await ctx.updateText("cards.list", {
      parse_mode: "Markdown",
      // reply_markup: { inline_keyboard: [[]] },
    });
  } else {
    await ctx.sendMessage("cards.list", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[]] },
    });
  }
}

bot
  .command("mis_tarjetas_agregar")
  .invoke(async ctx => {
    await ctx.sendMessage("cards.add.ask", {
      parse_mode: "Markdown",
    });

    const stream = fs.createReadStream(path.join(__dirname, "assets", "BIP.jpg"));
    await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "upload_photo");
    return await ctx.sendPhoto(stream, {
      parse_mode: "Markdown",
    });
  })
  .answer(async ctx => {
    const id = ctx.answer;
    const card = await bip.getCardState(id);
    if (!card) {
      ctx.data.id = id;
      ctx.inlineKeyboard([[{ ":arrow_backward: Volver a intentar": { go: "mis_tarjetas_agregar" } }]]);
      return await ctx.sendMessage("cards.add.invalid", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[]] },
      });
    }

    ctx.session.cards = _.uniqBy([...(ctx.session.cards || []), card], "id"); // by id
    ctx.data.card = card;

    ctx.inlineKeyboard([[{ ":arrow_backward: Volver": { go: "mis_tarjetas$callback" } }]]);
    return await ctx.sendMessage("cards.add.added", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[]] },
    });
  });

bot.command("mis_tarjetas_borrar").callback(async ctx => {
  const { id } = ctx.callbackData;
  const cards = (ctx.session.cards || []).filter(card => card["id"] !== id);

  ctx.data.cards = cards;
  ctx.session.cards = cards;

  const buttons = _(cards)
    .map(card => ({
      [`:x: ${card["id"]}`]: { callbackData: { id: card.id } },
    }))
    .chunk(2)
    .concat([[{ ":arrow_backward: Volver": { go: "mis_tarjetas$callback" } }]])
    .value();

  ctx.inlineKeyboard(buttons);
  return await ctx.updateText("cards.remove.ask", {
    parse_mode: "Markdown",
    // reply_markup: { inline_keyboard: [[]] },
  });
});

bot
  .command("saldo")
  .invoke(async ctx => {
    const cards = ctx.session.cards || [];

    ctx.data.cards = cards;

    await ctx.sendMessage("cards.state.ask", {
      parse_mode: "Markdown",
    });
    const stream = fs.createReadStream(path.join(__dirname, "assets", "BIP.jpg"));
    await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "upload_photo");
    return await ctx.sendPhoto(stream, {
      parse_mode: "Markdown",
    });
  })
  .answer(async ctx => {
    const id = ctx.answer;

    await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "typing");
    const card = await bip.getCardState(id);
    if (!card) {
      return await ctx.sendMessage("cards.state.invalid", { parse_mode: "Markdown" });
    }
    ctx.data.card = card;
    return await ctx.sendMessage("cards.state.response", { parse_mode: "Markdown" });
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
      const command = ctx.command.args[0].toUpperCase();
      return await ctx.go(command);
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
      const command = ctx.command.args[0].toUpperCase();
      return await ctx.go(command);
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
  .answer(async ctx => {
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
  })
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
  })
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
  .invoke(handleBusStop)
  .callback(handleBusStop);

async function handleBusStop(ctx) {
  const id = ctx.command.name.toUpperCase().trim();

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
        [`:arrows_counterclockwise: Actualizar (${date})`]: { callbackData: {} },
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

  if (ctx.command.type === "callback") {
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

// eslint-disable-next-line
console.log(dedent`
  Bot Started with:
  - NODE_ENV: ${config.get("NODE_ENV")}
  - URL: ${url}
  - PORT: ${config.get("PORT")}
  - TOKEN: ${_.fill([...token], "*", 0, -5).join("")}
`);
