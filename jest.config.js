module.exports = {
    "roots": [
        "<rootDir>/spec",
        "<rootDir>/src"
    ],
    "transform": {
        "^.+\\.tsx?$": ["ts-jest", { "tsconfig": "tsconfig.spec.json" }]
    },
}
