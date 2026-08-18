module.exports = {
  style: {
    postcss: {
      mode: "extends",
      loaderOptions: {
        postcssOptions: {
          ident: "postcss",
          plugins: [
            require("tailwindcss"),
            require("autoprefixer"),
          ],
        },
      },
    },
  },
};
