const dedent = require("dedent");
const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");

const expresions = require("./util/regex");
const strings = require("./util/strings");

module.exports = function createFeature(bot, options) {
  const { transantiago, googleMaps } = options;

  bot.texts({
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
        <% services.forEach(service => { %>
          ↱ /<%= stop["paradero"] %>\_<%= service["servicio"] %>
        <% if (service["destino"]) { -%>
        :bus: *<%= service["servicio"] %>* → <%= service["destino"] %>
        <% } else { -%>
        :bus: *<%= service["servicio"] %>* → :question:
        <% } -%>
        <% service["buses"].forEach(bus => { -%>
          ↳ \`<%= bus["plate"] %>\` _(<%= bus["distanceDisplay"] %> km):_
               <%= bus["time"] %>
        <% }) -%>
        <% if (service["respuestaServicio"]) { -%>
        _<%= service["respuestaServicio"] -%>_
        <% } -%>
        <% }); %>
      `,
    },
  });

  /**
   * /paradero
   * Ask and get information about the bus stop.
   */
  bot
    .command("paradero")
    .invoke(async ctx => {
      if (_.isEmpty(ctx.command.args)) {
        ctx.data.example = "PA692";
        return await ctx.sendMessage("stop.ask", { parse_mode: "Markdown" });
      } else {
        const command = ctx.command.args[0].toUpperCase();
        return await ctx.go(command);
      }
    })
    .answer(async ctx => {
      if (_.isEmpty(ctx.answer)) {
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
   * /(BUS_STOP)
   * Example: /PA692
   * Get buses and their plate and time.
   */
  bot.command(expresions.stops).invoke(handleBusStop).callback(handleBusStop);

  /**
   * /(BUS_STOP)_(BUS_TOUR)
   * Example: /PA692_518 /PG13_301C2
   * Get buses and their plate and time.
   */
  bot.command(expresions.mixed).invoke(handleBusStop).callback(handleBusStop);

  async function handleBusStop(ctx) {
    const [stop, service] = ctx.command.name.trim().split("_").map(strings.toUpperCaseUntilNumberic);

    ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
    const response = await transantiago.getStop(stop, service); // service can be undefined, this case brings all the tours.

    if (_.isEmpty(response)) {
      ctx.data.name = stop;
      return await ctx.sendMessage("stop.notFound", { parse_mode: "Markdown" });
    }

    ctx.data.stop = response;
    ctx.data.services = _(response["servicios"]["item"])
      .sortBy("servicio")
      .map(service =>
        Object.assign(service, {
          // TODO: do not depend on [1, 2, ...]
          buses: _([0, 1, 2, 3, 4])
            .filter(n => service[`ppubus${n}`])
            .map(n => ({
              plate: service[`ppubus${n}`],
              distance: numeral(service[`distanciabus${n}`]),
              distanceDisplay: numeral(service[`distanciabus${n}`]).divide(1000).format("0.[00]"),
              time: service[`horaprediccionbus${n}`],
            }))
            .sortBy("distance")
            .value(),
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

    let x = _.toNumber(response["x"]);
    let y = _.toNumber(response["y"]);
    if (!(x && y)) {
      const query = response["nomett"];
      const results = await googleMaps.getPlacesByAddress(query);
      const location = _.get(results, [0, "geometry", "location"], {});
      x = location.lat;
      y = location.lng;
    }

    if (x && y) {
      const args = [x, y].map(number => number.toPrecision(10));
      inline.push([
        {
          "Mostrar en el mapa": { go: "paradero_posicion$invoke", args },
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

  return bot;
};
