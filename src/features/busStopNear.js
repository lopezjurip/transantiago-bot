const dedent = require("dedent");
const numeral = require("numeral");
const _ = require("lodash");

module.exports = function createFeature(bot, options) {
  const { transantiago, googleMaps, config } = options;

  bot.texts({
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
        <% if (stops.length > 0) { %>
        :information_desk_person: Encontré <%= paging.total %> paraderos ordenados por cercanía.
        :book: Mostrando página <%= paging.current + 1 %> de <%= paging.pages %>:
        <% stops.forEach(stop => { %>
        :busstop: /<%= stop["cod"] -%> _(<%= stop["distancia"] -%> km)_
        <%= stop["name"] -%>
        <% stop["servicios"].forEach(service => { %>
          ↳ :bus: <%= service["cod"] %> <%= service["destino"] -%>
        <% }); %>
        <% }); %>
        <% } else { %>
        Lamentablemente no encontré paraderos cerca tuyo :disappointed:
        Esto puede ser un error del Transantiago, mio o tuyo.
        <% } %>
      `,
    },
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
        if (_.isEmpty(results)) {
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
      const response = await transantiago.getStopsNear(location);
      const stops = _(response)
        .filter("cod")
        .sortBy("distancia")
        .map(stop =>
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

      ctx.data.stops = pages[current] || [];
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

      const buttons = _(pages[current] || [])
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

      ctx.data.stops = pages[current] || [];
      ctx.data.paging = Object.assign({}, paging, {
        current,
      });

      const buttons = _(pages[current] || [])
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

  return bot;
};
