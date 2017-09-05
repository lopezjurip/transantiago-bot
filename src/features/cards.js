const Bluebird = require("bluebird");
const dedent = require("dedent");
const _ = require("lodash");
const moment = require("moment");
const fs = require("mz/fs");
const path = require("path");

module.exports = function createFeature(bot, options) {
  const { bip } = options;

  const BIP_EXAMPLE_PATH = path.join(__dirname, "..", "assets", "BIP.jpg");

  bot.texts({
    cards: {
      list: dedent`
        <% if (cards.length > 0) { %>
        *Mis tarjetas:*
        <% cards.forEach(card => { %>
        :ticket: Tarjeta: \`<%= card["id"] %>\`
        :money_with_wings: Saldo: *<%= card["balance"] %> CLP*
        :calendar: Actualizado: <%= card["date"] %>
        <% }); %>
        <% } else { %>
        *No tienes tarjetas guardadas hasta el momento.*
        Presiona el botón de abajo para añadir tu primera tarjeta _bip!_ o _pase escolar_.
        <% } %>
      `,
      add: {
        ask: dedent`
          *Escríbeme el número de 8 dígitos* de la tarjeta _bip!_ o _pase escolar_.
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
          <% if (cards.length > 0) { %>
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
          *Escríbeme el número de 8 dígitos* de la tarjeta _bip!_ o _pase escolar_.
          Para salir, escribe /cancelar.

          :bulb: Te mandaré un ejemplo.
          El número que necesitas suele estar en el código de barras o verticalmente por detrás.

          :bulb: Si quieres guardar o consultar por tus tarjetas lo puedes hacer desde /mis\_tarjetas.
        `,
        response: dedent`
          :ticket: Tarjeta: \`<%= card["id"] %>\`
          :money_with_wings: Saldo: *<%= card["balance"] %> CLP*
          :calendar: Actualizado: <%= card["date"] %>

          :bulb: Recuerda que puedes guardar tarjetas desde /mis\_tarjetas.
        `,
        invalid: dedent`
          Número de tarjeta inválido, si quieres volver a intentarlo anda a /saldo.
        `,
      },
    },
  });

  bot
    .command("mis_tarjetas")
    .invoke(handleCardStatus)
    .callback(handleCardStatus);

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

      const stream = fs.createReadStream(BIP_EXAMPLE_PATH);
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
      const stream = fs.createReadStream(BIP_EXAMPLE_PATH);
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

  return bot;
};
