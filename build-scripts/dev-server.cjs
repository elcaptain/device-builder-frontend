const { createRspackConfig } = require("./rspack.cjs");
const { RspackDevServer } = require("@rspack/dev-server");
const rspack = require("@rspack/core");

const config = createRspackConfig({ isProdBuild: false });

const compiler = rspack.rspack(config);
const server = new RspackDevServer(config.devServer, compiler);

server.start().then(() => {
  console.log(`\n  ESPHome Frontend dev server running at:\n`);
  console.log(`  > Local:   http://localhost:${config.devServer.port}/\n`);
  console.log(`  API proxy target: http://localhost:6052\n`);
});
