const axios = require("axios");

class TransantiagoAPI {
  constructor(options = {}) {
    this.options = Object.assign(
      {
        baseURL: "http://www.transantiago.cl/",
        timeout: 5000,
      },
      options
    );
    this.client = axios.create(this.options);
  }

  async getStopsNear(coordinates = {}) {
    const latitude = coordinates.latitude || coordinates.lat;
    const longitude = coordinates.longitude || coordinates.lng;
    try {
      const { data } = await this.client.get(`/restservice/rest/getpuntoparada?lat=${latitude}&lon=${longitude}&bip=1`);
      return data || [];
    } catch (e) {
      return [];
    }
  }

  async getStop(stop, service = "") {
    const { data } = await this.client.get(`/predictor/prediccion?codsimt=${stop}&codser=${service}`);
    if (data["respuestaParadero"] === "Paradero invalido.") {
      return null;
    }
    return data;
  }

  async getTour(tour) {
    const { data } = await this.client.get(`/restservice/rest/getrecorrido/${tour}`);
    return data;
  }

  async getTours() {
    const { data } = await this.client.get(`/restservice/rest/getservicios/all`);
    return data;
  }

  async getStops() {
    const { data } = await this.client.get(`/restservice/rest/getparadas/all`);
    return data;
  }
}

module.exports = TransantiagoAPI;
