const dedent = require("dedent");
const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");

module.exports = function createFeature(bot, options) {
  const { transantiago } = options;

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

  return bot;
};
