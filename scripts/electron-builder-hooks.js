const path = require("node:path");

module.exports = async function beforeBuild() {
  require(path.join(__dirname, "sync-engine-core.js"));
  return true;
};
