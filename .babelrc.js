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
    ].filter(Boolean)
}