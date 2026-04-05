
var Pikafish = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  
  return (
function(moduleArg = {}) {
  var moduleRtn;

var f = Object.assign({}, moduleArg), aa, ba, ca = new Promise((a, b) => {
  aa = a;
  ba = b;
}), da = "object" == typeof window, m = "function" == typeof importScripts;
f.Y || (f.Y = 0);
f.Y++;
(() => {
  var a = "undefined" != typeof ENVIRONMENT_IS_WASM_WORKER && ENVIRONMENT_IS_WASM_WORKER;
  "undefined" != typeof ENVIRONMENT_IS_PTHREAD && ENVIRONMENT_IS_PTHREAD || a || function(b) {
    function c(l, n, u) {
      var v = new XMLHttpRequest();
      v.open("GET", l, !0);
      v.responseType = "arraybuffer";
      v.onprogress = function(g) {
        var p = n;
        g.total && (p = g.total);
        if (g.loaded) {
          v.m ? f.J[l].loaded = g.loaded : (v.m = !0, f.J || (f.J = {}), f.J[l] = {loaded:g.loaded, total:p});
          var r = p = g = 0, y;
          for (y in f.J) {
            var G = f.J[y];
            g += G.total;
            p += G.loaded;
            r++;
          }
          g = Math.ceil(g * f.Y / r);
          f.setStatus && f.setStatus(`Downloading data... (${p}/${g})`);
        } else {
          !f.J && f.setStatus && f.setStatus("Downloading data...");
        }
      };
      v.onerror = function() {
        throw Error("NetworkError for: " + l);
      };
      v.onload = function() {
        if (200 == v.status || 304 == v.status || 206 == v.status || 0 == v.status && v.response) {
          u(v.response);
        } else {
          throw Error(v.statusText + " : " + v.responseURL);
        }
      };
      v.send(null);
    }
    function d(l) {
      console.error("package error:", l);
    }
    function e() {
      function l(g, p, r) {
        this.start = g;
        this.end = p;
        this.audio = r;
      }
      function n(g) {
        if (!g) {
          throw "Loading data file failed." + Error().stack;
        }
        if (g.constructor.name !== ArrayBuffer.name) {
          throw "bad input to processPackageData" + Error().stack;
        }
        g = new Uint8Array(g);
        l.prototype.M = g;
        g = b.files;
        for (var p = 0; p < g.length; ++p) {
          l.prototype.m[g[p].filename].onload();
        }
        f.removeRunDependency("datafile_emscripten/pikafish.data");
      }
      l.prototype = {m:{}, open:function(g, p) {
        this.name = p;
        this.m[p] = this;
        f.addRunDependency(`fp ${this.name}`);
      }, onload:function() {
        this.L(this.M.subarray(this.start, this.end));
      }, L:function(g) {
        f.FS_createDataFile(this.name, null, g, !0, !0, !0);
        f.removeRunDependency(`fp ${this.name}`);
        this.m[this.name] = null;
      }};
      for (var u = b.files, v = 0; v < u.length; ++v) {
        (new l(u[v].start, u[v].end, u[v].audio || 0)).open("GET", u[v].filename);
      }
      f.addRunDependency("datafile_emscripten/pikafish.data");
      f.pa || (f.pa = {});
      f.pa["emscripten/pikafish.data"] = {Sa:!1};
      w ? (n(w), w = null) : q = n;
    }
    "object" === typeof window ? window.encodeURIComponent(window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf("/")) + "/") : "undefined" === typeof process && "undefined" !== typeof location && encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf("/")) + "/");
    "function" !== typeof f.locateFilePackage || f.locateFile || (f.locateFile = f.locateFilePackage, t("warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)"));
    var h = f.locateFile ? f.locateFile("pikafish.data", "") : "pikafish.data", k = b.remote_package_size, q = null, w = f.getPreloadedPackage ? f.getPreloadedPackage(h, k) : null;
    w || c(h, k, function(l) {
      q ? (q(l), q = null) : w = l;
    }, d);
    f.calledRun ? e() : (f.preRun || (f.preRun = []), f.preRun.push(e));
  }({files:[{filename:"/pikafish.nnue", start:0, end:4134154}], remote_package_size:4134154});
})();
f.sendCommand = f.sendCommand || null;
f.terminate = f.terminate || null;
f.onReceiveStdout = f.onReceiveStdout || (a => console.log(a));
f.onReceiveStderr = f.onReceiveStderr || (a => console.error(a));
f.onExit = f.onExit || (a => console.log("exited with code " + a));
f.noExitRuntime = !0;
f.preRun || (f.preRun = []);
f.preRun.push(function() {
  var a = "", b = 0;
  let c = "", d = "";
  const e = f.onReceiveStdout, h = f.onReceiveStderr;
  ea(function() {
    return b < a.length ? a.charCodeAt(b++) : null;
  }, function(q) {
    q && 10 != q ? c += String.fromCharCode(q) : (e(c), c = "");
  }, function(q) {
    q && 10 != q ? d += String.fromCharCode(q) : (h(d), d = "");
  });
  const k = f.cwrap("wasm_uci_execute", "void", []);
  f.sendCommand = function(q) {
    a = q + "\n";
    b = 0;
    k();
  };
  f.terminate = function() {
    f._emscripten_force_exit(0);
  };
});
var fa = Object.assign({}, f), ha = [], ia = "./this.program", ja = (a, b) => {
  throw b;
}, x = "", ka, la, ma;
if (da || m) {
  m ? x = self.location.href : "undefined" != typeof document && document.currentScript && (x = document.currentScript.src), _scriptName && (x = _scriptName), x.startsWith("blob:") ? x = "" : x = x.substr(0, x.replace(/[?#].*/, "").lastIndexOf("/") + 1), ka = a => {
    var b = new XMLHttpRequest();
    b.open("GET", a, !1);
    b.send(null);
    return b.responseText;
  }, m && (ma = a => {
    var b = new XMLHttpRequest();
    b.open("GET", a, !1);
    b.responseType = "arraybuffer";
    b.send(null);
    return new Uint8Array(b.response);
  }), la = (a, b, c) => {
    var d = new XMLHttpRequest();
    d.open("GET", a, !0);
    d.responseType = "arraybuffer";
    d.onload = () => {
      200 == d.status || 0 == d.status && d.response ? b(d.response) : c();
    };
    d.onerror = c;
    d.send(null);
  };
}
var na = f.print || console.log.bind(console), t = f.printErr || console.error.bind(console);
Object.assign(f, fa);
fa = null;
f.arguments && (ha = f.arguments);
f.thisProgram && (ia = f.thisProgram);
f.quit && (ja = f.quit);
var oa;
f.wasmBinary && (oa = f.wasmBinary);
var pa, qa = !1, z, A, ra, B, D;
function sa() {
  var a = pa.buffer;
  f.HEAP8 = z = new Int8Array(a);
  f.HEAP16 = ra = new Int16Array(a);
  f.HEAPU8 = A = new Uint8Array(a);
  f.HEAPU16 = new Uint16Array(a);
  f.HEAP32 = B = new Int32Array(a);
  f.HEAPU32 = D = new Uint32Array(a);
  f.HEAPF32 = new Float32Array(a);
  f.HEAPF64 = new Float64Array(a);
}
var ta = [], ua = [], va = [], wa = [];
function xa() {
  var a = f.preRun.shift();
  ta.unshift(a);
}
var E = 0, ya = null, za = null;
function Aa() {
  E++;
  f.monitorRunDependencies?.(E);
}
function Ba() {
  E--;
  f.monitorRunDependencies?.(E);
  if (0 == E && (null !== ya && (clearInterval(ya), ya = null), za)) {
    var a = za;
    za = null;
    a();
  }
}
function Ca(a) {
  f.onAbort?.(a);
  a = "Aborted(" + a + ")";
  t(a);
  qa = !0;
  a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
  ba(a);
  throw a;
}
var Da = a => a.startsWith("data:application/octet-stream;base64,"), F;
F = "pikafish.wasm";
if (!Da(F)) {
  var Ea = F;
  F = f.locateFile ? f.locateFile(Ea, x) : x + Ea;
}
function Fa(a) {
  if (a == F && oa) {
    return new Uint8Array(oa);
  }
  if (ma) {
    return ma(a);
  }
  throw "both async and sync fetching of the wasm failed";
}
function Ga(a) {
  return oa || !da && !m || "function" != typeof fetch ? Promise.resolve().then(() => Fa(a)) : fetch(a, {credentials:"same-origin"}).then(b => {
    if (!b.ok) {
      throw `failed to load wasm binary file at '${a}'`;
    }
    return b.arrayBuffer();
  }).catch(() => Fa(a));
}
function Ha(a, b, c) {
  return Ga(a).then(d => WebAssembly.instantiate(d, b)).then(c, d => {
    t(`failed to asynchronously prepare wasm: ${d}`);
    Ca(d);
  });
}
function Ia(a, b) {
  var c = F;
  return oa || "function" != typeof WebAssembly.instantiateStreaming || Da(c) || "function" != typeof fetch ? Ha(c, a, b) : fetch(c, {credentials:"same-origin"}).then(d => WebAssembly.instantiateStreaming(d, a).then(b, function(e) {
    t(`wasm streaming compile failed: ${e}`);
    t("falling back to ArrayBuffer instantiation");
    return Ha(c, a, b);
  }));
}
var H, Ja;
function Ka(a) {
  this.name = "ExitStatus";
  this.message = `Program terminated with exit(${a})`;
  this.status = a;
}
var La = a => {
  for (; 0 < a.length;) {
    a.shift()(f);
  }
}, Ma = f.noExitRuntime || !0;
function I() {
  var a = B[+Na >> 2];
  Na += 4;
  return a;
}
var Oa = (a, b) => {
  for (var c = 0, d = a.length - 1; 0 <= d; d--) {
    var e = a[d];
    "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
  }
  if (b) {
    for (; c; c--) {
      a.unshift("..");
    }
  }
  return a;
}, J = a => {
  var b = "/" === a.charAt(0), c = "/" === a.substr(-1);
  (a = Oa(a.split("/").filter(d => !!d), !b).join("/")) || b || (a = ".");
  a && c && (a += "/");
  return (b ? "/" : "") + a;
}, Pa = a => {
  var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
  a = b[0];
  b = b[1];
  if (!a && !b) {
    return ".";
  }
  b &&= b.substr(0, b.length - 1);
  return a + b;
}, Qa = a => {
  if ("/" === a) {
    return "/";
  }
  a = J(a);
  a = a.replace(/\/$/, "");
  var b = a.lastIndexOf("/");
  return -1 === b ? a : a.substr(b + 1);
}, Ra = () => {
  if ("object" == typeof crypto && "function" == typeof crypto.getRandomValues) {
    return a => crypto.getRandomValues(a);
  }
  Ca("initRandomDevice");
}, Sa = a => (Sa = Ra())(a), Ta = (...a) => {
  for (var b = "", c = !1, d = a.length - 1; -1 <= d && !c; d--) {
    c = 0 <= d ? a[d] : "/";
    if ("string" != typeof c) {
      throw new TypeError("Arguments to path.resolve must be strings");
    }
    if (!c) {
      return "";
    }
    b = c + "/" + b;
    c = "/" === c.charAt(0);
  }
  b = Oa(b.split("/").filter(e => !!e), !c).join("/");
  return (c ? "/" : "") + b || ".";
}, Ua = "undefined" != typeof TextDecoder ? new TextDecoder("utf8") : void 0, K = (a, b) => {
  for (var c = b + NaN, d = b; a[d] && !(d >= c);) {
    ++d;
  }
  if (16 < d - b && a.buffer && Ua) {
    return Ua.decode(a.subarray(b, d));
  }
  for (c = ""; b < d;) {
    var e = a[b++];
    if (e & 128) {
      var h = a[b++] & 63;
      if (192 == (e & 224)) {
        c += String.fromCharCode((e & 31) << 6 | h);
      } else {
        var k = a[b++] & 63;
        e = 224 == (e & 240) ? (e & 15) << 12 | h << 6 | k : (e & 7) << 18 | h << 12 | k << 6 | a[b++] & 63;
        65536 > e ? c += String.fromCharCode(e) : (e -= 65536, c += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
      }
    } else {
      c += String.fromCharCode(e);
    }
  }
  return c;
}, Va = [], Wa = a => {
  for (var b = 0, c = 0; c < a.length; ++c) {
    var d = a.charCodeAt(c);
    127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
  }
  return b;
}, L = (a, b, c, d) => {
  if (!(0 < d)) {
    return 0;
  }
  var e = c;
  d = c + d - 1;
  for (var h = 0; h < a.length; ++h) {
    var k = a.charCodeAt(h);
    if (55296 <= k && 57343 >= k) {
      var q = a.charCodeAt(++h);
      k = 65536 + ((k & 1023) << 10) | q & 1023;
    }
    if (127 >= k) {
      if (c >= d) {
        break;
      }
      b[c++] = k;
    } else {
      if (2047 >= k) {
        if (c + 1 >= d) {
          break;
        }
        b[c++] = 192 | k >> 6;
      } else {
        if (65535 >= k) {
          if (c + 2 >= d) {
            break;
          }
          b[c++] = 224 | k >> 12;
        } else {
          if (c + 3 >= d) {
            break;
          }
          b[c++] = 240 | k >> 18;
          b[c++] = 128 | k >> 12 & 63;
        }
        b[c++] = 128 | k >> 6 & 63;
      }
      b[c++] = 128 | k & 63;
    }
  }
  b[c] = 0;
  return c - e;
};
function Xa(a, b) {
  var c = Array(Wa(a) + 1);
  a = L(a, c, 0, c.length);
  b && (c.length = a);
  return c;
}
var Ya = [];
function Za(a, b) {
  Ya[a] = {input:[], o:[], C:b};
  $a(a, ab);
}
var ab = {open(a) {
  var b = Ya[a.node.T];
  if (!b) {
    throw new M(43);
  }
  a.j = b;
  a.seekable = !1;
}, close(a) {
  a.j.C.R(a.j);
}, R(a) {
  a.j.C.R(a.j);
}, read(a, b, c, d) {
  if (!a.j || !a.j.C.ha) {
    throw new M(60);
  }
  for (var e = 0, h = 0; h < d; h++) {
    try {
      var k = a.j.C.ha(a.j);
    } catch (q) {
      throw new M(29);
    }
    if (void 0 === k && 0 === e) {
      throw new M(6);
    }
    if (null === k || void 0 === k) {
      break;
    }
    e++;
    b[c + h] = k;
  }
  e && (a.node.timestamp = Date.now());
  return e;
}, write(a, b, c, d) {
  if (!a.j || !a.j.C.ba) {
    throw new M(60);
  }
  try {
    for (var e = 0; e < d; e++) {
      a.j.C.ba(a.j, b[c + e]);
    }
  } catch (h) {
    throw new M(29);
  }
  d && (a.node.timestamp = Date.now());
  return e;
},}, bb = {ha() {
  a: {
    if (!Va.length) {
      var a = null;
      "undefined" != typeof window && "function" == typeof window.prompt ? (a = window.prompt("Input: "), null !== a && (a += "\n")) : "function" == typeof readline && (a = readline(), null !== a && (a += "\n"));
      if (!a) {
        a = null;
        break a;
      }
      Va = Xa(a, !0);
    }
    a = Va.shift();
  }
  return a;
}, ba(a, b) {
  null === b || 10 === b ? (na(K(a.o, 0)), a.o = []) : 0 != b && a.o.push(b);
}, R(a) {
  a.o && 0 < a.o.length && (na(K(a.o, 0)), a.o = []);
}, va() {
  return {Ma:25856, Oa:5, La:191, Na:35387, Ka:[3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,]};
}, wa() {
  return 0;
}, xa() {
  return [24, 80];
},}, cb = {ba(a, b) {
  null === b || 10 === b ? (t(K(a.o, 0)), a.o = []) : 0 != b && a.o.push(b);
}, R(a) {
  a.o && 0 < a.o.length && (t(K(a.o, 0)), a.o = []);
},};
function db(a, b) {
  var c = a.g ? a.g.length : 0;
  c >= b || (b = Math.max(b, c * (1048576 > c ? 2.0 : 1.125) >>> 0), 0 != c && (b = Math.max(b, 256)), c = a.g, a.g = new Uint8Array(b), 0 < a.l && a.g.set(c.subarray(0, a.l), 0));
}
var N = {v:null, B() {
  return N.createNode(null, "/", 16895, 0);
}, createNode(a, b, c, d) {
  if (24576 === (c & 61440) || 4096 === (c & 61440)) {
    throw new M(63);
  }
  N.v || (N.v = {dir:{node:{F:N.h.F, s:N.h.s, N:N.h.N, S:N.h.S, ra:N.h.ra, X:N.h.X, sa:N.h.sa, qa:N.h.qa, U:N.h.U}, stream:{G:N.i.G}}, file:{node:{F:N.h.F, s:N.h.s}, stream:{G:N.i.G, read:N.i.read, write:N.i.write, ea:N.i.ea, aa:N.i.aa, na:N.i.na}}, link:{node:{F:N.h.F, s:N.h.s, P:N.h.P}, stream:{}}, fa:{node:{F:N.h.F, s:N.h.s}, stream:eb}});
  c = fb(a, b, c, d);
  O(c.mode) ? (c.h = N.v.dir.node, c.i = N.v.dir.stream, c.g = {}) : 32768 === (c.mode & 61440) ? (c.h = N.v.file.node, c.i = N.v.file.stream, c.l = 0, c.g = null) : 40960 === (c.mode & 61440) ? (c.h = N.v.link.node, c.i = N.v.link.stream) : 8192 === (c.mode & 61440) && (c.h = N.v.fa.node, c.i = N.v.fa.stream);
  c.timestamp = Date.now();
  a && (a.g[b] = c, a.timestamp = c.timestamp);
  return c;
}, Ta(a) {
  return a.g ? a.g.subarray ? a.g.subarray(0, a.l) : new Uint8Array(a.g) : new Uint8Array(0);
}, h:{F(a) {
  var b = {};
  b.Qa = 8192 === (a.mode & 61440) ? a.id : 1;
  b.Wa = a.id;
  b.mode = a.mode;
  b.Ya = 1;
  b.uid = 0;
  b.Ua = 0;
  b.T = a.T;
  O(a.mode) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.l : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
  b.Ia = new Date(a.timestamp);
  b.Xa = new Date(a.timestamp);
  b.Pa = new Date(a.timestamp);
  b.ta = 4096;
  b.Ja = Math.ceil(b.size / b.ta);
  return b;
}, s(a, b) {
  void 0 !== b.mode && (a.mode = b.mode);
  void 0 !== b.timestamp && (a.timestamp = b.timestamp);
  if (void 0 !== b.size && (b = b.size, a.l != b)) {
    if (0 == b) {
      a.g = null, a.l = 0;
    } else {
      var c = a.g;
      a.g = new Uint8Array(b);
      c && a.g.set(c.subarray(0, Math.min(b, a.l)));
      a.l = b;
    }
  }
}, N() {
  throw gb[44];
}, S(a, b, c, d) {
  return N.createNode(a, b, c, d);
}, ra(a, b, c) {
  if (O(a.mode)) {
    try {
      var d = P(b, c);
    } catch (h) {
    }
    if (d) {
      for (var e in d.g) {
        throw new M(55);
      }
    }
  }
  delete a.parent.g[a.name];
  a.parent.timestamp = Date.now();
  a.name = c;
  b.g[c] = a;
  b.timestamp = a.parent.timestamp;
  a.parent = b;
}, X(a, b) {
  delete a.g[b];
  a.timestamp = Date.now();
}, sa(a, b) {
  var c = P(a, b), d;
  for (d in c.g) {
    throw new M(55);
  }
  delete a.g[b];
  a.timestamp = Date.now();
}, qa(a) {
  var b = [".", ".."], c;
  for (c of Object.keys(a.g)) {
    b.push(c);
  }
  return b;
}, U(a, b, c) {
  a = N.createNode(a, b, 41471, 0);
  a.link = c;
  return a;
}, P(a) {
  if (40960 !== (a.mode & 61440)) {
    throw new M(28);
  }
  return a.link;
},}, i:{read(a, b, c, d, e) {
  var h = a.node.g;
  if (e >= a.node.l) {
    return 0;
  }
  a = Math.min(a.node.l - e, d);
  if (8 < a && h.subarray) {
    b.set(h.subarray(e, e + a), c);
  } else {
    for (d = 0; d < a; d++) {
      b[c + d] = h[e + d];
    }
  }
  return a;
}, write(a, b, c, d, e, h) {
  b.buffer === z.buffer && (h = !1);
  if (!d) {
    return 0;
  }
  a = a.node;
  a.timestamp = Date.now();
  if (b.subarray && (!a.g || a.g.subarray)) {
    if (h) {
      return a.g = b.subarray(c, c + d), a.l = d;
    }
    if (0 === a.l && 0 === e) {
      return a.g = b.slice(c, c + d), a.l = d;
    }
    if (e + d <= a.l) {
      return a.g.set(b.subarray(c, c + d), e), d;
    }
  }
  db(a, e + d);
  if (a.g.subarray && b.subarray) {
    a.g.set(b.subarray(c, c + d), e);
  } else {
    for (h = 0; h < d; h++) {
      a.g[e + h] = b[c + h];
    }
  }
  a.l = Math.max(a.l, e + d);
  return d;
}, G(a, b, c) {
  1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.l);
  if (0 > b) {
    throw new M(28);
  }
  return b;
}, ea(a, b, c) {
  db(a.node, b + c);
  a.node.l = Math.max(a.node.l, b + c);
}, aa(a, b, c, d, e) {
  if (32768 !== (a.node.mode & 61440)) {
    throw new M(43);
  }
  a = a.node.g;
  if (e & 2 || a.buffer !== z.buffer) {
    if (0 < c || c + b < a.length) {
      a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
    }
    c = !0;
    Ca();
    b = void 0;
    if (!b) {
      throw new M(48);
    }
    z.set(a, b);
  } else {
    c = !1, b = a.byteOffset;
  }
  return {$a:b, Ha:c};
}, na(a, b, c, d) {
  N.i.write(a, b, 0, d, c, !1);
  return 0;
},},}, hb = (a, b, c) => {
  var d = `al ${a}`;
  la(a, e => {
    b(new Uint8Array(e));
    d && Ba(d);
  }, () => {
    if (c) {
      c();
    } else {
      throw `Loading data file "${a}" failed.`;
    }
  });
  d && Aa(d);
}, ib = f.preloadPlugins || [], jb = (a, b, c, d) => {
  "undefined" != typeof Browser && Browser.Va();
  var e = !1;
  ib.forEach(h => {
    !e && h.canHandle(b) && (h.handle(a, b, c, d), e = !0);
  });
  return e;
}, lb = (a, b, c, d, e, h, k, q, w, l) => {
  function n(g) {
    function p(r) {
      l?.();
      q || kb(a, b, r, d, e, w);
      h?.();
      Ba(v);
    }
    jb(g, u, p, () => {
      k?.();
      Ba(v);
    }) || p(g);
  }
  var u = b ? Ta(J(a + "/" + b)) : a, v = `cp ${u}`;
  Aa(v);
  "string" == typeof c ? hb(c, n, k) : n(c);
}, mb = (a, b) => {
  var c = 0;
  a && (c |= 365);
  b && (c |= 146);
  return c;
}, nb = null, ob = {}, pb = [], qb = 1, Q = null, rb = !0, M = class {
  constructor(a) {
    this.name = "ErrnoError";
    this.u = a;
  }
}, gb = {}, sb = class {
  constructor() {
    this.m = {};
    this.node = null;
  }
  get flags() {
    return this.m.flags;
  }
  set flags(a) {
    this.m.flags = a;
  }
  get position() {
    return this.m.position;
  }
  set position(a) {
    this.m.position = a;
  }
}, tb = class {
  constructor(a, b, c, d) {
    a ||= this;
    this.parent = a;
    this.B = a.B;
    this.O = null;
    this.id = qb++;
    this.name = b;
    this.mode = c;
    this.h = {};
    this.i = {};
    this.T = d;
  }
  get read() {
    return 365 === (this.mode & 365);
  }
  set read(a) {
    a ? this.mode |= 365 : this.mode &= -366;
  }
  get write() {
    return 146 === (this.mode & 146);
  }
  set write(a) {
    a ? this.mode |= 146 : this.mode &= -147;
  }
  get za() {
    return O(this.mode);
  }
  get ya() {
    return 8192 === (this.mode & 61440);
  }
};
function R(a, b = {}) {
  a = Ta(a);
  if (!a) {
    return {path:"", node:null};
  }
  b = Object.assign({ga:!0, ca:0}, b);
  if (8 < b.ca) {
    throw new M(32);
  }
  a = a.split("/").filter(k => !!k);
  for (var c = nb, d = "/", e = 0; e < a.length; e++) {
    var h = e === a.length - 1;
    if (h && b.parent) {
      break;
    }
    c = P(c, a[e]);
    d = J(d + "/" + a[e]);
    c.O && (!h || h && b.ga) && (c = c.O.root);
    if (!h || b.Z) {
      for (h = 0; 40960 === (c.mode & 61440);) {
        if (c = ub(d), d = Ta(Pa(d), c), c = R(d, {ca:b.ca + 1}).node, 40 < h++) {
          throw new M(32);
        }
      }
    }
  }
  return {path:d, node:c};
}
function S(a) {
  for (var b;;) {
    if (a === a.parent) {
      return a = a.B.ma, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
    }
    b = b ? `${a.name}/${b}` : a.name;
    a = a.parent;
  }
}
function vb(a, b) {
  for (var c = 0, d = 0; d < b.length; d++) {
    c = (c << 5) - c + b.charCodeAt(d) | 0;
  }
  return (a + c >>> 0) % Q.length;
}
function P(a, b) {
  var c = O(a.mode) ? (c = wb(a, "x")) ? c : a.h.N ? 0 : 2 : 54;
  if (c) {
    throw new M(c);
  }
  for (c = Q[vb(a.id, b)]; c; c = c.K) {
    var d = c.name;
    if (c.parent.id === a.id && d === b) {
      return c;
    }
  }
  return a.h.N(a, b);
}
function fb(a, b, c, d) {
  a = new tb(a, b, c, d);
  b = vb(a.parent.id, a.name);
  a.K = Q[b];
  return Q[b] = a;
}
function O(a) {
  return 16384 === (a & 61440);
}
function xb(a) {
  var b = ["r", "w", "rw"][a & 3];
  a & 512 && (b += "w");
  return b;
}
function wb(a, b) {
  if (rb) {
    return 0;
  }
  if (!b.includes("r") || a.mode & 292) {
    if (b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73)) {
      return 2;
    }
  } else {
    return 2;
  }
  return 0;
}
function yb(a, b) {
  try {
    return P(a, b), 20;
  } catch (c) {
  }
  return wb(a, "wx");
}
function T(a) {
  a = pb[a];
  if (!a) {
    throw new M(8);
  }
  return a;
}
function zb(a, b = -1) {
  a = Object.assign(new sb(), a);
  if (-1 == b) {
    a: {
      for (b = 0; 4096 >= b; b++) {
        if (!pb[b]) {
          break a;
        }
      }
      throw new M(33);
    }
  }
  a.D = b;
  return pb[b] = a;
}
function Ab(a, b = -1) {
  a = zb(a, b);
  a.i?.Ra?.(a);
  return a;
}
var eb = {open(a) {
  a.i = ob[a.node.T].i;
  a.i.open?.(a);
}, G() {
  throw new M(70);
},};
function $a(a, b) {
  ob[a] = {i:b};
}
function Bb(a, b) {
  var c = "/" === b;
  if (c && nb) {
    throw new M(10);
  }
  if (!c && b) {
    var d = R(b, {ga:!1});
    b = d.path;
    d = d.node;
    if (d.O) {
      throw new M(10);
    }
    if (!O(d.mode)) {
      throw new M(54);
    }
  }
  b = {type:a, Za:{}, ma:b, Aa:[]};
  a = a.B(b);
  a.B = b;
  b.root = a;
  c ? nb = a : d && (d.O = b, d.B && d.B.Aa.push(b));
}
function Cb(a, b, c) {
  var d = R(a, {parent:!0}).node;
  a = Qa(a);
  if (!a || "." === a || ".." === a) {
    throw new M(28);
  }
  var e = yb(d, a);
  if (e) {
    throw new M(e);
  }
  if (!d.h.S) {
    throw new M(63);
  }
  return d.h.S(d, a, b, c);
}
function U(a) {
  return Cb(a, 16895, 0);
}
function Db(a, b, c) {
  "undefined" == typeof c && (c = b, b = 438);
  return Cb(a, b | 8192, c);
}
function Eb(a, b) {
  if (!Ta(a)) {
    throw new M(44);
  }
  var c = R(b, {parent:!0}).node;
  if (!c) {
    throw new M(44);
  }
  b = Qa(b);
  var d = yb(c, b);
  if (d) {
    throw new M(d);
  }
  if (!c.h.U) {
    throw new M(63);
  }
  c.h.U(c, b, a);
}
function Fb(a) {
  var b = R(a, {parent:!0}).node;
  if (!b) {
    throw new M(44);
  }
  var c = Qa(a);
  a = P(b, c);
  a: {
    try {
      var d = P(b, c);
    } catch (h) {
      d = h.u;
      break a;
    }
    var e = wb(b, "wx");
    d = e ? e : O(d.mode) ? 31 : 0;
  }
  if (d) {
    throw new M(d);
  }
  if (!b.h.X) {
    throw new M(63);
  }
  if (a.O) {
    throw new M(10);
  }
  b.h.X(b, c);
  b = vb(a.parent.id, a.name);
  if (Q[b] === a) {
    Q[b] = a.K;
  } else {
    for (b = Q[b]; b;) {
      if (b.K === a) {
        b.K = a.K;
        break;
      }
      b = b.K;
    }
  }
}
function ub(a) {
  a = R(a).node;
  if (!a) {
    throw new M(44);
  }
  if (!a.h.P) {
    throw new M(28);
  }
  return Ta(S(a.parent), a.h.P(a));
}
function Gb(a, b) {
  a = "string" == typeof a ? R(a, {Z:!0}).node : a;
  if (!a.h.s) {
    throw new M(63);
  }
  a.h.s(a, {mode:b & 4095 | a.mode & -4096, timestamp:Date.now()});
}
function Hb(a, b) {
  if (0 > b) {
    throw new M(28);
  }
  a = "string" == typeof a ? R(a, {Z:!0}).node : a;
  if (!a.h.s) {
    throw new M(63);
  }
  if (O(a.mode)) {
    throw new M(31);
  }
  if (32768 !== (a.mode & 61440)) {
    throw new M(28);
  }
  var c = wb(a, "w");
  if (c) {
    throw new M(c);
  }
  a.h.s(a, {size:b, timestamp:Date.now()});
}
function Ib(a, b, c) {
  if ("" === a) {
    throw new M(44);
  }
  if ("string" == typeof b) {
    var d = {r:0, "r+":2, w:577, "w+":578, a:1089, "a+":1090,}[b];
    if ("undefined" == typeof d) {
      throw Error(`Unknown file open mode: ${b}`);
    }
    b = d;
  }
  c = b & 64 ? ("undefined" == typeof c ? 438 : c) & 4095 | 32768 : 0;
  if ("object" == typeof a) {
    var e = a;
  } else {
    a = J(a);
    try {
      e = R(a, {Z:!(b & 131072)}).node;
    } catch (h) {
    }
  }
  d = !1;
  if (b & 64) {
    if (e) {
      if (b & 128) {
        throw new M(20);
      }
    } else {
      e = Cb(a, c, 0), d = !0;
    }
  }
  if (!e) {
    throw new M(44);
  }
  8192 === (e.mode & 61440) && (b &= -513);
  if (b & 65536 && !O(e.mode)) {
    throw new M(54);
  }
  if (!d && (c = e ? 40960 === (e.mode & 61440) ? 32 : O(e.mode) && ("r" !== xb(b) || b & 512) ? 31 : wb(e, xb(b)) : 44)) {
    throw new M(c);
  }
  b & 512 && !d && Hb(e, 0);
  b &= -131713;
  e = zb({node:e, path:S(e), flags:b, seekable:!0, position:0, i:e.i, Ga:[], error:!1});
  e.i.open && e.i.open(e);
  !f.logReadFiles || b & 1 || (Jb ||= {}, a in Jb || (Jb[a] = 1));
  return e;
}
function Kb(a) {
  if (null === a.D) {
    throw new M(8);
  }
  a.$ && (a.$ = null);
  try {
    a.i.close && a.i.close(a);
  } catch (b) {
    throw b;
  } finally {
    pb[a.D] = null;
  }
  a.D = null;
}
function Lb(a, b, c) {
  if (null === a.D) {
    throw new M(8);
  }
  if (!a.seekable || !a.i.G) {
    throw new M(70);
  }
  if (0 != c && 1 != c && 2 != c) {
    throw new M(28);
  }
  a.position = a.i.G(a, b, c);
  a.Ga = [];
}
function Mb(a, b, c, d, e, h) {
  if (0 > d || 0 > e) {
    throw new M(28);
  }
  if (null === a.D) {
    throw new M(8);
  }
  if (0 === (a.flags & 2097155)) {
    throw new M(8);
  }
  if (O(a.node.mode)) {
    throw new M(31);
  }
  if (!a.i.write) {
    throw new M(28);
  }
  a.seekable && a.flags & 1024 && Lb(a, 0, 2);
  var k = "undefined" != typeof e;
  if (!k) {
    e = a.position;
  } else if (!a.seekable) {
    throw new M(70);
  }
  b = a.i.write(a, b, c, d, e, h);
  k || (a.position += b);
  return b;
}
function ea(a, b, c) {
  Nb = !0;
  f.stdin = a || f.stdin;
  f.stdout = b || f.stdout;
  f.stderr = c || f.stderr;
  f.stdin ? V("/dev", "stdin", f.stdin) : Eb("/dev/tty", "/dev/stdin");
  f.stdout ? V("/dev", "stdout", null, f.stdout) : Eb("/dev/tty", "/dev/stdout");
  f.stderr ? V("/dev", "stderr", null, f.stderr) : Eb("/dev/tty1", "/dev/stderr");
  Ib("/dev/stdin", 0);
  Ib("/dev/stdout", 1);
  Ib("/dev/stderr", 1);
}
var Nb;
function Ob(a, b) {
  a = "string" == typeof a ? a : S(a);
  for (b = b.split("/").reverse(); b.length;) {
    var c = b.pop();
    if (c) {
      var d = J(a + "/" + c);
      try {
        U(d);
      } catch (e) {
      }
      a = d;
    }
  }
  return d;
}
function Pb(a, b, c, d) {
  a = J(("string" == typeof a ? a : S(a)) + "/" + b);
  c = mb(c, d);
  return Cb(a, (void 0 !== c ? c : 438) & 4095 | 32768, 0);
}
function kb(a, b, c, d, e, h) {
  var k = b;
  a && (a = "string" == typeof a ? a : S(a), k = b ? J(a + "/" + b) : a);
  a = mb(d, e);
  k = Cb(k, (void 0 !== a ? a : 438) & 4095 | 32768, 0);
  if (c) {
    if ("string" == typeof c) {
      b = Array(c.length);
      d = 0;
      for (e = c.length; d < e; ++d) {
        b[d] = c.charCodeAt(d);
      }
      c = b;
    }
    Gb(k, a | 146);
    b = Ib(k, 577);
    Mb(b, c, 0, c.length, 0, h);
    Kb(b);
    Gb(k, a);
  }
}
function V(a, b, c, d) {
  a = J(("string" == typeof a ? a : S(a)) + "/" + b);
  b = mb(!!c, !!d);
  V.la || (V.la = 64);
  var e = V.la++ << 8 | 0;
  $a(e, {open(h) {
    h.seekable = !1;
  }, close() {
    d?.buffer?.length && d(10);
  }, read(h, k, q, w) {
    for (var l = 0, n = 0; n < w; n++) {
      try {
        var u = c();
      } catch (v) {
        throw new M(29);
      }
      if (void 0 === u && 0 === l) {
        throw new M(6);
      }
      if (null === u || void 0 === u) {
        break;
      }
      l++;
      k[q + n] = u;
    }
    l && (h.node.timestamp = Date.now());
    return l;
  }, write(h, k, q, w) {
    for (var l = 0; l < w; l++) {
      try {
        d(k[q + l]);
      } catch (n) {
        throw new M(29);
      }
    }
    w && (h.node.timestamp = Date.now());
    return l;
  }});
  return Db(a, b, e);
}
function Qb(a) {
  if (!(a.ya || a.za || a.link || a.g)) {
    if ("undefined" != typeof XMLHttpRequest) {
      throw Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    }
    if (ka) {
      try {
        a.g = Xa(ka(a.url), !0), a.l = a.g.length;
      } catch (b) {
        throw new M(29);
      }
    } else {
      throw Error("Cannot load without read() or XMLHttpRequest.");
    }
  }
}
function Rb(a, b, c, d, e) {
  class h {
    constructor() {
      this.M = !1;
      this.m = [];
      this.L = void 0;
      this.ia = this.ja = 0;
    }
    get(n) {
      if (!(n > this.length - 1 || 0 > n)) {
        var u = n % this.oa;
        return this.L(n / this.oa | 0)[u];
      }
    }
    Ba(n) {
      this.L = n;
    }
    ka() {
      var n = new XMLHttpRequest();
      n.open("HEAD", c, !1);
      n.send(null);
      if (!(200 <= n.status && 300 > n.status || 304 === n.status)) {
        throw Error("Couldn't load " + c + ". Status: " + n.status);
      }
      var u = Number(n.getResponseHeader("Content-length")), v, g = (v = n.getResponseHeader("Accept-Ranges")) && "bytes" === v;
      n = (v = n.getResponseHeader("Content-Encoding")) && "gzip" === v;
      var p = 1048576;
      g || (p = u);
      var r = this;
      r.Ba(y => {
        var G = y * p, X = (y + 1) * p - 1;
        X = Math.min(X, u - 1);
        if ("undefined" == typeof r.m[y]) {
          var jc = r.m;
          if (G > X) {
            throw Error("invalid range (" + G + ", " + X + ") or no bytes requested!");
          }
          if (X > u - 1) {
            throw Error("only " + u + " bytes available! programmer error!");
          }
          var C = new XMLHttpRequest();
          C.open("GET", c, !1);
          u !== p && C.setRequestHeader("Range", "bytes=" + G + "-" + X);
          C.responseType = "arraybuffer";
          C.overrideMimeType && C.overrideMimeType("text/plain; charset=x-user-defined");
          C.send(null);
          if (!(200 <= C.status && 300 > C.status || 304 === C.status)) {
            throw Error("Couldn't load " + c + ". Status: " + C.status);
          }
          G = void 0 !== C.response ? new Uint8Array(C.response || []) : Xa(C.responseText || "", !0);
          jc[y] = G;
        }
        if ("undefined" == typeof r.m[y]) {
          throw Error("doXHR failed!");
        }
        return r.m[y];
      });
      if (n || !u) {
        p = u = 1, p = u = this.L(0).length, na("LazyFiles on gzip forces download of the whole file when length is accessed");
      }
      this.ja = u;
      this.ia = p;
      this.M = !0;
    }
    get length() {
      this.M || this.ka();
      return this.ja;
    }
    get oa() {
      this.M || this.ka();
      return this.ia;
    }
  }
  if ("undefined" != typeof XMLHttpRequest) {
    if (!m) {
      throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
    }
    var k = new h();
    var q = void 0;
  } else {
    q = c, k = void 0;
  }
  var w = Pb(a, b, d, e);
  k ? w.g = k : q && (w.g = null, w.url = q);
  Object.defineProperties(w, {l:{get:function() {
    return this.g.length;
  }}});
  var l = {};
  Object.keys(w.i).forEach(n => {
    var u = w.i[n];
    l[n] = (...v) => {
      Qb(w);
      return u(...v);
    };
  });
  l.read = (n, u, v, g, p) => {
    Qb(w);
    n = n.node.g;
    if (p >= n.length) {
      u = 0;
    } else {
      g = Math.min(n.length - p, g);
      if (n.slice) {
        for (var r = 0; r < g; r++) {
          u[v + r] = n[p + r];
        }
      } else {
        for (r = 0; r < g; r++) {
          u[v + r] = n.get(p + r);
        }
      }
      u = g;
    }
    return u;
  };
  l.aa = () => {
    Qb(w);
    Ca();
    throw new M(48);
  };
  w.i = l;
  return w;
}
var W = {}, Jb, Na = void 0, Y = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400), Sb = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Tb = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], Ub = {}, Wb = () => {
  if (!Vb) {
    var a = {USER:"web_user", LOGNAME:"web_user", PATH:"/", PWD:"/", HOME:"/home/web_user", LANG:("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", _:ia || "./this.program"}, b;
    for (b in Ub) {
      void 0 === Ub[b] ? delete a[b] : a[b] = Ub[b];
    }
    var c = [];
    for (b in a) {
      c.push(`${b}=${a[b]}`);
    }
    Vb = c;
  }
  return Vb;
}, Vb, Xb = a => {
  Ma || (f.onExit?.(a), qa = !0);
  ja(a, new Ka(a));
}, Yb = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], Zb = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], $b = (a, b, c, d) => {
  function e(g, p, r) {
    for (g = "number" == typeof g ? g.toString() : g || ""; g.length < p;) {
      g = r[0] + g;
    }
    return g;
  }
  function h(g, p) {
    return e(g, p, "0");
  }
  function k(g, p) {
    function r(G) {
      return 0 > G ? -1 : 0 < G ? 1 : 0;
    }
    var y;
    0 === (y = r(g.getFullYear() - p.getFullYear())) && 0 === (y = r(g.getMonth() - p.getMonth())) && (y = r(g.getDate() - p.getDate()));
    return y;
  }
  function q(g) {
    switch(g.getDay()) {
      case 0:
        return new Date(g.getFullYear() - 1, 11, 29);
      case 1:
        return g;
      case 2:
        return new Date(g.getFullYear(), 0, 3);
      case 3:
        return new Date(g.getFullYear(), 0, 2);
      case 4:
        return new Date(g.getFullYear(), 0, 1);
      case 5:
        return new Date(g.getFullYear() - 1, 11, 31);
      case 6:
        return new Date(g.getFullYear() - 1, 11, 30);
    }
  }
  function w(g) {
    var p = g.H;
    for (g = new Date((new Date(g.I + 1900, 0, 1)).getTime()); 0 < p;) {
      var r = g.getMonth(), y = (Y(g.getFullYear()) ? Yb : Zb)[r];
      if (p > y - g.getDate()) {
        p -= y - g.getDate() + 1, g.setDate(1), 11 > r ? g.setMonth(r + 1) : (g.setMonth(0), g.setFullYear(g.getFullYear() + 1));
      } else {
        g.setDate(g.getDate() + p);
        break;
      }
    }
    r = new Date(g.getFullYear() + 1, 0, 4);
    p = q(new Date(g.getFullYear(), 0, 4));
    r = q(r);
    return 0 >= k(p, g) ? 0 >= k(r, g) ? g.getFullYear() + 1 : g.getFullYear() : g.getFullYear() - 1;
  }
  var l = D[d + 40 >> 2];
  d = {Ea:B[d >> 2], Da:B[d + 4 >> 2], V:B[d + 8 >> 2], da:B[d + 12 >> 2], W:B[d + 16 >> 2], I:B[d + 20 >> 2], A:B[d + 24 >> 2], H:B[d + 28 >> 2], ab:B[d + 32 >> 2], Ca:B[d + 36 >> 2], Fa:l ? l ? K(A, l) : "" : ""};
  c = c ? K(A, c) : "";
  l = {"%c":"%a %b %d %H:%M:%S %Y", "%D":"%m/%d/%y", "%F":"%Y-%m-%d", "%h":"%b", "%r":"%I:%M:%S %p", "%R":"%H:%M", "%T":"%H:%M:%S", "%x":"%m/%d/%y", "%X":"%H:%M:%S", "%Ec":"%c", "%EC":"%C", "%Ex":"%m/%d/%y", "%EX":"%H:%M:%S", "%Ey":"%y", "%EY":"%Y", "%Od":"%d", "%Oe":"%e", "%OH":"%H", "%OI":"%I", "%Om":"%m", "%OM":"%M", "%OS":"%S", "%Ou":"%u", "%OU":"%U", "%OV":"%V", "%Ow":"%w", "%OW":"%W", "%Oy":"%y",};
  for (var n in l) {
    c = c.replace(new RegExp(n, "g"), l[n]);
  }
  var u = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" "), v = "January February March April May June July August September October November December".split(" ");
  l = {"%a":g => u[g.A].substring(0, 3), "%A":g => u[g.A], "%b":g => v[g.W].substring(0, 3), "%B":g => v[g.W], "%C":g => h((g.I + 1900) / 100 | 0, 2), "%d":g => h(g.da, 2), "%e":g => e(g.da, 2, " "), "%g":g => w(g).toString().substring(2), "%G":w, "%H":g => h(g.V, 2), "%I":g => {
    g = g.V;
    0 == g ? g = 12 : 12 < g && (g -= 12);
    return h(g, 2);
  }, "%j":g => {
    for (var p = 0, r = 0; r <= g.W - 1; p += (Y(g.I + 1900) ? Yb : Zb)[r++]) {
    }
    return h(g.da + p, 3);
  }, "%m":g => h(g.W + 1, 2), "%M":g => h(g.Da, 2), "%n":() => "\n", "%p":g => 0 <= g.V && 12 > g.V ? "AM" : "PM", "%S":g => h(g.Ea, 2), "%t":() => "\t", "%u":g => g.A || 7, "%U":g => h(Math.floor((g.H + 7 - g.A) / 7), 2), "%V":g => {
    var p = Math.floor((g.H + 7 - (g.A + 6) % 7) / 7);
    2 >= (g.A + 371 - g.H - 2) % 7 && p++;
    if (p) {
      53 == p && (r = (g.A + 371 - g.H) % 7, 4 == r || 3 == r && Y(g.I) || (p = 1));
    } else {
      p = 52;
      var r = (g.A + 7 - g.H - 1) % 7;
      (4 == r || 5 == r && Y(g.I % 400 - 1)) && p++;
    }
    return h(p, 2);
  }, "%w":g => g.A, "%W":g => h(Math.floor((g.H + 7 - (g.A + 6) % 7) / 7), 2), "%y":g => (g.I + 1900).toString().substring(2), "%Y":g => g.I + 1900, "%z":g => {
    g = g.Ca;
    var p = 0 <= g;
    g = Math.abs(g) / 60;
    return (p ? "+" : "-") + String("0000" + (g / 60 * 100 + g % 60)).slice(-4);
  }, "%Z":g => g.Fa, "%%":() => "%"};
  c = c.replace(/%%/g, "\x00\x00");
  for (n in l) {
    c.includes(n) && (c = c.replace(new RegExp(n, "g"), l[n](d)));
  }
  c = c.replace(/\0\0/g, "%");
  n = Xa(c, !1);
  if (n.length > b) {
    return 0;
  }
  z.set(n, a);
  return n.length - 1;
}, bc = a => {
  var b = Wa(a) + 1, c = ac(b);
  L(a, A, c, b);
  return c;
}, ec = (a, b, c, d) => {
  var e = {string:l => {
    var n = 0;
    null !== l && void 0 !== l && 0 !== l && (n = bc(l));
    return n;
  }, array:l => {
    var n = ac(l.length);
    z.set(l, n);
    return n;
  }};
  a = f["_" + a];
  var h = [], k = 0;
  if (d) {
    for (var q = 0; q < d.length; q++) {
      var w = e[c[q]];
      w ? (0 === k && (k = cc()), h[q] = w(d[q])) : h[q] = d[q];
    }
  }
  c = a(...h);
  return c = function(l) {
    0 !== k && dc(k);
    return "string" === b ? l ? K(A, l) : "" : "boolean" === b ? !!l : l;
  }(c);
};
[44].forEach(a => {
  gb[a] = new M(a);
  gb[a].stack = "<generic error, no stack>";
});
Q = Array(4096);
Bb(N, "/");
U("/tmp");
U("/home");
U("/home/web_user");
(function() {
  U("/dev");
  $a(259, {read:() => 0, write:(d, e, h, k) => k,});
  Db("/dev/null", 259);
  Za(1280, bb);
  Za(1536, cb);
  Db("/dev/tty", 1280);
  Db("/dev/tty1", 1536);
  var a = new Uint8Array(1024), b = 0, c = () => {
    0 === b && (b = Sa(a).byteLength);
    return a[--b];
  };
  V("/dev", "random", c);
  V("/dev", "urandom", c);
  U("/dev/shm");
  U("/dev/shm/tmp");
})();
(function() {
  U("/proc");
  var a = U("/proc/self");
  U("/proc/self/fd");
  Bb({B() {
    var b = fb(a, "fd", 16895, 73);
    b.h = {N(c, d) {
      var e = T(+d);
      c = {parent:null, B:{ma:"fake"}, h:{P:() => e.path},};
      return c.parent = c;
    }};
    return b;
  }}, "/proc/self/fd");
})();
f.FS_createPath = Ob;
f.FS_createDataFile = kb;
f.FS_createPreloadedFile = lb;
f.FS_unlink = Fb;
f.FS_createLazyFile = Rb;
f.FS_createDevice = V;
var gc = {__syscall_fcntl64:function(a, b, c) {
  Na = c;
  try {
    var d = T(a);
    switch(b) {
      case 0:
        var e = I();
        if (0 > e) {
          break;
        }
        for (; pb[e];) {
          e++;
        }
        return Ab(d, e).D;
      case 1:
      case 2:
        return 0;
      case 3:
        return d.flags;
      case 4:
        return e = I(), d.flags |= e, 0;
      case 12:
        return e = I(), ra[e + 0 >> 1] = 2, 0;
      case 13:
      case 14:
        return 0;
    }
    return -28;
  } catch (h) {
    if ("undefined" == typeof W || "ErrnoError" !== h.name) {
      throw h;
    }
    return -h.u;
  }
}, __syscall_ftruncate64:function(a, b, c) {
  b = c + 2097152 >>> 0 < 4194305 - !!b ? (b >>> 0) + 4294967296 * c : NaN;
  try {
    if (isNaN(b)) {
      return 61;
    }
    var d = T(a);
    if (0 === (d.flags & 2097155)) {
      throw new M(28);
    }
    Hb(d.node, b);
    return 0;
  } catch (e) {
    if ("undefined" == typeof W || "ErrnoError" !== e.name) {
      throw e;
    }
    return -e.u;
  }
}, __syscall_getcwd:function(a, b) {
  try {
    if (0 === b) {
      return -28;
    }
    var c = Wa("/") + 1;
    if (b < c) {
      return -68;
    }
    L("/", A, a, b);
    return c;
  } catch (d) {
    if ("undefined" == typeof W || "ErrnoError" !== d.name) {
      throw d;
    }
    return -d.u;
  }
}, __syscall_ioctl:function(a, b, c) {
  Na = c;
  try {
    var d = T(a);
    switch(b) {
      case 21509:
        return d.j ? 0 : -59;
      case 21505:
        if (!d.j) {
          return -59;
        }
        if (d.j.C.va) {
          a = [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,];
          var e = I();
          B[e >> 2] = 25856;
          B[e + 4 >> 2] = 5;
          B[e + 8 >> 2] = 191;
          B[e + 12 >> 2] = 35387;
          for (var h = 0; 32 > h; h++) {
            z[e + h + 17] = a[h] || 0;
          }
        }
        return 0;
      case 21510:
      case 21511:
      case 21512:
        return d.j ? 0 : -59;
      case 21506:
      case 21507:
      case 21508:
        if (!d.j) {
          return -59;
        }
        if (d.j.C.wa) {
          for (e = I(), a = [], h = 0; 32 > h; h++) {
            a.push(z[e + h + 17]);
          }
        }
        return 0;
      case 21519:
        if (!d.j) {
          return -59;
        }
        e = I();
        return B[e >> 2] = 0;
      case 21520:
        return d.j ? -28 : -59;
      case 21531:
        e = I();
        if (!d.i.ua) {
          throw new M(59);
        }
        return d.i.ua(d, b, e);
      case 21523:
        if (!d.j) {
          return -59;
        }
        d.j.C.xa && (h = [24, 80], e = I(), ra[e >> 1] = h[0], ra[e + 2 >> 1] = h[1]);
        return 0;
      case 21524:
        return d.j ? 0 : -59;
      case 21515:
        return d.j ? 0 : -59;
      default:
        return -28;
    }
  } catch (k) {
    if ("undefined" == typeof W || "ErrnoError" !== k.name) {
      throw k;
    }
    return -k.u;
  }
}, __syscall_openat:function(a, b, c, d) {
  Na = d;
  try {
    b = b ? K(A, b) : "";
    var e = b;
    if ("/" === e.charAt(0)) {
      b = e;
    } else {
      var h = -100 === a ? "/" : T(a).path;
      if (0 == e.length) {
        throw new M(44);
      }
      b = J(h + "/" + e);
    }
    var k = d ? I() : 0;
    return Ib(b, c, k).D;
  } catch (q) {
    if ("undefined" == typeof W || "ErrnoError" !== q.name) {
      throw q;
    }
    return -q.u;
  }
}, _emscripten_get_now_is_monotonic:() => 1, _emscripten_memcpy_js:(a, b, c) => A.copyWithin(a, b, b + c), _localtime_js:function(a, b, c) {
  a = new Date(1000 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
  B[c >> 2] = a.getSeconds();
  B[c + 4 >> 2] = a.getMinutes();
  B[c + 8 >> 2] = a.getHours();
  B[c + 12 >> 2] = a.getDate();
  B[c + 16 >> 2] = a.getMonth();
  B[c + 20 >> 2] = a.getFullYear() - 1900;
  B[c + 24 >> 2] = a.getDay();
  B[c + 28 >> 2] = (Y(a.getFullYear()) ? Sb : Tb)[a.getMonth()] + a.getDate() - 1 | 0;
  B[c + 36 >> 2] = -(60 * a.getTimezoneOffset());
  b = (new Date(a.getFullYear(), 6, 1)).getTimezoneOffset();
  var d = (new Date(a.getFullYear(), 0, 1)).getTimezoneOffset();
  B[c + 32 >> 2] = (b != d && a.getTimezoneOffset() == Math.min(d, b)) | 0;
}, _mktime_js:function(a) {
  var b = new Date(B[a + 20 >> 2] + 1900, B[a + 16 >> 2], B[a + 12 >> 2], B[a + 8 >> 2], B[a + 4 >> 2], B[a >> 2], 0), c = B[a + 32 >> 2], d = b.getTimezoneOffset(), e = (new Date(b.getFullYear(), 6, 1)).getTimezoneOffset(), h = (new Date(b.getFullYear(), 0, 1)).getTimezoneOffset(), k = Math.min(h, e);
  0 > c ? B[a + 32 >> 2] = Number(e != h && k == d) : 0 < c != (k == d) && (e = Math.max(h, e), b.setTime(b.getTime() + 60000 * ((0 < c ? k : e) - d)));
  B[a + 24 >> 2] = b.getDay();
  B[a + 28 >> 2] = (Y(b.getFullYear()) ? Sb : Tb)[b.getMonth()] + b.getDate() - 1 | 0;
  B[a >> 2] = b.getSeconds();
  B[a + 4 >> 2] = b.getMinutes();
  B[a + 8 >> 2] = b.getHours();
  B[a + 12 >> 2] = b.getDate();
  B[a + 16 >> 2] = b.getMonth();
  B[a + 20 >> 2] = b.getYear();
  a = b.getTime();
  a = isNaN(a) ? -1 : a / 1000;
  fc((H = a, 1.0 <= +Math.abs(H) ? 0.0 < H ? +Math.floor(H / 4294967296.0) >>> 0 : ~~+Math.ceil((H - +(~~H >>> 0)) / 4294967296.0) >>> 0 : 0));
  return a >>> 0;
}, _tzset_js:(a, b, c, d) => {
  var e = (new Date()).getFullYear(), h = new Date(e, 0, 1), k = new Date(e, 6, 1);
  e = h.getTimezoneOffset();
  var q = k.getTimezoneOffset();
  D[a >> 2] = 60 * Math.max(e, q);
  B[b >> 2] = Number(e != q);
  a = w => w.toLocaleTimeString(void 0, {hour12:!1, timeZoneName:"short"}).split(" ")[1];
  h = a(h);
  k = a(k);
  q < e ? (L(h, A, c, 17), L(k, A, d, 17)) : (L(h, A, d, 17), L(k, A, c, 17));
}, abort:() => {
  Ca("");
}, emscripten_date_now:() => Date.now(), emscripten_get_now:() => performance.now(), emscripten_resize_heap:a => {
  var b = A.length;
  a >>>= 0;
  if (1073741824 < a) {
    return !1;
  }
  for (var c = 1; 4 >= c; c *= 2) {
    var d = b * (1 + 0.2 / c);
    d = Math.min(d, a + 100663296);
    var e = Math;
    d = Math.max(a, d);
    a: {
      e = (e.min.call(e, 1073741824, d + (65536 - d % 65536) % 65536) - pa.buffer.byteLength + 65535) / 65536;
      try {
        pa.grow(e);
        sa();
        var h = 1;
        break a;
      } catch (k) {
      }
      h = void 0;
    }
    if (h) {
      return !0;
    }
  }
  return !1;
}, environ_get:(a, b) => {
  var c = 0;
  Wb().forEach((d, e) => {
    var h = b + c;
    e = D[a + 4 * e >> 2] = h;
    for (h = 0; h < d.length; ++h) {
      z[e++] = d.charCodeAt(h);
    }
    z[e] = 0;
    c += d.length + 1;
  });
  return 0;
}, environ_sizes_get:(a, b) => {
  var c = Wb();
  D[a >> 2] = c.length;
  var d = 0;
  c.forEach(e => d += e.length + 1);
  D[b >> 2] = d;
  return 0;
}, exit:Xb, fd_close:function(a) {
  try {
    var b = T(a);
    Kb(b);
    return 0;
  } catch (c) {
    if ("undefined" == typeof W || "ErrnoError" !== c.name) {
      throw c;
    }
    return c.u;
  }
}, fd_read:function(a, b, c, d) {
  try {
    a: {
      var e = T(a);
      a = b;
      for (var h, k = b = 0; k < c; k++) {
        var q = D[a >> 2], w = D[a + 4 >> 2];
        a += 8;
        var l = e, n = h, u = z;
        if (0 > w || 0 > n) {
          throw new M(28);
        }
        if (null === l.D) {
          throw new M(8);
        }
        if (1 === (l.flags & 2097155)) {
          throw new M(8);
        }
        if (O(l.node.mode)) {
          throw new M(31);
        }
        if (!l.i.read) {
          throw new M(28);
        }
        var v = "undefined" != typeof n;
        if (!v) {
          n = l.position;
        } else if (!l.seekable) {
          throw new M(70);
        }
        var g = l.i.read(l, u, q, w, n);
        v || (l.position += g);
        var p = g;
        if (0 > p) {
          var r = -1;
          break a;
        }
        b += p;
        if (p < w) {
          break;
        }
        "undefined" != typeof h && (h += p);
      }
      r = b;
    }
    D[d >> 2] = r;
    return 0;
  } catch (y) {
    if ("undefined" == typeof W || "ErrnoError" !== y.name) {
      throw y;
    }
    return y.u;
  }
}, fd_seek:function(a, b, c, d, e) {
  b = c + 2097152 >>> 0 < 4194305 - !!b ? (b >>> 0) + 4294967296 * c : NaN;
  try {
    if (isNaN(b)) {
      return 61;
    }
    var h = T(a);
    Lb(h, b, d);
    Ja = [h.position >>> 0, (H = h.position, 1.0 <= +Math.abs(H) ? 0.0 < H ? +Math.floor(H / 4294967296.0) >>> 0 : ~~+Math.ceil((H - +(~~H >>> 0)) / 4294967296.0) >>> 0 : 0)];
    B[e >> 2] = Ja[0];
    B[e + 4 >> 2] = Ja[1];
    h.$ && 0 === b && 0 === d && (h.$ = null);
    return 0;
  } catch (k) {
    if ("undefined" == typeof W || "ErrnoError" !== k.name) {
      throw k;
    }
    return k.u;
  }
}, fd_write:function(a, b, c, d) {
  try {
    a: {
      var e = T(a);
      a = b;
      for (var h, k = b = 0; k < c; k++) {
        var q = D[a >> 2], w = D[a + 4 >> 2];
        a += 8;
        var l = Mb(e, z, q, w, h);
        if (0 > l) {
          var n = -1;
          break a;
        }
        b += l;
        "undefined" != typeof h && (h += l);
      }
      n = b;
    }
    D[d >> 2] = n;
    return 0;
  } catch (u) {
    if ("undefined" == typeof W || "ErrnoError" !== u.name) {
      throw u;
    }
    return u.u;
  }
}, strftime_l:(a, b, c, d) => $b(a, b, c, d)}, Z = function() {
  function a(c) {
    Z = c.exports;
    pa = Z.memory;
    sa();
    ua.unshift(Z.__wasm_call_ctors);
    Ba("wasm-instantiate");
    return Z;
  }
  var b = {env:gc, wasi_snapshot_preview1:gc,};
  Aa("wasm-instantiate");
  if (f.instantiateWasm) {
    try {
      return f.instantiateWasm(b, a);
    } catch (c) {
      t(`Module.instantiateWasm callback failed with error: ${c}`), ba(c);
    }
  }
  Ia(b, function(c) {
    a(c.instance);
  }).catch(ba);
  return {};
}(), hc = f._main = (a, b) => (hc = f._main = Z.__main_argc_argv)(a, b);
f._wasm_uci_execute = () => (f._wasm_uci_execute = Z.wasm_uci_execute)();
var fc = a => (fc = Z._emscripten_tempret_set)(a), dc = a => (dc = Z._emscripten_stack_restore)(a), ac = a => (ac = Z._emscripten_stack_alloc)(a), cc = () => (cc = Z.emscripten_stack_get_current)();
f.dynCall_iijii = (a, b, c, d, e, h) => (f.dynCall_iijii = Z.dynCall_iijii)(a, b, c, d, e, h);
f.dynCall_jiji = (a, b, c, d, e) => (f.dynCall_jiji = Z.dynCall_jiji)(a, b, c, d, e);
f.dynCall_viijii = (a, b, c, d, e, h, k) => (f.dynCall_viijii = Z.dynCall_viijii)(a, b, c, d, e, h, k);
f.dynCall_iiiiij = (a, b, c, d, e, h, k) => (f.dynCall_iiiiij = Z.dynCall_iiiiij)(a, b, c, d, e, h, k);
f.dynCall_iiiiijj = (a, b, c, d, e, h, k, q, w) => (f.dynCall_iiiiijj = Z.dynCall_iiiiijj)(a, b, c, d, e, h, k, q, w);
f.dynCall_iiiiiijj = (a, b, c, d, e, h, k, q, w, l) => (f.dynCall_iiiiiijj = Z.dynCall_iiiiiijj)(a, b, c, d, e, h, k, q, w, l);
f.addRunDependency = Aa;
f.removeRunDependency = Ba;
f.FS_createPath = Ob;
f.FS_createLazyFile = Rb;
f.FS_createDevice = V;
f.cwrap = (a, b, c, d) => {
  var e = !c || c.every(h => "number" === h || "boolean" === h);
  return "string" !== b && e && !d ? f["_" + a] : (...h) => ec(a, b, c, h);
};
f.FS_createPreloadedFile = lb;
f.FS_createDataFile = kb;
f.FS_unlink = Fb;
var ic;
za = function kc() {
  ic || lc();
  ic || (za = kc);
};
function mc(a = []) {
  var b = hc;
  a.unshift(ia);
  var c = a.length, d = ac(4 * (c + 1)), e = d;
  a.forEach(k => {
    D[e >> 2] = bc(k);
    e += 4;
  });
  D[e >> 2] = 0;
  try {
    var h = b(c, d);
    Xb(h, !0);
  } catch (k) {
    k instanceof Ka || "unwind" == k || ja(1, k);
  }
}
function lc() {
  var a = ha;
  function b() {
    if (!ic && (ic = !0, f.calledRun = !0, !qa)) {
      f.noFSInit || Nb || ea();
      rb = !1;
      La(ua);
      La(va);
      aa(f);
      if (f.onRuntimeInitialized) {
        f.onRuntimeInitialized();
      }
      nc && mc(a);
      if (f.postRun) {
        for ("function" == typeof f.postRun && (f.postRun = [f.postRun]); f.postRun.length;) {
          var c = f.postRun.shift();
          wa.unshift(c);
        }
      }
      La(wa);
    }
  }
  if (!(0 < E)) {
    if (f.preRun) {
      for ("function" == typeof f.preRun && (f.preRun = [f.preRun]); f.preRun.length;) {
        xa();
      }
    }
    La(ta);
    0 < E || (f.setStatus ? (f.setStatus("Running..."), setTimeout(function() {
      setTimeout(function() {
        f.setStatus("");
      }, 1);
      b();
    }, 1)) : b());
  }
}
if (f.preInit) {
  for ("function" == typeof f.preInit && (f.preInit = [f.preInit]); 0 < f.preInit.length;) {
    f.preInit.pop()();
  }
}
var nc = !0;
f.noInitialRun && (nc = !1);
lc();
moduleRtn = ca;



  return moduleRtn;
}
);
})();
if (typeof exports === 'object' && typeof module === 'object')
  module.exports = Pikafish;
else if (typeof define === 'function' && define['amd'])
  define([], () => Pikafish);
