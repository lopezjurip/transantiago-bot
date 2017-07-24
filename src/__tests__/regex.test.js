const product = require("cartesian-product");
const expresions = require("../features/util/regex");

const STOPS = [];
const TOURS = require("./data/tours.json") || [];
const MIXED = product(STOPS, TOURS).map(tuple => tuple.join("_"));

describe("regex", () => {
  it("matches", () => {
    TOURS.forEach(TOUR => {
      expect(TOUR).toMatch(expresions.tours);
      expect(TOUR).not.toMatch(expresions.stops);
      expect(TOUR).not.toMatch(expresions.mixed);
    });
    STOPS.forEach(STOP => {
      expect(STOP).toMatch(expresions.stops);
      expect(STOP).not.toMatch(expresions.tours);
      expect(STOP).not.toMatch(expresions.mixed);
    });
    MIXED.forEach(MIX => {
      expect(MIX).toMatch(expresions.mixed);
      expect(MIX).not.toMatch(expresions.tours);
      expect(MIX).not.toMatch(expresions.stops);
    });
  });
});
