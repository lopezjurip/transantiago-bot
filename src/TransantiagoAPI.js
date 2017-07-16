const axios = require("axios");

class TransantiagoAPI {
  constructor() {
    this.client = axios.create({
      baseURL: "http://www.transantiago.cl/",
      timeout: 3000,
    });
  }

  async getStops(coordinates = {}) {
    const latitude = coordinates.latitude || coordinates.lat;
    const longitude = coordinates.longitude || coordinates.lng;
    const { data } = await this.client.get(`/restservice/rest/getpuntoparada?lat=${latitude}&lon=${longitude}&bip=1`);
    return data;
  }

  async getStop(stop, service = "") {
    const { data } = await this.client.get(`/predictor/prediccion?codsimt=${stop}&codser=${service}`);
    if (data["respuestaParadero"] === "Paradero invalido.") {
      return null;
    }
    return data;
  }

  // See: http://www.transantiago.cl/restservice/rest/getservicios/all
  async getTours(tour) {
    const { data } = await this.client.get(`/restservice/rest/getrecorrido/${tour}`);
    return data;
  }
}

module.exports = TransantiagoAPI;
