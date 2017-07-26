// Blame tour `301c`.
// TODO: have a matching list?
exports.toUpperCaseUntilNumberic = input => {
  let numberFound = false;
  return String(input)
    .split("")
    .map(char => {
      if (numberFound) {
        return char.toLowerCase();
      } else {
        numberFound = char.match(/^[0-9]+$/);
        return char.toUpperCase();
      }
    })
    .join("");
};
