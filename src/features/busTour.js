const dedent = require("dedent");
const _ = require("lodash");

const expresions = require("./util/regex");

module.exports = function createFeature(bot, options) {
  const { transantiago, config } = options;

  bot.texts({
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
     * /(BUS)
     * Example: /422 /D18
     * Get bus complete tour.
     */
  bot
    .command(expresions.tours)
    .invoke(async ctx => {
      const id = ctx.command.name.toUpperCase().trim();

      ctx.bot.api.sendChatAction(ctx.meta.chat.id, "find_location"); // Unhandled promise
      const response = await transantiago.getTour(id);

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

  return bot;
};
