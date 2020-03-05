const env = process.env.BABEL_ENV || process.env.NODE_ENV;

module.exports = {
    "sourceMaps": true,
    "retainLines": true,
    "presets": [
        [
            "@babel/preset-env",
            {
                "targets": {
                    "node": "8.10"
                },
                "shippedProposals": true,
                "useBuiltIns": "usage",
                "corejs": 2
            }
        ],
        "@babel/preset-flow"
    ],
    "plugins": [
        "transform-class-properties",
        "@babel/plugin-proposal-object-rest-spread",
        "@babel/plugin-transform-classes",
        ["@babel/plugin-transform-async-to-generator", {
            "module": "bluebird",
            "method": "coroutine"
        }]
    ].filter(Boolean)
}