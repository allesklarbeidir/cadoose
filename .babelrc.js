const env = process.env.BABEL_ENV || process.env.NODE_ENV;

module.exports = {
    "sourceMaps": true,
    "retainLines": true,
    "presets": [
        [
            "@babel/preset-env",
            {
                "targets": {
                    "node": "12.14.0"
                }
            }
        ],
        "@babel/preset-flow"
    ],
    "plugins": [
        "transform-class-properties"
    ].filter(Boolean)
}