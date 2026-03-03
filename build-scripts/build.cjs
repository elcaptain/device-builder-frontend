const { createRspackConfig } = require("./rspack.cjs");
const rspack = require("@rspack/core");

const config = createRspackConfig({ isProdBuild: true });

const compiler = rspack.rspack(config);

compiler.run((err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(
    stats.toString({
      colors: true,
      chunks: false,
      modules: false,
    }),
  );

  compiler.close((closeErr) => {
    if (closeErr) {
      console.error(closeErr);
    }
  });
});
