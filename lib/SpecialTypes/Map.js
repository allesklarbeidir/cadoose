"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = void 0;require("harmony-reflect");
var _Schema = _interopRequireDefault(require("../Schema"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _objectSpread2(target) {for (var i = 1; i < arguments.length; i++) {var source = arguments[i] != null ? arguments[i] : {};var ownKeys = Object.keys(source);if (typeof Object.getOwnPropertySymbols === 'function') {ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) {return Object.getOwnPropertyDescriptor(source, sym).enumerable;}));}ownKeys.forEach(function (key) {_defineProperty(target, key, source[key]);});}return target;}function _defineProperty(obj, key, value) {if (key in obj) {Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true });} else {obj[key] = value;}return obj;}function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}function _possibleConstructorReturn(self, call) {if (call && (typeof call === "object" || typeof call === "function")) {return call;}return _assertThisInitialized(self);}function _assertThisInitialized(self) {if (self === void 0) {throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return self;}function _getPrototypeOf(o) {_getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {return o.__proto__ || Object.getPrototypeOf(o);};return _getPrototypeOf(o);}function _inherits(subClass, superClass) {if (typeof superClass !== "function" && superClass !== null) {throw new TypeError("Super expression must either be null or a function");}subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });if (superClass) _setPrototypeOf(subClass, superClass);}function _setPrototypeOf(o, p) {_setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {o.__proto__ = p;return o;};return _setPrototypeOf(o, p);}

const Proxy = global.Proxy;
Proxy.prototype = {};let

Map = /*#__PURE__*/function (_Proxy) {_inherits(Map, _Proxy);




  function Map(keyType, valType) {_classCallCheck(this, Map);return _possibleConstructorReturn(this, _getPrototypeOf(Map).call(this,
    (() => {

      if (typeof keyType() !== "string") {
        throw new Error("Can only use 'string'-typed keys.");
      }

      let o = {};

      Object.defineProperty(o, "__$keyType", {
        get: function () {
          if (keyType.name) {
            return keyType.name.toLowerCase();
          }
          return keyType;
        } });

      Object.defineProperty(o, "__$valType", {
        get: function () {
          if (valType.name) {
            return valType.name.toLowerCase();
          } else
          if (Array.isArray(valType)) {
            return valType[0].name.toLowerCase();
          }
          return valType;
        } });

      Object.defineProperty(o, "set", {
        get: function () {
          return function (val) {
            if (Object.keys(val).filter(v => typeof v.toLowerCase() !== o["__$keyType"]) > 0) {
              throw new Error("Not all keys have the correct type.");
            }
            if ([].concat(...Object.values(val).map(v => Array.isArray(v) ? v : [v])).filter(v => (typeof v).toLowerCase() !== o["__$valType"]) > 0) {
              throw new Error("Not all values have the correct type.");
            }
            o = _objectSpread2({},
            val);

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
      } }));

  }return Map;}(Proxy);var _default =



Map;exports.default = _default;