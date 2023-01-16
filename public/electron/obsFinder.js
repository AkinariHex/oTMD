const find = require("find-process");

module.exports.obsFinder = async () => {
  let obsFound = await find("name", "obs64.exe", true).then((list) => {
    let d = list.length > 0 ? list[0].name === "obs64.exe" : false;
    return d;
  });
  return obsFound;
};
