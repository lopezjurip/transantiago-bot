const axios = require("axios");

class Transantiago {
  constructor() {
    this.client = axios.create({
      baseURL: "http://www.transantiago.cl/",
      timeout: 3000,
    });
  }

  async getStops({ latitude, longitude }) {
    const { data } = await this.client.get(
      `/restservice/rest/getpuntoparada?lat=${latitude}&lon=${longitude}&bip=1`
    );
    return data;
  }

  async getStop(stop, service = "") {
    const { data } = await this.client.get(
      `/predictor/prediccion?codsimt=${stop}&codser=${service}`
    );
    if (data["respuestaParadero"] === "Paradero invalido.") {
      return null;
    }
    return data;
  }

  // See: http://www.transantiago.cl/restservice/rest/getservicios/all
  async getTours(tour) {
    try {
      const { data } = await this.client.get(
        `/restservice/rest/getrecorrido/${tour}`
      );
      return data;
    } catch (err) {
      return null;
    }
  }
}

module.exports = Transantiago;
