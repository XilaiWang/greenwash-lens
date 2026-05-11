const path = require("node:path");

const { scoreText } = require("../src/greenwash-engine");
const { classifyText } = require("../src/text-classifier");

global.window = global;
global.localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] ?? null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
};
global.GreenwashEngineCore = require("../src/engine-core");
require("../public/local-engine.js");

const samples = [
  "我们承诺到2030年实现碳中和，打造更绿色的未来。",
  "In 2024, we reduced Scope 1 and 2 emissions by 27% versus our 2021 baseline, and the data was independently assured by a third-party auditor.",
  "This quarter our customer support satisfaction improved across all regions.",
  "Green eco future",
];

const warnings = [];

for (const text of samples) {
  const classification = classifyText(text, {
    contextType: "auto",
    sector: "auto",
  });
  const backend = scoreText(text, {
    contextType: classification.context.selected,
    sector: classification.sector.selected,
    classification,
  });
  const browser = global.GreenwashLocal.analyze({
    text,
    contextType: "auto",
    sector: "auto",
  }).result;
  const gap = Math.abs(Number(backend.risk || 0) - Number(browser.risk || 0));

  if (gap > 5) {
    warnings.push({
      text,
      backend: backend.risk,
      browser: browser.risk,
      gap,
    });
  }
}

if (warnings.length) {
  console.warn("Engine drift warning:");
  warnings.forEach((warning) => {
    console.warn(
      `- gap=${warning.gap} backend=${warning.backend} browser=${warning.browser} text=${warning.text}`,
    );
  });
} else {
  console.log("Engine sync check passed.");
}
