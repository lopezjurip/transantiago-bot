const axios = require("axios");

// See: https://developers.google.com/maps/documentation/geocoding/intro?hl=es-419
class GoogleMapsAPI {
  static get cities() {
    return {
      Santiago: {
        bounds: [["-71.48529", "-33.14790"], ["-70.25482", "-33.94906"]],
        components: ["country:CL", "administrative_area:Santiago"],
      },
    };
  }

  constructor(key) {
    this.key = key; // API KEY
    this.client = axios.create({
      baseURL: "https://maps.googleapis.com/maps/api/",
      timeout: 5000,
    });
  }

  async getPlacesByCoordinates(coordinates = {}) {
    const latitude = coordinates.latitude || coordinates.lat;
    const longitude = coordinates.longitude || coordinates.lng;
    const params = {
      key: this.key,
      latlng: [latitude, longitude].join(","),
    };
    const { data } = await this.client.get("geocode/json", { params });
    if (data["status"] === "OVER_QUERY_LIMIT") {
      console.warn(data["message"]);
    }
    return data["results"] || [];
  }

  async getPlacesByAddress(address = "") {
    const params = {
      language: "es",
      region: "cl",
      key: this.key,
      bounds: GoogleMapsAPI.cities["Santiago"].bounds.map(box => box.join(",")).join("|"),
      components: GoogleMapsAPI.cities["Santiago"].components.join("|"),
      address,
    };
    const { data } = await this.client.get("geocode/json", { params });
    if (data["status"] === "OVER_QUERY_LIMIT") {
      console.warn(data["message"]);
    }
    return data["results"] || [];
  }
}

module.exports = GoogleMapsAPI;
