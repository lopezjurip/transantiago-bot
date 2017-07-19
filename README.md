# 🚍 Transantiago Bot

[![Docker Automated build][dockerhub-image]][dockerhub-url] [![dependencies][dependencies-image]][dependencies-url] [![dev-dependencies][dev-dependencies-image]][dev-dependencies-url] [![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

Telegram bot built with [`SerjoPepper/bot-brother`](https://github.com/SerjoPepper/bot-brother) to give you information about the Transantiago. Thanks to @radutzan for this [gist](https://gist.github.com/radutzan/a29aa8fb30b1b866bd0bc44d65a3676e).

> [Start conversation here](https://t.me/transantiago_bot)

## Development

**Requirements:**
*   Node.js 8
*   Yarn
*   Redis (at `127.0.0.1:6379`)

Clone this repository:

```sh
git clone https://github.com/mrpatiwi/transantiago-bot.git
cd transantiago-bot
```

Install dependencies:
```sh
yarn
```

Make sure to set the next enviorement variables:

```txt
URL=https://asdfg.ngrok.io
TELEGRAM__TOKEN=20**********************VeQYT
GOOGLE__MAPS__KEY=
```

These can be set with a `.env` files (ignored by git).

Start this bot:

```sh
yarn start
```

## Production

**Requirements:**
*   Docker
*   Docker-Compose

Create the same `.env` file but with the production values. Then:

```sh
docker-compose up -d --build
```

[dockerhub-image]: https://img.shields.io/docker/automated/mrpatiwi/transantiago-bot.svg
[dockerhub-url]: https://hub.docker.com/r/mrpatiwi/transantiago-bot/
[dependencies-image]: https://david-dm.org/mrpatiwi/transantiago-bot.svg
[dependencies-url]: https://david-dm.org/mrpatiwi/transantiago-bot
[dev-dependencies-image]: https://david-dm.org/mrpatiwi/transantiago-bot/dev-status.svg
[dev-dependencies-url]: https://david-dm.org/mrpatiwi/transantiago-bot#info=devDependencies
