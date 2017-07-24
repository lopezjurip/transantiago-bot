const axios = require("axios");
const moment = require("moment");
const _ = require("lodash");

class BIPAPI {
  constructor() {
    this.client = axios.create({
      baseURL: "http://www.metrosantiago.cl/",
      timeout: 6000,
    });
  }

  /**
   * Get BIP state
   * @param  {string}  id Card identifier
   * @return {Promise<Object>}  Response object like:
   *
   * {
   * "salida": true,
   * "tarjeta": "11111111",
   * "saldo": "2420" | undefined
   * "fecha": "17/07/2017 11:04" | undefined
   * }
   */
  async getCardState(id) {
    const { data } = await this.client.get(`/contents/guia-viajero/includes/consultarTarjeta/${id}`);
    const [, card] = data;
    const valid = _.get(card, ["salida"], false);
    if (!valid) {
      return null;
    } else {
      return {
        id: card["tarjeta"],
        balance: card["saldo"],
        card: card["fecha"],
        moment: moment(card["fecha"], "DD/MM/YYYY HH:mm").toDate(),
      };
    }
  }
}

module.exports = BIPAPI;
