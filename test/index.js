const judge = require("../dist");
const { join } = require("path");

console.log("Start test...");

judge(
    {
        id: 'agc030_a'
    },
    {
        file: 1,
        language: "cpp98"
    },
    (id) => ({
        path: join(__dirname, "" + id),
        info: {}
    }),
    (solution) => console.log(solution)
);