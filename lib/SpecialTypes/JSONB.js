"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = void 0;require("core-js/modules/es7.symbol.async-iterator");var _util = _interopRequireDefault(require("util"));
require("harmony-reflect");function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}function _possibleConstructorReturn(self, call) {if (call && (typeof call === "object" || typeof call === "function")) {return call;}return _assertThisInitialized(self);}function _assertThisInitialized(self) {if (self === void 0) {throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return self;}function _getPrototypeOf(o) {_getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {return o.__proto__ || Object.getPrototypeOf(o);};return _getPrototypeOf(o);}function _defineProperties(target, props) {for (var i = 0; i < props.length; i++) {var descriptor = props[i];descriptor.enumerable = descriptor.enumerable || false;descriptor.configurable = true;if ("value" in descriptor) descriptor.writable = true;Object.defineProperty(target, descriptor.key, descriptor);}}function _createClass(Constructor, protoProps, staticProps) {if (protoProps) _defineProperties(Constructor.prototype, protoProps);if (staticProps) _defineProperties(Constructor, staticProps);return Constructor;}function _inherits(subClass, superClass) {if (typeof superClass !== "function" && superClass !== null) {throw new TypeError("Super expression must either be null or a function");}subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });if (superClass) _setPrototypeOf(subClass, superClass);}function _setPrototypeOf(o, p) {_setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {o.__proto__ = p;return o;};return _setPrototypeOf(o, p);}

const Proxy = global.Proxy;
Proxy.prototype = {};let

JSONBPathBuilder = /*#__PURE__*/function (_Proxy) {_inherits(JSONBPathBuilder, _Proxy);_createClass(JSONBPathBuilder, null, [{ key: "build", value: function build(

    path, asJSON) {
      const pathArr = Array.isArray(path) ? path : [path];
      const root = pathArr[0];

      const pathString = `"${root}"${
      pathArr.length === 2 ?

      asJSON ? `->'${pathArr[1]}'` : `->>'${pathArr[1]}'` :



      `->${pathArr.slice(1, pathArr.length - 1).map(p => `'${p}'`).join("->")}` + (


      asJSON ?
      `->'${pathArr[pathArr.length - 1]}'` :

      `->>'${pathArr[pathArr.length - 1]}'`)


      }`;

      return pathString;
    } }]);

  function JSONBPathBuilder(path, asJSON) {_classCallCheck(this, JSONBPathBuilder);return _possibleConstructorReturn(this, _getPrototypeOf(JSONBPathBuilder).call(this,
    ((path, asJSON) => {

      const pathArr = Array.isArray(path) ? path : [path];
      const asJSONFlag = asJSON;

      const obj = {};
      Object.defineProperty(obj, "__$pathArr", {
        get: () => {
          return pathArr;
        } });

      Object.defineProperty(obj, "__$asJSON", {
        get: () => {
          return asJSONFlag;
        } });

      obj[_util.default.inspect.custom] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };
      obj["toString"] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };
      obj[Symbol.toPrimitive] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };

      return obj;

    })(path, asJSON), {
      get: (obj, prop) => {
        if (!obj[prop]) {
          obj["__$pathArr"].push(prop);
          return new JSONBPathBuilder(obj["__$pathArr"], obj["__$asJSON"]);
        }

        return obj[prop];
      },
      set: (obj, prop, value) => {
        return false;
      } }));

  }return JSONBPathBuilder;}(Proxy);let



JSONB = /*#__PURE__*/function (_Proxy2) {_inherits(JSONB, _Proxy2);_createClass(JSONB, null, [{ key: "path", value: function path(

    fieldName, asJSON) {
      return new JSONBPathBuilder(fieldName, asJSON);
    } }]);

  function JSONB(obj) {_classCallCheck(this, JSONB);return _possibleConstructorReturn(this, _getPrototypeOf(JSONB).call(this,
    (obj => {

      return obj;

    })(obj), {
      get: (obj, prop) => {
        if (prop === "__$isJSONB") {
          return true;
        }
        return obj[prop];
      },
      set: (obj, prop, value) => {
        obj[prop] = value;
        return true;
      } }));

  }return JSONB;}(Proxy);var _default =



JSONB;exports.default = _default;