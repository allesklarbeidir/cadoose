"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = void 0;require("harmony-reflect");
var _Schema = _interopRequireDefault(require("../Schema"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};

class Map extends Proxy {




  constructor(keyType, valType) {
    super((() => {

      if (typeof keyType() !== "string") {
        throw new Error("Can only use 'string'-typed keys.");
      }

      let o = {};

      Object.defineProperty(o, "__$keyType", {
        get: function () {
          return keyType.name;
        } });

      Object.defineProperty(o, "__$valType", {
        get: function () {
          return valType.name;
        } });

      Object.defineProperty(o, "set", {
        get: function () {
          return function (val) {
            if (Object.keys(val).filter(v => typeof v !== o["__$keyType"]) > 0) {
              throw new Error("Not all keys have the correct type.");
            }
            if (Object.values(val).filter(v => typeof v !== o["__$valType"]) > 0) {
              throw new Error("Not all values have the correct type.");
            }
            o = {
              ...val };

            return o;
          };
        } });


      return o;

    })(), {
      get: (obj, prop) => {
        return obj[prop];
      },
      set: (obj, prop, value) => {
        if (value !== null && value.__proto__.constructor.name !== obj["__$keyType"]) {
          throw new Error("Wrong Key-Type");
        } else
        {
          obj[prop] = value;
          return true;
        }
      } });

  }}var _default =



Map;exports.default = _default;