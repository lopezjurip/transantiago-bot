"use strict";

const bb = require("bot-brother");
const dedent = require("dedent");
const numeral = require("numeral");
const _ = require("lodash");
const fs = require("mz/fs");
const path = require("path");

const configuration = require("./configuration");
const Transantiago = require("./transantiago");
const info = require("../package.json");

const config = configuration();

const url = config.get("URL");
const token = config.get("TELEGRAM:TOKEN");
const manager = bb.sessionManager.redis({
  port: config.get("REDIS:PORT"),
  host: config.get("REDIS:HOST"),
});

const transantiago = new Transantiago();

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

bot.command("start").invoke(async ctx => {
  const { user } = ctx.meta;

  const txt = await fs.readFile(
    path.join(__dirname, "..", "docs", "commands.txt"),
    "utf8"
  );
  const commands = txt
    .split("\n")
    .filter(Boolean)
    .map(line => `/${line}`)
    .join("\n");

  const message = dedent`
    *¡Transantiago Bot te saluda humano ${user.first_name}!* :oncoming_bus: :wave:

    Este bot es _no-oficial_ y fue desarrollado usando información pública y en tiempo real del Transantiago. :information_desk_person:

    Información y datos para realizar una donación y mantener este proyecto vivo al escribir /about.

    :crystal_ball: Los comandos disponibles son los siguientes:

    ${commands}
  `;
  await ctx.sendMessage(message, { parse_mode: "Markdown" });
});

bot.command("help").invoke(async ctx => {
  await ctx.go("start");
});

bot.command("about").invoke(async ctx => {
  const message = dedent`
    *Transantiago Bot (${info.version})*
    *Licencia:* ${info.license}
    *Repositorio:* ${info.repository.url}

    Este bot es _no-oficial_ y no guarda relación con el Transantaigo ni el Ministerio de Transportes.

    :bust_in_silhouette: *Autor:*
     • ${info.author.name}
     • ${info.author.email}
     • ${info.author.url}
     • @${info.author.telegram}

    :pray: *Ayúdame a mantener esto con alguna donación:*
    - PayPal ${info.author.paypal}
    - Bitcoins: \`${info.author.btc}\`
    - Ether: \`${info.author.eth}\`
  `;
  await ctx.sendMessage(message, { parse_mode: "Markdown" });
});

bot.command("cancelar").invoke(async ctx => {
  ctx.hideKeyboard();
  const message = dedent`
    OK, dejaré de hacer lo que estaba haciendo.
    Necesitas ayuda? /help
  `;
  await ctx.sendMessage(message);
});

bot
  .command("paradero")
  .invoke(async ctx => {
    if (ctx.command.args >= 1) {
      return ctx.go(ctx.command.args[0]);
    } else {
      const message = dedent`
        ¿Qué paradero quieres consultar?
        Por Ejemplo: /PA692.
        Para cancelar escribe /cancelar.
      `;
      return ctx.sendMessage(message);
    }
  })
  .answer(async ctx => {
    const answer = ctx.answer;
    if (!answer) {
      return ctx.repeat();
    } else {
      return ctx.go(answer.toUpperCase());
    }
  });

bot
  .command("recorrido")
  .invoke(async ctx => {
    if (ctx.command.args >= 1) {
      return ctx.go(ctx.command.args[0]);
    } else {
      const message = dedent`
        ¿Qué recorrido quieres consultar?
        Por Ejemplo: /422.
        Para cancelar escribe /cancelar.
      `;
      return ctx.sendMessage(message);
    }
  })
  .answer(async ctx => {
    const answer = ctx.answer;
    if (!answer) {
      return ctx.repeat();
    } else {
      return ctx.go(answer.toUpperCase());
    }
  });

bot
  .command("cerca")
  .invoke(async ctx => {
    return ctx.sendMessage(dedent`
      :round_pushpin: Mandanos tu ubicación por Telegram.
      Si quieres cancelar esta acción, escribe /cancelar.
    `);
  })
  .answer(async ctx => {
    const { location } = ctx.message;

    if (!location) {
      return ctx.repeat();
    }

    const response = await transantiago.getStops(location);
    const stops = _(response).filter("cod").sortBy("cod");

    const list = stops
      .map(
        stop => dedent`
        :busstop: /${stop["cod"]} _(${numeral(stop["distancia"]).format(
          "0.[00]"
        )} km)_
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
      .concat([[{ Cancelar: { go: "cancelar" } }]])
      .value();

    ctx.keyboard(keyboard);
    await ctx.sendMessage(message, { parse_mode: "Markdown" });
  });

// Bus stops
bot
  .command(/^[a-zA-Z]{2}[0-9]+/) // Match first 2 alphabetic digits and the rest must be numbers.
  .invoke(async ctx => {
    const id = ctx.command.name.toUpperCase().trim();
    const response = await transantiago.getStop(id);

    if (!response) {
      const message = `No encontramos paraderos para ${id}.`;
      return ctx.sendMessage(message, { parse_mode: "Markdown" });
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

        const lines = [
          `:bus: /${name} → ${to}`,
          buses,
          service["respuestaServicio"],
        ];
        return lines.filter(Boolean).join("\n");
      })
      .join("\n\n");

    const message = dedent`
      :busstop: *Paradero ${response["paradero"]}*
      ${response["nomett"]}
      _Actualizado: ${response["horaprediccion"]}_

      ${services}
    `;

    await ctx.sendMessage(message, { parse_mode: "Markdown" });
    if (response["x"] && response["y"]) {
      await ctx.sendLocation(response["x"], response["y"]);
    }
  });

// Bus tours
bot
  .command(/^[a-zA-Z0-9]{1}[0-9]+/) // TODO: refine this
  .invoke(async ctx => {
    const id = ctx.command.name.toUpperCase().trim();
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
        :bus: *${code} → ${to}*

        ${times}

        ${stops}
      `;
    });

    const promises = tours.map(string =>
      ctx.sendMessage(string, { parse_mode: "Markdown" })
    );
    await Promise.all(promises);
  });
