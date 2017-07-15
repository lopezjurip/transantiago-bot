const axios = require("axios");

// See: https://developers.google.com/maps/documentation/geocoding/intro?hl=es-419
class GoogleMapsAPI {
  static get bounds() {
    return {
      // http://nominatim.openstreetmap.org/search.php?q=santiago%2C+chile&polygon_geojson=1&viewbox=
      Santiago: [["-71.48529", "-33.14790"], ["-70.25482", "-33.94906"]],
    };
  }

  constructor(key) {
    this.key = key; // API KEY
    this.client = axios.create({
      baseURL: "https://maps.googleapis.com/maps/api/",
      timeout: 3000,
    });
  }

  async getPlacesByAddress(address = "") {
    const params = {
      language: "es_CL",
      region: "cl",
      key: this.key,
      bounds: GoogleMapsAPI.bounds["Santiago"].map(box => box.join(",")).join("|"),
      address,
    };
    const { data } = await this.client.get("geocode/json", { params });
    return data.results;
  }
}

// https://maps.googleapis.com/maps/api/geocode/json?address=

module.exports = GoogleMapsAPI;
