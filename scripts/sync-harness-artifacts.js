const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "..", "out", "PhoneNumberControl");
const targets = ["ControlManifest.xml", "bundle.js"];

for (const fileName of targets) {
  const from = path.join(sourceDir, fileName);
  const to = path.join(__dirname, "..", fileName);

  if (!fs.existsSync(from)) {
    throw new Error(
      `Missing build artifact: ${from}. Run \"npm run build\" before starting the harness.`
    );
  }

  fs.copyFileSync(from, to);
}

console.log("Synchronized harness artifacts: ControlManifest.xml, bundle.js");
