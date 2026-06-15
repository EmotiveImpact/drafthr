import { jsx as d, Fragment as mo, jsxs as K } from "react/jsx-runtime";
import * as g from "react";
import An, { useLayoutEffect as nl, useState as Qe, memo as Hu, useEffect as Ze, useMemo as si, useRef as X, forwardRef as go, useImperativeHandle as Li, useCallback as Ne, Fragment as zu } from "react";
import * as ho from "react-dom";
import Wu from "react-dom";
import { Undo2 as ju, Redo2 as Uu, Pilcrow as rl, Quote as qu, SquareCode as Vu, Baseline as Xu, Highlighter as Ku, Bold as Gu, Italic as Yu, Underline as Qu, Code as ol, List as il, ListOrdered as al, ListChecks as sl, AlignLeft as Zu, AlignCenter as Ju, AlignRight as ed, AlignJustify as td, IndentDecrease as nd, IndentIncrease as rd, Link as od, Image as ll, MoreHorizontal as li, Strikethrough as id, Superscript as ad, Subscript as sd, Eraser as ld, Link2Off as cd, Minus as cl, ScissorsLineDashed as ud, Asterisk as ul, ClipboardType as dd, Palette as fd, Table as dl, ListTree as fl, Scissors as pl, Link2 as ml, Columns2 as pd, Search as md, Printer as gd, Download as hd, FileDown as bd, FileUp as yd, FileText as wd, FileCode as vd, Heading1 as gl, Heading2 as hl, Heading3 as bl, Heading4 as Cd, Heading5 as xd, Heading6 as Ed, ChevronDown as wr, Check as vr, ChevronUp as yl, Type as Td, Heading as Nd, TextQuote as Sd, SeparatorHorizontal as Ad } from "lucide-react";
import Pi from "dompurify";
function Ye(e, t, { checkForDefaultPrevented: n = !0 } = {}) {
  return function(o) {
    if (e == null || e(o), n === !1 || !o.defaultPrevented)
      return t == null ? void 0 : t(o);
  };
}
function qa(e, t) {
  if (typeof e == "function")
    return e(t);
  e != null && (e.current = t);
}
function wl(...e) {
  return (t) => {
    let n = !1;
    const r = e.map((o) => {
      const i = qa(o, t);
      return !n && typeof i == "function" && (n = !0), i;
    });
    if (n)
      return () => {
        for (let o = 0; o < r.length; o++) {
          const i = r[o];
          typeof i == "function" ? i() : qa(e[o], null);
        }
      };
  };
}
function mt(...e) {
  return g.useCallback(wl(...e), e);
}
function Rr(e, t = []) {
  let n = [];
  function r(i, a) {
    const s = g.createContext(a), l = n.length;
    n = [...n, a];
    const c = (p) => {
      var x;
      const { scope: h, children: v, ...T } = p, b = ((x = h == null ? void 0 : h[e]) == null ? void 0 : x[l]) || s, E = g.useMemo(() => T, Object.values(T));
      return /* @__PURE__ */ d(b.Provider, { value: E, children: v });
    };
    c.displayName = i + "Provider";
    function f(p, h) {
      var b;
      const v = ((b = h == null ? void 0 : h[e]) == null ? void 0 : b[l]) || s, T = g.useContext(v);
      if (T) return T;
      if (a !== void 0) return a;
      throw new Error(`\`${p}\` must be used within \`${i}\``);
    }
    return [c, f];
  }
  const o = () => {
    const i = n.map((a) => g.createContext(a));
    return function(s) {
      const l = (s == null ? void 0 : s[e]) || i;
      return g.useMemo(
        () => ({ [`__scope${e}`]: { ...s, [e]: l } }),
        [s, l]
      );
    };
  };
  return o.scopeName = e, [r, kd(o, ...t)];
}
function kd(...e) {
  const t = e[0];
  if (e.length === 1) return t;
  const n = () => {
    const r = e.map((o) => ({
      useScope: o(),
      scopeName: o.scopeName
    }));
    return function(i) {
      const a = r.reduce((s, { useScope: l, scopeName: c }) => {
        const p = l(i)[`__scope${c}`];
        return { ...s, ...p };
      }, {});
      return g.useMemo(() => ({ [`__scope${t.scopeName}`]: a }), [a]);
    };
  };
  return n.scopeName = t.scopeName, n;
}
// @__NO_SIDE_EFFECTS__
function Cr(e) {
  const t = /* @__PURE__ */ Rd(e), n = g.forwardRef((r, o) => {
    const { children: i, ...a } = r, s = g.Children.toArray(i), l = s.find(Ld);
    if (l) {
      const c = l.props.children, f = s.map((p) => p === l ? g.Children.count(c) > 1 ? g.Children.only(null) : g.isValidElement(c) ? c.props.children : null : p);
      return /* @__PURE__ */ d(t, { ...a, ref: o, children: g.isValidElement(c) ? g.cloneElement(c, void 0, f) : null });
    }
    return /* @__PURE__ */ d(t, { ...a, ref: o, children: i });
  });
  return n.displayName = `${e}.Slot`, n;
}
// @__NO_SIDE_EFFECTS__
function Rd(e) {
  const t = g.forwardRef((n, r) => {
    const { children: o, ...i } = n;
    if (g.isValidElement(o)) {
      const a = Md(o), s = Pd(i, o.props);
      return o.type !== g.Fragment && (s.ref = r ? wl(r, a) : a), g.cloneElement(o, s);
    }
    return g.Children.count(o) > 1 ? g.Children.only(null) : null;
  });
  return t.displayName = `${e}.SlotClone`, t;
}
var vl = Symbol("radix.slottable");
// @__NO_SIDE_EFFECTS__
function _d(e) {
  const t = ({ children: n }) => /* @__PURE__ */ d(mo, { children: n });
  return t.displayName = `${e}.Slottable`, t.__radixId = vl, t;
}
function Ld(e) {
  return g.isValidElement(e) && typeof e.type == "function" && "__radixId" in e.type && e.type.__radixId === vl;
}
function Pd(e, t) {
  const n = { ...t };
  for (const r in t) {
    const o = e[r], i = t[r];
    /^on[A-Z]/.test(r) ? o && i ? n[r] = (...s) => {
      const l = i(...s);
      return o(...s), l;
    } : o && (n[r] = o) : r === "style" ? n[r] = { ...o, ...i } : r === "className" && (n[r] = [o, i].filter(Boolean).join(" "));
  }
  return { ...e, ...n };
}
function Md(e) {
  var r, o;
  let t = (r = Object.getOwnPropertyDescriptor(e.props, "ref")) == null ? void 0 : r.get, n = t && "isReactWarning" in t && t.isReactWarning;
  return n ? e.ref : (t = (o = Object.getOwnPropertyDescriptor(e, "ref")) == null ? void 0 : o.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
var Od = [
  "a",
  "button",
  "div",
  "form",
  "h2",
  "h3",
  "img",
  "input",
  "label",
  "li",
  "nav",
  "ol",
  "p",
  "select",
  "span",
  "svg",
  "ul"
], lt = Od.reduce((e, t) => {
  const n = /* @__PURE__ */ Cr(`Primitive.${t}`), r = g.forwardRef((o, i) => {
    const { asChild: a, ...s } = o, l = a ? n : t;
    return typeof window < "u" && (window[Symbol.for("radix-ui")] = !0), /* @__PURE__ */ d(l, { ...s, ref: i });
  });
  return r.displayName = `Primitive.${t}`, { ...e, [t]: r };
}, {});
function Dd(e, t) {
  e && ho.flushSync(() => e.dispatchEvent(t));
}
function _n(e) {
  const t = g.useRef(e);
  return g.useEffect(() => {
    t.current = e;
  }), g.useMemo(() => (...n) => {
    var r;
    return (r = t.current) == null ? void 0 : r.call(t, ...n);
  }, []);
}
function Id(e, t = globalThis == null ? void 0 : globalThis.document) {
  const n = _n(e);
  g.useEffect(() => {
    const r = (o) => {
      o.key === "Escape" && n(o);
    };
    return t.addEventListener("keydown", r, { capture: !0 }), () => t.removeEventListener("keydown", r, { capture: !0 });
  }, [n, t]);
}
var $d = "DismissableLayer", ci = "dismissableLayer.update", Bd = "dismissableLayer.pointerDownOutside", Fd = "dismissableLayer.focusOutside", Va, Cl = g.createContext({
  layers: /* @__PURE__ */ new Set(),
  layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
  branches: /* @__PURE__ */ new Set()
}), bo = g.forwardRef(
  (e, t) => {
    const {
      disableOutsidePointerEvents: n = !1,
      onEscapeKeyDown: r,
      onPointerDownOutside: o,
      onFocusOutside: i,
      onInteractOutside: a,
      onDismiss: s,
      ...l
    } = e, c = g.useContext(Cl), [f, p] = g.useState(null), h = (f == null ? void 0 : f.ownerDocument) ?? (globalThis == null ? void 0 : globalThis.document), [, v] = g.useState({}), T = mt(t, (H) => p(H)), b = Array.from(c.layers), [E] = [...c.layersWithOutsidePointerEventsDisabled].slice(-1), x = b.indexOf(E), w = f ? b.indexOf(f) : -1, k = c.layersWithOutsidePointerEventsDisabled.size > 0, D = w >= x, j = Wd((H) => {
      const Q = H.target, be = [...c.branches].some((ke) => ke.contains(Q));
      !D || be || (o == null || o(H), a == null || a(H), H.defaultPrevented || s == null || s());
    }, h), q = jd((H) => {
      const Q = H.target;
      [...c.branches].some((ke) => ke.contains(Q)) || (i == null || i(H), a == null || a(H), H.defaultPrevented || s == null || s());
    }, h);
    return Id((H) => {
      w === c.layers.size - 1 && (r == null || r(H), !H.defaultPrevented && s && (H.preventDefault(), s()));
    }, h), g.useEffect(() => {
      if (f)
        return n && (c.layersWithOutsidePointerEventsDisabled.size === 0 && (Va = h.body.style.pointerEvents, h.body.style.pointerEvents = "none"), c.layersWithOutsidePointerEventsDisabled.add(f)), c.layers.add(f), Xa(), () => {
          n && c.layersWithOutsidePointerEventsDisabled.size === 1 && (h.body.style.pointerEvents = Va);
        };
    }, [f, h, n, c]), g.useEffect(() => () => {
      f && (c.layers.delete(f), c.layersWithOutsidePointerEventsDisabled.delete(f), Xa());
    }, [f, c]), g.useEffect(() => {
      const H = () => v({});
      return document.addEventListener(ci, H), () => document.removeEventListener(ci, H);
    }, []), /* @__PURE__ */ d(
      lt.div,
      {
        ...l,
        ref: T,
        style: {
          pointerEvents: k ? D ? "auto" : "none" : void 0,
          ...e.style
        },
        onFocusCapture: Ye(e.onFocusCapture, q.onFocusCapture),
        onBlurCapture: Ye(e.onBlurCapture, q.onBlurCapture),
        onPointerDownCapture: Ye(
          e.onPointerDownCapture,
          j.onPointerDownCapture
        )
      }
    );
  }
);
bo.displayName = $d;
var Hd = "DismissableLayerBranch", zd = g.forwardRef((e, t) => {
  const n = g.useContext(Cl), r = g.useRef(null), o = mt(t, r);
  return g.useEffect(() => {
    const i = r.current;
    if (i)
      return n.branches.add(i), () => {
        n.branches.delete(i);
      };
  }, [n.branches]), /* @__PURE__ */ d(lt.div, { ...e, ref: o });
});
zd.displayName = Hd;
function Wd(e, t = globalThis == null ? void 0 : globalThis.document) {
  const n = _n(e), r = g.useRef(!1), o = g.useRef(() => {
  });
  return g.useEffect(() => {
    const i = (s) => {
      if (s.target && !r.current) {
        let l = function() {
          xl(
            Bd,
            n,
            c,
            { discrete: !0 }
          );
        };
        const c = { originalEvent: s };
        s.pointerType === "touch" ? (t.removeEventListener("click", o.current), o.current = l, t.addEventListener("click", o.current, { once: !0 })) : l();
      } else
        t.removeEventListener("click", o.current);
      r.current = !1;
    }, a = window.setTimeout(() => {
      t.addEventListener("pointerdown", i);
    }, 0);
    return () => {
      window.clearTimeout(a), t.removeEventListener("pointerdown", i), t.removeEventListener("click", o.current);
    };
  }, [t, n]), {
    // ensures we check React component tree (not just DOM tree)
    onPointerDownCapture: () => r.current = !0
  };
}
function jd(e, t = globalThis == null ? void 0 : globalThis.document) {
  const n = _n(e), r = g.useRef(!1);
  return g.useEffect(() => {
    const o = (i) => {
      i.target && !r.current && xl(Fd, n, { originalEvent: i }, {
        discrete: !1
      });
    };
    return t.addEventListener("focusin", o), () => t.removeEventListener("focusin", o);
  }, [t, n]), {
    onFocusCapture: () => r.current = !0,
    onBlurCapture: () => r.current = !1
  };
}
function Xa() {
  const e = new CustomEvent(ci);
  document.dispatchEvent(e);
}
function xl(e, t, n, { discrete: r }) {
  const o = n.originalEvent.target, i = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: n });
  t && o.addEventListener(e, t, { once: !0 }), r ? Dd(o, i) : o.dispatchEvent(i);
}
var qo = 0;
function El() {
  g.useEffect(() => {
    const e = document.querySelectorAll("[data-radix-focus-guard]");
    return document.body.insertAdjacentElement("afterbegin", e[0] ?? Ka()), document.body.insertAdjacentElement("beforeend", e[1] ?? Ka()), qo++, () => {
      qo === 1 && document.querySelectorAll("[data-radix-focus-guard]").forEach((t) => t.remove()), qo--;
    };
  }, []);
}
function Ka() {
  const e = document.createElement("span");
  return e.setAttribute("data-radix-focus-guard", ""), e.tabIndex = 0, e.style.outline = "none", e.style.opacity = "0", e.style.position = "fixed", e.style.pointerEvents = "none", e;
}
var Vo = "focusScope.autoFocusOnMount", Xo = "focusScope.autoFocusOnUnmount", Ga = { bubbles: !1, cancelable: !0 }, Ud = "FocusScope", Mi = g.forwardRef((e, t) => {
  const {
    loop: n = !1,
    trapped: r = !1,
    onMountAutoFocus: o,
    onUnmountAutoFocus: i,
    ...a
  } = e, [s, l] = g.useState(null), c = _n(o), f = _n(i), p = g.useRef(null), h = mt(t, (b) => l(b)), v = g.useRef({
    paused: !1,
    pause() {
      this.paused = !0;
    },
    resume() {
      this.paused = !1;
    }
  }).current;
  g.useEffect(() => {
    if (r) {
      let b = function(k) {
        if (v.paused || !s) return;
        const D = k.target;
        s.contains(D) ? p.current = D : dn(p.current, { select: !0 });
      }, E = function(k) {
        if (v.paused || !s) return;
        const D = k.relatedTarget;
        D !== null && (s.contains(D) || dn(p.current, { select: !0 }));
      }, x = function(k) {
        if (document.activeElement === document.body)
          for (const j of k)
            j.removedNodes.length > 0 && dn(s);
      };
      document.addEventListener("focusin", b), document.addEventListener("focusout", E);
      const w = new MutationObserver(x);
      return s && w.observe(s, { childList: !0, subtree: !0 }), () => {
        document.removeEventListener("focusin", b), document.removeEventListener("focusout", E), w.disconnect();
      };
    }
  }, [r, s, v.paused]), g.useEffect(() => {
    if (s) {
      Qa.add(v);
      const b = document.activeElement;
      if (!s.contains(b)) {
        const x = new CustomEvent(Vo, Ga);
        s.addEventListener(Vo, c), s.dispatchEvent(x), x.defaultPrevented || (qd(Yd(Tl(s)), { select: !0 }), document.activeElement === b && dn(s));
      }
      return () => {
        s.removeEventListener(Vo, c), setTimeout(() => {
          const x = new CustomEvent(Xo, Ga);
          s.addEventListener(Xo, f), s.dispatchEvent(x), x.defaultPrevented || dn(b ?? document.body, { select: !0 }), s.removeEventListener(Xo, f), Qa.remove(v);
        }, 0);
      };
    }
  }, [s, c, f, v]);
  const T = g.useCallback(
    (b) => {
      if (!n && !r || v.paused) return;
      const E = b.key === "Tab" && !b.altKey && !b.ctrlKey && !b.metaKey, x = document.activeElement;
      if (E && x) {
        const w = b.currentTarget, [k, D] = Vd(w);
        k && D ? !b.shiftKey && x === D ? (b.preventDefault(), n && dn(k, { select: !0 })) : b.shiftKey && x === k && (b.preventDefault(), n && dn(D, { select: !0 })) : x === w && b.preventDefault();
      }
    },
    [n, r, v.paused]
  );
  return /* @__PURE__ */ d(lt.div, { tabIndex: -1, ...a, ref: h, onKeyDown: T });
});
Mi.displayName = Ud;
function qd(e, { select: t = !1 } = {}) {
  const n = document.activeElement;
  for (const r of e)
    if (dn(r, { select: t }), document.activeElement !== n) return;
}
function Vd(e) {
  const t = Tl(e), n = Ya(t, e), r = Ya(t.reverse(), e);
  return [n, r];
}
function Tl(e) {
  const t = [], n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (r) => {
      const o = r.tagName === "INPUT" && r.type === "hidden";
      return r.disabled || r.hidden || o ? NodeFilter.FILTER_SKIP : r.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  for (; n.nextNode(); ) t.push(n.currentNode);
  return t;
}
function Ya(e, t) {
  for (const n of e)
    if (!Xd(n, { upTo: t })) return n;
}
function Xd(e, { upTo: t }) {
  if (getComputedStyle(e).visibility === "hidden") return !0;
  for (; e; ) {
    if (t !== void 0 && e === t) return !1;
    if (getComputedStyle(e).display === "none") return !0;
    e = e.parentElement;
  }
  return !1;
}
function Kd(e) {
  return e instanceof HTMLInputElement && "select" in e;
}
function dn(e, { select: t = !1 } = {}) {
  if (e && e.focus) {
    const n = document.activeElement;
    e.focus({ preventScroll: !0 }), e !== n && Kd(e) && t && e.select();
  }
}
var Qa = Gd();
function Gd() {
  let e = [];
  return {
    add(t) {
      const n = e[0];
      t !== n && (n == null || n.pause()), e = Za(e, t), e.unshift(t);
    },
    remove(t) {
      var n;
      e = Za(e, t), (n = e[0]) == null || n.resume();
    }
  };
}
function Za(e, t) {
  const n = [...e], r = n.indexOf(t);
  return r !== -1 && n.splice(r, 1), n;
}
function Yd(e) {
  return e.filter((t) => t.tagName !== "A");
}
var St = globalThis != null && globalThis.document ? g.useLayoutEffect : () => {
}, Qd = g[" useId ".trim().toString()] || (() => {
}), Zd = 0;
function _r(e) {
  const [t, n] = g.useState(Qd());
  return St(() => {
    n((r) => r ?? String(Zd++));
  }, [e]), e || (t ? `radix-${t}` : "");
}
const Jd = ["top", "right", "bottom", "left"], mn = Math.min, Dt = Math.max, ro = Math.round, Ur = Math.floor, Qt = (e) => ({
  x: e,
  y: e
}), ef = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function ui(e, t, n) {
  return Dt(e, mn(t, n));
}
function on(e, t) {
  return typeof e == "function" ? e(t) : e;
}
function an(e) {
  return e.split("-")[0];
}
function rr(e) {
  return e.split("-")[1];
}
function Oi(e) {
  return e === "x" ? "y" : "x";
}
function Di(e) {
  return e === "y" ? "height" : "width";
}
function Yt(e) {
  const t = e[0];
  return t === "t" || t === "b" ? "y" : "x";
}
function Ii(e) {
  return Oi(Yt(e));
}
function tf(e, t, n) {
  n === void 0 && (n = !1);
  const r = rr(e), o = Ii(e), i = Di(o);
  let a = o === "x" ? r === (n ? "end" : "start") ? "right" : "left" : r === "start" ? "bottom" : "top";
  return t.reference[i] > t.floating[i] && (a = oo(a)), [a, oo(a)];
}
function nf(e) {
  const t = oo(e);
  return [di(e), t, di(t)];
}
function di(e) {
  return e.includes("start") ? e.replace("start", "end") : e.replace("end", "start");
}
const Ja = ["left", "right"], es = ["right", "left"], rf = ["top", "bottom"], of = ["bottom", "top"];
function af(e, t, n) {
  switch (e) {
    case "top":
    case "bottom":
      return n ? t ? es : Ja : t ? Ja : es;
    case "left":
    case "right":
      return t ? rf : of;
    default:
      return [];
  }
}
function sf(e, t, n, r) {
  const o = rr(e);
  let i = af(an(e), n === "start", r);
  return o && (i = i.map((a) => a + "-" + o), t && (i = i.concat(i.map(di)))), i;
}
function oo(e) {
  const t = an(e);
  return ef[t] + e.slice(t.length);
}
function lf(e) {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...e
  };
}
function Nl(e) {
  return typeof e != "number" ? lf(e) : {
    top: e,
    right: e,
    bottom: e,
    left: e
  };
}
function io(e) {
  const {
    x: t,
    y: n,
    width: r,
    height: o
  } = e;
  return {
    width: r,
    height: o,
    top: n,
    left: t,
    right: t + r,
    bottom: n + o,
    x: t,
    y: n
  };
}
function ts(e, t, n) {
  let {
    reference: r,
    floating: o
  } = e;
  const i = Yt(t), a = Ii(t), s = Di(a), l = an(t), c = i === "y", f = r.x + r.width / 2 - o.width / 2, p = r.y + r.height / 2 - o.height / 2, h = r[s] / 2 - o[s] / 2;
  let v;
  switch (l) {
    case "top":
      v = {
        x: f,
        y: r.y - o.height
      };
      break;
    case "bottom":
      v = {
        x: f,
        y: r.y + r.height
      };
      break;
    case "right":
      v = {
        x: r.x + r.width,
        y: p
      };
      break;
    case "left":
      v = {
        x: r.x - o.width,
        y: p
      };
      break;
    default:
      v = {
        x: r.x,
        y: r.y
      };
  }
  switch (rr(t)) {
    case "start":
      v[a] -= h * (n && c ? -1 : 1);
      break;
    case "end":
      v[a] += h * (n && c ? -1 : 1);
      break;
  }
  return v;
}
async function cf(e, t) {
  var n;
  t === void 0 && (t = {});
  const {
    x: r,
    y: o,
    platform: i,
    rects: a,
    elements: s,
    strategy: l
  } = e, {
    boundary: c = "clippingAncestors",
    rootBoundary: f = "viewport",
    elementContext: p = "floating",
    altBoundary: h = !1,
    padding: v = 0
  } = on(t, e), T = Nl(v), E = s[h ? p === "floating" ? "reference" : "floating" : p], x = io(await i.getClippingRect({
    element: (n = await (i.isElement == null ? void 0 : i.isElement(E))) == null || n ? E : E.contextElement || await (i.getDocumentElement == null ? void 0 : i.getDocumentElement(s.floating)),
    boundary: c,
    rootBoundary: f,
    strategy: l
  })), w = p === "floating" ? {
    x: r,
    y: o,
    width: a.floating.width,
    height: a.floating.height
  } : a.reference, k = await (i.getOffsetParent == null ? void 0 : i.getOffsetParent(s.floating)), D = await (i.isElement == null ? void 0 : i.isElement(k)) ? await (i.getScale == null ? void 0 : i.getScale(k)) || {
    x: 1,
    y: 1
  } : {
    x: 1,
    y: 1
  }, j = io(i.convertOffsetParentRelativeRectToViewportRelativeRect ? await i.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: s,
    rect: w,
    offsetParent: k,
    strategy: l
  }) : w);
  return {
    top: (x.top - j.top + T.top) / D.y,
    bottom: (j.bottom - x.bottom + T.bottom) / D.y,
    left: (x.left - j.left + T.left) / D.x,
    right: (j.right - x.right + T.right) / D.x
  };
}
const uf = 50, df = async (e, t, n) => {
  const {
    placement: r = "bottom",
    strategy: o = "absolute",
    middleware: i = [],
    platform: a
  } = n, s = a.detectOverflow ? a : {
    ...a,
    detectOverflow: cf
  }, l = await (a.isRTL == null ? void 0 : a.isRTL(t));
  let c = await a.getElementRects({
    reference: e,
    floating: t,
    strategy: o
  }), {
    x: f,
    y: p
  } = ts(c, r, l), h = r, v = 0;
  const T = {};
  for (let b = 0; b < i.length; b++) {
    const E = i[b];
    if (!E)
      continue;
    const {
      name: x,
      fn: w
    } = E, {
      x: k,
      y: D,
      data: j,
      reset: q
    } = await w({
      x: f,
      y: p,
      initialPlacement: r,
      placement: h,
      strategy: o,
      middlewareData: T,
      rects: c,
      platform: s,
      elements: {
        reference: e,
        floating: t
      }
    });
    f = k ?? f, p = D ?? p, T[x] = {
      ...T[x],
      ...j
    }, q && v < uf && (v++, typeof q == "object" && (q.placement && (h = q.placement), q.rects && (c = q.rects === !0 ? await a.getElementRects({
      reference: e,
      floating: t,
      strategy: o
    }) : q.rects), {
      x: f,
      y: p
    } = ts(c, h, l)), b = -1);
  }
  return {
    x: f,
    y: p,
    placement: h,
    strategy: o,
    middlewareData: T
  };
}, ff = (e) => ({
  name: "arrow",
  options: e,
  async fn(t) {
    const {
      x: n,
      y: r,
      placement: o,
      rects: i,
      platform: a,
      elements: s,
      middlewareData: l
    } = t, {
      element: c,
      padding: f = 0
    } = on(e, t) || {};
    if (c == null)
      return {};
    const p = Nl(f), h = {
      x: n,
      y: r
    }, v = Ii(o), T = Di(v), b = await a.getDimensions(c), E = v === "y", x = E ? "top" : "left", w = E ? "bottom" : "right", k = E ? "clientHeight" : "clientWidth", D = i.reference[T] + i.reference[v] - h[v] - i.floating[T], j = h[v] - i.reference[v], q = await (a.getOffsetParent == null ? void 0 : a.getOffsetParent(c));
    let H = q ? q[k] : 0;
    (!H || !await (a.isElement == null ? void 0 : a.isElement(q))) && (H = s.floating[k] || i.floating[T]);
    const Q = D / 2 - j / 2, be = H / 2 - b[T] / 2 - 1, ke = mn(p[x], be), we = mn(p[w], be), $e = ke, Re = H - b[T] - we, Me = H / 2 - b[T] / 2 + Q, V = ui($e, Me, Re), ve = !l.arrow && rr(o) != null && Me !== V && i.reference[T] / 2 - (Me < $e ? ke : we) - b[T] / 2 < 0, _e = ve ? Me < $e ? Me - $e : Me - Re : 0;
    return {
      [v]: h[v] + _e,
      data: {
        [v]: V,
        centerOffset: Me - V - _e,
        ...ve && {
          alignmentOffset: _e
        }
      },
      reset: ve
    };
  }
}), pf = function(e) {
  return e === void 0 && (e = {}), {
    name: "flip",
    options: e,
    async fn(t) {
      var n, r;
      const {
        placement: o,
        middlewareData: i,
        rects: a,
        initialPlacement: s,
        platform: l,
        elements: c
      } = t, {
        mainAxis: f = !0,
        crossAxis: p = !0,
        fallbackPlacements: h,
        fallbackStrategy: v = "bestFit",
        fallbackAxisSideDirection: T = "none",
        flipAlignment: b = !0,
        ...E
      } = on(e, t);
      if ((n = i.arrow) != null && n.alignmentOffset)
        return {};
      const x = an(o), w = Yt(s), k = an(s) === s, D = await (l.isRTL == null ? void 0 : l.isRTL(c.floating)), j = h || (k || !b ? [oo(s)] : nf(s)), q = T !== "none";
      !h && q && j.push(...sf(s, b, T, D));
      const H = [s, ...j], Q = await l.detectOverflow(t, E), be = [];
      let ke = ((r = i.flip) == null ? void 0 : r.overflows) || [];
      if (f && be.push(Q[x]), p) {
        const Me = tf(o, a, D);
        be.push(Q[Me[0]], Q[Me[1]]);
      }
      if (ke = [...ke, {
        placement: o,
        overflows: be
      }], !be.every((Me) => Me <= 0)) {
        var we, $e;
        const Me = (((we = i.flip) == null ? void 0 : we.index) || 0) + 1, V = H[Me];
        if (V && (!(p === "alignment" ? w !== Yt(V) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        ke.every((de) => Yt(de.placement) === w ? de.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Me,
              overflows: ke
            },
            reset: {
              placement: V
            }
          };
        let ve = ($e = ke.filter((_e) => _e.overflows[0] <= 0).sort((_e, de) => _e.overflows[1] - de.overflows[1])[0]) == null ? void 0 : $e.placement;
        if (!ve)
          switch (v) {
            case "bestFit": {
              var Re;
              const _e = (Re = ke.filter((de) => {
                if (q) {
                  const Le = Yt(de.placement);
                  return Le === w || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  Le === "y";
                }
                return !0;
              }).map((de) => [de.placement, de.overflows.filter((Le) => Le > 0).reduce((Le, Ve) => Le + Ve, 0)]).sort((de, Le) => de[1] - Le[1])[0]) == null ? void 0 : Re[0];
              _e && (ve = _e);
              break;
            }
            case "initialPlacement":
              ve = s;
              break;
          }
        if (o !== ve)
          return {
            reset: {
              placement: ve
            }
          };
      }
      return {};
    }
  };
};
function ns(e, t) {
  return {
    top: e.top - t.height,
    right: e.right - t.width,
    bottom: e.bottom - t.height,
    left: e.left - t.width
  };
}
function rs(e) {
  return Jd.some((t) => e[t] >= 0);
}
const mf = function(e) {
  return e === void 0 && (e = {}), {
    name: "hide",
    options: e,
    async fn(t) {
      const {
        rects: n,
        platform: r
      } = t, {
        strategy: o = "referenceHidden",
        ...i
      } = on(e, t);
      switch (o) {
        case "referenceHidden": {
          const a = await r.detectOverflow(t, {
            ...i,
            elementContext: "reference"
          }), s = ns(a, n.reference);
          return {
            data: {
              referenceHiddenOffsets: s,
              referenceHidden: rs(s)
            }
          };
        }
        case "escaped": {
          const a = await r.detectOverflow(t, {
            ...i,
            altBoundary: !0
          }), s = ns(a, n.floating);
          return {
            data: {
              escapedOffsets: s,
              escaped: rs(s)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, Sl = /* @__PURE__ */ new Set(["left", "top"]);
async function gf(e, t) {
  const {
    placement: n,
    platform: r,
    elements: o
  } = e, i = await (r.isRTL == null ? void 0 : r.isRTL(o.floating)), a = an(n), s = rr(n), l = Yt(n) === "y", c = Sl.has(a) ? -1 : 1, f = i && l ? -1 : 1, p = on(t, e);
  let {
    mainAxis: h,
    crossAxis: v,
    alignmentAxis: T
  } = typeof p == "number" ? {
    mainAxis: p,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: p.mainAxis || 0,
    crossAxis: p.crossAxis || 0,
    alignmentAxis: p.alignmentAxis
  };
  return s && typeof T == "number" && (v = s === "end" ? T * -1 : T), l ? {
    x: v * f,
    y: h * c
  } : {
    x: h * c,
    y: v * f
  };
}
const hf = function(e) {
  return e === void 0 && (e = 0), {
    name: "offset",
    options: e,
    async fn(t) {
      var n, r;
      const {
        x: o,
        y: i,
        placement: a,
        middlewareData: s
      } = t, l = await gf(t, e);
      return a === ((n = s.offset) == null ? void 0 : n.placement) && (r = s.arrow) != null && r.alignmentOffset ? {} : {
        x: o + l.x,
        y: i + l.y,
        data: {
          ...l,
          placement: a
        }
      };
    }
  };
}, bf = function(e) {
  return e === void 0 && (e = {}), {
    name: "shift",
    options: e,
    async fn(t) {
      const {
        x: n,
        y: r,
        placement: o,
        platform: i
      } = t, {
        mainAxis: a = !0,
        crossAxis: s = !1,
        limiter: l = {
          fn: (x) => {
            let {
              x: w,
              y: k
            } = x;
            return {
              x: w,
              y: k
            };
          }
        },
        ...c
      } = on(e, t), f = {
        x: n,
        y: r
      }, p = await i.detectOverflow(t, c), h = Yt(an(o)), v = Oi(h);
      let T = f[v], b = f[h];
      if (a) {
        const x = v === "y" ? "top" : "left", w = v === "y" ? "bottom" : "right", k = T + p[x], D = T - p[w];
        T = ui(k, T, D);
      }
      if (s) {
        const x = h === "y" ? "top" : "left", w = h === "y" ? "bottom" : "right", k = b + p[x], D = b - p[w];
        b = ui(k, b, D);
      }
      const E = l.fn({
        ...t,
        [v]: T,
        [h]: b
      });
      return {
        ...E,
        data: {
          x: E.x - n,
          y: E.y - r,
          enabled: {
            [v]: a,
            [h]: s
          }
        }
      };
    }
  };
}, yf = function(e) {
  return e === void 0 && (e = {}), {
    options: e,
    fn(t) {
      const {
        x: n,
        y: r,
        placement: o,
        rects: i,
        middlewareData: a
      } = t, {
        offset: s = 0,
        mainAxis: l = !0,
        crossAxis: c = !0
      } = on(e, t), f = {
        x: n,
        y: r
      }, p = Yt(o), h = Oi(p);
      let v = f[h], T = f[p];
      const b = on(s, t), E = typeof b == "number" ? {
        mainAxis: b,
        crossAxis: 0
      } : {
        mainAxis: 0,
        crossAxis: 0,
        ...b
      };
      if (l) {
        const k = h === "y" ? "height" : "width", D = i.reference[h] - i.floating[k] + E.mainAxis, j = i.reference[h] + i.reference[k] - E.mainAxis;
        v < D ? v = D : v > j && (v = j);
      }
      if (c) {
        var x, w;
        const k = h === "y" ? "width" : "height", D = Sl.has(an(o)), j = i.reference[p] - i.floating[k] + (D && ((x = a.offset) == null ? void 0 : x[p]) || 0) + (D ? 0 : E.crossAxis), q = i.reference[p] + i.reference[k] + (D ? 0 : ((w = a.offset) == null ? void 0 : w[p]) || 0) - (D ? E.crossAxis : 0);
        T < j ? T = j : T > q && (T = q);
      }
      return {
        [h]: v,
        [p]: T
      };
    }
  };
}, wf = function(e) {
  return e === void 0 && (e = {}), {
    name: "size",
    options: e,
    async fn(t) {
      var n, r;
      const {
        placement: o,
        rects: i,
        platform: a,
        elements: s
      } = t, {
        apply: l = () => {
        },
        ...c
      } = on(e, t), f = await a.detectOverflow(t, c), p = an(o), h = rr(o), v = Yt(o) === "y", {
        width: T,
        height: b
      } = i.floating;
      let E, x;
      p === "top" || p === "bottom" ? (E = p, x = h === (await (a.isRTL == null ? void 0 : a.isRTL(s.floating)) ? "start" : "end") ? "left" : "right") : (x = p, E = h === "end" ? "top" : "bottom");
      const w = b - f.top - f.bottom, k = T - f.left - f.right, D = mn(b - f[E], w), j = mn(T - f[x], k), q = !t.middlewareData.shift;
      let H = D, Q = j;
      if ((n = t.middlewareData.shift) != null && n.enabled.x && (Q = k), (r = t.middlewareData.shift) != null && r.enabled.y && (H = w), q && !h) {
        const ke = Dt(f.left, 0), we = Dt(f.right, 0), $e = Dt(f.top, 0), Re = Dt(f.bottom, 0);
        v ? Q = T - 2 * (ke !== 0 || we !== 0 ? ke + we : Dt(f.left, f.right)) : H = b - 2 * ($e !== 0 || Re !== 0 ? $e + Re : Dt(f.top, f.bottom));
      }
      await l({
        ...t,
        availableWidth: Q,
        availableHeight: H
      });
      const be = await a.getDimensions(s.floating);
      return T !== be.width || b !== be.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function yo() {
  return typeof window < "u";
}
function or(e) {
  return Al(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function It(e) {
  var t;
  return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function Zt(e) {
  var t;
  return (t = (Al(e) ? e.ownerDocument : e.document) || window.document) == null ? void 0 : t.documentElement;
}
function Al(e) {
  return yo() ? e instanceof Node || e instanceof It(e).Node : !1;
}
function qt(e) {
  return yo() ? e instanceof Element || e instanceof It(e).Element : !1;
}
function sn(e) {
  return yo() ? e instanceof HTMLElement || e instanceof It(e).HTMLElement : !1;
}
function os(e) {
  return !yo() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof It(e).ShadowRoot;
}
function Lr(e) {
  const {
    overflow: t,
    overflowX: n,
    overflowY: r,
    display: o
  } = Vt(e);
  return /auto|scroll|overlay|hidden|clip/.test(t + r + n) && o !== "inline" && o !== "contents";
}
function vf(e) {
  return /^(table|td|th)$/.test(or(e));
}
function wo(e) {
  try {
    if (e.matches(":popover-open"))
      return !0;
  } catch {
  }
  try {
    return e.matches(":modal");
  } catch {
    return !1;
  }
}
const Cf = /transform|translate|scale|rotate|perspective|filter/, xf = /paint|layout|strict|content/, kn = (e) => !!e && e !== "none";
let Ko;
function $i(e) {
  const t = qt(e) ? Vt(e) : e;
  return kn(t.transform) || kn(t.translate) || kn(t.scale) || kn(t.rotate) || kn(t.perspective) || !Bi() && (kn(t.backdropFilter) || kn(t.filter)) || Cf.test(t.willChange || "") || xf.test(t.contain || "");
}
function Ef(e) {
  let t = gn(e);
  for (; sn(t) && !Jn(t); ) {
    if ($i(t))
      return t;
    if (wo(t))
      return null;
    t = gn(t);
  }
  return null;
}
function Bi() {
  return Ko == null && (Ko = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Ko;
}
function Jn(e) {
  return /^(html|body|#document)$/.test(or(e));
}
function Vt(e) {
  return It(e).getComputedStyle(e);
}
function vo(e) {
  return qt(e) ? {
    scrollLeft: e.scrollLeft,
    scrollTop: e.scrollTop
  } : {
    scrollLeft: e.scrollX,
    scrollTop: e.scrollY
  };
}
function gn(e) {
  if (or(e) === "html")
    return e;
  const t = (
    // Step into the shadow DOM of the parent of a slotted node.
    e.assignedSlot || // DOM Element detected.
    e.parentNode || // ShadowRoot detected.
    os(e) && e.host || // Fallback.
    Zt(e)
  );
  return os(t) ? t.host : t;
}
function kl(e) {
  const t = gn(e);
  return Jn(t) ? e.ownerDocument ? e.ownerDocument.body : e.body : sn(t) && Lr(t) ? t : kl(t);
}
function xr(e, t, n) {
  var r;
  t === void 0 && (t = []), n === void 0 && (n = !0);
  const o = kl(e), i = o === ((r = e.ownerDocument) == null ? void 0 : r.body), a = It(o);
  if (i) {
    const s = fi(a);
    return t.concat(a, a.visualViewport || [], Lr(o) ? o : [], s && n ? xr(s) : []);
  } else
    return t.concat(o, xr(o, [], n));
}
function fi(e) {
  return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
function Rl(e) {
  const t = Vt(e);
  let n = parseFloat(t.width) || 0, r = parseFloat(t.height) || 0;
  const o = sn(e), i = o ? e.offsetWidth : n, a = o ? e.offsetHeight : r, s = ro(n) !== i || ro(r) !== a;
  return s && (n = i, r = a), {
    width: n,
    height: r,
    $: s
  };
}
function Fi(e) {
  return qt(e) ? e : e.contextElement;
}
function Gn(e) {
  const t = Fi(e);
  if (!sn(t))
    return Qt(1);
  const n = t.getBoundingClientRect(), {
    width: r,
    height: o,
    $: i
  } = Rl(t);
  let a = (i ? ro(n.width) : n.width) / r, s = (i ? ro(n.height) : n.height) / o;
  return (!a || !Number.isFinite(a)) && (a = 1), (!s || !Number.isFinite(s)) && (s = 1), {
    x: a,
    y: s
  };
}
const Tf = /* @__PURE__ */ Qt(0);
function _l(e) {
  const t = It(e);
  return !Bi() || !t.visualViewport ? Tf : {
    x: t.visualViewport.offsetLeft,
    y: t.visualViewport.offsetTop
  };
}
function Nf(e, t, n) {
  return t === void 0 && (t = !1), !n || t && n !== It(e) ? !1 : t;
}
function Ln(e, t, n, r) {
  t === void 0 && (t = !1), n === void 0 && (n = !1);
  const o = e.getBoundingClientRect(), i = Fi(e);
  let a = Qt(1);
  t && (r ? qt(r) && (a = Gn(r)) : a = Gn(e));
  const s = Nf(i, n, r) ? _l(i) : Qt(0);
  let l = (o.left + s.x) / a.x, c = (o.top + s.y) / a.y, f = o.width / a.x, p = o.height / a.y;
  if (i) {
    const h = It(i), v = r && qt(r) ? It(r) : r;
    let T = h, b = fi(T);
    for (; b && r && v !== T; ) {
      const E = Gn(b), x = b.getBoundingClientRect(), w = Vt(b), k = x.left + (b.clientLeft + parseFloat(w.paddingLeft)) * E.x, D = x.top + (b.clientTop + parseFloat(w.paddingTop)) * E.y;
      l *= E.x, c *= E.y, f *= E.x, p *= E.y, l += k, c += D, T = It(b), b = fi(T);
    }
  }
  return io({
    width: f,
    height: p,
    x: l,
    y: c
  });
}
function Co(e, t) {
  const n = vo(e).scrollLeft;
  return t ? t.left + n : Ln(Zt(e)).left + n;
}
function Ll(e, t) {
  const n = e.getBoundingClientRect(), r = n.left + t.scrollLeft - Co(e, n), o = n.top + t.scrollTop;
  return {
    x: r,
    y: o
  };
}
function Sf(e) {
  let {
    elements: t,
    rect: n,
    offsetParent: r,
    strategy: o
  } = e;
  const i = o === "fixed", a = Zt(r), s = t ? wo(t.floating) : !1;
  if (r === a || s && i)
    return n;
  let l = {
    scrollLeft: 0,
    scrollTop: 0
  }, c = Qt(1);
  const f = Qt(0), p = sn(r);
  if ((p || !p && !i) && ((or(r) !== "body" || Lr(a)) && (l = vo(r)), p)) {
    const v = Ln(r);
    c = Gn(r), f.x = v.x + r.clientLeft, f.y = v.y + r.clientTop;
  }
  const h = a && !p && !i ? Ll(a, l) : Qt(0);
  return {
    width: n.width * c.x,
    height: n.height * c.y,
    x: n.x * c.x - l.scrollLeft * c.x + f.x + h.x,
    y: n.y * c.y - l.scrollTop * c.y + f.y + h.y
  };
}
function Af(e) {
  return Array.from(e.getClientRects());
}
function kf(e) {
  const t = Zt(e), n = vo(e), r = e.ownerDocument.body, o = Dt(t.scrollWidth, t.clientWidth, r.scrollWidth, r.clientWidth), i = Dt(t.scrollHeight, t.clientHeight, r.scrollHeight, r.clientHeight);
  let a = -n.scrollLeft + Co(e);
  const s = -n.scrollTop;
  return Vt(r).direction === "rtl" && (a += Dt(t.clientWidth, r.clientWidth) - o), {
    width: o,
    height: i,
    x: a,
    y: s
  };
}
const is = 25;
function Rf(e, t) {
  const n = It(e), r = Zt(e), o = n.visualViewport;
  let i = r.clientWidth, a = r.clientHeight, s = 0, l = 0;
  if (o) {
    i = o.width, a = o.height;
    const f = Bi();
    (!f || f && t === "fixed") && (s = o.offsetLeft, l = o.offsetTop);
  }
  const c = Co(r);
  if (c <= 0) {
    const f = r.ownerDocument, p = f.body, h = getComputedStyle(p), v = f.compatMode === "CSS1Compat" && parseFloat(h.marginLeft) + parseFloat(h.marginRight) || 0, T = Math.abs(r.clientWidth - p.clientWidth - v);
    T <= is && (i -= T);
  } else c <= is && (i += c);
  return {
    width: i,
    height: a,
    x: s,
    y: l
  };
}
function _f(e, t) {
  const n = Ln(e, !0, t === "fixed"), r = n.top + e.clientTop, o = n.left + e.clientLeft, i = sn(e) ? Gn(e) : Qt(1), a = e.clientWidth * i.x, s = e.clientHeight * i.y, l = o * i.x, c = r * i.y;
  return {
    width: a,
    height: s,
    x: l,
    y: c
  };
}
function as(e, t, n) {
  let r;
  if (t === "viewport")
    r = Rf(e, n);
  else if (t === "document")
    r = kf(Zt(e));
  else if (qt(t))
    r = _f(t, n);
  else {
    const o = _l(e);
    r = {
      x: t.x - o.x,
      y: t.y - o.y,
      width: t.width,
      height: t.height
    };
  }
  return io(r);
}
function Pl(e, t) {
  const n = gn(e);
  return n === t || !qt(n) || Jn(n) ? !1 : Vt(n).position === "fixed" || Pl(n, t);
}
function Lf(e, t) {
  const n = t.get(e);
  if (n)
    return n;
  let r = xr(e, [], !1).filter((s) => qt(s) && or(s) !== "body"), o = null;
  const i = Vt(e).position === "fixed";
  let a = i ? gn(e) : e;
  for (; qt(a) && !Jn(a); ) {
    const s = Vt(a), l = $i(a);
    !l && s.position === "fixed" && (o = null), (i ? !l && !o : !l && s.position === "static" && !!o && (o.position === "absolute" || o.position === "fixed") || Lr(a) && !l && Pl(e, a)) ? r = r.filter((f) => f !== a) : o = s, a = gn(a);
  }
  return t.set(e, r), r;
}
function Pf(e) {
  let {
    element: t,
    boundary: n,
    rootBoundary: r,
    strategy: o
  } = e;
  const a = [...n === "clippingAncestors" ? wo(t) ? [] : Lf(t, this._c) : [].concat(n), r], s = as(t, a[0], o);
  let l = s.top, c = s.right, f = s.bottom, p = s.left;
  for (let h = 1; h < a.length; h++) {
    const v = as(t, a[h], o);
    l = Dt(v.top, l), c = mn(v.right, c), f = mn(v.bottom, f), p = Dt(v.left, p);
  }
  return {
    width: c - p,
    height: f - l,
    x: p,
    y: l
  };
}
function Mf(e) {
  const {
    width: t,
    height: n
  } = Rl(e);
  return {
    width: t,
    height: n
  };
}
function Of(e, t, n) {
  const r = sn(t), o = Zt(t), i = n === "fixed", a = Ln(e, !0, i, t);
  let s = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const l = Qt(0);
  function c() {
    l.x = Co(o);
  }
  if (r || !r && !i)
    if ((or(t) !== "body" || Lr(o)) && (s = vo(t)), r) {
      const v = Ln(t, !0, i, t);
      l.x = v.x + t.clientLeft, l.y = v.y + t.clientTop;
    } else o && c();
  i && !r && o && c();
  const f = o && !r && !i ? Ll(o, s) : Qt(0), p = a.left + s.scrollLeft - l.x - f.x, h = a.top + s.scrollTop - l.y - f.y;
  return {
    x: p,
    y: h,
    width: a.width,
    height: a.height
  };
}
function Go(e) {
  return Vt(e).position === "static";
}
function ss(e, t) {
  if (!sn(e) || Vt(e).position === "fixed")
    return null;
  if (t)
    return t(e);
  let n = e.offsetParent;
  return Zt(e) === n && (n = n.ownerDocument.body), n;
}
function Ml(e, t) {
  const n = It(e);
  if (wo(e))
    return n;
  if (!sn(e)) {
    let o = gn(e);
    for (; o && !Jn(o); ) {
      if (qt(o) && !Go(o))
        return o;
      o = gn(o);
    }
    return n;
  }
  let r = ss(e, t);
  for (; r && vf(r) && Go(r); )
    r = ss(r, t);
  return r && Jn(r) && Go(r) && !$i(r) ? n : r || Ef(e) || n;
}
const Df = async function(e) {
  const t = this.getOffsetParent || Ml, n = this.getDimensions, r = await n(e.floating);
  return {
    reference: Of(e.reference, await t(e.floating), e.strategy),
    floating: {
      x: 0,
      y: 0,
      width: r.width,
      height: r.height
    }
  };
};
function If(e) {
  return Vt(e).direction === "rtl";
}
const $f = {
  convertOffsetParentRelativeRectToViewportRelativeRect: Sf,
  getDocumentElement: Zt,
  getClippingRect: Pf,
  getOffsetParent: Ml,
  getElementRects: Df,
  getClientRects: Af,
  getDimensions: Mf,
  getScale: Gn,
  isElement: qt,
  isRTL: If
};
function Ol(e, t) {
  return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function Bf(e, t) {
  let n = null, r;
  const o = Zt(e);
  function i() {
    var s;
    clearTimeout(r), (s = n) == null || s.disconnect(), n = null;
  }
  function a(s, l) {
    s === void 0 && (s = !1), l === void 0 && (l = 1), i();
    const c = e.getBoundingClientRect(), {
      left: f,
      top: p,
      width: h,
      height: v
    } = c;
    if (s || t(), !h || !v)
      return;
    const T = Ur(p), b = Ur(o.clientWidth - (f + h)), E = Ur(o.clientHeight - (p + v)), x = Ur(f), k = {
      rootMargin: -T + "px " + -b + "px " + -E + "px " + -x + "px",
      threshold: Dt(0, mn(1, l)) || 1
    };
    let D = !0;
    function j(q) {
      const H = q[0].intersectionRatio;
      if (H !== l) {
        if (!D)
          return a();
        H ? a(!1, H) : r = setTimeout(() => {
          a(!1, 1e-7);
        }, 1e3);
      }
      H === 1 && !Ol(c, e.getBoundingClientRect()) && a(), D = !1;
    }
    try {
      n = new IntersectionObserver(j, {
        ...k,
        // Handle <iframe>s
        root: o.ownerDocument
      });
    } catch {
      n = new IntersectionObserver(j, k);
    }
    n.observe(e);
  }
  return a(!0), i;
}
function Ff(e, t, n, r) {
  r === void 0 && (r = {});
  const {
    ancestorScroll: o = !0,
    ancestorResize: i = !0,
    elementResize: a = typeof ResizeObserver == "function",
    layoutShift: s = typeof IntersectionObserver == "function",
    animationFrame: l = !1
  } = r, c = Fi(e), f = o || i ? [...c ? xr(c) : [], ...t ? xr(t) : []] : [];
  f.forEach((x) => {
    o && x.addEventListener("scroll", n, {
      passive: !0
    }), i && x.addEventListener("resize", n);
  });
  const p = c && s ? Bf(c, n) : null;
  let h = -1, v = null;
  a && (v = new ResizeObserver((x) => {
    let [w] = x;
    w && w.target === c && v && t && (v.unobserve(t), cancelAnimationFrame(h), h = requestAnimationFrame(() => {
      var k;
      (k = v) == null || k.observe(t);
    })), n();
  }), c && !l && v.observe(c), t && v.observe(t));
  let T, b = l ? Ln(e) : null;
  l && E();
  function E() {
    const x = Ln(e);
    b && !Ol(b, x) && n(), b = x, T = requestAnimationFrame(E);
  }
  return n(), () => {
    var x;
    f.forEach((w) => {
      o && w.removeEventListener("scroll", n), i && w.removeEventListener("resize", n);
    }), p == null || p(), (x = v) == null || x.disconnect(), v = null, l && cancelAnimationFrame(T);
  };
}
const Hf = hf, zf = bf, Wf = pf, jf = wf, Uf = mf, ls = ff, qf = yf, Vf = (e, t, n) => {
  const r = /* @__PURE__ */ new Map(), o = {
    platform: $f,
    ...n
  }, i = {
    ...o.platform,
    _c: r
  };
  return df(e, t, {
    ...o,
    platform: i
  });
};
var Xf = typeof document < "u", Kf = function() {
}, Qr = Xf ? nl : Kf;
function ao(e, t) {
  if (e === t)
    return !0;
  if (typeof e != typeof t)
    return !1;
  if (typeof e == "function" && e.toString() === t.toString())
    return !0;
  let n, r, o;
  if (e && t && typeof e == "object") {
    if (Array.isArray(e)) {
      if (n = e.length, n !== t.length) return !1;
      for (r = n; r-- !== 0; )
        if (!ao(e[r], t[r]))
          return !1;
      return !0;
    }
    if (o = Object.keys(e), n = o.length, n !== Object.keys(t).length)
      return !1;
    for (r = n; r-- !== 0; )
      if (!{}.hasOwnProperty.call(t, o[r]))
        return !1;
    for (r = n; r-- !== 0; ) {
      const i = o[r];
      if (!(i === "_owner" && e.$$typeof) && !ao(e[i], t[i]))
        return !1;
    }
    return !0;
  }
  return e !== e && t !== t;
}
function Dl(e) {
  return typeof window > "u" ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function cs(e, t) {
  const n = Dl(e);
  return Math.round(t * n) / n;
}
function Yo(e) {
  const t = g.useRef(e);
  return Qr(() => {
    t.current = e;
  }), t;
}
function Gf(e) {
  e === void 0 && (e = {});
  const {
    placement: t = "bottom",
    strategy: n = "absolute",
    middleware: r = [],
    platform: o,
    elements: {
      reference: i,
      floating: a
    } = {},
    transform: s = !0,
    whileElementsMounted: l,
    open: c
  } = e, [f, p] = g.useState({
    x: 0,
    y: 0,
    strategy: n,
    placement: t,
    middlewareData: {},
    isPositioned: !1
  }), [h, v] = g.useState(r);
  ao(h, r) || v(r);
  const [T, b] = g.useState(null), [E, x] = g.useState(null), w = g.useCallback((de) => {
    de !== q.current && (q.current = de, b(de));
  }, []), k = g.useCallback((de) => {
    de !== H.current && (H.current = de, x(de));
  }, []), D = i || T, j = a || E, q = g.useRef(null), H = g.useRef(null), Q = g.useRef(f), be = l != null, ke = Yo(l), we = Yo(o), $e = Yo(c), Re = g.useCallback(() => {
    if (!q.current || !H.current)
      return;
    const de = {
      placement: t,
      strategy: n,
      middleware: h
    };
    we.current && (de.platform = we.current), Vf(q.current, H.current, de).then((Le) => {
      const Ve = {
        ...Le,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: $e.current !== !1
      };
      Me.current && !ao(Q.current, Ve) && (Q.current = Ve, ho.flushSync(() => {
        p(Ve);
      }));
    });
  }, [h, t, n, we, $e]);
  Qr(() => {
    c === !1 && Q.current.isPositioned && (Q.current.isPositioned = !1, p((de) => ({
      ...de,
      isPositioned: !1
    })));
  }, [c]);
  const Me = g.useRef(!1);
  Qr(() => (Me.current = !0, () => {
    Me.current = !1;
  }), []), Qr(() => {
    if (D && (q.current = D), j && (H.current = j), D && j) {
      if (ke.current)
        return ke.current(D, j, Re);
      Re();
    }
  }, [D, j, Re, ke, be]);
  const V = g.useMemo(() => ({
    reference: q,
    floating: H,
    setReference: w,
    setFloating: k
  }), [w, k]), ve = g.useMemo(() => ({
    reference: D,
    floating: j
  }), [D, j]), _e = g.useMemo(() => {
    const de = {
      position: n,
      left: 0,
      top: 0
    };
    if (!ve.floating)
      return de;
    const Le = cs(ve.floating, f.x), Ve = cs(ve.floating, f.y);
    return s ? {
      ...de,
      transform: "translate(" + Le + "px, " + Ve + "px)",
      ...Dl(ve.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: n,
      left: Le,
      top: Ve
    };
  }, [n, s, ve.floating, f.x, f.y]);
  return g.useMemo(() => ({
    ...f,
    update: Re,
    refs: V,
    elements: ve,
    floatingStyles: _e
  }), [f, Re, V, ve, _e]);
}
const Yf = (e) => {
  function t(n) {
    return {}.hasOwnProperty.call(n, "current");
  }
  return {
    name: "arrow",
    options: e,
    fn(n) {
      const {
        element: r,
        padding: o
      } = typeof e == "function" ? e(n) : e;
      return r && t(r) ? r.current != null ? ls({
        element: r.current,
        padding: o
      }).fn(n) : {} : r ? ls({
        element: r,
        padding: o
      }).fn(n) : {};
    }
  };
}, Qf = (e, t) => {
  const n = Hf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
}, Zf = (e, t) => {
  const n = zf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
}, Jf = (e, t) => ({
  fn: qf(e).fn,
  options: [e, t]
}), ep = (e, t) => {
  const n = Wf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
}, tp = (e, t) => {
  const n = jf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
}, np = (e, t) => {
  const n = Uf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
}, rp = (e, t) => {
  const n = Yf(e);
  return {
    name: n.name,
    fn: n.fn,
    options: [e, t]
  };
};
var op = "Arrow", Il = g.forwardRef((e, t) => {
  const { children: n, width: r = 10, height: o = 5, ...i } = e;
  return /* @__PURE__ */ d(
    lt.svg,
    {
      ...i,
      ref: t,
      width: r,
      height: o,
      viewBox: "0 0 30 10",
      preserveAspectRatio: "none",
      children: e.asChild ? n : /* @__PURE__ */ d("polygon", { points: "0,0 30,0 15,10" })
    }
  );
});
Il.displayName = op;
var ip = Il;
function ap(e) {
  const [t, n] = g.useState(void 0);
  return St(() => {
    if (e) {
      n({ width: e.offsetWidth, height: e.offsetHeight });
      const r = new ResizeObserver((o) => {
        if (!Array.isArray(o) || !o.length)
          return;
        const i = o[0];
        let a, s;
        if ("borderBoxSize" in i) {
          const l = i.borderBoxSize, c = Array.isArray(l) ? l[0] : l;
          a = c.inlineSize, s = c.blockSize;
        } else
          a = e.offsetWidth, s = e.offsetHeight;
        n({ width: a, height: s });
      });
      return r.observe(e, { box: "border-box" }), () => r.unobserve(e);
    } else
      n(void 0);
  }, [e]), t;
}
var Hi = "Popper", [$l, ir] = Rr(Hi), [sp, Bl] = $l(Hi), Fl = (e) => {
  const { __scopePopper: t, children: n } = e, [r, o] = g.useState(null);
  return /* @__PURE__ */ d(sp, { scope: t, anchor: r, onAnchorChange: o, children: n });
};
Fl.displayName = Hi;
var Hl = "PopperAnchor", zl = g.forwardRef(
  (e, t) => {
    const { __scopePopper: n, virtualRef: r, ...o } = e, i = Bl(Hl, n), a = g.useRef(null), s = mt(t, a), l = g.useRef(null);
    return g.useEffect(() => {
      const c = l.current;
      l.current = (r == null ? void 0 : r.current) || a.current, c !== l.current && i.onAnchorChange(l.current);
    }), r ? null : /* @__PURE__ */ d(lt.div, { ...o, ref: s });
  }
);
zl.displayName = Hl;
var zi = "PopperContent", [lp, cp] = $l(zi), Wl = g.forwardRef(
  (e, t) => {
    var ee, Be, it, Oe, We, I;
    const {
      __scopePopper: n,
      side: r = "bottom",
      sideOffset: o = 0,
      align: i = "center",
      alignOffset: a = 0,
      arrowPadding: s = 0,
      avoidCollisions: l = !0,
      collisionBoundary: c = [],
      collisionPadding: f = 0,
      sticky: p = "partial",
      hideWhenDetached: h = !1,
      updatePositionStrategy: v = "optimized",
      onPlaced: T,
      ...b
    } = e, E = Bl(zi, n), [x, w] = g.useState(null), k = mt(t, (ce) => w(ce)), [D, j] = g.useState(null), q = ap(D), H = (q == null ? void 0 : q.width) ?? 0, Q = (q == null ? void 0 : q.height) ?? 0, be = r + (i !== "center" ? "-" + i : ""), ke = typeof f == "number" ? f : { top: 0, right: 0, bottom: 0, left: 0, ...f }, we = Array.isArray(c) ? c : [c], $e = we.length > 0, Re = {
      padding: ke,
      boundary: we.filter(dp),
      // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
      altBoundary: $e
    }, { refs: Me, floatingStyles: V, placement: ve, isPositioned: _e, middlewareData: de } = Gf({
      // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
      strategy: "fixed",
      placement: be,
      whileElementsMounted: (...ce) => Ff(...ce, {
        animationFrame: v === "always"
      }),
      elements: {
        reference: E.anchor
      },
      middleware: [
        Qf({ mainAxis: o + Q, alignmentAxis: a }),
        l && Zf({
          mainAxis: !0,
          crossAxis: !1,
          limiter: p === "partial" ? Jf() : void 0,
          ...Re
        }),
        l && ep({ ...Re }),
        tp({
          ...Re,
          apply: ({ elements: ce, rects: ue, availableWidth: xe, availableHeight: Et }) => {
            const { width: Ct, height: _t } = ue.reference, kt = ce.floating.style;
            kt.setProperty("--radix-popper-available-width", `${xe}px`), kt.setProperty("--radix-popper-available-height", `${Et}px`), kt.setProperty("--radix-popper-anchor-width", `${Ct}px`), kt.setProperty("--radix-popper-anchor-height", `${_t}px`);
          }
        }),
        D && rp({ element: D, padding: s }),
        fp({ arrowWidth: H, arrowHeight: Q }),
        h && np({ strategy: "referenceHidden", ...Re })
      ]
    }), [Le, Ve] = ql(ve), st = _n(T);
    St(() => {
      _e && (st == null || st());
    }, [_e, st]);
    const et = (ee = de.arrow) == null ? void 0 : ee.x, tt = (Be = de.arrow) == null ? void 0 : Be.y, nt = ((it = de.arrow) == null ? void 0 : it.centerOffset) !== 0, [ot, z] = g.useState();
    return St(() => {
      x && z(window.getComputedStyle(x).zIndex);
    }, [x]), /* @__PURE__ */ d(
      "div",
      {
        ref: Me.setFloating,
        "data-radix-popper-content-wrapper": "",
        style: {
          ...V,
          transform: _e ? V.transform : "translate(0, -200%)",
          // keep off the page when measuring
          minWidth: "max-content",
          zIndex: ot,
          "--radix-popper-transform-origin": [
            (Oe = de.transformOrigin) == null ? void 0 : Oe.x,
            (We = de.transformOrigin) == null ? void 0 : We.y
          ].join(" "),
          // hide the content if using the hide middleware and should be hidden
          // set visibility to hidden and disable pointer events so the UI behaves
          // as if the PopperContent isn't there at all
          ...((I = de.hide) == null ? void 0 : I.referenceHidden) && {
            visibility: "hidden",
            pointerEvents: "none"
          }
        },
        dir: e.dir,
        children: /* @__PURE__ */ d(
          lp,
          {
            scope: n,
            placedSide: Le,
            onArrowChange: j,
            arrowX: et,
            arrowY: tt,
            shouldHideArrow: nt,
            children: /* @__PURE__ */ d(
              lt.div,
              {
                "data-side": Le,
                "data-align": Ve,
                ...b,
                ref: k,
                style: {
                  ...b.style,
                  // if the PopperContent hasn't been placed yet (not all measurements done)
                  // we prevent animations so that users's animation don't kick in too early referring wrong sides
                  animation: _e ? void 0 : "none"
                }
              }
            )
          }
        )
      }
    );
  }
);
Wl.displayName = zi;
var jl = "PopperArrow", up = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right"
}, Ul = g.forwardRef(function(t, n) {
  const { __scopePopper: r, ...o } = t, i = cp(jl, r), a = up[i.placedSide];
  return (
    // we have to use an extra wrapper because `ResizeObserver` (used by `useSize`)
    // doesn't report size as we'd expect on SVG elements.
    // it reports their bounding box which is effectively the largest path inside the SVG.
    /* @__PURE__ */ d(
      "span",
      {
        ref: i.onArrowChange,
        style: {
          position: "absolute",
          left: i.arrowX,
          top: i.arrowY,
          [a]: 0,
          transformOrigin: {
            top: "",
            right: "0 0",
            bottom: "center 0",
            left: "100% 0"
          }[i.placedSide],
          transform: {
            top: "translateY(100%)",
            right: "translateY(50%) rotate(90deg) translateX(-50%)",
            bottom: "rotate(180deg)",
            left: "translateY(50%) rotate(-90deg) translateX(50%)"
          }[i.placedSide],
          visibility: i.shouldHideArrow ? "hidden" : void 0
        },
        children: /* @__PURE__ */ d(
          ip,
          {
            ...o,
            ref: n,
            style: {
              ...o.style,
              // ensures the element can be measured correctly (mostly for if SVG)
              display: "block"
            }
          }
        )
      }
    )
  );
});
Ul.displayName = jl;
function dp(e) {
  return e !== null;
}
var fp = (e) => ({
  name: "transformOrigin",
  options: e,
  fn(t) {
    var E, x, w;
    const { placement: n, rects: r, middlewareData: o } = t, a = ((E = o.arrow) == null ? void 0 : E.centerOffset) !== 0, s = a ? 0 : e.arrowWidth, l = a ? 0 : e.arrowHeight, [c, f] = ql(n), p = { start: "0%", center: "50%", end: "100%" }[f], h = (((x = o.arrow) == null ? void 0 : x.x) ?? 0) + s / 2, v = (((w = o.arrow) == null ? void 0 : w.y) ?? 0) + l / 2;
    let T = "", b = "";
    return c === "bottom" ? (T = a ? p : `${h}px`, b = `${-l}px`) : c === "top" ? (T = a ? p : `${h}px`, b = `${r.floating.height + l}px`) : c === "right" ? (T = `${-l}px`, b = a ? p : `${v}px`) : c === "left" && (T = `${r.floating.width + l}px`, b = a ? p : `${v}px`), { data: { x: T, y: b } };
  }
});
function ql(e) {
  const [t, n = "center"] = e.split("-");
  return [t, n];
}
var Wi = Fl, xo = zl, ji = Wl, Ui = Ul, pp = "Portal", Eo = g.forwardRef((e, t) => {
  var s;
  const { container: n, ...r } = e, [o, i] = g.useState(!1);
  St(() => i(!0), []);
  const a = n || o && ((s = globalThis == null ? void 0 : globalThis.document) == null ? void 0 : s.body);
  return a ? Wu.createPortal(/* @__PURE__ */ d(lt.div, { ...r, ref: t }), a) : null;
});
Eo.displayName = pp;
function mp(e, t) {
  return g.useReducer((n, r) => t[n][r] ?? n, e);
}
var Pr = (e) => {
  const { present: t, children: n } = e, r = gp(t), o = typeof n == "function" ? n({ present: r.isPresent }) : g.Children.only(n), i = mt(r.ref, hp(o));
  return typeof n == "function" || r.isPresent ? g.cloneElement(o, { ref: i }) : null;
};
Pr.displayName = "Presence";
function gp(e) {
  const [t, n] = g.useState(), r = g.useRef(null), o = g.useRef(e), i = g.useRef("none"), a = e ? "mounted" : "unmounted", [s, l] = mp(a, {
    mounted: {
      UNMOUNT: "unmounted",
      ANIMATION_OUT: "unmountSuspended"
    },
    unmountSuspended: {
      MOUNT: "mounted",
      ANIMATION_END: "unmounted"
    },
    unmounted: {
      MOUNT: "mounted"
    }
  });
  return g.useEffect(() => {
    const c = qr(r.current);
    i.current = s === "mounted" ? c : "none";
  }, [s]), St(() => {
    const c = r.current, f = o.current;
    if (f !== e) {
      const h = i.current, v = qr(c);
      e ? l("MOUNT") : v === "none" || (c == null ? void 0 : c.display) === "none" ? l("UNMOUNT") : l(f && h !== v ? "ANIMATION_OUT" : "UNMOUNT"), o.current = e;
    }
  }, [e, l]), St(() => {
    if (t) {
      let c;
      const f = t.ownerDocument.defaultView ?? window, p = (v) => {
        const b = qr(r.current).includes(CSS.escape(v.animationName));
        if (v.target === t && b && (l("ANIMATION_END"), !o.current)) {
          const E = t.style.animationFillMode;
          t.style.animationFillMode = "forwards", c = f.setTimeout(() => {
            t.style.animationFillMode === "forwards" && (t.style.animationFillMode = E);
          });
        }
      }, h = (v) => {
        v.target === t && (i.current = qr(r.current));
      };
      return t.addEventListener("animationstart", h), t.addEventListener("animationcancel", p), t.addEventListener("animationend", p), () => {
        f.clearTimeout(c), t.removeEventListener("animationstart", h), t.removeEventListener("animationcancel", p), t.removeEventListener("animationend", p);
      };
    } else
      l("ANIMATION_END");
  }, [t, l]), {
    isPresent: ["mounted", "unmountSuspended"].includes(s),
    ref: g.useCallback((c) => {
      r.current = c ? getComputedStyle(c) : null, n(c);
    }, [])
  };
}
function qr(e) {
  return (e == null ? void 0 : e.animationName) || "none";
}
function hp(e) {
  var r, o;
  let t = (r = Object.getOwnPropertyDescriptor(e.props, "ref")) == null ? void 0 : r.get, n = t && "isReactWarning" in t && t.isReactWarning;
  return n ? e.ref : (t = (o = Object.getOwnPropertyDescriptor(e, "ref")) == null ? void 0 : o.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
var bp = g[" useInsertionEffect ".trim().toString()] || St;
function so({
  prop: e,
  defaultProp: t,
  onChange: n = () => {
  },
  caller: r
}) {
  const [o, i, a] = yp({
    defaultProp: t,
    onChange: n
  }), s = e !== void 0, l = s ? e : o;
  {
    const f = g.useRef(e !== void 0);
    g.useEffect(() => {
      const p = f.current;
      p !== s && console.warn(
        `${r} is changing from ${p ? "controlled" : "uncontrolled"} to ${s ? "controlled" : "uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
      ), f.current = s;
    }, [s, r]);
  }
  const c = g.useCallback(
    (f) => {
      var p;
      if (s) {
        const h = wp(f) ? f(e) : f;
        h !== e && ((p = a.current) == null || p.call(a, h));
      } else
        i(f);
    },
    [s, e, i, a]
  );
  return [l, c];
}
function yp({
  defaultProp: e,
  onChange: t
}) {
  const [n, r] = g.useState(e), o = g.useRef(n), i = g.useRef(t);
  return bp(() => {
    i.current = t;
  }, [t]), g.useEffect(() => {
    var a;
    o.current !== n && ((a = i.current) == null || a.call(i, n), o.current = n);
  }, [n, o]), [n, r, i];
}
function wp(e) {
  return typeof e == "function";
}
var vp = function(e) {
  if (typeof document > "u")
    return null;
  var t = Array.isArray(e) ? e[0] : e;
  return t.ownerDocument.body;
}, Un = /* @__PURE__ */ new WeakMap(), Vr = /* @__PURE__ */ new WeakMap(), Xr = {}, Qo = 0, Vl = function(e) {
  return e && (e.host || Vl(e.parentNode));
}, Cp = function(e, t) {
  return t.map(function(n) {
    if (e.contains(n))
      return n;
    var r = Vl(n);
    return r && e.contains(r) ? r : (console.error("aria-hidden", n, "in not contained inside", e, ". Doing nothing"), null);
  }).filter(function(n) {
    return !!n;
  });
}, xp = function(e, t, n, r) {
  var o = Cp(t, Array.isArray(e) ? e : [e]);
  Xr[n] || (Xr[n] = /* @__PURE__ */ new WeakMap());
  var i = Xr[n], a = [], s = /* @__PURE__ */ new Set(), l = new Set(o), c = function(p) {
    !p || s.has(p) || (s.add(p), c(p.parentNode));
  };
  o.forEach(c);
  var f = function(p) {
    !p || l.has(p) || Array.prototype.forEach.call(p.children, function(h) {
      if (s.has(h))
        f(h);
      else
        try {
          var v = h.getAttribute(r), T = v !== null && v !== "false", b = (Un.get(h) || 0) + 1, E = (i.get(h) || 0) + 1;
          Un.set(h, b), i.set(h, E), a.push(h), b === 1 && T && Vr.set(h, !0), E === 1 && h.setAttribute(n, "true"), T || h.setAttribute(r, "true");
        } catch (x) {
          console.error("aria-hidden: cannot operate on ", h, x);
        }
    });
  };
  return f(t), s.clear(), Qo++, function() {
    a.forEach(function(p) {
      var h = Un.get(p) - 1, v = i.get(p) - 1;
      Un.set(p, h), i.set(p, v), h || (Vr.has(p) || p.removeAttribute(r), Vr.delete(p)), v || p.removeAttribute(n);
    }), Qo--, Qo || (Un = /* @__PURE__ */ new WeakMap(), Un = /* @__PURE__ */ new WeakMap(), Vr = /* @__PURE__ */ new WeakMap(), Xr = {});
  };
}, Xl = function(e, t, n) {
  n === void 0 && (n = "data-aria-hidden");
  var r = Array.from(Array.isArray(e) ? e : [e]), o = vp(e);
  return o ? (r.push.apply(r, Array.from(o.querySelectorAll("[aria-live], script"))), xp(r, o, n, "aria-hidden")) : function() {
    return null;
  };
}, Gt = function() {
  return Gt = Object.assign || function(t) {
    for (var n, r = 1, o = arguments.length; r < o; r++) {
      n = arguments[r];
      for (var i in n) Object.prototype.hasOwnProperty.call(n, i) && (t[i] = n[i]);
    }
    return t;
  }, Gt.apply(this, arguments);
};
function Kl(e, t) {
  var n = {};
  for (var r in e) Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
  if (e != null && typeof Object.getOwnPropertySymbols == "function")
    for (var o = 0, r = Object.getOwnPropertySymbols(e); o < r.length; o++)
      t.indexOf(r[o]) < 0 && Object.prototype.propertyIsEnumerable.call(e, r[o]) && (n[r[o]] = e[r[o]]);
  return n;
}
function Ep(e, t, n) {
  if (n || arguments.length === 2) for (var r = 0, o = t.length, i; r < o; r++)
    (i || !(r in t)) && (i || (i = Array.prototype.slice.call(t, 0, r)), i[r] = t[r]);
  return e.concat(i || Array.prototype.slice.call(t));
}
var Zr = "right-scroll-bar-position", Jr = "width-before-scroll-bar", Tp = "with-scroll-bars-hidden", Np = "--removed-body-scroll-bar-size";
function Zo(e, t) {
  return typeof e == "function" ? e(t) : e && (e.current = t), e;
}
function Sp(e, t) {
  var n = Qe(function() {
    return {
      // value
      value: e,
      // last callback
      callback: t,
      // "memoized" public interface
      facade: {
        get current() {
          return n.value;
        },
        set current(r) {
          var o = n.value;
          o !== r && (n.value = r, n.callback(r, o));
        }
      }
    };
  })[0];
  return n.callback = t, n.facade;
}
var Ap = typeof window < "u" ? g.useLayoutEffect : g.useEffect, us = /* @__PURE__ */ new WeakMap();
function kp(e, t) {
  var n = Sp(null, function(r) {
    return e.forEach(function(o) {
      return Zo(o, r);
    });
  });
  return Ap(function() {
    var r = us.get(n);
    if (r) {
      var o = new Set(r), i = new Set(e), a = n.current;
      o.forEach(function(s) {
        i.has(s) || Zo(s, null);
      }), i.forEach(function(s) {
        o.has(s) || Zo(s, a);
      });
    }
    us.set(n, e);
  }, [e]), n;
}
function Rp(e) {
  return e;
}
function _p(e, t) {
  t === void 0 && (t = Rp);
  var n = [], r = !1, o = {
    read: function() {
      if (r)
        throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
      return n.length ? n[n.length - 1] : e;
    },
    useMedium: function(i) {
      var a = t(i, r);
      return n.push(a), function() {
        n = n.filter(function(s) {
          return s !== a;
        });
      };
    },
    assignSyncMedium: function(i) {
      for (r = !0; n.length; ) {
        var a = n;
        n = [], a.forEach(i);
      }
      n = {
        push: function(s) {
          return i(s);
        },
        filter: function() {
          return n;
        }
      };
    },
    assignMedium: function(i) {
      r = !0;
      var a = [];
      if (n.length) {
        var s = n;
        n = [], s.forEach(i), a = n;
      }
      var l = function() {
        var f = a;
        a = [], f.forEach(i);
      }, c = function() {
        return Promise.resolve().then(l);
      };
      c(), n = {
        push: function(f) {
          a.push(f), c();
        },
        filter: function(f) {
          return a = a.filter(f), n;
        }
      };
    }
  };
  return o;
}
function Lp(e) {
  e === void 0 && (e = {});
  var t = _p(null);
  return t.options = Gt({ async: !0, ssr: !1 }, e), t;
}
var Gl = function(e) {
  var t = e.sideCar, n = Kl(e, ["sideCar"]);
  if (!t)
    throw new Error("Sidecar: please provide `sideCar` property to import the right car");
  var r = t.read();
  if (!r)
    throw new Error("Sidecar medium not found");
  return g.createElement(r, Gt({}, n));
};
Gl.isSideCarExport = !0;
function Pp(e, t) {
  return e.useMedium(t), Gl;
}
var Yl = Lp(), Jo = function() {
}, To = g.forwardRef(function(e, t) {
  var n = g.useRef(null), r = g.useState({
    onScrollCapture: Jo,
    onWheelCapture: Jo,
    onTouchMoveCapture: Jo
  }), o = r[0], i = r[1], a = e.forwardProps, s = e.children, l = e.className, c = e.removeScrollBar, f = e.enabled, p = e.shards, h = e.sideCar, v = e.noRelative, T = e.noIsolation, b = e.inert, E = e.allowPinchZoom, x = e.as, w = x === void 0 ? "div" : x, k = e.gapMode, D = Kl(e, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]), j = h, q = kp([n, t]), H = Gt(Gt({}, D), o);
  return g.createElement(
    g.Fragment,
    null,
    f && g.createElement(j, { sideCar: Yl, removeScrollBar: c, shards: p, noRelative: v, noIsolation: T, inert: b, setCallbacks: i, allowPinchZoom: !!E, lockRef: n, gapMode: k }),
    a ? g.cloneElement(g.Children.only(s), Gt(Gt({}, H), { ref: q })) : g.createElement(w, Gt({}, H, { className: l, ref: q }), s)
  );
});
To.defaultProps = {
  enabled: !0,
  removeScrollBar: !0,
  inert: !1
};
To.classNames = {
  fullWidth: Jr,
  zeroRight: Zr
};
var Mp = function() {
  if (typeof __webpack_nonce__ < "u")
    return __webpack_nonce__;
};
function Op() {
  if (!document)
    return null;
  var e = document.createElement("style");
  e.type = "text/css";
  var t = Mp();
  return t && e.setAttribute("nonce", t), e;
}
function Dp(e, t) {
  e.styleSheet ? e.styleSheet.cssText = t : e.appendChild(document.createTextNode(t));
}
function Ip(e) {
  var t = document.head || document.getElementsByTagName("head")[0];
  t.appendChild(e);
}
var $p = function() {
  var e = 0, t = null;
  return {
    add: function(n) {
      e == 0 && (t = Op()) && (Dp(t, n), Ip(t)), e++;
    },
    remove: function() {
      e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), t = null);
    }
  };
}, Bp = function() {
  var e = $p();
  return function(t, n) {
    g.useEffect(function() {
      return e.add(t), function() {
        e.remove();
      };
    }, [t && n]);
  };
}, Ql = function() {
  var e = Bp(), t = function(n) {
    var r = n.styles, o = n.dynamic;
    return e(r, o), null;
  };
  return t;
}, Fp = {
  left: 0,
  top: 0,
  right: 0,
  gap: 0
}, ei = function(e) {
  return parseInt(e || "", 10) || 0;
}, Hp = function(e) {
  var t = window.getComputedStyle(document.body), n = t[e === "padding" ? "paddingLeft" : "marginLeft"], r = t[e === "padding" ? "paddingTop" : "marginTop"], o = t[e === "padding" ? "paddingRight" : "marginRight"];
  return [ei(n), ei(r), ei(o)];
}, zp = function(e) {
  if (e === void 0 && (e = "margin"), typeof window > "u")
    return Fp;
  var t = Hp(e), n = document.documentElement.clientWidth, r = window.innerWidth;
  return {
    left: t[0],
    top: t[1],
    right: t[2],
    gap: Math.max(0, r - n + t[2] - t[0])
  };
}, Wp = Ql(), Yn = "data-scroll-locked", jp = function(e, t, n, r) {
  var o = e.left, i = e.top, a = e.right, s = e.gap;
  return n === void 0 && (n = "margin"), `
  .`.concat(Tp, ` {
   overflow: hidden `).concat(r, `;
   padding-right: `).concat(s, "px ").concat(r, `;
  }
  body[`).concat(Yn, `] {
    overflow: hidden `).concat(r, `;
    overscroll-behavior: contain;
    `).concat([
    t && "position: relative ".concat(r, ";"),
    n === "margin" && `
    padding-left: `.concat(o, `px;
    padding-top: `).concat(i, `px;
    padding-right: `).concat(a, `px;
    margin-left:0;
    margin-top:0;
    margin-right: `).concat(s, "px ").concat(r, `;
    `),
    n === "padding" && "padding-right: ".concat(s, "px ").concat(r, ";")
  ].filter(Boolean).join(""), `
  }
  
  .`).concat(Zr, ` {
    right: `).concat(s, "px ").concat(r, `;
  }
  
  .`).concat(Jr, ` {
    margin-right: `).concat(s, "px ").concat(r, `;
  }
  
  .`).concat(Zr, " .").concat(Zr, ` {
    right: 0 `).concat(r, `;
  }
  
  .`).concat(Jr, " .").concat(Jr, ` {
    margin-right: 0 `).concat(r, `;
  }
  
  body[`).concat(Yn, `] {
    `).concat(Np, ": ").concat(s, `px;
  }
`);
}, ds = function() {
  var e = parseInt(document.body.getAttribute(Yn) || "0", 10);
  return isFinite(e) ? e : 0;
}, Up = function() {
  g.useEffect(function() {
    return document.body.setAttribute(Yn, (ds() + 1).toString()), function() {
      var e = ds() - 1;
      e <= 0 ? document.body.removeAttribute(Yn) : document.body.setAttribute(Yn, e.toString());
    };
  }, []);
}, qp = function(e) {
  var t = e.noRelative, n = e.noImportant, r = e.gapMode, o = r === void 0 ? "margin" : r;
  Up();
  var i = g.useMemo(function() {
    return zp(o);
  }, [o]);
  return g.createElement(Wp, { styles: jp(i, !t, o, n ? "" : "!important") });
}, pi = !1;
if (typeof window < "u")
  try {
    var Kr = Object.defineProperty({}, "passive", {
      get: function() {
        return pi = !0, !0;
      }
    });
    window.addEventListener("test", Kr, Kr), window.removeEventListener("test", Kr, Kr);
  } catch {
    pi = !1;
  }
var qn = pi ? { passive: !1 } : !1, Vp = function(e) {
  return e.tagName === "TEXTAREA";
}, Zl = function(e, t) {
  if (!(e instanceof Element))
    return !1;
  var n = window.getComputedStyle(e);
  return (
    // not-not-scrollable
    n[t] !== "hidden" && // contains scroll inside self
    !(n.overflowY === n.overflowX && !Vp(e) && n[t] === "visible")
  );
}, Xp = function(e) {
  return Zl(e, "overflowY");
}, Kp = function(e) {
  return Zl(e, "overflowX");
}, fs = function(e, t) {
  var n = t.ownerDocument, r = t;
  do {
    typeof ShadowRoot < "u" && r instanceof ShadowRoot && (r = r.host);
    var o = Jl(e, r);
    if (o) {
      var i = ec(e, r), a = i[1], s = i[2];
      if (a > s)
        return !0;
    }
    r = r.parentNode;
  } while (r && r !== n.body);
  return !1;
}, Gp = function(e) {
  var t = e.scrollTop, n = e.scrollHeight, r = e.clientHeight;
  return [
    t,
    n,
    r
  ];
}, Yp = function(e) {
  var t = e.scrollLeft, n = e.scrollWidth, r = e.clientWidth;
  return [
    t,
    n,
    r
  ];
}, Jl = function(e, t) {
  return e === "v" ? Xp(t) : Kp(t);
}, ec = function(e, t) {
  return e === "v" ? Gp(t) : Yp(t);
}, Qp = function(e, t) {
  return e === "h" && t === "rtl" ? -1 : 1;
}, Zp = function(e, t, n, r, o) {
  var i = Qp(e, window.getComputedStyle(t).direction), a = i * r, s = n.target, l = t.contains(s), c = !1, f = a > 0, p = 0, h = 0;
  do {
    if (!s)
      break;
    var v = ec(e, s), T = v[0], b = v[1], E = v[2], x = b - E - i * T;
    (T || x) && Jl(e, s) && (p += x, h += T);
    var w = s.parentNode;
    s = w && w.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? w.host : w;
  } while (
    // portaled content
    !l && s !== document.body || // self content
    l && (t.contains(s) || t === s)
  );
  return (f && Math.abs(p) < 1 || !f && Math.abs(h) < 1) && (c = !0), c;
}, Gr = function(e) {
  return "changedTouches" in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0];
}, ps = function(e) {
  return [e.deltaX, e.deltaY];
}, ms = function(e) {
  return e && "current" in e ? e.current : e;
}, Jp = function(e, t) {
  return e[0] === t[0] && e[1] === t[1];
}, em = function(e) {
  return `
  .block-interactivity-`.concat(e, ` {pointer-events: none;}
  .allow-interactivity-`).concat(e, ` {pointer-events: all;}
`);
}, tm = 0, Vn = [];
function nm(e) {
  var t = g.useRef([]), n = g.useRef([0, 0]), r = g.useRef(), o = g.useState(tm++)[0], i = g.useState(Ql)[0], a = g.useRef(e);
  g.useEffect(function() {
    a.current = e;
  }, [e]), g.useEffect(function() {
    if (e.inert) {
      document.body.classList.add("block-interactivity-".concat(o));
      var b = Ep([e.lockRef.current], (e.shards || []).map(ms), !0).filter(Boolean);
      return b.forEach(function(E) {
        return E.classList.add("allow-interactivity-".concat(o));
      }), function() {
        document.body.classList.remove("block-interactivity-".concat(o)), b.forEach(function(E) {
          return E.classList.remove("allow-interactivity-".concat(o));
        });
      };
    }
  }, [e.inert, e.lockRef.current, e.shards]);
  var s = g.useCallback(function(b, E) {
    if ("touches" in b && b.touches.length === 2 || b.type === "wheel" && b.ctrlKey)
      return !a.current.allowPinchZoom;
    var x = Gr(b), w = n.current, k = "deltaX" in b ? b.deltaX : w[0] - x[0], D = "deltaY" in b ? b.deltaY : w[1] - x[1], j, q = b.target, H = Math.abs(k) > Math.abs(D) ? "h" : "v";
    if ("touches" in b && H === "h" && q.type === "range")
      return !1;
    var Q = window.getSelection(), be = Q && Q.anchorNode, ke = be ? be === q || be.contains(q) : !1;
    if (ke)
      return !1;
    var we = fs(H, q);
    if (!we)
      return !0;
    if (we ? j = H : (j = H === "v" ? "h" : "v", we = fs(H, q)), !we)
      return !1;
    if (!r.current && "changedTouches" in b && (k || D) && (r.current = j), !j)
      return !0;
    var $e = r.current || j;
    return Zp($e, E, b, $e === "h" ? k : D);
  }, []), l = g.useCallback(function(b) {
    var E = b;
    if (!(!Vn.length || Vn[Vn.length - 1] !== i)) {
      var x = "deltaY" in E ? ps(E) : Gr(E), w = t.current.filter(function(j) {
        return j.name === E.type && (j.target === E.target || E.target === j.shadowParent) && Jp(j.delta, x);
      })[0];
      if (w && w.should) {
        E.cancelable && E.preventDefault();
        return;
      }
      if (!w) {
        var k = (a.current.shards || []).map(ms).filter(Boolean).filter(function(j) {
          return j.contains(E.target);
        }), D = k.length > 0 ? s(E, k[0]) : !a.current.noIsolation;
        D && E.cancelable && E.preventDefault();
      }
    }
  }, []), c = g.useCallback(function(b, E, x, w) {
    var k = { name: b, delta: E, target: x, should: w, shadowParent: rm(x) };
    t.current.push(k), setTimeout(function() {
      t.current = t.current.filter(function(D) {
        return D !== k;
      });
    }, 1);
  }, []), f = g.useCallback(function(b) {
    n.current = Gr(b), r.current = void 0;
  }, []), p = g.useCallback(function(b) {
    c(b.type, ps(b), b.target, s(b, e.lockRef.current));
  }, []), h = g.useCallback(function(b) {
    c(b.type, Gr(b), b.target, s(b, e.lockRef.current));
  }, []);
  g.useEffect(function() {
    return Vn.push(i), e.setCallbacks({
      onScrollCapture: p,
      onWheelCapture: p,
      onTouchMoveCapture: h
    }), document.addEventListener("wheel", l, qn), document.addEventListener("touchmove", l, qn), document.addEventListener("touchstart", f, qn), function() {
      Vn = Vn.filter(function(b) {
        return b !== i;
      }), document.removeEventListener("wheel", l, qn), document.removeEventListener("touchmove", l, qn), document.removeEventListener("touchstart", f, qn);
    };
  }, []);
  var v = e.removeScrollBar, T = e.inert;
  return g.createElement(
    g.Fragment,
    null,
    T ? g.createElement(i, { styles: em(o) }) : null,
    v ? g.createElement(qp, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
  );
}
function rm(e) {
  for (var t = null; e !== null; )
    e instanceof ShadowRoot && (t = e.host, e = e.host), e = e.parentNode;
  return t;
}
const om = Pp(Yl, nm);
var qi = g.forwardRef(function(e, t) {
  return g.createElement(To, Gt({}, e, { ref: t, sideCar: om }));
});
qi.classNames = To.classNames;
var No = "Popover", [tc] = Rr(No, [
  ir
]), Mr = ir(), [im, bn] = tc(No), nc = (e) => {
  const {
    __scopePopover: t,
    children: n,
    open: r,
    defaultOpen: o,
    onOpenChange: i,
    modal: a = !1
  } = e, s = Mr(t), l = g.useRef(null), [c, f] = g.useState(!1), [p, h] = so({
    prop: r,
    defaultProp: o ?? !1,
    onChange: i,
    caller: No
  });
  return /* @__PURE__ */ d(Wi, { ...s, children: /* @__PURE__ */ d(
    im,
    {
      scope: t,
      contentId: _r(),
      triggerRef: l,
      open: p,
      onOpenChange: h,
      onOpenToggle: g.useCallback(() => h((v) => !v), [h]),
      hasCustomAnchor: c,
      onCustomAnchorAdd: g.useCallback(() => f(!0), []),
      onCustomAnchorRemove: g.useCallback(() => f(!1), []),
      modal: a,
      children: n
    }
  ) });
};
nc.displayName = No;
var rc = "PopoverAnchor", am = g.forwardRef(
  (e, t) => {
    const { __scopePopover: n, ...r } = e, o = bn(rc, n), i = Mr(n), { onCustomAnchorAdd: a, onCustomAnchorRemove: s } = o;
    return g.useEffect(() => (a(), () => s()), [a, s]), /* @__PURE__ */ d(xo, { ...i, ...r, ref: t });
  }
);
am.displayName = rc;
var oc = "PopoverTrigger", ic = g.forwardRef(
  (e, t) => {
    const { __scopePopover: n, ...r } = e, o = bn(oc, n), i = Mr(n), a = mt(t, o.triggerRef), s = /* @__PURE__ */ d(
      lt.button,
      {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": o.open,
        "aria-controls": o.contentId,
        "data-state": dc(o.open),
        ...r,
        ref: a,
        onClick: Ye(e.onClick, o.onOpenToggle)
      }
    );
    return o.hasCustomAnchor ? s : /* @__PURE__ */ d(xo, { asChild: !0, ...i, children: s });
  }
);
ic.displayName = oc;
var Vi = "PopoverPortal", [sm, lm] = tc(Vi, {
  forceMount: void 0
}), ac = (e) => {
  const { __scopePopover: t, forceMount: n, children: r, container: o } = e, i = bn(Vi, t);
  return /* @__PURE__ */ d(sm, { scope: t, forceMount: n, children: /* @__PURE__ */ d(Pr, { present: n || i.open, children: /* @__PURE__ */ d(Eo, { asChild: !0, container: o, children: r }) }) });
};
ac.displayName = Vi;
var er = "PopoverContent", sc = g.forwardRef(
  (e, t) => {
    const n = lm(er, e.__scopePopover), { forceMount: r = n.forceMount, ...o } = e, i = bn(er, e.__scopePopover);
    return /* @__PURE__ */ d(Pr, { present: r || i.open, children: i.modal ? /* @__PURE__ */ d(um, { ...o, ref: t }) : /* @__PURE__ */ d(dm, { ...o, ref: t }) });
  }
);
sc.displayName = er;
var cm = /* @__PURE__ */ Cr("PopoverContent.RemoveScroll"), um = g.forwardRef(
  (e, t) => {
    const n = bn(er, e.__scopePopover), r = g.useRef(null), o = mt(t, r), i = g.useRef(!1);
    return g.useEffect(() => {
      const a = r.current;
      if (a) return Xl(a);
    }, []), /* @__PURE__ */ d(qi, { as: cm, allowPinchZoom: !0, children: /* @__PURE__ */ d(
      lc,
      {
        ...e,
        ref: o,
        trapFocus: n.open,
        disableOutsidePointerEvents: !0,
        onCloseAutoFocus: Ye(e.onCloseAutoFocus, (a) => {
          var s;
          a.preventDefault(), i.current || (s = n.triggerRef.current) == null || s.focus();
        }),
        onPointerDownOutside: Ye(
          e.onPointerDownOutside,
          (a) => {
            const s = a.detail.originalEvent, l = s.button === 0 && s.ctrlKey === !0, c = s.button === 2 || l;
            i.current = c;
          },
          { checkForDefaultPrevented: !1 }
        ),
        onFocusOutside: Ye(
          e.onFocusOutside,
          (a) => a.preventDefault(),
          { checkForDefaultPrevented: !1 }
        )
      }
    ) });
  }
), dm = g.forwardRef(
  (e, t) => {
    const n = bn(er, e.__scopePopover), r = g.useRef(!1), o = g.useRef(!1);
    return /* @__PURE__ */ d(
      lc,
      {
        ...e,
        ref: t,
        trapFocus: !1,
        disableOutsidePointerEvents: !1,
        onCloseAutoFocus: (i) => {
          var a, s;
          (a = e.onCloseAutoFocus) == null || a.call(e, i), i.defaultPrevented || (r.current || (s = n.triggerRef.current) == null || s.focus(), i.preventDefault()), r.current = !1, o.current = !1;
        },
        onInteractOutside: (i) => {
          var l, c;
          (l = e.onInteractOutside) == null || l.call(e, i), i.defaultPrevented || (r.current = !0, i.detail.originalEvent.type === "pointerdown" && (o.current = !0));
          const a = i.target;
          ((c = n.triggerRef.current) == null ? void 0 : c.contains(a)) && i.preventDefault(), i.detail.originalEvent.type === "focusin" && o.current && i.preventDefault();
        }
      }
    );
  }
), lc = g.forwardRef(
  (e, t) => {
    const {
      __scopePopover: n,
      trapFocus: r,
      onOpenAutoFocus: o,
      onCloseAutoFocus: i,
      disableOutsidePointerEvents: a,
      onEscapeKeyDown: s,
      onPointerDownOutside: l,
      onFocusOutside: c,
      onInteractOutside: f,
      ...p
    } = e, h = bn(er, n), v = Mr(n);
    return El(), /* @__PURE__ */ d(
      Mi,
      {
        asChild: !0,
        loop: !0,
        trapped: r,
        onMountAutoFocus: o,
        onUnmountAutoFocus: i,
        children: /* @__PURE__ */ d(
          bo,
          {
            asChild: !0,
            disableOutsidePointerEvents: a,
            onInteractOutside: f,
            onEscapeKeyDown: s,
            onPointerDownOutside: l,
            onFocusOutside: c,
            onDismiss: () => h.onOpenChange(!1),
            children: /* @__PURE__ */ d(
              ji,
              {
                "data-state": dc(h.open),
                role: "dialog",
                id: h.contentId,
                ...v,
                ...p,
                ref: t,
                style: {
                  ...p.style,
                  "--radix-popover-content-transform-origin": "var(--radix-popper-transform-origin)",
                  "--radix-popover-content-available-width": "var(--radix-popper-available-width)",
                  "--radix-popover-content-available-height": "var(--radix-popper-available-height)",
                  "--radix-popover-trigger-width": "var(--radix-popper-anchor-width)",
                  "--radix-popover-trigger-height": "var(--radix-popper-anchor-height)"
                }
              }
            )
          }
        )
      }
    );
  }
), cc = "PopoverClose", fm = g.forwardRef(
  (e, t) => {
    const { __scopePopover: n, ...r } = e, o = bn(cc, n);
    return /* @__PURE__ */ d(
      lt.button,
      {
        type: "button",
        ...r,
        ref: t,
        onClick: Ye(e.onClick, () => o.onOpenChange(!1))
      }
    );
  }
);
fm.displayName = cc;
var pm = "PopoverArrow", uc = g.forwardRef(
  (e, t) => {
    const { __scopePopover: n, ...r } = e, o = Mr(n);
    return /* @__PURE__ */ d(Ui, { ...o, ...r, ref: t });
  }
);
uc.displayName = pm;
function dc(e) {
  return e ? "open" : "closed";
}
var mi = nc, gi = ic, hi = ac, bi = sc, yi = uc;
function gs(e, [t, n]) {
  return Math.min(n, Math.max(t, e));
}
function mm(e) {
  const t = e + "CollectionProvider", [n, r] = Rr(t), [o, i] = n(
    t,
    { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
  ), a = (b) => {
    const { scope: E, children: x } = b, w = An.useRef(null), k = An.useRef(/* @__PURE__ */ new Map()).current;
    return /* @__PURE__ */ d(o, { scope: E, itemMap: k, collectionRef: w, children: x });
  };
  a.displayName = t;
  const s = e + "CollectionSlot", l = /* @__PURE__ */ Cr(s), c = An.forwardRef(
    (b, E) => {
      const { scope: x, children: w } = b, k = i(s, x), D = mt(E, k.collectionRef);
      return /* @__PURE__ */ d(l, { ref: D, children: w });
    }
  );
  c.displayName = s;
  const f = e + "CollectionItemSlot", p = "data-radix-collection-item", h = /* @__PURE__ */ Cr(f), v = An.forwardRef(
    (b, E) => {
      const { scope: x, children: w, ...k } = b, D = An.useRef(null), j = mt(E, D), q = i(f, x);
      return An.useEffect(() => (q.itemMap.set(D, { ref: D, ...k }), () => void q.itemMap.delete(D))), /* @__PURE__ */ d(h, { [p]: "", ref: j, children: w });
    }
  );
  v.displayName = f;
  function T(b) {
    const E = i(e + "CollectionConsumer", b);
    return An.useCallback(() => {
      const w = E.collectionRef.current;
      if (!w) return [];
      const k = Array.from(w.querySelectorAll(`[${p}]`));
      return Array.from(E.itemMap.values()).sort(
        (q, H) => k.indexOf(q.ref.current) - k.indexOf(H.ref.current)
      );
    }, [E.collectionRef, E.itemMap]);
  }
  return [
    { Provider: a, Slot: c, ItemSlot: v },
    T,
    r
  ];
}
var gm = g.createContext(void 0);
function hm(e) {
  const t = g.useContext(gm);
  return e || t || "ltr";
}
function bm(e) {
  const t = g.useRef({ value: e, previous: e });
  return g.useMemo(() => (t.current.value !== e && (t.current.previous = t.current.value, t.current.value = e), t.current.previous), [e]);
}
var fc = Object.freeze({
  // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
  position: "absolute",
  border: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  wordWrap: "normal"
}), ym = "VisuallyHidden", pc = g.forwardRef(
  (e, t) => /* @__PURE__ */ d(
    lt.span,
    {
      ...e,
      ref: t,
      style: { ...fc, ...e.style }
    }
  )
);
pc.displayName = ym;
var wm = pc, vm = [" ", "Enter", "ArrowUp", "ArrowDown"], Cm = [" ", "Enter"], Pn = "Select", [So, Ao, xm] = mm(Pn), [ar] = Rr(Pn, [
  xm,
  ir
]), ko = ir(), [Em, yn] = ar(Pn), [Tm, Nm] = ar(Pn), mc = (e) => {
  const {
    __scopeSelect: t,
    children: n,
    open: r,
    defaultOpen: o,
    onOpenChange: i,
    value: a,
    defaultValue: s,
    onValueChange: l,
    dir: c,
    name: f,
    autoComplete: p,
    disabled: h,
    required: v,
    form: T
  } = e, b = ko(t), [E, x] = g.useState(null), [w, k] = g.useState(null), [D, j] = g.useState(!1), q = hm(c), [H, Q] = so({
    prop: r,
    defaultProp: o ?? !1,
    onChange: i,
    caller: Pn
  }), [be, ke] = so({
    prop: a,
    defaultProp: s,
    onChange: l,
    caller: Pn
  }), we = g.useRef(null), $e = E ? T || !!E.closest("form") : !0, [Re, Me] = g.useState(/* @__PURE__ */ new Set()), V = Array.from(Re).map((ve) => ve.props.value).join(";");
  return /* @__PURE__ */ d(Wi, { ...b, children: /* @__PURE__ */ K(
    Em,
    {
      required: v,
      scope: t,
      trigger: E,
      onTriggerChange: x,
      valueNode: w,
      onValueNodeChange: k,
      valueNodeHasChildren: D,
      onValueNodeHasChildrenChange: j,
      contentId: _r(),
      value: be,
      onValueChange: ke,
      open: H,
      onOpenChange: Q,
      dir: q,
      triggerPointerDownPosRef: we,
      disabled: h,
      children: [
        /* @__PURE__ */ d(So.Provider, { scope: t, children: /* @__PURE__ */ d(
          Tm,
          {
            scope: e.__scopeSelect,
            onNativeOptionAdd: g.useCallback((ve) => {
              Me((_e) => new Set(_e).add(ve));
            }, []),
            onNativeOptionRemove: g.useCallback((ve) => {
              Me((_e) => {
                const de = new Set(_e);
                return de.delete(ve), de;
              });
            }, []),
            children: n
          }
        ) }),
        $e ? /* @__PURE__ */ K(
          Ic,
          {
            "aria-hidden": !0,
            required: v,
            tabIndex: -1,
            name: f,
            autoComplete: p,
            value: be,
            onChange: (ve) => ke(ve.target.value),
            disabled: h,
            form: T,
            children: [
              be === void 0 ? /* @__PURE__ */ d("option", { value: "" }) : null,
              Array.from(Re)
            ]
          },
          V
        ) : null
      ]
    }
  ) });
};
mc.displayName = Pn;
var gc = "SelectTrigger", hc = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, disabled: r = !1, ...o } = e, i = ko(n), a = yn(gc, n), s = a.disabled || r, l = mt(t, a.onTriggerChange), c = Ao(n), f = g.useRef("touch"), [p, h, v] = Bc((b) => {
      const E = c().filter((k) => !k.disabled), x = E.find((k) => k.value === a.value), w = Fc(E, b, x);
      w !== void 0 && a.onValueChange(w.value);
    }), T = (b) => {
      s || (a.onOpenChange(!0), v()), b && (a.triggerPointerDownPosRef.current = {
        x: Math.round(b.pageX),
        y: Math.round(b.pageY)
      });
    };
    return /* @__PURE__ */ d(xo, { asChild: !0, ...i, children: /* @__PURE__ */ d(
      lt.button,
      {
        type: "button",
        role: "combobox",
        "aria-controls": a.contentId,
        "aria-expanded": a.open,
        "aria-required": a.required,
        "aria-autocomplete": "none",
        dir: a.dir,
        "data-state": a.open ? "open" : "closed",
        disabled: s,
        "data-disabled": s ? "" : void 0,
        "data-placeholder": $c(a.value) ? "" : void 0,
        ...o,
        ref: l,
        onClick: Ye(o.onClick, (b) => {
          b.currentTarget.focus(), f.current !== "mouse" && T(b);
        }),
        onPointerDown: Ye(o.onPointerDown, (b) => {
          f.current = b.pointerType;
          const E = b.target;
          E.hasPointerCapture(b.pointerId) && E.releasePointerCapture(b.pointerId), b.button === 0 && b.ctrlKey === !1 && b.pointerType === "mouse" && (T(b), b.preventDefault());
        }),
        onKeyDown: Ye(o.onKeyDown, (b) => {
          const E = p.current !== "";
          !(b.ctrlKey || b.altKey || b.metaKey) && b.key.length === 1 && h(b.key), !(E && b.key === " ") && vm.includes(b.key) && (T(), b.preventDefault());
        })
      }
    ) });
  }
);
hc.displayName = gc;
var bc = "SelectValue", yc = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, className: r, style: o, children: i, placeholder: a = "", ...s } = e, l = yn(bc, n), { onValueNodeHasChildrenChange: c } = l, f = i !== void 0, p = mt(t, l.onValueNodeChange);
    return St(() => {
      c(f);
    }, [c, f]), /* @__PURE__ */ d(
      lt.span,
      {
        ...s,
        ref: p,
        style: { pointerEvents: "none" },
        children: $c(l.value) ? /* @__PURE__ */ d(mo, { children: a }) : i
      }
    );
  }
);
yc.displayName = bc;
var Sm = "SelectIcon", wc = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, children: r, ...o } = e;
    return /* @__PURE__ */ d(lt.span, { "aria-hidden": !0, ...o, ref: t, children: r || "▼" });
  }
);
wc.displayName = Sm;
var Am = "SelectPortal", vc = (e) => /* @__PURE__ */ d(Eo, { asChild: !0, ...e });
vc.displayName = Am;
var Mn = "SelectContent", Cc = g.forwardRef(
  (e, t) => {
    const n = yn(Mn, e.__scopeSelect), [r, o] = g.useState();
    if (St(() => {
      o(new DocumentFragment());
    }, []), !n.open) {
      const i = r;
      return i ? ho.createPortal(
        /* @__PURE__ */ d(xc, { scope: e.__scopeSelect, children: /* @__PURE__ */ d(So.Slot, { scope: e.__scopeSelect, children: /* @__PURE__ */ d("div", { children: e.children }) }) }),
        i
      ) : null;
    }
    return /* @__PURE__ */ d(Ec, { ...e, ref: t });
  }
);
Cc.displayName = Mn;
var Wt = 10, [xc, wn] = ar(Mn), km = "SelectContentImpl", Rm = /* @__PURE__ */ Cr("SelectContent.RemoveScroll"), Ec = g.forwardRef(
  (e, t) => {
    const {
      __scopeSelect: n,
      position: r = "item-aligned",
      onCloseAutoFocus: o,
      onEscapeKeyDown: i,
      onPointerDownOutside: a,
      //
      // PopperContent props
      side: s,
      sideOffset: l,
      align: c,
      alignOffset: f,
      arrowPadding: p,
      collisionBoundary: h,
      collisionPadding: v,
      sticky: T,
      hideWhenDetached: b,
      avoidCollisions: E,
      //
      ...x
    } = e, w = yn(Mn, n), [k, D] = g.useState(null), [j, q] = g.useState(null), H = mt(t, (ee) => D(ee)), [Q, be] = g.useState(null), [ke, we] = g.useState(
      null
    ), $e = Ao(n), [Re, Me] = g.useState(!1), V = g.useRef(!1);
    g.useEffect(() => {
      if (k) return Xl(k);
    }, [k]), El();
    const ve = g.useCallback(
      (ee) => {
        const [Be, ...it] = $e().map((I) => I.ref.current), [Oe] = it.slice(-1), We = document.activeElement;
        for (const I of ee)
          if (I === We || (I == null || I.scrollIntoView({ block: "nearest" }), I === Be && j && (j.scrollTop = 0), I === Oe && j && (j.scrollTop = j.scrollHeight), I == null || I.focus(), document.activeElement !== We)) return;
      },
      [$e, j]
    ), _e = g.useCallback(
      () => ve([Q, k]),
      [ve, Q, k]
    );
    g.useEffect(() => {
      Re && _e();
    }, [Re, _e]);
    const { onOpenChange: de, triggerPointerDownPosRef: Le } = w;
    g.useEffect(() => {
      if (k) {
        let ee = { x: 0, y: 0 };
        const Be = (Oe) => {
          var We, I;
          ee = {
            x: Math.abs(Math.round(Oe.pageX) - (((We = Le.current) == null ? void 0 : We.x) ?? 0)),
            y: Math.abs(Math.round(Oe.pageY) - (((I = Le.current) == null ? void 0 : I.y) ?? 0))
          };
        }, it = (Oe) => {
          ee.x <= 10 && ee.y <= 10 ? Oe.preventDefault() : k.contains(Oe.target) || de(!1), document.removeEventListener("pointermove", Be), Le.current = null;
        };
        return Le.current !== null && (document.addEventListener("pointermove", Be), document.addEventListener("pointerup", it, { capture: !0, once: !0 })), () => {
          document.removeEventListener("pointermove", Be), document.removeEventListener("pointerup", it, { capture: !0 });
        };
      }
    }, [k, de, Le]), g.useEffect(() => {
      const ee = () => de(!1);
      return window.addEventListener("blur", ee), window.addEventListener("resize", ee), () => {
        window.removeEventListener("blur", ee), window.removeEventListener("resize", ee);
      };
    }, [de]);
    const [Ve, st] = Bc((ee) => {
      const Be = $e().filter((We) => !We.disabled), it = Be.find((We) => We.ref.current === document.activeElement), Oe = Fc(Be, ee, it);
      Oe && setTimeout(() => Oe.ref.current.focus());
    }), et = g.useCallback(
      (ee, Be, it) => {
        const Oe = !V.current && !it;
        (w.value !== void 0 && w.value === Be || Oe) && (be(ee), Oe && (V.current = !0));
      },
      [w.value]
    ), tt = g.useCallback(() => k == null ? void 0 : k.focus(), [k]), nt = g.useCallback(
      (ee, Be, it) => {
        const Oe = !V.current && !it;
        (w.value !== void 0 && w.value === Be || Oe) && we(ee);
      },
      [w.value]
    ), ot = r === "popper" ? wi : Tc, z = ot === wi ? {
      side: s,
      sideOffset: l,
      align: c,
      alignOffset: f,
      arrowPadding: p,
      collisionBoundary: h,
      collisionPadding: v,
      sticky: T,
      hideWhenDetached: b,
      avoidCollisions: E
    } : {};
    return /* @__PURE__ */ d(
      xc,
      {
        scope: n,
        content: k,
        viewport: j,
        onViewportChange: q,
        itemRefCallback: et,
        selectedItem: Q,
        onItemLeave: tt,
        itemTextRefCallback: nt,
        focusSelectedItem: _e,
        selectedItemText: ke,
        position: r,
        isPositioned: Re,
        searchRef: Ve,
        children: /* @__PURE__ */ d(qi, { as: Rm, allowPinchZoom: !0, children: /* @__PURE__ */ d(
          Mi,
          {
            asChild: !0,
            trapped: w.open,
            onMountAutoFocus: (ee) => {
              ee.preventDefault();
            },
            onUnmountAutoFocus: Ye(o, (ee) => {
              var Be;
              (Be = w.trigger) == null || Be.focus({ preventScroll: !0 }), ee.preventDefault();
            }),
            children: /* @__PURE__ */ d(
              bo,
              {
                asChild: !0,
                disableOutsidePointerEvents: !0,
                onEscapeKeyDown: i,
                onPointerDownOutside: a,
                onFocusOutside: (ee) => ee.preventDefault(),
                onDismiss: () => w.onOpenChange(!1),
                children: /* @__PURE__ */ d(
                  ot,
                  {
                    role: "listbox",
                    id: w.contentId,
                    "data-state": w.open ? "open" : "closed",
                    dir: w.dir,
                    onContextMenu: (ee) => ee.preventDefault(),
                    ...x,
                    ...z,
                    onPlaced: () => Me(!0),
                    ref: H,
                    style: {
                      // flex layout so we can place the scroll buttons properly
                      display: "flex",
                      flexDirection: "column",
                      // reset the outline by default as the content MAY get focused
                      outline: "none",
                      ...x.style
                    },
                    onKeyDown: Ye(x.onKeyDown, (ee) => {
                      const Be = ee.ctrlKey || ee.altKey || ee.metaKey;
                      if (ee.key === "Tab" && ee.preventDefault(), !Be && ee.key.length === 1 && st(ee.key), ["ArrowUp", "ArrowDown", "Home", "End"].includes(ee.key)) {
                        let Oe = $e().filter((We) => !We.disabled).map((We) => We.ref.current);
                        if (["ArrowUp", "End"].includes(ee.key) && (Oe = Oe.slice().reverse()), ["ArrowUp", "ArrowDown"].includes(ee.key)) {
                          const We = ee.target, I = Oe.indexOf(We);
                          Oe = Oe.slice(I + 1);
                        }
                        setTimeout(() => ve(Oe)), ee.preventDefault();
                      }
                    })
                  }
                )
              }
            )
          }
        ) })
      }
    );
  }
);
Ec.displayName = km;
var _m = "SelectItemAlignedPosition", Tc = g.forwardRef((e, t) => {
  const { __scopeSelect: n, onPlaced: r, ...o } = e, i = yn(Mn, n), a = wn(Mn, n), [s, l] = g.useState(null), [c, f] = g.useState(null), p = mt(t, (H) => f(H)), h = Ao(n), v = g.useRef(!1), T = g.useRef(!0), { viewport: b, selectedItem: E, selectedItemText: x, focusSelectedItem: w } = a, k = g.useCallback(() => {
    if (i.trigger && i.valueNode && s && c && b && E && x) {
      const H = i.trigger.getBoundingClientRect(), Q = c.getBoundingClientRect(), be = i.valueNode.getBoundingClientRect(), ke = x.getBoundingClientRect();
      if (i.dir !== "rtl") {
        const We = ke.left - Q.left, I = be.left - We, ce = H.left - I, ue = H.width + ce, xe = Math.max(ue, Q.width), Et = window.innerWidth - Wt, Ct = gs(I, [
          Wt,
          // Prevents the content from going off the starting edge of the
          // viewport. It may still go off the ending edge, but this can be
          // controlled by the user since they may want to manage overflow in a
          // specific way.
          // https://github.com/radix-ui/primitives/issues/2049
          Math.max(Wt, Et - xe)
        ]);
        s.style.minWidth = ue + "px", s.style.left = Ct + "px";
      } else {
        const We = Q.right - ke.right, I = window.innerWidth - be.right - We, ce = window.innerWidth - H.right - I, ue = H.width + ce, xe = Math.max(ue, Q.width), Et = window.innerWidth - Wt, Ct = gs(I, [
          Wt,
          Math.max(Wt, Et - xe)
        ]);
        s.style.minWidth = ue + "px", s.style.right = Ct + "px";
      }
      const we = h(), $e = window.innerHeight - Wt * 2, Re = b.scrollHeight, Me = window.getComputedStyle(c), V = parseInt(Me.borderTopWidth, 10), ve = parseInt(Me.paddingTop, 10), _e = parseInt(Me.borderBottomWidth, 10), de = parseInt(Me.paddingBottom, 10), Le = V + ve + Re + de + _e, Ve = Math.min(E.offsetHeight * 5, Le), st = window.getComputedStyle(b), et = parseInt(st.paddingTop, 10), tt = parseInt(st.paddingBottom, 10), nt = H.top + H.height / 2 - Wt, ot = $e - nt, z = E.offsetHeight / 2, ee = E.offsetTop + z, Be = V + ve + ee, it = Le - Be;
      if (Be <= nt) {
        const We = we.length > 0 && E === we[we.length - 1].ref.current;
        s.style.bottom = "0px";
        const I = c.clientHeight - b.offsetTop - b.offsetHeight, ce = Math.max(
          ot,
          z + // viewport might have padding bottom, include it to avoid a scrollable viewport
          (We ? tt : 0) + I + _e
        ), ue = Be + ce;
        s.style.height = ue + "px";
      } else {
        const We = we.length > 0 && E === we[0].ref.current;
        s.style.top = "0px";
        const ce = Math.max(
          nt,
          V + b.offsetTop + // viewport might have padding top, include it to avoid a scrollable viewport
          (We ? et : 0) + z
        ) + it;
        s.style.height = ce + "px", b.scrollTop = Be - nt + b.offsetTop;
      }
      s.style.margin = `${Wt}px 0`, s.style.minHeight = Ve + "px", s.style.maxHeight = $e + "px", r == null || r(), requestAnimationFrame(() => v.current = !0);
    }
  }, [
    h,
    i.trigger,
    i.valueNode,
    s,
    c,
    b,
    E,
    x,
    i.dir,
    r
  ]);
  St(() => k(), [k]);
  const [D, j] = g.useState();
  St(() => {
    c && j(window.getComputedStyle(c).zIndex);
  }, [c]);
  const q = g.useCallback(
    (H) => {
      H && T.current === !0 && (k(), w == null || w(), T.current = !1);
    },
    [k, w]
  );
  return /* @__PURE__ */ d(
    Pm,
    {
      scope: n,
      contentWrapper: s,
      shouldExpandOnScrollRef: v,
      onScrollButtonChange: q,
      children: /* @__PURE__ */ d(
        "div",
        {
          ref: l,
          style: {
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            zIndex: D
          },
          children: /* @__PURE__ */ d(
            lt.div,
            {
              ...o,
              ref: p,
              style: {
                // When we get the height of the content, it includes borders. If we were to set
                // the height without having `boxSizing: 'border-box'` it would be too big.
                boxSizing: "border-box",
                // We need to ensure the content doesn't get taller than the wrapper
                maxHeight: "100%",
                ...o.style
              }
            }
          )
        }
      )
    }
  );
});
Tc.displayName = _m;
var Lm = "SelectPopperPosition", wi = g.forwardRef((e, t) => {
  const {
    __scopeSelect: n,
    align: r = "start",
    collisionPadding: o = Wt,
    ...i
  } = e, a = ko(n);
  return /* @__PURE__ */ d(
    ji,
    {
      ...a,
      ...i,
      ref: t,
      align: r,
      collisionPadding: o,
      style: {
        // Ensure border-box for floating-ui calculations
        boxSizing: "border-box",
        ...i.style,
        "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
        "--radix-select-content-available-width": "var(--radix-popper-available-width)",
        "--radix-select-content-available-height": "var(--radix-popper-available-height)",
        "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
        "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
      }
    }
  );
});
wi.displayName = Lm;
var [Pm, Xi] = ar(Mn, {}), vi = "SelectViewport", Nc = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, nonce: r, ...o } = e, i = wn(vi, n), a = Xi(vi, n), s = mt(t, i.onViewportChange), l = g.useRef(0);
    return /* @__PURE__ */ K(mo, { children: [
      /* @__PURE__ */ d(
        "style",
        {
          dangerouslySetInnerHTML: {
            __html: "[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}"
          },
          nonce: r
        }
      ),
      /* @__PURE__ */ d(So.Slot, { scope: n, children: /* @__PURE__ */ d(
        lt.div,
        {
          "data-radix-select-viewport": "",
          role: "presentation",
          ...o,
          ref: s,
          style: {
            // we use position: 'relative' here on the `viewport` so that when we call
            // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
            // (independent of the scrollUpButton).
            position: "relative",
            flex: 1,
            // Viewport should only be scrollable in the vertical direction.
            // This won't work in vertical writing modes, so we'll need to
            // revisit this if/when that is supported
            // https://developer.chrome.com/blog/vertical-form-controls
            overflow: "hidden auto",
            ...o.style
          },
          onScroll: Ye(o.onScroll, (c) => {
            const f = c.currentTarget, { contentWrapper: p, shouldExpandOnScrollRef: h } = a;
            if (h != null && h.current && p) {
              const v = Math.abs(l.current - f.scrollTop);
              if (v > 0) {
                const T = window.innerHeight - Wt * 2, b = parseFloat(p.style.minHeight), E = parseFloat(p.style.height), x = Math.max(b, E);
                if (x < T) {
                  const w = x + v, k = Math.min(T, w), D = w - k;
                  p.style.height = k + "px", p.style.bottom === "0px" && (f.scrollTop = D > 0 ? D : 0, p.style.justifyContent = "flex-end");
                }
              }
            }
            l.current = f.scrollTop;
          })
        }
      ) })
    ] });
  }
);
Nc.displayName = vi;
var Sc = "SelectGroup", [Mm, Om] = ar(Sc), Dm = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, ...r } = e, o = _r();
    return /* @__PURE__ */ d(Mm, { scope: n, id: o, children: /* @__PURE__ */ d(lt.div, { role: "group", "aria-labelledby": o, ...r, ref: t }) });
  }
);
Dm.displayName = Sc;
var Ac = "SelectLabel", Im = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, ...r } = e, o = Om(Ac, n);
    return /* @__PURE__ */ d(lt.div, { id: o.id, ...r, ref: t });
  }
);
Im.displayName = Ac;
var lo = "SelectItem", [$m, kc] = ar(lo), Rc = g.forwardRef(
  (e, t) => {
    const {
      __scopeSelect: n,
      value: r,
      disabled: o = !1,
      textValue: i,
      ...a
    } = e, s = yn(lo, n), l = wn(lo, n), c = s.value === r, [f, p] = g.useState(i ?? ""), [h, v] = g.useState(!1), T = mt(
      t,
      (w) => {
        var k;
        return (k = l.itemRefCallback) == null ? void 0 : k.call(l, w, r, o);
      }
    ), b = _r(), E = g.useRef("touch"), x = () => {
      o || (s.onValueChange(r), s.onOpenChange(!1));
    };
    if (r === "")
      throw new Error(
        "A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder."
      );
    return /* @__PURE__ */ d(
      $m,
      {
        scope: n,
        value: r,
        disabled: o,
        textId: b,
        isSelected: c,
        onItemTextChange: g.useCallback((w) => {
          p((k) => k || ((w == null ? void 0 : w.textContent) ?? "").trim());
        }, []),
        children: /* @__PURE__ */ d(
          So.ItemSlot,
          {
            scope: n,
            value: r,
            disabled: o,
            textValue: f,
            children: /* @__PURE__ */ d(
              lt.div,
              {
                role: "option",
                "aria-labelledby": b,
                "data-highlighted": h ? "" : void 0,
                "aria-selected": c && h,
                "data-state": c ? "checked" : "unchecked",
                "aria-disabled": o || void 0,
                "data-disabled": o ? "" : void 0,
                tabIndex: o ? void 0 : -1,
                ...a,
                ref: T,
                onFocus: Ye(a.onFocus, () => v(!0)),
                onBlur: Ye(a.onBlur, () => v(!1)),
                onClick: Ye(a.onClick, () => {
                  E.current !== "mouse" && x();
                }),
                onPointerUp: Ye(a.onPointerUp, () => {
                  E.current === "mouse" && x();
                }),
                onPointerDown: Ye(a.onPointerDown, (w) => {
                  E.current = w.pointerType;
                }),
                onPointerMove: Ye(a.onPointerMove, (w) => {
                  var k;
                  E.current = w.pointerType, o ? (k = l.onItemLeave) == null || k.call(l) : E.current === "mouse" && w.currentTarget.focus({ preventScroll: !0 });
                }),
                onPointerLeave: Ye(a.onPointerLeave, (w) => {
                  var k;
                  w.currentTarget === document.activeElement && ((k = l.onItemLeave) == null || k.call(l));
                }),
                onKeyDown: Ye(a.onKeyDown, (w) => {
                  var D;
                  ((D = l.searchRef) == null ? void 0 : D.current) !== "" && w.key === " " || (Cm.includes(w.key) && x(), w.key === " " && w.preventDefault());
                })
              }
            )
          }
        )
      }
    );
  }
);
Rc.displayName = lo;
var br = "SelectItemText", _c = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, className: r, style: o, ...i } = e, a = yn(br, n), s = wn(br, n), l = kc(br, n), c = Nm(br, n), [f, p] = g.useState(null), h = mt(
      t,
      (x) => p(x),
      l.onItemTextChange,
      (x) => {
        var w;
        return (w = s.itemTextRefCallback) == null ? void 0 : w.call(s, x, l.value, l.disabled);
      }
    ), v = f == null ? void 0 : f.textContent, T = g.useMemo(
      () => /* @__PURE__ */ d("option", { value: l.value, disabled: l.disabled, children: v }, l.value),
      [l.disabled, l.value, v]
    ), { onNativeOptionAdd: b, onNativeOptionRemove: E } = c;
    return St(() => (b(T), () => E(T)), [b, E, T]), /* @__PURE__ */ K(mo, { children: [
      /* @__PURE__ */ d(lt.span, { id: l.textId, ...i, ref: h }),
      l.isSelected && a.valueNode && !a.valueNodeHasChildren ? ho.createPortal(i.children, a.valueNode) : null
    ] });
  }
);
_c.displayName = br;
var Lc = "SelectItemIndicator", Pc = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, ...r } = e;
    return kc(Lc, n).isSelected ? /* @__PURE__ */ d(lt.span, { "aria-hidden": !0, ...r, ref: t }) : null;
  }
);
Pc.displayName = Lc;
var Ci = "SelectScrollUpButton", Mc = g.forwardRef((e, t) => {
  const n = wn(Ci, e.__scopeSelect), r = Xi(Ci, e.__scopeSelect), [o, i] = g.useState(!1), a = mt(t, r.onScrollButtonChange);
  return St(() => {
    if (n.viewport && n.isPositioned) {
      let s = function() {
        const c = l.scrollTop > 0;
        i(c);
      };
      const l = n.viewport;
      return s(), l.addEventListener("scroll", s), () => l.removeEventListener("scroll", s);
    }
  }, [n.viewport, n.isPositioned]), o ? /* @__PURE__ */ d(
    Dc,
    {
      ...e,
      ref: a,
      onAutoScroll: () => {
        const { viewport: s, selectedItem: l } = n;
        s && l && (s.scrollTop = s.scrollTop - l.offsetHeight);
      }
    }
  ) : null;
});
Mc.displayName = Ci;
var xi = "SelectScrollDownButton", Oc = g.forwardRef((e, t) => {
  const n = wn(xi, e.__scopeSelect), r = Xi(xi, e.__scopeSelect), [o, i] = g.useState(!1), a = mt(t, r.onScrollButtonChange);
  return St(() => {
    if (n.viewport && n.isPositioned) {
      let s = function() {
        const c = l.scrollHeight - l.clientHeight, f = Math.ceil(l.scrollTop) < c;
        i(f);
      };
      const l = n.viewport;
      return s(), l.addEventListener("scroll", s), () => l.removeEventListener("scroll", s);
    }
  }, [n.viewport, n.isPositioned]), o ? /* @__PURE__ */ d(
    Dc,
    {
      ...e,
      ref: a,
      onAutoScroll: () => {
        const { viewport: s, selectedItem: l } = n;
        s && l && (s.scrollTop = s.scrollTop + l.offsetHeight);
      }
    }
  ) : null;
});
Oc.displayName = xi;
var Dc = g.forwardRef((e, t) => {
  const { __scopeSelect: n, onAutoScroll: r, ...o } = e, i = wn("SelectScrollButton", n), a = g.useRef(null), s = Ao(n), l = g.useCallback(() => {
    a.current !== null && (window.clearInterval(a.current), a.current = null);
  }, []);
  return g.useEffect(() => () => l(), [l]), St(() => {
    var f;
    const c = s().find((p) => p.ref.current === document.activeElement);
    (f = c == null ? void 0 : c.ref.current) == null || f.scrollIntoView({ block: "nearest" });
  }, [s]), /* @__PURE__ */ d(
    lt.div,
    {
      "aria-hidden": !0,
      ...o,
      ref: t,
      style: { flexShrink: 0, ...o.style },
      onPointerDown: Ye(o.onPointerDown, () => {
        a.current === null && (a.current = window.setInterval(r, 50));
      }),
      onPointerMove: Ye(o.onPointerMove, () => {
        var c;
        (c = i.onItemLeave) == null || c.call(i), a.current === null && (a.current = window.setInterval(r, 50));
      }),
      onPointerLeave: Ye(o.onPointerLeave, () => {
        l();
      })
    }
  );
}), Bm = "SelectSeparator", Fm = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, ...r } = e;
    return /* @__PURE__ */ d(lt.div, { "aria-hidden": !0, ...r, ref: t });
  }
);
Fm.displayName = Bm;
var Ei = "SelectArrow", Hm = g.forwardRef(
  (e, t) => {
    const { __scopeSelect: n, ...r } = e, o = ko(n), i = yn(Ei, n), a = wn(Ei, n);
    return i.open && a.position === "popper" ? /* @__PURE__ */ d(Ui, { ...o, ...r, ref: t }) : null;
  }
);
Hm.displayName = Ei;
var zm = "SelectBubbleInput", Ic = g.forwardRef(
  ({ __scopeSelect: e, value: t, ...n }, r) => {
    const o = g.useRef(null), i = mt(r, o), a = bm(t);
    return g.useEffect(() => {
      const s = o.current;
      if (!s) return;
      const l = window.HTMLSelectElement.prototype, f = Object.getOwnPropertyDescriptor(
        l,
        "value"
      ).set;
      if (a !== t && f) {
        const p = new Event("change", { bubbles: !0 });
        f.call(s, t), s.dispatchEvent(p);
      }
    }, [a, t]), /* @__PURE__ */ d(
      lt.select,
      {
        ...n,
        style: { ...fc, ...n.style },
        ref: i,
        defaultValue: t
      }
    );
  }
);
Ic.displayName = zm;
function $c(e) {
  return e === "" || e === void 0;
}
function Bc(e) {
  const t = _n(e), n = g.useRef(""), r = g.useRef(0), o = g.useCallback(
    (a) => {
      const s = n.current + a;
      t(s), (function l(c) {
        n.current = c, window.clearTimeout(r.current), c !== "" && (r.current = window.setTimeout(() => l(""), 1e3));
      })(s);
    },
    [t]
  ), i = g.useCallback(() => {
    n.current = "", window.clearTimeout(r.current);
  }, []);
  return g.useEffect(() => () => window.clearTimeout(r.current), []), [n, o, i];
}
function Fc(e, t, n) {
  const o = t.length > 1 && Array.from(t).every((c) => c === t[0]) ? t[0] : t, i = n ? e.indexOf(n) : -1;
  let a = Wm(e, Math.max(i, 0));
  o.length === 1 && (a = a.filter((c) => c !== n));
  const l = a.find(
    (c) => c.textValue.toLowerCase().startsWith(o.toLowerCase())
  );
  return l !== n ? l : void 0;
}
function Wm(e, t) {
  return e.map((n, r) => e[(t + r) % e.length]);
}
var Ro = mc, _o = hc, jm = yc, Ki = wc, Lo = vc, Po = Cc, Mo = Nc, Er = Rc, Tr = _c, Nr = Pc, Hc = Mc, zc = Oc, [Oo] = Rr("Tooltip", [
  ir
]), Do = ir(), Wc = "TooltipProvider", Um = 700, Ti = "tooltip.open", [qm, Gi] = Oo(Wc), jc = (e) => {
  const {
    __scopeTooltip: t,
    delayDuration: n = Um,
    skipDelayDuration: r = 300,
    disableHoverableContent: o = !1,
    children: i
  } = e, a = g.useRef(!0), s = g.useRef(!1), l = g.useRef(0);
  return g.useEffect(() => {
    const c = l.current;
    return () => window.clearTimeout(c);
  }, []), /* @__PURE__ */ d(
    qm,
    {
      scope: t,
      isOpenDelayedRef: a,
      delayDuration: n,
      onOpen: g.useCallback(() => {
        window.clearTimeout(l.current), a.current = !1;
      }, []),
      onClose: g.useCallback(() => {
        window.clearTimeout(l.current), l.current = window.setTimeout(
          () => a.current = !0,
          r
        );
      }, [r]),
      isPointerInTransitRef: s,
      onPointerInTransitChange: g.useCallback((c) => {
        s.current = c;
      }, []),
      disableHoverableContent: o,
      children: i
    }
  );
};
jc.displayName = Wc;
var Sr = "Tooltip", [Vm, Or] = Oo(Sr), Uc = (e) => {
  const {
    __scopeTooltip: t,
    children: n,
    open: r,
    defaultOpen: o,
    onOpenChange: i,
    disableHoverableContent: a,
    delayDuration: s
  } = e, l = Gi(Sr, e.__scopeTooltip), c = Do(t), [f, p] = g.useState(null), h = _r(), v = g.useRef(0), T = a ?? l.disableHoverableContent, b = s ?? l.delayDuration, E = g.useRef(!1), [x, w] = so({
    prop: r,
    defaultProp: o ?? !1,
    onChange: (H) => {
      H ? (l.onOpen(), document.dispatchEvent(new CustomEvent(Ti))) : l.onClose(), i == null || i(H);
    },
    caller: Sr
  }), k = g.useMemo(() => x ? E.current ? "delayed-open" : "instant-open" : "closed", [x]), D = g.useCallback(() => {
    window.clearTimeout(v.current), v.current = 0, E.current = !1, w(!0);
  }, [w]), j = g.useCallback(() => {
    window.clearTimeout(v.current), v.current = 0, w(!1);
  }, [w]), q = g.useCallback(() => {
    window.clearTimeout(v.current), v.current = window.setTimeout(() => {
      E.current = !0, w(!0), v.current = 0;
    }, b);
  }, [b, w]);
  return g.useEffect(() => () => {
    v.current && (window.clearTimeout(v.current), v.current = 0);
  }, []), /* @__PURE__ */ d(Wi, { ...c, children: /* @__PURE__ */ d(
    Vm,
    {
      scope: t,
      contentId: h,
      open: x,
      stateAttribute: k,
      trigger: f,
      onTriggerChange: p,
      onTriggerEnter: g.useCallback(() => {
        l.isOpenDelayedRef.current ? q() : D();
      }, [l.isOpenDelayedRef, q, D]),
      onTriggerLeave: g.useCallback(() => {
        T ? j() : (window.clearTimeout(v.current), v.current = 0);
      }, [j, T]),
      onOpen: D,
      onClose: j,
      disableHoverableContent: T,
      children: n
    }
  ) });
};
Uc.displayName = Sr;
var Ni = "TooltipTrigger", qc = g.forwardRef(
  (e, t) => {
    const { __scopeTooltip: n, ...r } = e, o = Or(Ni, n), i = Gi(Ni, n), a = Do(n), s = g.useRef(null), l = mt(t, s, o.onTriggerChange), c = g.useRef(!1), f = g.useRef(!1), p = g.useCallback(() => c.current = !1, []);
    return g.useEffect(() => () => document.removeEventListener("pointerup", p), [p]), /* @__PURE__ */ d(xo, { asChild: !0, ...a, children: /* @__PURE__ */ d(
      lt.button,
      {
        "aria-describedby": o.open ? o.contentId : void 0,
        "data-state": o.stateAttribute,
        ...r,
        ref: l,
        onPointerMove: Ye(e.onPointerMove, (h) => {
          h.pointerType !== "touch" && !f.current && !i.isPointerInTransitRef.current && (o.onTriggerEnter(), f.current = !0);
        }),
        onPointerLeave: Ye(e.onPointerLeave, () => {
          o.onTriggerLeave(), f.current = !1;
        }),
        onPointerDown: Ye(e.onPointerDown, () => {
          o.open && o.onClose(), c.current = !0, document.addEventListener("pointerup", p, { once: !0 });
        }),
        onFocus: Ye(e.onFocus, () => {
          c.current || o.onOpen();
        }),
        onBlur: Ye(e.onBlur, o.onClose),
        onClick: Ye(e.onClick, o.onClose)
      }
    ) });
  }
);
qc.displayName = Ni;
var Yi = "TooltipPortal", [Xm, Km] = Oo(Yi, {
  forceMount: void 0
}), Vc = (e) => {
  const { __scopeTooltip: t, forceMount: n, children: r, container: o } = e, i = Or(Yi, t);
  return /* @__PURE__ */ d(Xm, { scope: t, forceMount: n, children: /* @__PURE__ */ d(Pr, { present: n || i.open, children: /* @__PURE__ */ d(Eo, { asChild: !0, container: o, children: r }) }) });
};
Vc.displayName = Yi;
var tr = "TooltipContent", Xc = g.forwardRef(
  (e, t) => {
    const n = Km(tr, e.__scopeTooltip), { forceMount: r = n.forceMount, side: o = "top", ...i } = e, a = Or(tr, e.__scopeTooltip);
    return /* @__PURE__ */ d(Pr, { present: r || a.open, children: a.disableHoverableContent ? /* @__PURE__ */ d(Kc, { side: o, ...i, ref: t }) : /* @__PURE__ */ d(Gm, { side: o, ...i, ref: t }) });
  }
), Gm = g.forwardRef((e, t) => {
  const n = Or(tr, e.__scopeTooltip), r = Gi(tr, e.__scopeTooltip), o = g.useRef(null), i = mt(t, o), [a, s] = g.useState(null), { trigger: l, onClose: c } = n, f = o.current, { onPointerInTransitChange: p } = r, h = g.useCallback(() => {
    s(null), p(!1);
  }, [p]), v = g.useCallback(
    (T, b) => {
      const E = T.currentTarget, x = { x: T.clientX, y: T.clientY }, w = Jm(x, E.getBoundingClientRect()), k = eg(x, w), D = tg(b.getBoundingClientRect()), j = rg([...k, ...D]);
      s(j), p(!0);
    },
    [p]
  );
  return g.useEffect(() => () => h(), [h]), g.useEffect(() => {
    if (l && f) {
      const T = (E) => v(E, f), b = (E) => v(E, l);
      return l.addEventListener("pointerleave", T), f.addEventListener("pointerleave", b), () => {
        l.removeEventListener("pointerleave", T), f.removeEventListener("pointerleave", b);
      };
    }
  }, [l, f, v, h]), g.useEffect(() => {
    if (a) {
      const T = (b) => {
        const E = b.target, x = { x: b.clientX, y: b.clientY }, w = (l == null ? void 0 : l.contains(E)) || (f == null ? void 0 : f.contains(E)), k = !ng(x, a);
        w ? h() : k && (h(), c());
      };
      return document.addEventListener("pointermove", T), () => document.removeEventListener("pointermove", T);
    }
  }, [l, f, a, c, h]), /* @__PURE__ */ d(Kc, { ...e, ref: i });
}), [Ym, Qm] = Oo(Sr, { isInside: !1 }), Zm = /* @__PURE__ */ _d("TooltipContent"), Kc = g.forwardRef(
  (e, t) => {
    const {
      __scopeTooltip: n,
      children: r,
      "aria-label": o,
      onEscapeKeyDown: i,
      onPointerDownOutside: a,
      ...s
    } = e, l = Or(tr, n), c = Do(n), { onClose: f } = l;
    return g.useEffect(() => (document.addEventListener(Ti, f), () => document.removeEventListener(Ti, f)), [f]), g.useEffect(() => {
      if (l.trigger) {
        const p = (h) => {
          const v = h.target;
          v != null && v.contains(l.trigger) && f();
        };
        return window.addEventListener("scroll", p, { capture: !0 }), () => window.removeEventListener("scroll", p, { capture: !0 });
      }
    }, [l.trigger, f]), /* @__PURE__ */ d(
      bo,
      {
        asChild: !0,
        disableOutsidePointerEvents: !1,
        onEscapeKeyDown: i,
        onPointerDownOutside: a,
        onFocusOutside: (p) => p.preventDefault(),
        onDismiss: f,
        children: /* @__PURE__ */ K(
          ji,
          {
            "data-state": l.stateAttribute,
            ...c,
            ...s,
            ref: t,
            style: {
              ...s.style,
              "--radix-tooltip-content-transform-origin": "var(--radix-popper-transform-origin)",
              "--radix-tooltip-content-available-width": "var(--radix-popper-available-width)",
              "--radix-tooltip-content-available-height": "var(--radix-popper-available-height)",
              "--radix-tooltip-trigger-width": "var(--radix-popper-anchor-width)",
              "--radix-tooltip-trigger-height": "var(--radix-popper-anchor-height)"
            },
            children: [
              /* @__PURE__ */ d(Zm, { children: r }),
              /* @__PURE__ */ d(Ym, { scope: n, isInside: !0, children: /* @__PURE__ */ d(wm, { id: l.contentId, role: "tooltip", children: o || r }) })
            ]
          }
        )
      }
    );
  }
);
Xc.displayName = tr;
var Gc = "TooltipArrow", Yc = g.forwardRef(
  (e, t) => {
    const { __scopeTooltip: n, ...r } = e, o = Do(n);
    return Qm(
      Gc,
      n
    ).isInside ? null : /* @__PURE__ */ d(Ui, { ...o, ...r, ref: t });
  }
);
Yc.displayName = Gc;
function Jm(e, t) {
  const n = Math.abs(t.top - e.y), r = Math.abs(t.bottom - e.y), o = Math.abs(t.right - e.x), i = Math.abs(t.left - e.x);
  switch (Math.min(n, r, o, i)) {
    case i:
      return "left";
    case o:
      return "right";
    case n:
      return "top";
    case r:
      return "bottom";
    default:
      throw new Error("unreachable");
  }
}
function eg(e, t, n = 5) {
  const r = [];
  switch (t) {
    case "top":
      r.push(
        { x: e.x - n, y: e.y + n },
        { x: e.x + n, y: e.y + n }
      );
      break;
    case "bottom":
      r.push(
        { x: e.x - n, y: e.y - n },
        { x: e.x + n, y: e.y - n }
      );
      break;
    case "left":
      r.push(
        { x: e.x + n, y: e.y - n },
        { x: e.x + n, y: e.y + n }
      );
      break;
    case "right":
      r.push(
        { x: e.x - n, y: e.y - n },
        { x: e.x - n, y: e.y + n }
      );
      break;
  }
  return r;
}
function tg(e) {
  const { top: t, right: n, bottom: r, left: o } = e;
  return [
    { x: o, y: t },
    { x: n, y: t },
    { x: n, y: r },
    { x: o, y: r }
  ];
}
function ng(e, t) {
  const { x: n, y: r } = e;
  let o = !1;
  for (let i = 0, a = t.length - 1; i < t.length; a = i++) {
    const s = t[i], l = t[a], c = s.x, f = s.y, p = l.x, h = l.y;
    f > r != h > r && n < (p - c) * (r - f) / (h - f) + c && (o = !o);
  }
  return o;
}
function rg(e) {
  const t = e.slice();
  return t.sort((n, r) => n.x < r.x ? -1 : n.x > r.x ? 1 : n.y < r.y ? -1 : n.y > r.y ? 1 : 0), og(t);
}
function og(e) {
  if (e.length <= 1) return e.slice();
  const t = [];
  for (let r = 0; r < e.length; r++) {
    const o = e[r];
    for (; t.length >= 2; ) {
      const i = t[t.length - 1], a = t[t.length - 2];
      if ((i.x - a.x) * (o.y - a.y) >= (i.y - a.y) * (o.x - a.x)) t.pop();
      else break;
    }
    t.push(o);
  }
  t.pop();
  const n = [];
  for (let r = e.length - 1; r >= 0; r--) {
    const o = e[r];
    for (; n.length >= 2; ) {
      const i = n[n.length - 1], a = n[n.length - 2];
      if ((i.x - a.x) * (o.y - a.y) >= (i.y - a.y) * (o.x - a.x)) n.pop();
      else break;
    }
    n.push(o);
  }
  return n.pop(), t.length === 1 && n.length === 1 && t[0].x === n[0].x && t[0].y === n[0].y ? t : t.concat(n);
}
var Qc = jc, sr = Uc, lr = qc, cr = Vc, ur = Xc, dr = Yc;
const Si = {
  bold: !1,
  italic: !1,
  underline: !1,
  strikethrough: !1,
  superscript: !1,
  subscript: !1,
  fontSize: "",
  unorderedList: !1,
  orderedList: !1,
  block: "p",
  align: "",
  link: !1,
  linkHref: "",
  blockquote: !1,
  pasteFormatting: "clean",
  canUndo: !1,
  canRedo: !1,
  reflowState: "idle",
  pageCount: 0,
  characterCount: 0,
  wordCount: 0,
  isEmpty: !0
}, ig = Hu(
  sg,
  (e, t) => e.editor !== t.editor || e.editorRef !== t.editorRef || e.disabled !== t.disabled || e.className !== t.className || e.labels !== t.labels || e.onCommand !== t.onCommand || e.onUndo !== t.onUndo || e.onRedo !== t.onRedo || e.onImageInsert !== t.onImageInsert || e.features !== t.features ? !1 : ag(e.state, t.state)
);
function ag(e, t) {
  if (e === t) return !0;
  if (!e || !t) return !1;
  const n = Object.keys(e);
  if (n.length !== Object.keys(t).length) return !1;
  for (const r of n)
    if (!Object.is(e[r], t[r])) return !1;
  return !0;
}
function sg({
  editor: e,
  editorRef: t,
  state: n,
  disabled: r,
  className: o,
  labels: i,
  onCommand: a,
  onUndo: s,
  onRedo: l,
  onImageInsert: c,
  features: f
}) {
  const p = f ?? new Proxy({}, { get: () => !0 }), h = e ?? (t == null ? void 0 : t.current) ?? null, [v, T] = Qe(
    n ?? (h == null ? void 0 : h.getState()) ?? Si
  );
  Ze(() => {
    if (n) return;
    const z = e ?? (t == null ? void 0 : t.current) ?? null;
    if (z)
      return T(z.getState()), z.subscribe(T);
  }, [e, t, n]);
  const b = n ?? v, E = e ?? (t == null ? void 0 : t.current) ?? null, x = !!r, w = si(() => ({ ...yg, ...i }), [i]), [k, D] = Qe(!1), [j, q] = Qe(""), [H, Q] = Qe(!1), [be, ke] = Qe(!1), we = X(null), $e = X(null), Re = X(null), Me = X(null), V = (z, ee) => {
    x || (a ? a(z, ee) : E == null || E.runCommand(z, ee));
  }, ve = () => {
    x || !b.canUndo || (s ? s() : E == null || E.undo());
  }, _e = () => {
    x || !b.canRedo || (l ? l() : E == null || E.redo());
  }, de = () => {
    x || (c ? c() : E == null || E.requestImageInsert());
  }, Le = () => {
    x || (q(b.linkHref ?? ""), Q(!1), D(!0));
  }, Ve = () => {
    var z;
    D(!1), q(""), (z = we.current) == null || z.focus();
  }, st = () => {
    const z = j.trim();
    if (!z) {
      Ve();
      return;
    }
    V("createLink", z), Ve();
  }, et = () => {
    x || (D(!1), Q(!0));
  }, tt = () => {
    var z;
    Q(!1), (z = $e.current) == null || z.focus();
  }, nt = (z, ee, Be) => {
    V("insertTable", JSON.stringify({ rows: z, cols: ee, header: Be })), tt();
  }, ot = () => {
    var z;
    x || (z = E == null ? void 0 : E.openFind) == null || z.call(E);
  };
  return Ze(() => {
    if (!k) return;
    const z = window.setTimeout(() => {
      var ee;
      return (ee = Re.current) == null ? void 0 : ee.focus();
    }, 0);
    return () => window.clearTimeout(z);
  }, [k]), /* @__PURE__ */ d(Qc, { delayDuration: 400, skipDelayDuration: 150, children: /* @__PURE__ */ K(
    "div",
    {
      ref: Me,
      className: ["pagedly-toolbar", "pagedly-toolbar--split", o].filter(Boolean).join(" "),
      role: "toolbar",
      children: [
        /* @__PURE__ */ K("div", { className: "pagedly-toolbar__row pagedly-toolbar__row--primary", children: [
          /* @__PURE__ */ K(Bt, { className: "pagedly-toolbar__history", children: [
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.undo,
                disabled: x || !b.canUndo,
                onClick: ve,
                children: /* @__PURE__ */ d(ju, { "aria-hidden": !0, size: 16 })
              }
            ),
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.redo,
                disabled: x || !b.canRedo,
                onClick: _e,
                children: /* @__PURE__ */ d(Uu, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ d(
            Ae,
            {
              label: w.paragraph,
              active: b.block === "p",
              disabled: x,
              onClick: () => V("formatBlock", "p"),
              children: /* @__PURE__ */ d(rl, { "aria-hidden": !0, size: 16 })
            }
          ),
          p.headings && /* @__PURE__ */ d(
            hg,
            {
              value: b.block,
              disabled: x,
              onChange: (z) => V("formatBlock", z),
              labels: w
            }
          ),
          p.blockquote && /* @__PURE__ */ d(
            Ae,
            {
              label: w.blockquote ?? "Quote",
              active: b.blockquote,
              disabled: x,
              onClick: () => V("toggleBlockquote"),
              children: /* @__PURE__ */ d(qu, { "aria-hidden": !0, size: 16 })
            }
          ),
          p.codeBlock && /* @__PURE__ */ d(
            Ae,
            {
              label: w.codeBlock ?? "Code block",
              disabled: x,
              onClick: () => V("formatCodeBlock"),
              children: /* @__PURE__ */ d(Vu, { "aria-hidden": !0, size: 16 })
            }
          ),
          /* @__PURE__ */ d(en, {}),
          p.fontSize && /* @__PURE__ */ d(
            pg,
            {
              value: b.fontSize,
              disabled: x,
              editor: E,
              onChange: (z) => V("setFontSize", z)
            }
          ),
          /* @__PURE__ */ K(Bt, { children: [
            p.fontFamily && /* @__PURE__ */ d(
              bg,
              {
                disabled: x,
                label: w.fontFamily ?? "Font family",
                onChange: (z) => V("setFontFamily", z)
              }
            ),
            p.fontColor && /* @__PURE__ */ d(
              ys,
              {
                label: w.fontColor ?? "Text color",
                icon: /* @__PURE__ */ d(Xu, { "aria-hidden": !0, size: 16 }),
                palette: dg,
                disabled: x,
                onPick: (z) => V("setFontColor", z)
              }
            ),
            p.highlight && /* @__PURE__ */ d(
              ys,
              {
                label: w.highlightColor ?? "Highlight color",
                icon: /* @__PURE__ */ d(Ku, { "aria-hidden": !0, size: 16 }),
                palette: fg,
                disabled: x,
                onPick: (z) => V("setHighlightColor", z)
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.bold && /* @__PURE__ */ d(
              Ae,
              {
                label: w.bold,
                active: b.bold,
                disabled: x,
                onClick: () => V("bold"),
                children: /* @__PURE__ */ d(Gu, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.italic && /* @__PURE__ */ d(
              Ae,
              {
                label: w.italic,
                active: b.italic,
                disabled: x,
                onClick: () => V("italic"),
                children: /* @__PURE__ */ d(Yu, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.underline && /* @__PURE__ */ d(
              Ae,
              {
                label: w.underline,
                active: b.underline,
                disabled: x,
                onClick: () => V("underline"),
                children: /* @__PURE__ */ d(Qu, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.inlineCode && /* @__PURE__ */ d(
              Ae,
              {
                label: w.inlineCode ?? "Inline code",
                disabled: x,
                onClick: () => V("toggleInlineCode"),
                children: /* @__PURE__ */ d(ol, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.bulletList && /* @__PURE__ */ d(
              Ae,
              {
                label: w.bulletList,
                active: b.unorderedList,
                disabled: x,
                onClick: () => V("insertUnorderedList"),
                children: /* @__PURE__ */ d(il, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.numberedList && /* @__PURE__ */ d(
              Ae,
              {
                label: w.numberedList,
                active: b.orderedList,
                disabled: x,
                onClick: () => V("insertOrderedList"),
                children: /* @__PURE__ */ d(al, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.checklist && /* @__PURE__ */ d(
              Ae,
              {
                label: w.checklist ?? "Checklist",
                disabled: x,
                onClick: () => V("insertChecklist"),
                children: /* @__PURE__ */ d(sl, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          p.alignment && /* @__PURE__ */ K(Bt, { className: "pagedly-toolbar__group--alignment", children: [
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.alignLeft,
                active: b.align === "left",
                disabled: x,
                onClick: () => V("justifyLeft"),
                children: /* @__PURE__ */ d(Zu, { "aria-hidden": !0, size: 16 })
              }
            ),
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.alignCenter,
                active: b.align === "center",
                disabled: x,
                onClick: () => V("justifyCenter"),
                children: /* @__PURE__ */ d(Ju, { "aria-hidden": !0, size: 16 })
              }
            ),
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.alignRight,
                active: b.align === "right",
                disabled: x,
                onClick: () => V("justifyRight"),
                children: /* @__PURE__ */ d(ed, { "aria-hidden": !0, size: 16 })
              }
            ),
            /* @__PURE__ */ d(
              Ae,
              {
                label: w.justify,
                active: b.align === "justify",
                disabled: x,
                onClick: () => V("justifyFull"),
                children: /* @__PURE__ */ d(td, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          (p.indent || p.lineSpacing) && /* @__PURE__ */ K(Bt, { children: [
            p.indent && /* @__PURE__ */ d(
              Ae,
              {
                label: w.outdent ?? "Decrease indent",
                disabled: x,
                onClick: () => V("outdent"),
                children: /* @__PURE__ */ d(nd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.indent && /* @__PURE__ */ d(
              Ae,
              {
                label: w.indent ?? "Increase indent",
                disabled: x,
                onClick: () => V("indent"),
                children: /* @__PURE__ */ d(rd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.lineSpacing && /* @__PURE__ */ d(
              gg,
              {
                disabled: x,
                label: w.lineSpacing ?? "Line spacing",
                onChange: (z) => V("setLineSpacing", z)
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.link && /* Link popover — Radix Popover anchored to the link button.
            Auto-positions below the trigger, traps focus, dismisses on
            outside click + Escape. */
            /* @__PURE__ */ K(
              mi,
              {
                open: k,
                onOpenChange: (z) => {
                  z ? Le() : Ve();
                },
                children: [
                  /* @__PURE__ */ d(gi, { asChild: !0, children: /* @__PURE__ */ d(
                    Ae,
                    {
                      ref: we,
                      label: b.link ? w.editLink : w.insertLink,
                      active: b.link,
                      disabled: x,
                      onClick: () => {
                      },
                      children: /* @__PURE__ */ d(od, { "aria-hidden": !0, size: 16 })
                    }
                  ) }),
                  /* @__PURE__ */ d(hi, { children: /* @__PURE__ */ K(
                    bi,
                    {
                      className: "pagedly-toolbar__popover pagedly-toolbar__popover--link",
                      side: "bottom",
                      align: "start",
                      sideOffset: 6,
                      "aria-label": w.insertLink,
                      onOpenAutoFocus: (z) => {
                        var ee;
                        z.preventDefault(), (ee = Re.current) == null || ee.focus();
                      },
                      children: [
                        /* @__PURE__ */ d(
                          "input",
                          {
                            ref: Re,
                            type: "url",
                            value: j,
                            placeholder: "https://example.com",
                            "aria-label": w.linkUrlLabel,
                            className: "pagedly-toolbar__popover-input",
                            onChange: (z) => q(z.target.value),
                            onKeyDown: (z) => {
                              z.key === "Enter" && (z.preventDefault(), st());
                            }
                          }
                        ),
                        /* @__PURE__ */ d(
                          "button",
                          {
                            type: "button",
                            className: "pagedly-toolbar__popover-button",
                            onMouseDown: (z) => z.preventDefault(),
                            onClick: st,
                            children: w.apply
                          }
                        ),
                        /* @__PURE__ */ d(
                          "button",
                          {
                            type: "button",
                            className: "pagedly-toolbar__popover-button pagedly-toolbar__popover-button--ghost",
                            onMouseDown: (z) => z.preventDefault(),
                            onClick: Ve,
                            children: w.cancel
                          }
                        ),
                        /* @__PURE__ */ d(yi, { className: "pagedly-toolbar__popover-arrow" })
                      ]
                    }
                  ) })
                ]
              }
            ),
            p.image && /* @__PURE__ */ d(Ae, { label: w.insertImage, disabled: x, onClick: de, children: /* @__PURE__ */ d(ll, { "aria-hidden": !0, size: 16 }) })
          ] }),
          /* @__PURE__ */ d(Bt, { children: /* @__PURE__ */ d(
            Ae,
            {
              label: be ? w.hideMore ?? "Hide extras" : w.showMore ?? "More options",
              active: be,
              disabled: x,
              onClick: () => ke((z) => !z),
              children: /* @__PURE__ */ d(li, { "aria-hidden": !0, size: 16 })
            }
          ) }),
          p.wordCount && /* @__PURE__ */ d(
            lg,
            {
              words: b.wordCount,
              characters: b.characterCount,
              wordsLabel: w.words ?? "words",
              charsLabel: w.characters ?? "chars",
              readTimeLabel: w.readTime ?? "min read"
            }
          )
        ] }),
        be ? /* @__PURE__ */ K("div", { className: "pagedly-toolbar__row pagedly-toolbar__row--secondary", children: [
          /* @__PURE__ */ K(Bt, { children: [
            p.strikethrough && /* @__PURE__ */ d(
              Ae,
              {
                label: w.strikethrough,
                active: b.strikethrough,
                disabled: x,
                onClick: () => V("strikeThrough"),
                children: /* @__PURE__ */ d(id, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.superscript && /* @__PURE__ */ d(
              Ae,
              {
                label: w.superscript,
                active: b.superscript,
                disabled: x,
                onClick: () => V("superscript"),
                children: /* @__PURE__ */ d(ad, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.subscript && /* @__PURE__ */ d(
              Ae,
              {
                label: w.subscript,
                active: b.subscript,
                disabled: x,
                onClick: () => V("subscript"),
                children: /* @__PURE__ */ d(sd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.removeFormat && /* @__PURE__ */ d(
              Ae,
              {
                label: w.removeFormat,
                disabled: x,
                onClick: () => V("removeFormat"),
                children: /* @__PURE__ */ d(ld, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.link && /* @__PURE__ */ d(
              Ae,
              {
                label: w.unlink,
                disabled: x || !b.link,
                onClick: () => V("unlink"),
                children: /* @__PURE__ */ d(cd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.horizontalRule && /* @__PURE__ */ d(
              Ae,
              {
                label: w.horizontalRule,
                disabled: x,
                onClick: () => V("insertHorizontalRule"),
                children: /* @__PURE__ */ d(cl, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.pageBreak && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertPageBreak,
                disabled: x,
                onClick: () => V("insertPageBreak"),
                children: /* @__PURE__ */ d(ud, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.footnotes && p.footnotes !== "off" && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertFootnote ?? "Insert footnote",
                disabled: x,
                onClick: () => V("insertFootnote"),
                children: /* @__PURE__ */ d(ul, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.paste && /* @__PURE__ */ d(
              Ae,
              {
                label: w.pastePlain,
                disabled: x,
                onClick: () => V("pastePlain"),
                children: /* @__PURE__ */ d(dd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.paste && /* @__PURE__ */ d(
              Ae,
              {
                label: w.pasteKeepFormatting,
                active: b.pasteFormatting === "rich",
                disabled: x,
                onClick: () => V(
                  "setPasteFormatting",
                  b.pasteFormatting === "rich" ? "clean" : "rich"
                ),
                children: /* @__PURE__ */ d(fd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.table && /* @__PURE__ */ K(
              mi,
              {
                open: H,
                onOpenChange: (z) => {
                  z ? et() : tt();
                },
                children: [
                  /* @__PURE__ */ d(gi, { asChild: !0, children: /* @__PURE__ */ d(
                    Ae,
                    {
                      ref: $e,
                      label: w.insertTable,
                      disabled: x,
                      onClick: () => {
                      },
                      children: /* @__PURE__ */ d(dl, { "aria-hidden": !0, size: 16 })
                    }
                  ) }),
                  /* @__PURE__ */ d(hi, { children: /* @__PURE__ */ K(
                    bi,
                    {
                      className: "pagedly-toolbar__popover pagedly-toolbar__popover--table",
                      side: "bottom",
                      align: "start",
                      sideOffset: 6,
                      "aria-label": w.insertTable,
                      children: [
                        /* @__PURE__ */ d(
                          cg,
                          {
                            label: w.insertTable,
                            onPick: nt,
                            onClose: tt
                          }
                        ),
                        /* @__PURE__ */ d(yi, { className: "pagedly-toolbar__popover-arrow" })
                      ]
                    }
                  ) })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.toc && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertToc ?? "Insert table of contents",
                disabled: x,
                onClick: () => V("insertTableOfContents"),
                children: /* @__PURE__ */ d(fl, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.sections && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertSectionBreak ?? "Insert section break",
                disabled: x,
                onClick: () => V("insertSectionBreak"),
                children: /* @__PURE__ */ d(pl, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.toc && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertCrossReference ?? "Insert cross-reference",
                disabled: x,
                onClick: () => V("insertCrossReference"),
                children: /* @__PURE__ */ d(ml, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.leaders && /* @__PURE__ */ d(
              Ae,
              {
                label: w.insertLeader ?? "Insert leader row",
                disabled: x,
                onClick: () => V("insertLeader"),
                children: /* @__PURE__ */ d(li, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.columns && /* @__PURE__ */ d(
              Ae,
              {
                label: w.toggleColumns ?? "Two columns",
                disabled: x,
                onClick: () => V("toggleColumns"),
                children: /* @__PURE__ */ d(pd, { "aria-hidden": !0, size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ d(en, {}),
          /* @__PURE__ */ K(Bt, { children: [
            p.find && /* @__PURE__ */ d(Ae, { label: w.find, disabled: x, onClick: ot, children: /* @__PURE__ */ d(md, { "aria-hidden": !0, size: 16 }) }),
            p.print && /* @__PURE__ */ d(
              Ae,
              {
                label: w.print ?? "Print",
                disabled: x,
                onClick: () => {
                  typeof window < "u" && window.print();
                },
                children: /* @__PURE__ */ d(gd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.downloadPdf && /* @__PURE__ */ d(
              Ae,
              {
                label: w.downloadPdf,
                disabled: x || !(E != null && E.downloadPdf),
                onClick: () => {
                  var z;
                  return (z = E == null ? void 0 : E.downloadPdf) == null ? void 0 : z.call(E);
                },
                children: /* @__PURE__ */ d(hd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.exportDocx && /* @__PURE__ */ d(
              Ae,
              {
                label: w.exportDocx ?? "Export as DOCX",
                disabled: x,
                onClick: () => V("exportDocx"),
                children: /* @__PURE__ */ d(bd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.importDocx && /* @__PURE__ */ d(
              Ae,
              {
                label: w.importDocx ?? "Import DOCX",
                disabled: x,
                onClick: () => V("importDocx"),
                children: /* @__PURE__ */ d(yd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.exportMarkdown && /* @__PURE__ */ d(
              Ae,
              {
                label: w.exportMarkdown ?? "Export as Markdown",
                disabled: x,
                onClick: () => V("exportMarkdown"),
                children: /* @__PURE__ */ d(wd, { "aria-hidden": !0, size: 16 })
              }
            ),
            p.importMarkdown && /* @__PURE__ */ d(
              Ae,
              {
                label: w.importMarkdown ?? "Import Markdown",
                disabled: x,
                onClick: () => V("importMarkdown"),
                children: /* @__PURE__ */ d(vd, { "aria-hidden": !0, size: 16 })
              }
            )
          ] })
        ] }) : null
      ]
    }
  ) });
}
function lg({
  words: e,
  characters: t,
  wordsLabel: n,
  charsLabel: r,
  readTimeLabel: o
}) {
  const i = Math.max(1, Math.ceil(e / 200));
  return /* @__PURE__ */ K(
    "div",
    {
      className: "pagedly-toolbar__status pagedly-toolbar__wordcount",
      role: "status",
      "aria-live": "off",
      title: `${e.toLocaleString()} ${n} · ${t.toLocaleString()} ${r} · ${i} ${o}`,
      children: [
        /* @__PURE__ */ K("span", { className: "pagedly-toolbar__wordcount-words", children: [
          e.toLocaleString(),
          " ",
          n
        ] }),
        /* @__PURE__ */ d("span", { className: "pagedly-toolbar__wordcount-sep", "aria-hidden": !0, children: "·" }),
        /* @__PURE__ */ K("span", { className: "pagedly-toolbar__wordcount-chars", children: [
          t.toLocaleString(),
          " ",
          r
        ] }),
        /* @__PURE__ */ d("span", { className: "pagedly-toolbar__wordcount-sep", "aria-hidden": !0, children: "·" }),
        /* @__PURE__ */ K("span", { className: "pagedly-toolbar__wordcount-time", children: [
          i,
          " ",
          o
        ] })
      ]
    }
  );
}
function cg({
  label: e,
  onPick: t,
  onClose: n
}) {
  const [r, o] = Qe(2), [i, a] = Qe(2), [s, l] = Qe(!0), c = 8, f = 8;
  return /* @__PURE__ */ K("div", { className: "pagedly-table-picker", role: "group", "aria-label": e, children: [
    /* @__PURE__ */ d("div", { className: "pagedly-table-picker__grid", role: "grid", "aria-label": `${e}: ${r} × ${i}`, children: Array.from({ length: c }).map((p, h) => /* @__PURE__ */ d("div", { role: "row", className: "pagedly-table-picker__row", children: Array.from({ length: f }).map((v, T) => {
      const b = h < r && T < i;
      return /* @__PURE__ */ d(
        "button",
        {
          type: "button",
          role: "gridcell",
          "aria-label": `${h + 1} × ${T + 1}`,
          className: `pagedly-table-picker__cell${b ? " pagedly-table-picker__cell--active" : ""}`,
          onMouseEnter: () => {
            o(h + 1), a(T + 1);
          },
          onFocus: () => {
            o(h + 1), a(T + 1);
          },
          onMouseDown: (E) => E.preventDefault(),
          onClick: () => t(h + 1, T + 1, s)
        },
        T
      );
    }) }, h)) }),
    /* @__PURE__ */ K("label", { className: "pagedly-table-picker__option", children: [
      /* @__PURE__ */ d(
        "input",
        {
          type: "checkbox",
          checked: s,
          onChange: (p) => l(p.target.checked)
        }
      ),
      "Header row"
    ] }),
    /* @__PURE__ */ K("div", { className: "pagedly-table-picker__readout", "aria-live": "polite", children: [
      r,
      " × ",
      i
    ] })
  ] });
}
function Bt({ children: e, className: t }) {
  return /* @__PURE__ */ d("div", { className: ["pagedly-toolbar__group", t].filter(Boolean).join(" "), children: e });
}
const ug = [
  { label: "System Default", stack: "" },
  { label: "Sans serif", stack: "system-ui, sans-serif" },
  { label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  // Google fonts — alphabetical
  { label: "DM Sans", stack: "'DM Sans', sans-serif", googleFamily: "DM+Sans" },
  { label: "DM Serif Display", stack: "'DM Serif Display', serif", googleFamily: "DM+Serif+Display" },
  { label: "Inter", stack: "'Inter', sans-serif", googleFamily: "Inter" },
  { label: "Lato", stack: "'Lato', sans-serif", googleFamily: "Lato" },
  { label: "Lora", stack: "'Lora', serif", googleFamily: "Lora" },
  { label: "Merriweather", stack: "'Merriweather', serif", googleFamily: "Merriweather" },
  { label: "Montserrat", stack: "'Montserrat', sans-serif", googleFamily: "Montserrat" },
  { label: "Nunito", stack: "'Nunito', sans-serif", googleFamily: "Nunito" },
  { label: "Open Sans", stack: "'Open Sans', sans-serif", googleFamily: "Open+Sans" },
  { label: "Playfair Display", stack: "'Playfair Display', serif", googleFamily: "Playfair+Display" },
  { label: "Poppins", stack: "'Poppins', sans-serif", googleFamily: "Poppins" },
  { label: "Raleway", stack: "'Raleway', sans-serif", googleFamily: "Raleway" },
  { label: "Roboto", stack: "'Roboto', sans-serif", googleFamily: "Roboto" },
  { label: "Source Sans 3", stack: "'Source Sans 3', sans-serif", googleFamily: "Source+Sans+3" },
  { label: "Work Sans", stack: "'Work Sans', sans-serif", googleFamily: "Work+Sans" }
], hs = /* @__PURE__ */ new Set();
function ti(e) {
  if (typeof document > "u" || hs.has(e)) return;
  hs.add(e);
  const t = document.createElement("link");
  t.rel = "stylesheet", t.href = `https://fonts.googleapis.com/css2?family=${e}:wght@400;600;700&display=swap`, t.setAttribute("data-pagedly-google-font", e), document.head.appendChild(t);
}
const dg = [
  { label: "Black", value: "#000000" },
  { label: "Dark gray", value: "#374151" },
  { label: "Gray", value: "#6b7280" },
  { label: "Light gray", value: "#9ca3af" },
  { label: "White", value: "#ffffff" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Amber", value: "#d97706" },
  { label: "Yellow", value: "#facc15" },
  { label: "Lime", value: "#65a30d" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#0d9488" },
  { label: "Cyan", value: "#0891b2" },
  { label: "Sky", value: "#0284c7" },
  { label: "Blue", value: "#2563eb" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Fuchsia", value: "#c026d3" },
  { label: "Pink", value: "#db2777" },
  { label: "Rose", value: "#e11d48" }
], fg = [
  { label: "None", value: "transparent" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Lime", value: "#d9f99d" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Cyan", value: "#a5f3fc" },
  { label: "Sky", value: "#bae6fd" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Indigo", value: "#c7d2fe" },
  { label: "Violet", value: "#ddd6fe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Rose", value: "#fecdd3" },
  { label: "Orange", value: "#fed7aa" }
], bs = [
  "8px",
  "9px",
  "10px",
  "11px",
  "12px",
  "13px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "36px",
  "48px",
  "60px",
  "72px"
];
function pg({
  value: e,
  disabled: t,
  onChange: n
}) {
  const r = e || "", o = !!r && !bs.includes(r);
  return /* @__PURE__ */ K(
    Ro,
    {
      value: r,
      disabled: t,
      onValueChange: (i) => n(i === "__placeholder__" ? "" : i),
      children: [
        /* @__PURE__ */ d(Qc, { delayDuration: 400, children: /* @__PURE__ */ K(sr, { children: [
          /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ K(
            _o,
            {
              className: "pagedly-toolbar__fontsize",
              "aria-label": "Font size",
              "data-disabled": t || void 0,
              children: [
                /* @__PURE__ */ d(jm, { placeholder: "Size" }),
                /* @__PURE__ */ d(Ki, { className: "pagedly-toolbar__fontsize-chevron", children: /* @__PURE__ */ d(wr, { "aria-hidden": !0, size: 12 }) })
              ]
            }
          ) }),
          /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(
            ur,
            {
              className: "pagedly-toolbar__tooltip",
              side: "bottom",
              sideOffset: 6,
              children: [
                "Font size",
                /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
              ]
            }
          ) })
        ] }) }),
        /* @__PURE__ */ d(Lo, { children: /* @__PURE__ */ K(
          Po,
          {
            className: "pagedly-toolbar__select-content",
            position: "popper",
            sideOffset: 4,
            children: [
              /* @__PURE__ */ d(Hc, { className: "pagedly-toolbar__select-scroll", children: /* @__PURE__ */ d(yl, { "aria-hidden": !0, size: 12 }) }),
              /* @__PURE__ */ K(Mo, { children: [
                o ? /* @__PURE__ */ K(Er, { value: r, className: "pagedly-toolbar__select-item", children: [
                  /* @__PURE__ */ d(Nr, { className: "pagedly-toolbar__select-indicator", children: /* @__PURE__ */ d(vr, { "aria-hidden": !0, size: 12 }) }),
                  /* @__PURE__ */ d(Tr, { children: r.replace("px", "") })
                ] }) : null,
                bs.map((i) => /* @__PURE__ */ K(Er, { value: i, className: "pagedly-toolbar__select-item", children: [
                  /* @__PURE__ */ d(Nr, { className: "pagedly-toolbar__select-indicator", children: /* @__PURE__ */ d(vr, { "aria-hidden": !0, size: 12 }) }),
                  /* @__PURE__ */ d(Tr, { children: i.replace("px", "") })
                ] }, i))
              ] }),
              /* @__PURE__ */ d(zc, { className: "pagedly-toolbar__select-scroll", children: /* @__PURE__ */ d(wr, { "aria-hidden": !0, size: 12 }) })
            ]
          }
        ) })
      ]
    }
  );
}
const mg = [
  { value: "1", label: "Single" },
  { value: "1.15", label: "1.15" },
  { value: "1.5", label: "1.5" },
  { value: "2", label: "Double" },
  { value: "__clear__", label: "Clear" }
];
function gg({
  disabled: e,
  onChange: t,
  label: n
}) {
  return /* @__PURE__ */ K(
    Ro,
    {
      value: "",
      disabled: e,
      onValueChange: (r) => t(r === "__clear__" ? "" : r),
      children: [
        /* @__PURE__ */ K(sr, { children: [
          /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ K(
            _o,
            {
              className: "pagedly-toolbar__fontsize",
              "aria-label": n,
              "data-disabled": e || void 0,
              children: [
                /* @__PURE__ */ d("span", { "aria-hidden": !0, style: { fontSize: 14, lineHeight: 1 }, children: "↕" }),
                /* @__PURE__ */ d(Ki, { className: "pagedly-toolbar__fontsize-chevron", children: /* @__PURE__ */ d(wr, { "aria-hidden": !0, size: 12 }) })
              ]
            }
          ) }),
          /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(ur, { className: "pagedly-toolbar__tooltip", side: "bottom", sideOffset: 6, children: [
            n,
            /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
          ] }) })
        ] }),
        /* @__PURE__ */ d(Lo, { children: /* @__PURE__ */ d(
          Po,
          {
            className: "pagedly-toolbar__select-content",
            position: "popper",
            sideOffset: 4,
            children: /* @__PURE__ */ d(Mo, { children: mg.map((r) => /* @__PURE__ */ K(Er, { value: r.value, className: "pagedly-toolbar__select-item", children: [
              /* @__PURE__ */ d(Nr, { className: "pagedly-toolbar__select-indicator", children: /* @__PURE__ */ d(vr, { "aria-hidden": !0, size: 12 }) }),
              /* @__PURE__ */ d(Tr, { children: r.label })
            ] }, r.value)) })
          }
        ) })
      ]
    }
  );
}
function en() {
  return /* @__PURE__ */ d("span", { className: "pagedly-toolbar__divider", "aria-hidden": "true" });
}
function hg({
  value: e,
  disabled: t,
  onChange: n,
  labels: r
}) {
  const o = [
    { value: "h1", label: r.heading1, icon: /* @__PURE__ */ d(gl, { "aria-hidden": !0, size: 14 }) },
    { value: "h2", label: r.heading2, icon: /* @__PURE__ */ d(hl, { "aria-hidden": !0, size: 14 }) },
    { value: "h3", label: r.heading3, icon: /* @__PURE__ */ d(bl, { "aria-hidden": !0, size: 14 }) },
    { value: "h4", label: r.heading4, icon: /* @__PURE__ */ d(Cd, { "aria-hidden": !0, size: 14 }) },
    { value: "h5", label: r.heading5, icon: /* @__PURE__ */ d(xd, { "aria-hidden": !0, size: 14 }) },
    { value: "h6", label: r.heading6, icon: /* @__PURE__ */ d(Ed, { "aria-hidden": !0, size: 14 }) }
  ], i = o.some((s) => s.value === e), a = i ? o.find((s) => s.value === e) ?? o[0] : { value: "", label: r.headingMenu ?? "Heading", icon: /* @__PURE__ */ d(Nd, { "aria-hidden": !0, size: 16 }) };
  return /* @__PURE__ */ K(
    Ro,
    {
      value: i ? a.value : "",
      disabled: t,
      onValueChange: n,
      children: [
        /* @__PURE__ */ K(sr, { children: [
          /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ K(
            _o,
            {
              className: "pagedly-toolbar__blockstyle",
              "aria-label": `${r.headingMenu ?? "Heading"} — ${a.label}`,
              "aria-pressed": i ? "true" : "false",
              "data-active": i || void 0,
              "data-disabled": t || void 0,
              children: [
                /* @__PURE__ */ d("span", { className: "pagedly-toolbar__blockstyle-value", children: a.icon }),
                /* @__PURE__ */ d(Ki, { className: "pagedly-toolbar__fontsize-chevron", children: /* @__PURE__ */ d(wr, { "aria-hidden": !0, size: 10 }) })
              ]
            }
          ) }),
          /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(
            ur,
            {
              className: "pagedly-toolbar__tooltip",
              side: "bottom",
              sideOffset: 6,
              children: [
                r.headingMenu ?? "Heading",
                /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ d(Lo, { children: /* @__PURE__ */ d(
          Po,
          {
            className: "pagedly-toolbar__select-content",
            position: "popper",
            sideOffset: 4,
            children: /* @__PURE__ */ d(Mo, { children: o.map((s) => /* @__PURE__ */ K(
              Er,
              {
                value: s.value,
                className: "pagedly-toolbar__select-item",
                children: [
                  /* @__PURE__ */ d(Nr, { className: "pagedly-toolbar__select-indicator", children: /* @__PURE__ */ d(vr, { "aria-hidden": !0, size: 12 }) }),
                  /* @__PURE__ */ d(Tr, { children: /* @__PURE__ */ K("span", { className: "pagedly-toolbar__blockstyle-value", children: [
                    s.icon,
                    /* @__PURE__ */ d("span", { children: s.label })
                  ] }) })
                ]
              },
              s.value
            )) })
          }
        ) })
      ]
    }
  );
}
function bg({
  disabled: e,
  onChange: t,
  label: n
}) {
  return /* @__PURE__ */ K(
    Ro,
    {
      value: "",
      disabled: e,
      onValueChange: (r) => {
        const [o, i] = r.split("||");
        i && ti(i), t(o);
      },
      children: [
        /* @__PURE__ */ K(sr, { children: [
          /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ d(
            _o,
            {
              className: "pagedly-toolbar__button",
              "aria-label": n,
              "data-disabled": e || void 0,
              children: /* @__PURE__ */ d(Td, { "aria-hidden": !0, size: 16 })
            }
          ) }),
          /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(
            ur,
            {
              className: "pagedly-toolbar__tooltip",
              side: "bottom",
              sideOffset: 6,
              children: [
                n,
                /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ d(Lo, { children: /* @__PURE__ */ K(
          Po,
          {
            className: "pagedly-toolbar__select-content",
            position: "popper",
            sideOffset: 4,
            children: [
              /* @__PURE__ */ d(Hc, { className: "pagedly-toolbar__select-scroll", children: /* @__PURE__ */ d(yl, { "aria-hidden": !0, size: 12 }) }),
              /* @__PURE__ */ d(Mo, { children: ug.map((r) => {
                const o = `${r.stack}||${r.googleFamily ?? ""}`;
                return /* @__PURE__ */ K(
                  Er,
                  {
                    value: o,
                    className: "pagedly-toolbar__select-item",
                    onPointerEnter: () => {
                      r.googleFamily && ti(r.googleFamily);
                    },
                    onFocus: () => {
                      r.googleFamily && ti(r.googleFamily);
                    },
                    children: [
                      /* @__PURE__ */ d(Nr, { className: "pagedly-toolbar__select-indicator", children: /* @__PURE__ */ d(vr, { "aria-hidden": !0, size: 12 }) }),
                      /* @__PURE__ */ d(Tr, { children: /* @__PURE__ */ d("span", { style: r.stack ? { fontFamily: r.stack } : void 0, children: r.label }) })
                    ]
                  },
                  r.label
                );
              }) }),
              /* @__PURE__ */ d(zc, { className: "pagedly-toolbar__select-scroll", children: /* @__PURE__ */ d(wr, { "aria-hidden": !0, size: 12 }) })
            ]
          }
        ) })
      ]
    }
  );
}
function ys({
  label: e,
  icon: t,
  palette: n,
  disabled: r,
  onPick: o
}) {
  const [i, a] = Qe(!1);
  return /* @__PURE__ */ K(mi, { open: i, onOpenChange: a, children: [
    /* @__PURE__ */ K(sr, { children: [
      /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ d(gi, { asChild: !0, children: /* @__PURE__ */ d(
        "button",
        {
          type: "button",
          className: "pagedly-toolbar__button",
          "aria-label": e,
          disabled: r,
          onMouseDown: (s) => s.preventDefault(),
          children: t
        }
      ) }) }),
      /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(
        ur,
        {
          className: "pagedly-toolbar__tooltip",
          side: "bottom",
          sideOffset: 6,
          children: [
            e,
            /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ d(hi, { children: /* @__PURE__ */ K(
      bi,
      {
        className: "pagedly-toolbar__popover pagedly-toolbar__popover--color",
        side: "bottom",
        align: "start",
        sideOffset: 6,
        "aria-label": e,
        children: [
          /* @__PURE__ */ d("div", { className: "pagedly-toolbar__color-grid", children: n.map((s) => /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              className: "pagedly-toolbar__color-swatch",
              "aria-label": s.label,
              title: s.label,
              onMouseDown: (l) => l.preventDefault(),
              onClick: () => {
                o(s.value), a(!1);
              },
              style: {
                background: s.value === "transparent" ? "linear-gradient(45deg, #ffffff 45%, #ef4444 45%, #ef4444 55%, #ffffff 55%)" : s.value
              }
            },
            s.value
          )) }),
          /* @__PURE__ */ d(yi, { className: "pagedly-toolbar__popover-arrow" })
        ]
      }
    ) })
  ] });
}
const Ae = go(function({ label: t, active: n, disabled: r, children: o, onClick: i }, a) {
  return /* @__PURE__ */ K(sr, { children: [
    /* @__PURE__ */ d(lr, { asChild: !0, children: /* @__PURE__ */ d(
      "button",
      {
        ref: a,
        type: "button",
        className: "pagedly-toolbar__button",
        "aria-label": t,
        "aria-pressed": n === void 0 ? void 0 : n ? "true" : "false",
        disabled: r,
        onMouseDown: (s) => s.preventDefault(),
        onClick: i,
        children: o
      }
    ) }),
    /* @__PURE__ */ d(cr, { children: /* @__PURE__ */ K(
      ur,
      {
        className: "pagedly-toolbar__tooltip",
        side: "bottom",
        sideOffset: 6,
        children: [
          t,
          /* @__PURE__ */ d(dr, { className: "pagedly-toolbar__tooltip-arrow" })
        ]
      }
    ) })
  ] });
}), yg = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strikethrough",
  superscript: "Superscript",
  subscript: "Subscript",
  removeFormat: "Clear formatting",
  paragraph: "Paragraph",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  heading4: "Heading 4",
  heading5: "Heading 5",
  heading6: "Heading 6",
  bulletList: "Bullet list",
  numberedList: "Numbered list",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
  justify: "Justify",
  insertLink: "Insert link",
  editLink: "Edit link",
  unlink: "Remove link",
  horizontalRule: "Insert horizontal rule",
  insertPageBreak: "Insert page break",
  pastePlain: "Paste without formatting",
  pasteKeepFormatting: "Keep source formatting on paste",
  insertTable: "Insert table",
  find: "Find (Ctrl/Cmd+F)",
  print: "Print",
  downloadPdf: "Download as PDF",
  fontFamily: "Font family",
  fontColor: "Text color",
  highlightColor: "Highlight color",
  blockStyle: "Block style",
  headingMenu: "Heading",
  blockquote: "Quote",
  inlineCode: "Inline code",
  codeBlock: "Code block",
  indent: "Increase indent",
  outdent: "Decrease indent",
  lineSpacing: "Line spacing",
  checklist: "Checklist",
  insertFootnote: "Insert footnote",
  exportDocx: "Export as DOCX",
  importDocx: "Import DOCX",
  exportMarkdown: "Export as Markdown",
  importMarkdown: "Import Markdown",
  insertToc: "Insert table of contents",
  insertSectionBreak: "Insert section break",
  insertCrossReference: "Insert cross-reference",
  insertLeader: "Insert leader row",
  toggleColumns: "Two columns",
  insertImage: "Insert image",
  undo: "Undo",
  redo: "Redo",
  linkUrlLabel: "Link URL",
  apply: "Apply",
  cancel: "Cancel",
  showMore: "More options",
  hideMore: "Hide extras",
  words: "words",
  characters: "chars",
  readTime: "min read"
};
function Zc(e, t) {
  if (!e || !t) return null;
  const n = e.childNodes;
  for (let r = 0; r < n.length; r++) {
    const o = n[r];
    if (o.s_tag === t) return o;
  }
  return null;
}
function Jc(e, t, n, r, o) {
  for (; e.childNodes.length && !n(); ) {
    o = o || e.childNodes.length !== 1;
    const i = e.lastChild;
    if (!i) break;
    if (i.nodeType === Node.TEXT_NODE) {
      const l = i.textContent ?? "";
      if (l.length === 0) {
        e.removeChild(i);
        continue;
      }
      const c = l.match(/(\s|\S+)/g), f = document.createTextNode("");
      t.prepend(f);
      const p = c ? c.length : 0;
      for (let h = 0; h < p; h++)
        if (h === p - 1 && !o || (i.textContent = c.slice(0, p - h - 1).join(""), f.textContent = c.slice(p - h - 1, p).join(""), n())) return;
      i.textContent === "" && e.removeChild(i);
      continue;
    }
    const a = i;
    if (!a.childNodes.length || /^h\d$/i.test(a.tagName) || /^tr$/i.test(a.tagName) || typeof r == "function" && r(a)) {
      if (!o)
        return;
      t.prepend(a);
      continue;
    }
    if (o) {
      if (t.prepend(a), !n())
        continue;
      e.appendChild(a);
    }
    let s = Zc(
      t,
      a.s_tag
    );
    s || (a.s_tag || (a.s_tag = Math.random().toString(36).slice(2, 8)), s = a.cloneNode(!1), s.s_tag = a.s_tag, t.prepend(s)), Jc(
      a,
      s,
      n,
      r,
      o
    ), s.normalize(), e.contains(a) && (a.childNodes.length === 0 || a.innerHTML === "") && e.removeChild(a);
  }
}
function eu(e) {
  var n, r;
  return e ? (((r = (n = e.nodeName) == null ? void 0 : n.toLowerCase) == null ? void 0 : r.call(n)) ?? "") === "pagedly-marker" : !1;
}
function wg(e) {
  let t = e.lastChild;
  for (; t && eu(t); ) t = t.previousSibling;
  return t;
}
function vg(e) {
  let t = e.firstChild;
  for (; t && eu(t); ) t = t.nextSibling;
  return t;
}
function Cg(e, t) {
  const n = e.lastChild;
  if (n && n.nodeType === Node.TEXT_NODE) {
    n.textContent = (n.textContent ?? "") + t;
    return;
  }
  e.appendChild(document.createTextNode(t));
}
function tu(e, t) {
  let n = e, r = t;
  for (; ; ) {
    const o = wg(n), i = vg(r);
    if (!o || !i) return null;
    if (i.nodeType === Node.TEXT_NODE)
      return {
        sourceText: i,
        destBlock: n
      };
    if (o.nodeType === Node.TEXT_NODE)
      return null;
    const a = o, s = i;
    if (!a.s_tag || a.s_tag !== s.s_tag) return null;
    n = a, r = s;
  }
}
function xg(e, t) {
  const n = tu(e, t);
  if (!n) return null;
  const r = n.sourceText, o = r.textContent ?? "";
  if (!o.length) return null;
  const i = o.match(/^(\s*\S+\s*)/);
  if (!i) return null;
  const a = i[1];
  return r.textContent = o.slice(a.length), Cg(n.destBlock, a), a;
}
function Eg(e, t, n) {
  const r = tu(e, t);
  if (!r) return !1;
  let o = r.destBlock;
  for (; o && o.lastChild; ) o = o.lastChild;
  if (!o || o.nodeType !== Node.TEXT_NODE) return !1;
  const i = o, a = i.textContent ?? "";
  return a.endsWith(n) ? (i.textContent = a.slice(0, a.length - n.length), r.sourceText.textContent = n + (r.sourceText.textContent ?? ""), !0) : !1;
}
function Tg(e, t, n) {
  for (; !n(); ) {
    const r = t.firstChild;
    if (!r) break;
    const o = (i, a) => {
      const l = Zc(
        i,
        a.s_tag
      );
      l && a.childNodes.length ? o(l, a.firstChild) : (i.append(a), i.normalize());
    };
    o(e, r);
  }
}
const co = "pagedly-fn-ref";
let ws = 0;
function Ng() {
  return ws += 1, `fn-${Math.random().toString(36).slice(2, 8)}-${ws}`;
}
function Sg(e, t, n) {
  if (t.rangeCount === 0) return null;
  const r = t.getRangeAt(0), o = document.createElement("sup");
  return o.className = co, o.setAttribute("data-fn", Ng()), o.setAttribute("data-fn-text", n), o.setAttribute("contenteditable", "false"), o.textContent = "0", r.deleteContents(), r.insertNode(o), o;
}
function Ag(e, t) {
  const n = Array.from(e.querySelectorAll(`sup.${co}`));
  if (n.length !== 0) {
    n.forEach((r, o) => {
      r.textContent = String(o + 1);
    });
    for (const r of t) {
      const o = Array.from(
        r.querySelectorAll(`sup.${co}[data-fn-text]`)
      );
      if (o.length === 0) continue;
      const i = document.createElement("div");
      i.className = "pagedly-ce-footnotes", i.setAttribute("contenteditable", "false"), i.setAttribute("aria-hidden", "true");
      for (const a of o) {
        const s = document.createElement("div");
        s.className = "pagedly-ce-footnotes__item";
        const l = document.createElement("sup");
        l.className = "pagedly-ce-footnotes__num", l.textContent = a.textContent ?? "", s.appendChild(l), s.appendChild(document.createTextNode(" " + (a.getAttribute("data-fn-text") ?? ""))), i.appendChild(s);
      }
      r.appendChild(i);
    }
  }
}
function vs(e) {
  return !!e.querySelector(`sup.${co}[data-fn-text]`);
}
function Qi(e) {
  return Array.from(
    e.querySelectorAll("h1, h2, h3, h4, h5, h6")
  ).filter((t) => !t.closest('[aria-hidden="true"]') && !t.closest(".pagedly-toc"));
}
function kg(e) {
  const t = Array.from(e.querySelectorAll(".pagedly-xref"));
  if (t.length === 0) return;
  const n = Array.from(e.querySelectorAll(".pagedly-ce-page")), r = Qi(e), o = (i) => {
    const a = i.closest(".pagedly-ce-page"), s = a ? n.indexOf(a) : -1;
    return s >= 0 ? s + 1 : 0;
  };
  for (const i of t) {
    const a = i.getAttribute("data-xref-target");
    let s = a ? e.querySelector(`[data-xref-id="${a}"]`) : null;
    if (!s) {
      const f = Number(i.getAttribute("data-xref-index"));
      s = Number.isFinite(f) ? r[f] ?? null : null;
    }
    const l = s ? o(s) : 0, c = l ? `p. ${l}` : "p. ?";
    i.textContent !== c && (i.textContent = c);
  }
}
function Rg(e) {
  const t = document.createElement("div");
  t.className = "pagedly-toc", t.setAttribute("contenteditable", "false");
  const n = document.createElement("div");
  return n.className = "pagedly-toc__title", n.textContent = "Contents", t.appendChild(n), Qi(e).forEach((r, o) => {
    const i = document.createElement("div");
    i.className = "pagedly-toc__entry", i.setAttribute("data-toc-index", String(o)), i.setAttribute("data-toc-level", r.tagName[1]);
    const a = document.createElement("span");
    a.className = "pagedly-toc__text", a.textContent = (r.textContent ?? "").trim() || "(untitled)";
    const s = document.createElement("span");
    s.className = "pagedly-toc__dots";
    const l = document.createElement("span");
    l.className = "pagedly-toc__page", l.textContent = "", i.appendChild(a), i.appendChild(s), i.appendChild(l), t.appendChild(i);
  }), t;
}
function _g(e) {
  const t = Array.from(e.querySelectorAll(".pagedly-ce-page")), n = (i) => {
    const a = i.closest(".pagedly-ce-page"), s = a ? t.indexOf(a) : -1;
    return s >= 0 ? s + 1 : 0;
  }, r = Qi(e);
  let o = !1;
  for (const i of Array.from(e.querySelectorAll(".pagedly-toc")))
    for (const a of Array.from(i.querySelectorAll(".pagedly-toc__entry"))) {
      const s = Number(a.getAttribute("data-toc-index")), l = r[s], c = a.querySelector(".pagedly-toc__page");
      if (!l || !c) continue;
      const f = String(n(l) || "");
      c.textContent !== f && (c.textContent = f, o = !0);
    }
  return o;
}
const Lg = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "hr",
  "span",
  "div",
  "img",
  "figure",
  "figcaption",
  "ins",
  "del",
  "template"
], Ai = [
  "data-att-id",
  "data-text-align",
  "data-checked",
  "data-align",
  "data-comment-id",
  "data-toc-index",
  "data-toc-level",
  "data-xref-index",
  "data-xref-id",
  "data-xref-target",
  "data-fn",
  "data-fn-text",
  "data-fn-note",
  "data-section-id",
  "data-section-anchor",
  "data-generated-letter-chrome"
], Pg = [
  "href",
  "target",
  "rel",
  "colspan",
  "rowspan",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "class",
  "style",
  "contenteditable",
  ...Ai
], Mg = /^(?:https?:|mailto:|tel:|#|\/(?!\/)|blob:|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i, Og = {
  ALLOWED_TAGS: Lg,
  ALLOWED_ATTR: Pg,
  // ALLOW_DATA_ATTR is false (don't blanket-allow arbitrary data-*); the editor
  // ones are whitelisted explicitly via ADD_ATTR + ADD_URI_SAFE_ATTR so they
  // survive even though DOMPurify would otherwise treat them as data attrs.
  ADD_ATTR: ["target", "contenteditable", ...Ai],
  // A custom ALLOWED_URI_REGEXP makes DOMPurify URI-check EVERY attribute not in
  // its URI-safe set — so non-URI attributes whose values aren't URLs (colspan="2",
  // width="40", and the editor data-*) get wrongly stripped. Exempt them here.
  // (The letter sanitizer omits the table-span attrs and so silently drops merges
  // on save — a latent bug this shared sanitizer avoids.)
  ADD_URI_SAFE_ATTR: [
    "target",
    "contenteditable",
    "colspan",
    "rowspan",
    "width",
    "height",
    ...Ai
  ],
  ALLOW_DATA_ATTR: !1,
  KEEP_CONTENT: !0,
  ALLOWED_URI_REGEXP: Mg
};
function pn(e) {
  return typeof window > "u" ? e : Pi.sanitize(e ?? "", Og);
}
function On(e) {
  const t = (e ?? "").trim();
  if (!t || /^\/\//.test(t)) return "";
  const n = /^([a-z][a-z0-9+.-]*):/i.exec(t);
  if (n) {
    const r = n[1].toLowerCase();
    if (!(r === "http" || r === "https" || r === "mailto" || r === "tel" || r === "blob" || /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(t))) return "";
  }
  return t.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const Cs = /* @__PURE__ */ new Set([
  "font-family",
  "font-weight",
  "font-style",
  "font-variant",
  "color",
  "line-height",
  "letter-spacing",
  "text-align"
]);
function Dg(e, t = !1) {
  const n = t ? new Set([...Cs].filter((o) => o !== "color")) : Cs, r = e.querySelectorAll("span");
  for (const o of Array.from(r)) {
    let i = o.attributes.length === 0;
    if (!i && o.attributes.length === 1 && o.hasAttribute("style")) {
      const l = (o.getAttribute("style") ?? "").split(";").map((c) => c.trim().toLowerCase()).filter(Boolean).map((c) => {
        var f;
        return (f = c.split(":")[0]) == null ? void 0 : f.trim();
      }).filter((c) => !!c);
      i = l.length > 0 && l.every((c) => n.has(c));
    }
    if (!i) continue;
    const a = o.parentNode;
    if (a) {
      for (; o.firstChild; ) a.insertBefore(o.firstChild, o);
      a.removeChild(o);
    }
  }
}
const Ig = /* @__PURE__ */ new Set([
  "color",
  "background-color",
  "background",
  "text-align",
  // text-decoration keeps style-based underline / line-through (e.g. a
  // tracked-change insertion). Safe to keep — unlike font-weight it can't
  // silently cancel a semantic tag the way `font-weight:normal` on a <b>
  // wrapper does.
  "text-decoration",
  "text-decoration-line"
]);
function $g(e) {
  return e.split(";").map((t) => t.trim()).filter(Boolean).filter((t) => {
    var r;
    const n = (r = t.split(":")[0]) == null ? void 0 : r.trim().toLowerCase();
    return n && Ig.has(n);
  }).join("; ");
}
function Bg(e, t = {}) {
  const n = t.keepInlineStyles === !0;
  e = e.replace(/<!--[\s\S]*?-->/g, ""), e = pn(e);
  const r = document.createElement("div");
  r.innerHTML = e;
  const o = r.querySelectorAll(
    "template, script, style, meta, link, head, title"
  );
  for (const l of Array.from(o)) l.remove();
  for (const l of Array.from(r.querySelectorAll("*")))
    l.tagName.includes(":") && l.remove();
  const i = new Set(
    n ? ["lang", "dir", "face", "size", "valign", "border", "cellpadding", "cellspacing"] : [
      "lang",
      "dir",
      "align",
      "face",
      "color",
      "size",
      "bgcolor",
      "valign",
      "border",
      "cellpadding",
      "cellspacing"
    ]
  );
  for (const l of Array.from(r.querySelectorAll("*"))) {
    if (n) {
      const c = $g(l.getAttribute("style") ?? "");
      c ? l.setAttribute("style", c) : l.removeAttribute("style");
    } else
      l.removeAttribute("style");
    l.removeAttribute("class"), l.removeAttribute("id");
    for (const c of Array.from(l.attributes))
      (c.name.startsWith("data-") || i.has(c.name.toLowerCase())) && l.removeAttribute(c.name);
  }
  const a = /^(p|div|ul|ol|li|blockquote|pre|table|tr|td|th|h[1-6])$/i;
  for (const l of Array.from(r.querySelectorAll("b, strong")))
    if (Array.from(l.children).some(
      (f) => a.test(f.tagName)
    )) {
      const f = l.parentNode;
      if (!f) continue;
      for (; l.firstChild; ) f.insertBefore(l.firstChild, l);
      f.removeChild(l);
    }
  const s = r.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (const l of Array.from(s))
    if (Array.from(l.children).some(
      (f) => a.test(f.tagName)
    )) {
      const f = l.parentNode;
      if (!f) continue;
      for (; l.firstChild; ) f.insertBefore(l.firstChild, l);
      f.removeChild(l);
    }
  for (const l of Array.from(r.querySelectorAll("span")))
    if (l.attributes.length === 0) {
      const c = l.parentNode;
      if (!c) continue;
      for (; l.firstChild; ) c.insertBefore(l.firstChild, l);
      c.removeChild(l);
    }
  return r.innerHTML;
}
const Zi = /* @__PURE__ */ new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "LI",
  "PRE",
  "DIV",
  "FIGURE"
]);
function xs(e, t) {
  const n = [];
  let r = t;
  for (; r && r !== e; ) {
    const o = r.parentNode;
    if (!o) return null;
    n.unshift(Array.prototype.indexOf.call(o.childNodes, r)), r = o;
  }
  return r === e ? n : null;
}
function Es(e, t) {
  let n = e;
  for (const r of t) {
    const o = n.childNodes[r];
    if (!o) return null;
    n = o;
  }
  return n;
}
function Fg(e) {
  const t = window.getSelection();
  if (!t || t.rangeCount === 0 || !t.anchorNode || !t.focusNode || !e.contains(t.anchorNode) || !e.contains(t.focusNode))
    return null;
  const n = xs(e, t.anchorNode), r = xs(e, t.focusNode);
  return !n || !r ? null : {
    anchor: { path: n, offset: t.anchorOffset },
    focus: { path: r, offset: t.focusOffset }
  };
}
function Hg(e, t) {
  if (!t) return;
  const n = Es(e, t.anchor.path), r = Es(e, t.focus.path);
  if (!n || !r) return;
  const o = window.getSelection();
  if (o)
    try {
      const i = document.createRange(), a = (s, l) => s.nodeType === Node.TEXT_NODE ? Math.min(l, (s.textContent ?? "").length) : Math.min(l, s.childNodes.length);
      i.setStart(n, a(n, t.anchor.offset)), i.setEnd(r, a(r, t.focus.offset)), o.removeAllRanges(), o.addRange(i);
    } catch {
    }
}
function Ts(e, t) {
  let n = e;
  for (; n && n !== t; ) {
    if (n.nodeType === Node.ELEMENT_NODE && Zi.has(n.tagName))
      return n;
    n = n.parentNode;
  }
  return null;
}
function zg(e, t) {
  if (!e.collapsed) return !1;
  try {
    const n = document.createRange();
    return n.selectNodeContents(t), n.setEnd(e.startContainer, e.startOffset), n.toString().length === 0;
  } catch {
    return !1;
  }
}
function Wg(e, t) {
  if (!e.collapsed) return !1;
  try {
    const n = document.createRange();
    return n.selectNodeContents(t), n.setStart(e.startContainer, e.startOffset), n.toString().length === 0;
  } catch {
    return !1;
  }
}
function Yr(e, t) {
  const n = () => {
    var f;
    const r = window.getSelection();
    if (!r) return;
    const o = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let i = t, a = o.nextNode(), s = null, l = 0;
    for (; a; ) {
      const p = ((f = a.textContent) == null ? void 0 : f.length) ?? 0;
      if (i <= p) {
        s = a, l = i;
        break;
      }
      i -= p, a = o.nextNode();
    }
    const c = document.createRange();
    s ? c.setStart(s, l) : c.setStart(e, 0), c.collapse(!0), r.removeAllRanges(), r.addRange(c);
  };
  n(), typeof requestAnimationFrame == "function" && requestAnimationFrame(n);
}
function ni(e) {
  const t = e.lastChild;
  t && t.nodeName === "BR" && e.removeChild(t);
}
function jg(e) {
  let t = e.nextSibling;
  for (; t; ) {
    if (t.nodeType === Node.ELEMENT_NODE) {
      const n = t;
      if (n.tagName === "TEMPLATE" || Ji(n)) {
        t = t.nextSibling;
        continue;
      }
      return Zi.has(n.tagName) ? n : null;
    }
    if (t.nodeType === Node.TEXT_NODE && (t.textContent ?? "").trim().length === 0) {
      t = t.nextSibling;
      continue;
    }
    return null;
  }
  return null;
}
function Ji(e) {
  var t, n;
  return ((t = e.classList) == null ? void 0 : t.contains("pagedly-ce-header")) || ((n = e.classList) == null ? void 0 : n.contains("pagedly-ce-footer"));
}
function Ns(e) {
  var t;
  return ((t = e.classList) == null ? void 0 : t.contains("pagedly-page-break")) ?? !1;
}
function nu(e) {
  var t, n;
  return ((t = e.classList) == null ? void 0 : t.contains("pagedly-page-break")) || ((n = e.classList) == null ? void 0 : n.contains("pagedly-section-break"));
}
function ru(e) {
  var t;
  return ((t = e.classList) == null ? void 0 : t.contains("pagedly-break-before")) ?? !1;
}
function ou(e) {
  var t;
  return ((t = e.classList) == null ? void 0 : t.contains("pagedly-keep-with-next")) ?? !1;
}
function Ar(e) {
  return Array.from(e.children).filter(
    (t) => t.tagName !== "TEMPLATE" && !Ji(t)
  );
}
function Ug(e) {
  const t = Ar(e);
  for (let n = 0; n < t.length; n++) {
    if (ru(t[n]) && n > 0) return t[n];
    if (nu(t[n]) && n < t.length - 1) return t[n].nextSibling;
  }
  return null;
}
function qg(e, t) {
  const n = Ar(e), r = Ar(t), o = n[n.length - 1], i = r[0];
  return !!o && nu(o) || !!i && ru(i) || // A keep-with-next block at the top of the next page is there to stay with
  // what follows — never pull it back up. This holds even when it's ALONE on
  // the page (nk.length === 1): the old `nk.length > 1` restriction let the
  // backward pull yank a lone KWN up to the previous page, where the
  // keep-with-next peel-down then pushed it back down — a period-2 oscillation
  // that made fitContentOverPages non-idempotent (an incremental==full hazard)
  // whenever the KWN block's successor was unsplittable (image / table row /
  // keep-together). Blocking the pull can only prevent compaction, never
  // strand the block further from its successor or explode page count.
  !!i && ou(i);
}
function Vg(e) {
  let t = e.previousSibling;
  for (; t; ) {
    if (t.nodeType === Node.ELEMENT_NODE) {
      const n = t;
      if (n.tagName === "TEMPLATE" || Ji(n)) {
        t = t.previousSibling;
        continue;
      }
      return Zi.has(n.tagName) ? n : null;
    }
    if (t.nodeType === Node.TEXT_NODE && (t.textContent ?? "").trim().length === 0) {
      t = t.previousSibling;
      continue;
    }
    return null;
  }
  return null;
}
function Ss(e) {
  return Math.round(e / 25.4 * 96);
}
const Xg = go(function({
  html: t,
  onChange: n,
  pageWidthMm: r = 210,
  pageHeightMm: o = 297,
  pagePadding: i = "20mm",
  doNotBreak: a,
  sanitizePastedHtml: s,
  pasteFormatting: l,
  pageHeaderHtml: c,
  pageFooterHtml: f,
  watermark: p,
  runningHead: h,
  differentFirstPage: v,
  changeDebounceMs: T,
  readOnly: b = !1
}, E) {
  const x = X(null), w = X(null), k = X(0), D = X(!1), j = X(1), q = X(!1), H = X(null), Q = X(null), be = X(!1), ke = X(n);
  ke.current = n;
  const we = X(null), $e = X(T);
  $e.current = T;
  const Re = X(b);
  Re.current = b;
  const Me = X(a);
  Me.current = a;
  const V = X(s);
  V.current = s;
  const ve = X(l);
  ve.current = l;
  const _e = X(!1), de = X(c);
  de.current = c;
  const Le = X(f);
  Le.current = f;
  const Ve = X(p);
  Ve.current = p;
  const st = X(h);
  st.current = h;
  const et = X(v);
  et.current = v;
  const tt = X([]), nt = X([]), ot = X(null), z = X(!1), ee = X(!1), Be = 200, it = Ss(r), Oe = Ss(o), We = 24, I = (N) => {
    N.style.width = `${it}px`, N.style.minHeight = `${Oe}px`, N.style.height = "auto", N.style.padding = i, N.style.boxSizing = "border-box", N.style.background = "var(--pagedly-page-background, white)", N.style.boxShadow = "var(--pagedly-page-box-shadow, 0 0 0 1px rgba(60,64,67,0.08), 0 1px 3px 1px rgba(60,64,67,0.15))", N.style.borderRadius = "var(--pagedly-page-border-radius, 3px)", N.style.overflow = "hidden", N.style.overflowAnchor = "none", N.style.margin = `0 auto ${We}px`, N.style.position = "relative", N.classList.add("pagedly-ce-page");
  }, ce = () => {
    const N = w.current;
    if (!N) return;
    Array.from(
      N.querySelectorAll(".pagedly-ce-page")
    ).forEach((L) => I(L));
  }, ue = (N) => {
    const M = N.clientHeight;
    return (M >= Oe * 0.5 ? M : Oe) + 1;
  }, xe = () => {
    const N = w.current;
    return N ? Array.from(N.querySelectorAll(".pagedly-ce-page")) : [];
  }, Et = () => {
    var te;
    const N = w.current, M = window.getSelection();
    if (!N || !M || M.rangeCount === 0) return;
    let L = M.getRangeAt(0).startContainer;
    for (; L && L !== N; ) {
      if (L.nodeType === Node.ELEMENT_NODE && ((te = L.classList) != null && te.contains("pagedly-ce-page"))) {
        const pe = xe().indexOf(L);
        return pe >= 0 ? pe : void 0;
      }
      L = L.parentNode;
    }
  }, kt = ".pagedly-ce-header, .pagedly-ce-footer, .pagedly-ce-watermark, .pagedly-ce-running-head, .pagedly-ce-footnotes, .pagedly-repeated-thead", Lt = (N = w.current ?? document) => {
    for (const M of Array.from(N.querySelectorAll(kt)))
      M.remove();
  }, Ft = () => xe().map((N) => {
    if (!N.querySelector(kt)) return N.innerHTML;
    const M = N.cloneNode(!0);
    return Lt(M), M.innerHTML;
  }).join("").replace(/​/g, "").replace(/\s+data-pid="[^"]*"/g, ""), Jt = "p, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, table, figure, hr, div.pagedly-page-break", xt = () => {
    const N = [];
    for (const M of xe())
      for (const L of Array.from(M.children))
        L.matches(kt) || L.tagName !== "TEMPLATE" && L.matches(Jt) && N.push(L);
    return N;
  }, In = () => {
    const N = xt();
    for (const M of N)
      M.getAttribute("data-pid") || M.setAttribute("data-pid", `b${j.current++}`);
    return N;
  }, pr = 120, $n = () => {
    if (!w.current) return;
    const N = ke.current;
    N && N(Ft());
  }, ln = () => {
    we.current !== null && window.clearTimeout(we.current);
    const N = $e.current ?? pr;
    we.current = window.setTimeout(() => {
      we.current = null, $n();
    }, N);
  }, cn = (N, M, L) => N.replace(/\{page\}/g, String(M)).replace(/\{total\}/g, String(L)), mr = (N, M, L, te) => {
    const pe = document.createElement("div");
    pe.className = `pagedly-ce-${N}`, pe.setAttribute("contenteditable", "false"), pe.setAttribute("aria-hidden", "true");
    const Y = document.createElement("span");
    Y.className = "pagedly-ce-chrome-left", Y.innerHTML = cn(M.left ?? "", L, te);
    const ye = document.createElement("span");
    return ye.className = "pagedly-ce-chrome-right", ye.innerHTML = cn(M.right ?? "", L, te), pe.appendChild(Y), pe.appendChild(ye), pe;
  }, vn = () => {
    const N = de.current, M = Le.current, L = Ve.current, te = st.current, pe = w.current, Y = pe ? vs(pe) : !1, ye = !!(pe != null && pe.querySelector(".pagedly-xref[data-xref-index]"));
    if (!N && !M && !L && !te && !Y && !ye) return;
    const Ee = xe();
    Y && pe && Ag(pe, Ee), ye && pe && kg(pe);
    const ge = Ee.length, ie = !!(pe != null && pe.querySelector(".pagedly-section-break"));
    let ne = 0;
    const Se = (me, ae) => ie ? (ae === 0 || me.querySelector(".pagedly-section-break") ? ne = 1 : ne += 1, ne) : ae + 1, oe = te ? te.level ? `h${te.level}` : "h1, h2" : "";
    let le = "";
    Ee.forEach((me, ae) => {
      const Ue = Se(me, ae);
      if (te) {
        const Ce = me.querySelectorAll(oe);
        if (Ce.length && (le = (Ce[Ce.length - 1].textContent ?? "").trim()), le) {
          const he = document.createElement("div");
          he.className = "pagedly-ce-running-head", he.setAttribute("contenteditable", "false"), he.setAttribute("aria-hidden", "true"), he.textContent = le, me.appendChild(he);
        }
      }
      const Te = et.current && ae === 0;
      if (N && !Te && me.appendChild(mr("header", N, Ue, ge)), M && !Te && me.appendChild(mr("footer", M, Ue, ge)), L) {
        const Ce = document.createElement("div");
        Ce.className = "pagedly-ce-watermark", Ce.setAttribute("contenteditable", "false"), Ce.setAttribute("aria-hidden", "true"), Ce.textContent = L, me.appendChild(Ce);
      }
    });
  }, Cn = () => {
    const N = w.current;
    if (!N) return;
    const M = /* @__PURE__ */ new Map();
    for (const L of Array.from(N.querySelectorAll("table"))) {
      const te = L.s_tag;
      if (!te) continue;
      const pe = M.get(te);
      if (!pe) {
        M.set(te, L);
        continue;
      }
      if (L.querySelector(":scope > thead")) continue;
      const Y = pe.querySelector(":scope > thead");
      if (!Y) continue;
      const ye = Y.cloneNode(!0);
      ye.classList.add("pagedly-repeated-thead"), ye.setAttribute("contenteditable", "false"), ye.setAttribute("aria-hidden", "true"), L.insertBefore(ye, L.firstChild);
    }
  }, Bn = (N) => {
    const M = w.current;
    M && Lt(M), Tn(N), vn(), Cn();
  }, xn = () => {
    const N = w.current;
    return N ? {
      html: N.innerHTML,
      selection: Fg(N)
    } : null;
  }, Fn = () => {
    if (z.current) return;
    const N = xn();
    if (!N) return;
    ee.current = !1;
    const M = tt.current;
    M.length > 0 && M[M.length - 1].html === N.html || (M.push(N), M.length > Be && M.shift(), nt.current = []);
  }, Hn = () => {
    z.current || (ee.current = !0, ot.current !== null && window.clearTimeout(ot.current), ot.current = window.setTimeout(() => {
      ot.current = null, Fn();
    }, 350));
  }, zn = () => {
    ot.current !== null && (window.clearTimeout(ot.current), ot.current = null), Fn();
  }, un = (N) => {
    const M = w.current;
    if (!M) return;
    z.current = !0, M.innerHTML = N.html, ce(), Hg(M, N.selection), z.current = !1;
    const L = ke.current;
    L && L(Ft());
  }, Xt = () => {
    zn();
    const N = tt.current;
    if (N.length < 2) return;
    const M = N.pop();
    nt.current.push(M), un(N[N.length - 1]);
  }, $r = () => {
    zn();
    const N = nt.current;
    if (N.length === 0) return;
    const M = N.pop();
    tt.current.push(M), un(M);
  }, Wn = () => {
    var te;
    const N = w.current, M = window.getSelection();
    if (!N || !M || M.rangeCount === 0) return null;
    let L = M.getRangeAt(0).startContainer;
    for (; L && L !== N; ) {
      if (L.nodeType === Node.ELEMENT_NODE && (((te = L.parentElement) == null ? void 0 : te.classList.contains("pagedly-ce-page")) ?? !1))
        return L;
      L = L.parentNode;
    }
    return null;
  }, Bo = 160, Br = 80, En = (N) => {
    if (!w.current) return;
    const L = document.createElement("template");
    L.innerHTML = N;
    const te = Array.from(L.content.childNodes);
    if (te.reduce(
      (ne, Se) => ne + (Se.nodeType === Node.ELEMENT_NODE ? 1 : 0),
      0
    ) <= Bo) {
      document.execCommand("insertHTML", !1, N);
      return;
    }
    const Y = (ne) => {
      const Se = document.createElement("div");
      for (const oe of ne) Se.appendChild(oe.cloneNode(!0));
      return Se.innerHTML;
    }, ye = [];
    for (let ne = 0; ne < te.length; ne += Br)
      ye.push(Y(te.slice(ne, ne + Br)));
    _e.current = !0, document.execCommand("insertHTML", !1, ye[0]);
    let Ee = Wn(), ge = 1;
    const ie = () => {
      const ne = w.current;
      if (!ne || ge >= ye.length) {
        _e.current = !1, ne && (ln(), Hn());
        return;
      }
      if (Ee && ne.contains(Ee)) {
        ne.focus({ preventScroll: !0 });
        const Se = document.createRange();
        Se.selectNodeContents(Ee), Se.collapse(!1);
        const oe = window.getSelection();
        oe == null || oe.removeAllRanges(), oe == null || oe.addRange(Se);
      }
      document.execCommand("insertHTML", !1, ye[ge]), Ee = Wn() ?? Ee, ge++, requestAnimationFrame(ie);
    };
    requestAnimationFrame(ie);
  }, Fr = 2, bt = (N, M) => {
    const L = w.current;
    if (!L || N.clientHeight <= M * Fr) return !1;
    const te = Array.from(N.childNodes);
    if (te.reduce(
      (le, me) => le + (me.nodeType === Node.ELEMENT_NODE ? 1 : 0),
      0
    ) < 2) return !1;
    const Y = getComputedStyle(N), ye = (parseFloat(Y.paddingTop) || 0) + (parseFloat(Y.paddingBottom) || 0), Ee = Math.max(1, M - ye), ge = te.map(
      (le) => le.nodeType === Node.ELEMENT_NODE ? le.offsetHeight : 0
    ), ie = [];
    let ne = [], Se = 0;
    for (let le = 0; le < te.length; le++) {
      const me = ge[le];
      ne.length > 0 && Se + me > Ee && (ie.push(ne), ne = [], Se = 0), ne.push(te[le]), Se += me;
    }
    if (ne.length && ie.push(ne), ie.length < 2) return !1;
    let oe = N;
    return ie.forEach((le, me) => {
      let ae;
      me === 0 ? ae = N : (ae = document.createElement("div"), I(ae), L.insertBefore(ae, oe.nextSibling));
      for (const Ue of le) ae.appendChild(Ue);
      oe = ae;
    }), !0;
  }, Tn = (N, M = !1, L = !1) => {
    var ct;
    if (q.current || !k.current) return;
    const te = w.current;
    if (!te) return;
    q.current = !0;
    let pe = !1;
    if (!M) {
      let ze = te.querySelector(".pagedly-ce-page");
      const Je = [];
      for (const qe of Array.from(te.childNodes))
        qe.nodeType === Node.ELEMENT_NODE && ((ct = qe.classList) != null && ct.contains("pagedly-ce-page")) || Je.push(qe);
      if (Je.length > 0) {
        pe = !0, ze || (ze = document.createElement("div"), te.insertBefore(ze, te.firstChild), I(ze));
        for (let qe = Je.length - 1; qe >= 0; qe--)
          ze.insertBefore(Je[qe], ze.firstChild);
      }
    }
    const Y = window.getSelection(), ye = document.createElement("pagedly-marker"), Ee = document.createElement("pagedly-marker");
    let ge = !1;
    if (Y && Y.rangeCount && Y.anchorNode && te.contains(Y.anchorNode))
      try {
        const ze = Y.getRangeAt(0);
        ze.insertNode(ye), ze.collapse(!1), ze.insertNode(Ee), ge = !0;
      } catch {
      }
    let ie = xe();
    if (ie.length === 0) {
      const ze = document.createElement("div");
      te.appendChild(ze), I(ze), ze.innerHTML = "<div><br></div>", ie = xe();
    }
    const Se = te && vs(te) ? 72 : 0, oe = k.current - Se, le = 5e3, me = N === void 0 || pe, ae = me ? 0 : Math.max(0, Math.min(N, ie.length - 1) - 1), he = me ? 16 : L ? 3 : 6;
    let yt = "end", wt = 0, ht = ae, Ke = !1;
    for (let ze = ae; ze < ie.length && ze < le; ze++) {
      if (wt >= he) {
        yt = "window", ht = ze;
        break;
      }
      wt++, ht = ze;
      const Je = ie[ze];
      let qe = ie[ze + 1] ?? null;
      const vt = Je.innerHTML;
      let Tt = !1;
      bt(Je, oe) && (Ke = !0, ie = xe(), qe = ie[ze + 1] ?? null);
      const Pt = Ug(Je);
      if (Pt) {
        const Ht = document.createElement("div");
        I(Ht), Je.after(Ht);
        let Rt = Pt;
        const gr = [];
        for (; Rt; )
          gr.push(Rt), Rt = Rt.nextSibling;
        for (const Wr of gr) Ht.appendChild(Wr);
        ie = xe(), qe = ie[ze + 1] ?? null;
      }
      if (Je.clientHeight <= oe && qe && !qg(Je, qe) && Tg(Je, qe, () => !qe.childNodes.length || Je.clientHeight > oe), Je.clientHeight > oe && (qe || (qe = document.createElement("div"), te.appendChild(qe), I(qe), ie = xe()), Jc(
        Je,
        qe,
        () => Je.clientHeight <= oe,
        Me.current
      ), Tt = !0), qe && Ar(qe).length > 0) {
        const Ht = Ar(Je), Rt = Ht[Ht.length - 1];
        Rt && ou(Rt) && Ht.length > 1 && (qe.insertBefore(Rt, qe.firstChild), Tt = !0);
      }
      if (qe && qe.childNodes.length === 0 && (qe.remove(), ie = xe()), !me && !L && ze >= N && !Tt && Je.innerHTML === vt) {
        yt = "settled";
        break;
      }
    }
    yt === "window" ? (H.current = M ? ht : Math.min(H.current ?? 1 / 0, ht), be.current = be.current || me || L || Ke, Hr()) : (M || me) && (H.current = null, be.current = !1, $t());
    for (const ze of xe().slice(ae, ht + 2)) ze.normalize();
    if (ge && document.body.contains(ye)) {
      const ze = document.createRange();
      ze.setStart(ye, 0), document.body.contains(Ee) && ze.setEnd(Ee, 0), Y == null || Y.removeAllRanges(), Y == null || Y.addRange(ze);
    }
    ye.remove(), Ee.remove();
    {
      const ze = (vt) => {
        if (vt.nodeType !== Node.ELEMENT_NODE) return !1;
        const Pt = vt.tagName.toLowerCase();
        return Pt === "template" || Pt === "script" || Pt === "style";
      }, Je = (vt) => {
        for (const Tt of Array.from(vt.childNodes))
          if (!ze(Tt)) {
            if (Tt.nodeType === Node.TEXT_NODE) {
              if ((Tt.textContent ?? "").trim().length > 0) return !0;
            } else if (Tt.nodeType === Node.ELEMENT_NODE) {
              const Pt = Tt;
              if ((Pt.textContent ?? "").trim().length > 0) return !0;
              const Rt = Pt.tagName.toLowerCase();
              if ((Rt === "div" || Rt === "p") && Pt.children.length === 1 && Pt.children[0].tagName.toLowerCase() === "br")
                return !0;
            }
          }
        return !1;
      };
      let qe = xe();
      if (qe.length === 0) {
        const vt = document.createElement("div");
        te.appendChild(vt), I(vt), qe = xe();
      }
      if (!Je(qe[0])) {
        const vt = document.createElement("div");
        vt.appendChild(document.createElement("br")), qe[0].appendChild(vt);
        const Tt = document.createRange();
        Tt.setStart(vt, 0), Tt.collapse(!0), Y == null || Y.removeAllRanges(), Y == null || Y.addRange(Tt);
      }
    }
    q.current = !1;
  }, Kt = () => {
    Q.current = null;
    const N = H.current, M = w.current;
    if (N === null || !M) return;
    const L = be.current;
    Lt(M), Tn(N + 1, !0, L), (H.current === null || !L) && (vn(), Cn());
  }, Hr = () => {
    if (Q.current !== null) return;
    const N = window.requestIdleCallback, M = be.current;
    Q.current = N ? N(Kt, M ? {} : { timeout: 200 }) : window.setTimeout(Kt, M ? 200 : 32);
  }, $t = () => {
    if (Q.current === null) return;
    const N = window.cancelIdleCallback;
    N ? N(Q.current) : window.clearTimeout(Q.current), Q.current = null;
  };
  return nl(() => {
    const N = w.current;
    if (!N) return;
    N.innerHTML = "";
    const M = document.createElement("div");
    N.appendChild(M), I(M), k.current = ue(M), M.innerHTML = t || "<div><br></div>", Tn(), vn(), Cn();
  }, []), Ze(() => {
    if (!D.current) {
      D.current = !0;
      return;
    }
    w.current && (ce(), k.current = Oe + 1, Bn());
  }, [it, Oe, i]), Ze(() => {
    const N = w.current;
    if (!N) return;
    const M = (Y) => {
      const ye = Y, Ee = typeof ye.inputType == "string" && ye.inputType.startsWith("delete");
      Lt(N), Dg(N, ve.current === "rich"), N.normalize();
      const ge = Ee ? xe().map(
        (ne) => (ne.textContent ?? "").slice(0, 30)
      ) : null, ie = Et();
      if (typeof performance < "u" && performance.now(), Tn(ie), Ee && ge) {
        const ne = xe();
        if (ne.length >= 2) {
          const Se = ie === void 0 ? 0 : Math.max(0, ie - 1), oe = ie === void 0 ? ne.length - 2 : Math.min(ne.length - 2, ie + 1);
          for (let le = Se; le <= oe; le++) {
            const me = (ne[le + 1].textContent ?? "").slice(0, 30), ae = ge[le + 1] ?? "";
            if (me !== ae || me.length === 0)
              continue;
            const Ue = ne[le].clientHeight, Te = xg(
              ne[le],
              ne[le + 1]
            );
            if (!Te) continue;
            ne[le].clientHeight > Ue && Eg(ne[le], ne[le + 1], Te);
          }
        }
      }
      _e.current || ln(), vn(), Cn(), _e.current || Hn();
    };
    if (N.addEventListener("input", M), tt.current.length === 0) {
      const Y = xn();
      Y && tt.current.push(Y);
    }
    const L = (Y) => {
      if (!(Y.metaKey || Y.ctrlKey)) return;
      const Ee = Y.key.toLowerCase();
      Ee === "z" && !Y.shiftKey ? (Y.preventDefault(), Xt()) : (Ee === "z" && Y.shiftKey || Ee === "y") && (Y.preventDefault(), $r());
    };
    N.addEventListener("keydown", L);
    const te = (Y) => {
      if (Re.current) {
        Y.preventDefault();
        return;
      }
      const ye = Y.clipboardData;
      if (!ye) return;
      const Ee = ye.getData("text/html"), ge = ye.getData("text/plain"), ie = ve.current === "rich", ne = V.current ?? ((Se) => Bg(Se, { keepInlineStyles: ie }));
      if (Ee) {
        Y.preventDefault();
        const Se = ne(Ee);
        En(Se);
      } else ge && (Y.preventDefault(), document.execCommand("insertText", !1, ge));
    };
    N.addEventListener("paste", te);
    const pe = (Y) => {
      var le, me;
      if (Re.current) {
        Y.preventDefault();
        return;
      }
      const Ee = Y.inputType;
      if (Ee !== "deleteContentBackward" && Ee !== "deleteContentForward")
        return;
      const ge = window.getSelection();
      if (ge && ge.rangeCount > 0) {
        const ae = ge.toString(), Ue = N.textContent ?? "";
        if (ae.length > 0 && Ue.length > 0 && ae.length >= Ue.length) {
          Y.preventDefault();
          const Te = xe();
          if (Te.length === 0) return;
          const Ce = [];
          for (const Ke of Te)
            for (const ct of Array.from(Ke.childNodes))
              ct.nodeType === Node.ELEMENT_NODE && ct.tagName.toLowerCase() === "template" && Ce.push(ct);
          for (let Ke = Te.length - 1; Ke >= 1; Ke--)
            Te[Ke].remove();
          const he = Te[0];
          he.innerHTML = "";
          for (const Ke of Ce) he.appendChild(Ke);
          const yt = document.createElement("div");
          yt.appendChild(document.createElement("br"));
          const wt = he.querySelector("template");
          wt ? (le = wt.parentNode) == null || le.insertBefore(
            yt,
            wt.nextSibling
          ) : he.appendChild(yt);
          const ht = document.createRange();
          ht.setStart(yt, 0), ht.collapse(!0), ge.removeAllRanges(), ge.addRange(ht), N.dispatchEvent(
            new InputEvent("input", {
              bubbles: !0,
              inputType: "deleteContent"
            })
          );
          return;
        }
      }
      if (Ee === "deleteContentBackward" || Ee === "deleteContentForward") {
        const ae = window.getSelection();
        if (ae && ae.rangeCount > 0 && !ae.isCollapsed) {
          const Ue = ae.getRangeAt(0), Te = [], Ce = document.createTreeWalker(
            Ue.commonAncestorContainer,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode(yt) {
                const wt = yt;
                return wt.tagName === "TEMPLATE" && wt.hasAttribute("data-section-anchor") && Ue.intersectsNode(wt) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
              }
            }
          );
          let he;
          for (; he = Ce.nextNode(); ) Te.push(he);
          if (Te.length > 0) {
            Y.preventDefault(), Ue.deleteContents();
            const yt = Ue.startContainer, wt = Ue.startOffset, ht = document.createDocumentFragment();
            for (const Ke of Te) ht.appendChild(Ke);
            if (yt.nodeType === Node.TEXT_NODE) {
              const Ke = yt, ct = Ke.parentNode;
              if (ct)
                if (wt >= (Ke.textContent ?? "").length)
                  ct.insertBefore(ht, Ke.nextSibling);
                else if (wt <= 0)
                  ct.insertBefore(ht, Ke);
                else {
                  const ze = Ke.splitText(wt);
                  ct.insertBefore(ht, ze);
                }
            } else {
              const Ke = yt, ct = Ke.childNodes[wt] ?? null;
              Ke.insertBefore(ht, ct);
            }
            N.dispatchEvent(
              new InputEvent("input", {
                bubbles: !0,
                inputType: Ee
              })
            );
            return;
          }
        }
      }
      if (Ee === "deleteContentBackward") {
        const ae = window.getSelection();
        if (ae && ae.rangeCount > 0 && ae.isCollapsed) {
          const Ue = ae.getRangeAt(0), Te = Ts(Ue.startContainer, N);
          if (Te && zg(Ue, Te)) {
            const Ce = Vg(Te);
            if (Ce) {
              if (Ns(Ce)) {
                Y.preventDefault(), Ce.remove(), N.dispatchEvent(
                  new InputEvent("input", {
                    bubbles: !0,
                    inputType: "deleteContentBackward"
                  })
                ), Yr(Te, 0);
                return;
              }
              Y.preventDefault(), Ce.childNodes.length === 1 && ((me = Ce.firstChild) == null ? void 0 : me.nodeName) === "BR" && Ce.removeChild(Ce.firstChild), ni(Te);
              const he = (Ce.textContent ?? "").length;
              for (; Te.firstChild; )
                Ce.appendChild(Te.firstChild);
              Te.remove(), Ce.childNodes.length === 0 && Ce.appendChild(document.createElement("br")), N.dispatchEvent(
                new InputEvent("input", {
                  bubbles: !0,
                  inputType: "deleteContentBackward"
                })
              ), Yr(Ce, he);
              return;
            }
          }
        }
      }
      if (Ee === "deleteContentForward") {
        const ae = window.getSelection();
        if (ae && ae.rangeCount > 0 && ae.isCollapsed) {
          const Ue = ae.getRangeAt(0), Te = Ts(Ue.startContainer, N);
          if (Te && Wg(Ue, Te)) {
            const Ce = jg(Te);
            if (Ce) {
              if (Ns(Ce)) {
                Y.preventDefault(), Ce.remove(), N.dispatchEvent(
                  new InputEvent("input", {
                    bubbles: !0,
                    inputType: "deleteContentForward"
                  })
                ), Yr(
                  Te,
                  (Te.textContent ?? "").length
                );
                return;
              }
              Y.preventDefault(), ni(Te), ni(Ce);
              const he = (Te.textContent ?? "").length;
              for (; Ce.firstChild; )
                Te.appendChild(Ce.firstChild);
              Te.childNodes.length === 0 && Te.appendChild(document.createElement("br")), Ce.remove(), N.dispatchEvent(
                new InputEvent("input", {
                  bubbles: !0,
                  inputType: "deleteContentForward"
                })
              ), Yr(Te, he);
              return;
            }
          }
        }
      }
      const ie = xe();
      if (ie.length !== 1) return;
      const ne = ie[0].textContent ?? "", Se = ie[0].innerHTML.trim();
      ne.trim().length === 0 && (Se === "" || Se === "<br>" || Se === "<div><br></div>" || Se === "<p><br></p>") && Y.preventDefault();
    };
    return N.addEventListener("beforeinput", pe), () => {
      N.removeEventListener("input", M), N.removeEventListener("paste", te), N.removeEventListener(
        "beforeinput",
        pe
      ), N.removeEventListener("keydown", L), ot.current !== null && window.clearTimeout(ot.current), we.current !== null && window.clearTimeout(we.current), $t();
    };
  }, []), Ze(() => {
    const N = w.current;
    if (!N) return;
    let M = null, L = null, te = null;
    const pe = () => {
      M && (M.removeAttribute("data-pagedly-selected"), M = null), L && (L.remove(), L = null);
    }, Y = () => {
      if (!M || !L) return;
      const oe = M.getBoundingClientRect(), le = N.getBoundingClientRect();
      L.style.left = `${oe.right - le.left - 8}px`, L.style.top = `${oe.bottom - le.top - 8}px`;
    }, ye = (oe) => {
      var me;
      const le = oe.target;
      le.tagName === "IMG" ? (pe(), M = le, M.setAttribute("data-pagedly-selected", "true"), L = document.createElement("div"), L.className = "pagedly-img-handle", L.setAttribute("contenteditable", "false"), L.setAttribute("aria-hidden", "true"), N.appendChild(L), Y()) : M && !((me = le.classList) != null && me.contains("pagedly-img-handle")) && pe();
    }, Ee = () => {
      M && L && Y();
    }, ge = (oe) => {
      const le = oe.target;
      if (!L || le !== L || !M) return;
      oe.preventDefault(), oe.stopPropagation();
      const me = M.getBoundingClientRect().width, ae = M.getBoundingClientRect().height;
      te = {
        startX: oe.clientX,
        startW: me,
        startH: ae,
        aspect: ae > 0 ? me / ae : 1
      }, L.setPointerCapture(oe.pointerId);
    }, ie = (oe) => {
      if (!te || !M) return;
      const le = oe.clientX - te.startX, me = Math.max(40, te.startW + le), ae = Math.max(40, me / te.aspect);
      M.style.width = `${Math.round(me)}px`, M.style.height = `${Math.round(ae)}px`, M.setAttribute("width", String(Math.round(me))), M.setAttribute("height", String(Math.round(ae))), Y();
    }, ne = (oe) => {
      te && (te = null, L == null || L.releasePointerCapture(oe.pointerId), N.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
      ));
    }, Se = (oe) => {
      if (oe.key === "Escape" && M)
        pe();
      else if ((oe.key === "Backspace" || oe.key === "Delete") && M) {
        oe.preventDefault();
        const le = M;
        pe(), le.remove(), N.dispatchEvent(
          new InputEvent("input", { bubbles: !0, inputType: "deleteContent" })
        );
      }
    };
    return N.addEventListener("click", ye), N.addEventListener("pointerdown", ge), window.addEventListener("pointermove", ie), window.addEventListener("pointerup", ne), window.addEventListener("scroll", Ee, !0), N.addEventListener("keydown", Se), () => {
      pe(), N.removeEventListener("click", ye), N.removeEventListener("pointerdown", ge), window.removeEventListener("pointermove", ie), window.removeEventListener("pointerup", ne), window.removeEventListener("scroll", Ee, !0), N.removeEventListener("keydown", Se);
    };
  }, []), Ze(() => {
    const N = w.current;
    if (!N) return;
    const M = 6;
    let L = null;
    const te = (ge, ie, ne) => {
      for (const Se of Array.from(ge.rows)) {
        const oe = Se.cells[ie];
        oe && (oe.style.width = `${Math.round(ne)}px`);
      }
    }, pe = (ge) => {
      var oe, le;
      const ie = (le = (oe = ge.target) == null ? void 0 : oe.closest) == null ? void 0 : le.call(oe, "td, th");
      if (!ie || !N.contains(ie)) return null;
      const ne = ie.getBoundingClientRect(), Se = ie.parentElement;
      if (Math.abs(ge.clientX - ne.right) <= M)
        return { cell: ie, edge: "right" };
      if (Math.abs(ge.clientX - ne.left) <= M && ie.cellIndex > 0) {
        const me = Se.cells[ie.cellIndex - 1];
        if (me) return { cell: me, edge: "right" };
      }
      if (Math.abs(ge.clientY - ne.bottom) <= M)
        return { cell: ie, edge: "bottom" };
      if (Math.abs(ge.clientY - ne.top) <= M) {
        const me = Se.previousElementSibling, ae = me == null ? void 0 : me.cells[ie.cellIndex];
        if (ae) return { cell: ae, edge: "bottom" };
      }
      return null;
    }, Y = (ge) => {
      if (L) {
        if (L.kind === "col") {
          const ne = ge.clientX - L.startX, Se = Math.max(30, L.startW + ne), oe = Math.max(30, L.startNextW - ne);
          te(L.table, L.colIndex, Se), te(L.table, L.colIndex + 1, oe);
        } else {
          const ne = ge.clientY - L.startY;
          L.row.style.height = `${Math.max(20, Math.round(L.startH + ne))}px`;
        }
        return;
      }
      const ie = pe(ge);
      if (!ie) {
        N.style.cursor = "";
        return;
      }
      if (ie.edge === "right") {
        const ne = ie.cell.parentElement;
        N.style.cursor = ie.cell.cellIndex < ne.cells.length - 1 ? "col-resize" : "";
      } else
        N.style.cursor = "row-resize";
    }, ye = (ge) => {
      var le;
      const ie = pe(ge);
      if (!ie) return;
      const ne = ie.cell, Se = ne.parentElement, oe = ne.closest("table");
      if (oe) {
        if (ie.edge === "right") {
          const me = ne.cellIndex;
          if (me >= Se.cells.length - 1) return;
          const ae = Se.cells[me + 1];
          ge.preventDefault(), L = {
            kind: "col",
            table: oe,
            colIndex: me,
            startX: ge.clientX,
            startW: ne.getBoundingClientRect().width,
            startNextW: ae.getBoundingClientRect().width
          };
        } else
          ge.preventDefault(), L = {
            kind: "row",
            row: Se,
            startY: ge.clientY,
            startH: Se.getBoundingClientRect().height
          };
        (le = N.setPointerCapture) == null || le.call(N, ge.pointerId);
      }
    }, Ee = (ge) => {
      var ie;
      L && (L = null, (ie = N.releasePointerCapture) == null || ie.call(N, ge.pointerId), N.style.cursor = "", N.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
      ));
    };
    return N.addEventListener("pointermove", Y), N.addEventListener("pointerdown", ye), window.addEventListener("pointerup", Ee), () => {
      N.removeEventListener("pointermove", Y), N.removeEventListener("pointerdown", ye), window.removeEventListener("pointerup", Ee);
    };
  }, []), Li(
    E,
    () => ({
      getHTML() {
        return Ft();
      },
      getContentEl() {
        return w.current;
      },
      setHTML(N) {
        const M = w.current;
        if (!M) return;
        M.innerHTML = "";
        const L = document.createElement("div");
        M.appendChild(L), I(L), L.innerHTML = N || "<div><br></div>", Bn();
      },
      focus() {
        var M;
        const N = w.current;
        if (N && (N.focus({ preventScroll: !0 }), !((M = window.getSelection()) != null && M.rangeCount))) {
          const L = document.createRange();
          L.selectNodeContents(N), L.collapse(!0);
          const te = window.getSelection();
          te == null || te.removeAllRanges(), te == null || te.addRange(L);
        }
      },
      execCommand(N, M) {
        const L = w.current;
        if (!L) return !1;
        document.activeElement !== L && L.focus({ preventScroll: !0 });
        try {
          return document.execCommand(N, !1, M);
        } catch {
          return !1;
        }
      },
      reflow() {
        Bn();
      },
      undo() {
        Xt();
      },
      redo() {
        $r();
      },
      canUndo() {
        return tt.current.length >= 2 || ee.current;
      },
      canRedo() {
        return nt.current.length > 0;
      },
      getBlocks() {
        return In().map((N) => ({
          pid: N.getAttribute("data-pid") ?? "",
          tag: N.tagName.toLowerCase(),
          text: (N.textContent ?? "").replace(/​/g, "").trim()
        }));
      },
      replaceBlock(N, M) {
        const L = w.current;
        if (!L) return !1;
        const te = L.querySelector(`[data-pid="${N}"]`);
        return te ? (te.innerHTML = M, te.dispatchEvent(
          new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
        ), !0) : !1;
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  ), /* @__PURE__ */ d("div", { ref: x, className: "pagedly-ce-editor", style: {
    background: "var(--pagedly-desk-background, #e8eaed)",
    padding: "40px 0 56px",
    minHeight: "100vh",
    overflowAnchor: "none"
  }, children: /* @__PURE__ */ d(
    "div",
    {
      ref: w,
      className: "pagedly-ce-content",
      contentEditable: !b,
      suppressContentEditableWarning: !0,
      role: "textbox",
      "aria-multiline": "true",
      "aria-readonly": b || void 0,
      style: { outline: "none", overflowAnchor: "none" }
    }
  ) });
}), uo = {
  bold: !0,
  italic: !0,
  underline: !0,
  strikethrough: !0,
  superscript: !0,
  subscript: !0,
  inlineCode: !0,
  fontColor: !0,
  highlight: !0,
  fontFamily: !0,
  fontSize: !0,
  removeFormat: !0,
  headings: !0,
  blockquote: !0,
  codeBlock: !0,
  alignment: !0,
  indent: !0,
  lineSpacing: !0,
  footnotes: "off",
  bulletList: !0,
  numberedList: !0,
  checklist: !0,
  link: !0,
  image: !0,
  table: !0,
  horizontalRule: !0,
  pageBreak: !0,
  find: !0,
  print: !0,
  downloadPdf: !0,
  exportDocx: !0,
  importDocx: !0,
  exportMarkdown: !0,
  importMarkdown: !0,
  paste: !0,
  wordCount: !0,
  markdownShortcuts: !0,
  smartTypography: !0,
  autoLink: !0,
  slashMenu: !0,
  commandPalette: !0,
  outline: !0,
  ai: !0,
  // Opt-in: hyphenation needs a document language to be useful + is opinionated.
  hyphenation: !1,
  // Opt-in: trades page-bottom whitespace for no orphaned lines.
  widowControl: !1,
  comments: !0,
  trackChanges: !0,
  toc: !0,
  sections: !0,
  columns: !0,
  leaders: !0
}, Fy = {
  ...uo,
  superscript: !1,
  subscript: !1,
  inlineCode: !1,
  fontColor: !1,
  highlight: !1,
  fontFamily: !1,
  fontSize: !1,
  codeBlock: !1,
  image: !1,
  table: !1,
  horizontalRule: !1,
  pageBreak: !1,
  print: !1,
  downloadPdf: !1,
  exportDocx: !1,
  importDocx: !1,
  exportMarkdown: !1,
  importMarkdown: !1
}, Hy = { ...uo };
function Kg(e) {
  return e ? { ...uo, ...e } : uo;
}
const Gg = {
  exportDocx: "exportDocx",
  importDocx: "importDocx",
  exportMarkdown: "exportMarkdown",
  importMarkdown: "importMarkdown",
  copyAsMarkdown: "exportMarkdown",
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikeThrough: "strikethrough",
  superscript: "superscript",
  subscript: "subscript",
  removeFormat: "removeFormat",
  insertUnorderedList: "bulletList",
  insertOrderedList: "numberedList",
  justifyLeft: "alignment",
  justifyCenter: "alignment",
  justifyRight: "alignment",
  justifyFull: "alignment",
  createLink: "link",
  unlink: "link",
  insertHorizontalRule: "horizontalRule",
  insertPageBreak: "pageBreak",
  insertTable: "table",
  setFontSize: "fontSize",
  setFontColor: "fontColor",
  setHighlightColor: "highlight",
  setFontFamily: "fontFamily",
  toggleBlockquote: "blockquote",
  toggleInlineCode: "inlineCode",
  formatCodeBlock: "codeBlock",
  indent: "indent",
  outdent: "indent",
  setLineSpacing: "lineSpacing",
  insertChecklist: "checklist",
  tableInsertRowAbove: "table",
  tableInsertRowBelow: "table",
  tableInsertColumnBefore: "table",
  tableInsertColumnAfter: "table",
  tableDeleteRow: "table",
  tableDeleteColumn: "table",
  tableDelete: "table",
  tableMergeRight: "table",
  tableMergeDown: "table",
  tableSplitCell: "table",
  toggleKeepTogether: "pageBreak",
  toggleKeepWithNext: "pageBreak",
  togglePageBreakBefore: "pageBreak",
  toggleColumns: "columns",
  insertLeader: "leaders",
  addComment: "comments",
  resolveComment: "comments",
  acceptChange: "trackChanges",
  rejectChange: "trackChanges",
  acceptAllChanges: "trackChanges",
  rejectAllChanges: "trackChanges",
  insertTableOfContents: "toc",
  insertCrossReference: "toc",
  insertSectionBreak: "sections"
};
function As(e) {
  let t = e;
  for (; t; ) {
    if (t.nodeType === Node.ELEMENT_NODE) {
      const n = t.tagName.toLowerCase();
      if (n === "td" || n === "th") return t;
      if (n === "table") return null;
    }
    t = t.parentNode;
  }
  return null;
}
function fr(e) {
  return e.closest("table");
}
function Io(e) {
  const t = e.parentElement;
  return t ? Array.prototype.indexOf.call(t.cells, e) : 0;
}
function Dr(e) {
  return Array.from(e.querySelectorAll("tr")).filter(
    (t) => t.closest("table") === e
  );
}
function fo(e) {
  const t = document.createElement(e);
  return t.appendChild(document.createElement("br")), t;
}
const hn = (e, t) => {
  const n = parseInt(e.getAttribute(t) ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};
function iu(e) {
  return Array.from(e.querySelectorAll("td,th")).some(
    (t) => hn(t, "colspan") > 1 || hn(t, "rowspan") > 1
  );
}
function ks(e) {
  var t;
  return ((t = e.parentElement) == null ? void 0 : t.tagName.toLowerCase()) ?? "tbody";
}
function Rs(e, t) {
  var a;
  const n = e.parentElement;
  if (!n) return;
  const r = e.tagName.toLowerCase() === "th" && t === "above" ? "th" : "td", o = document.createElement("tr");
  for (let s = 0; s < n.cells.length; s++) o.appendChild(fo(r));
  const i = n.getAttribute("data-section-id");
  i && o.setAttribute("data-section-id", i), (a = n.parentElement) == null || a.insertBefore(
    o,
    t === "above" ? n : n.nextSibling
  );
}
function _s(e, t) {
  var o;
  const n = fr(e);
  if (!n || iu(n)) return;
  const r = Io(e) + (t === "after" ? 1 : 0);
  for (const i of Dr(n)) {
    const a = ((o = i.parentElement) == null ? void 0 : o.tagName.toLowerCase()) === "thead", s = fo(a ? "th" : "td"), l = i.cells[r] ?? null;
    i.insertBefore(s, l);
  }
}
function Yg(e) {
  const t = fr(e), n = e.parentElement;
  return !t || !n || Dr(t).length <= 1 ? !1 : (n.remove(), !0);
}
function Qg(e) {
  const t = fr(e);
  if (!t || iu(t)) return !1;
  const n = Io(e), r = Dr(t);
  if (Math.max(...r.map((i) => i.cells.length), 0) <= 1) return !1;
  for (const i of r)
    i.cells[n] && i.deleteCell(n);
  return !0;
}
function Zg(e) {
  const t = e.parentElement;
  if (!t) return !1;
  const n = Array.prototype.indexOf.call(t.cells, e), r = t.cells[n + 1];
  if (!r) return !1;
  if ((r.textContent ?? "").trim())
    for (; r.firstChild; ) e.appendChild(r.firstChild);
  return e.setAttribute("colspan", String(hn(e, "colspan") + hn(r, "colspan"))), r.remove(), !0;
}
function Jg(e) {
  const t = fr(e), n = e.parentElement;
  if (!t || !n) return !1;
  const r = Dr(t), o = r.indexOf(n), i = r[o + 1];
  if (!i || ks(n) !== ks(i)) return !1;
  const a = Io(e), s = i.cells[a];
  if (!s) return !1;
  if ((s.textContent ?? "").trim())
    for (; s.firstChild; ) e.appendChild(s.firstChild);
  return e.setAttribute("rowspan", String(hn(e, "rowspan") + hn(s, "rowspan"))), s.remove(), !0;
}
function eh(e) {
  const t = fr(e), n = e.parentElement;
  if (!t || !n) return !1;
  const r = hn(e, "colspan"), o = hn(e, "rowspan");
  if (r <= 1 && o <= 1) return !1;
  const i = e.tagName.toLowerCase() === "th" ? "th" : "td";
  e.removeAttribute("colspan"), e.removeAttribute("rowspan");
  for (let a = 1; a < r; a++) n.insertBefore(fo(i), e.nextSibling);
  if (o > 1) {
    const a = Dr(t), s = a.indexOf(n), l = Io(e);
    for (let c = 1; c < o; c++) {
      const f = a[s + c];
      if (!f) continue;
      const p = f.cells[l] ?? null;
      for (let h = 0; h < r; h++) f.insertBefore(fo(i), p);
    }
  }
  return !0;
}
function th(e) {
  const t = fr(e);
  if (!t) return null;
  const n = t.parentElement, r = document.createElement("p");
  r.appendChild(document.createElement("br"));
  const o = t.getAttribute("data-section-id");
  return o && r.setAttribute("data-section-id", o), n == null || n.insertBefore(r, t), t.remove(), r;
}
const au = "pagedly-fn-ref", ki = "pagedly-endnotes";
let Ls = 0;
function nh() {
  return Ls += 1, `fn-${Math.random().toString(36).slice(2, 8)}-${Ls}`;
}
function rh(e, t) {
  let n = e.querySelector(`ol.${ki}`);
  if (n) return n;
  n = document.createElement("ol"), n.className = ki, t && n.setAttribute("data-section-id", t);
  const r = e.querySelectorAll(".pagedly-ce-page");
  return (r.length ? r[r.length - 1] : e).appendChild(n), n;
}
function oh(e, t) {
  if (t.rangeCount === 0) return null;
  const n = t.getRangeAt(0), r = nh(), o = document.createElement("sup");
  o.className = au, o.setAttribute("data-fn", r), o.setAttribute("contenteditable", "false"), o.textContent = "0", n.deleteContents(), n.insertNode(o);
  let i = null, a = o.parentNode;
  for (; a && a !== e; ) {
    if (a.nodeType === Node.ELEMENT_NODE) {
      const c = a.getAttribute("data-section-id");
      if (c) {
        i = c;
        break;
      }
    }
    a = a.parentNode;
  }
  const s = rh(e, i), l = document.createElement("li");
  return l.setAttribute("data-fn-note", r), l.appendChild(document.createElement("br")), s.appendChild(l), ih(e), l;
}
function ih(e) {
  const t = e.querySelector(`ol.${ki}`), n = Array.from(e.querySelectorAll(`sup.${au}`));
  if (!t) return;
  if (n.length === 0) {
    t.remove();
    return;
  }
  const r = [];
  n.forEach((i, a) => {
    i.textContent = String(a + 1);
    const s = i.getAttribute("data-fn");
    s && r.push(s);
  });
  const o = /* @__PURE__ */ new Map();
  for (const i of Array.from(t.querySelectorAll("li[data-fn-note]"))) {
    const a = i.getAttribute("data-fn-note");
    a && o.set(a, i);
  }
  for (const [i, a] of o)
    r.includes(i) || a.remove();
  for (const i of r) {
    const a = o.get(i);
    a && t.appendChild(a);
  }
  t.children.length === 0 && t.remove();
}
function ah(e, t) {
  let n = e;
  for (; n && n !== t; ) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "LI")
      return n;
    n = n.parentNode;
  }
  return null;
}
function sh(e) {
  const t = e.parentElement;
  if (!t || t.tagName !== "UL" && t.tagName !== "OL")
    return null;
  const n = e.previousElementSibling;
  if (!n || n.tagName !== "LI") return null;
  const r = t.tagName.toLowerCase();
  let o = n.lastElementChild;
  if (!o || o.tagName !== "UL" && o.tagName !== "OL") {
    o = document.createElement(r), t.classList.contains("pagedly-checklist") && o.classList.add("pagedly-checklist");
    const i = t.getAttribute("data-section-id");
    i && o.setAttribute("data-section-id", i), n.appendChild(o);
  }
  return o.appendChild(e), e;
}
function lh(e) {
  const t = e.parentElement;
  if (!t || t.tagName !== "UL" && t.tagName !== "OL")
    return null;
  const n = t.parentElement;
  if (!n || n.tagName !== "LI") return null;
  const r = n.parentElement;
  if (!r) return null;
  const o = [];
  let i = e.nextElementSibling;
  for (; i; )
    o.push(i), i = i.nextElementSibling;
  if (o.length > 0) {
    let a = e.lastElementChild;
    (!a || a.tagName !== "UL" && a.tagName !== "OL") && (a = document.createElement(t.tagName.toLowerCase()), t.classList.contains("pagedly-checklist") && a.classList.add("pagedly-checklist"), e.appendChild(a));
    for (const s of o) a.appendChild(s);
  }
  return r.insertBefore(e, n.nextSibling), t.children.length === 0 && t.remove(), e;
}
const ch = (() => {
  const e = new Uint32Array(256);
  for (let t = 0; t < 256; t++) {
    let n = t;
    for (let r = 0; r < 8; r++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
    e[t] = n >>> 0;
  }
  return e;
})();
function uh(e) {
  let t = 4294967295;
  for (let n = 0; n < e.length; n++) t = ch[(t ^ e[n]) & 255] ^ t >>> 8;
  return (t ^ 4294967295) >>> 0;
}
function dh(e) {
  const t = new TextEncoder(), n = [], r = [];
  let o = 0;
  const i = (f) => new Uint8Array([f & 255, f >>> 8 & 255]), a = (f) => new Uint8Array([f & 255, f >>> 8 & 255, f >>> 16 & 255, f >>> 24 & 255]), s = (f) => {
    const p = f.reduce((T, b) => T + b.length, 0), h = new Uint8Array(p);
    let v = 0;
    for (const T of f)
      h.set(T, v), v += T.length;
    return h;
  };
  for (const f of e) {
    const p = t.encode(f.name), h = uh(f.data), v = s([
      a(67324752),
      i(20),
      i(0),
      i(0),
      i(0),
      i(0),
      a(h),
      a(f.data.length),
      a(f.data.length),
      i(p.length),
      i(0),
      p,
      f.data
    ]);
    n.push(v), r.push(
      s([
        a(33639248),
        i(20),
        i(20),
        i(0),
        i(0),
        i(0),
        i(0),
        a(h),
        a(f.data.length),
        a(f.data.length),
        i(p.length),
        i(0),
        i(0),
        i(0),
        i(0),
        a(0),
        a(o),
        p
      ])
    ), o += v.length;
  }
  const l = s(r), c = s([
    a(101010256),
    i(0),
    i(0),
    i(e.length),
    i(e.length),
    a(l.length),
    a(o),
    i(0)
  ]);
  return s([...n, l, c]);
}
const jt = (e) => e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), fh = () => ({ rels: [], media: [], nextRelId: 2, mediaExts: /* @__PURE__ */ new Set() });
function Ps(e) {
  const t = e.trim();
  let n = /^#([0-9a-f]{6})$/i.exec(t);
  return n ? n[1].toUpperCase() : (n = /^#([0-9a-f]{3})$/i.exec(t), n ? n[1].split("").map((r) => r + r).join("").toUpperCase() : (n = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(t), n ? [n[1], n[2], n[3]].map((r) => Math.min(255, Number(r)).toString(16).padStart(2, "0")).join("").toUpperCase() : null));
}
function ph(e) {
  const t = /^(\d+(?:\.\d+)?)(pt|px)$/i.exec(e.trim());
  if (!t) return null;
  const n = Number(t[1]), r = t[2].toLowerCase() === "pt" ? n : n * 0.75;
  return r > 0 && r < 400 ? Math.round(r * 2) : null;
}
function $o(e, t) {
  const n = { ...t }, r = e.style.fontSize;
  if (r) {
    const a = ph(r);
    a != null && (n.szHalf = a);
  }
  if (e.style.color) {
    const a = Ps(e.style.color);
    a && (n.color = a);
  }
  const o = e.style.backgroundColor || e.style.background;
  if (o) {
    const a = Ps(o);
    a && (n.fill = a);
  }
  if (e.style.fontFamily) {
    const a = e.style.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    a && /^[\w \-]+$/.test(a) && (n.font = a);
  }
  const i = e.style.textDecoration || e.style.textDecorationLine;
  return i && /underline/i.test(i) && (n.u = !0), i && /line-through/i.test(i) && (n.strike = !0), n;
}
function mh(e) {
  const t = [];
  return e.b && t.push("<w:b/>"), e.i && t.push("<w:i/>"), e.u && t.push('<w:u w:val="single"/>'), e.strike && t.push("<w:strike/>"), e.font && t.push(`<w:rFonts w:ascii="${jt(e.font)}" w:hAnsi="${jt(e.font)}"/>`), e.szHalf != null && t.push(`<w:sz w:val="${e.szHalf}"/><w:szCs w:val="${e.szHalf}"/>`), e.color && t.push(`<w:color w:val="${e.color}"/>`), e.fill && t.push(`<w:shd w:val="clear" w:color="auto" w:fill="${e.fill}"/>`), t.length ? `<w:rPr>${t.join("")}</w:rPr>` : "";
}
function gh(e) {
  const t = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(e.trim());
  if (!t) return null;
  try {
    const n = atob(t[2]), r = new Uint8Array(n.length);
    for (let i = 0; i < n.length; i++) r[i] = n.charCodeAt(i);
    const o = t[1].toLowerCase() === "jpg" ? "jpeg" : t[1].toLowerCase();
    return { bytes: r, ext: o };
  } catch {
    return null;
  }
}
function hh(e, t) {
  const n = e.getAttribute("src") ?? "", r = e.getAttribute("alt") ?? "", o = gh(n);
  if (!o)
    return r ? `<w:r><w:t xml:space="preserve">${jt(r)}</w:t></w:r>` : "";
  const i = t.media.length + 1, a = `media/image${i}.${o.ext}`, s = `rId${t.nextRelId++}`;
  t.media.push({ name: `word/${a}`, data: o.bytes }), t.mediaExts.add(o.ext), t.rels.push(
    `<Relationship Id="${s}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${a}"/>`
  );
  const l = Number(e.getAttribute("width")) || 300, c = Number(e.getAttribute("height")) || Math.round(l * 0.75), f = Math.max(1, Math.round(l * 9525)), p = Math.max(1, Math.round(c * 9525)), h = jt(r || `image${i}`);
  return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${f}" cy="${p}"/><wp:docPr id="${i}" name="${h}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i}" name="${h}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${s}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${f}" cy="${p}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
function fn(e, t, n) {
  if (e.nodeType === Node.TEXT_NODE) {
    const s = (e.nodeValue ?? "").replace(/​/g, "");
    return s ? `<w:r>${mh(t)}<w:t xml:space="preserve">${jt(s)}</w:t></w:r>` : "";
  }
  if (e.nodeType !== Node.ELEMENT_NODE) return "";
  const r = e, o = r.tagName;
  if (o === "BR") return "<w:r><w:br/></w:r>";
  if (o === "IMG") return hh(r, n);
  let i = { ...t };
  (o === "STRONG" || o === "B") && (i.b = !0), (o === "EM" || o === "I") && (i.i = !0), (o === "U" || o === "INS") && (i.u = !0), (o === "S" || o === "STRIKE" || o === "DEL") && (i.strike = !0), o === "CODE" && (i.font = "Consolas"), i = $o(r, i);
  const a = Array.from(r.childNodes).map((s) => fn(s, i, n)).join("");
  if (o === "A") {
    const s = r.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(s)) {
      const l = `rId${n.nextRelId++}`;
      return n.rels.push(
        `<Relationship Id="${l}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${jt(s)}" TargetMode="External"/>`
      ), `<w:hyperlink r:id="${l}">${a}</w:hyperlink>`;
    }
  }
  return a;
}
function Ot(e, t = {}) {
  const n = [];
  return t.style && n.push(`<w:pStyle w:val="${t.style}"/>`), t.numId != null && n.push(`<w:numPr><w:ilvl w:val="${t.ilvl ?? 0}"/><w:numId w:val="${t.numId}"/></w:numPr>`), t.pPrRaw && n.push(t.pPrRaw), `<w:p>${n.length ? `<w:pPr>${n.join("")}</w:pPr>` : ""}${e}</w:p>`;
}
function ea(e) {
  const t = [], n = e.style.textAlign, r = { center: "center", right: "right", justify: "both" };
  n && r[n] && t.push(`<w:jc w:val="${r[n]}"/>`);
  const o = (v) => {
    const T = /^(-?\d+(?:\.\d+)?)(pt|px)$/i.exec(v.trim());
    if (!T) return null;
    const b = Number(T[1]);
    return T[2].toLowerCase() === "pt" ? b : b * 0.75;
  }, i = [], a = e.style.marginBottom ? o(e.style.marginBottom) : null, s = e.style.marginTop ? o(e.style.marginTop) : null;
  a != null && a >= 0 && i.push(`w:after="${Math.round(a * 20)}"`), s != null && s >= 0 && i.push(`w:before="${Math.round(s * 20)}"`);
  const l = e.style.lineHeight;
  if (l && /^\d+(\.\d+)?$/.test(l.trim())) {
    const v = Number(l);
    v > 0.5 && v < 4 && i.push(`w:line="${Math.round(v * 240)}"`, 'w:lineRule="auto"');
  }
  i.length && t.push(`<w:spacing ${i.join(" ")}/>`);
  const c = [], f = e.style.marginLeft ? o(e.style.marginLeft) : null, p = e.style.marginRight ? o(e.style.marginRight) : null, h = e.style.textIndent ? o(e.style.textIndent) : null;
  if (h != null && h < 0) {
    const v = Math.round(-h * 20), T = Math.max(0, Math.round(((f ?? 0) + h) * 20));
    c.push(`w:left="${T}"`, `w:hanging="${v}"`);
  } else
    f != null && f > 0 && c.push(`w:left="${Math.round(f * 20)}"`), h != null && h > 0 && c.push(`w:firstLine="${Math.round(h * 20)}"`);
  return p != null && p > 0 && c.push(`w:right="${Math.round(p * 20)}"`), c.length && t.push(`<w:ind ${c.join(" ")}/>`), t.join("");
}
function bh(e, t, n) {
  var a, s, l;
  const r = e.tagName, o = $o(e, {}), i = ea(e);
  if (/^H[1-6]$/.test(r)) {
    t.push(Ot(fn(e, o, n), { style: `Heading${r[1]}`, pPrRaw: i }));
    return;
  }
  if (r === "DIV" && e.classList.contains("pagedly-toc")) {
    const c = (s = (a = e.querySelector(".pagedly-toc__title")) == null ? void 0 : a.textContent) == null ? void 0 : s.trim();
    c && t.push(Ot(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${jt(c)}</w:t></w:r>`));
    for (const f of Array.from(e.querySelectorAll(".pagedly-toc__entry"))) {
      const p = (((l = f.querySelector(".pagedly-toc__text")) == null ? void 0 : l.textContent) ?? "").trim();
      p && t.push(Ot(`<w:r><w:t xml:space="preserve">${jt(p)}</w:t></w:r>`));
    }
    return;
  }
  if (r === "P" || r === "DIV") {
    t.push(Ot(fn(e, o, n), { pPrRaw: i }));
    return;
  }
  if (r === "BLOCKQUOTE") {
    t.push(Ot(fn(e, o, n), { style: "Quote", pPrRaw: i }));
    return;
  }
  if (r === "PRE") {
    const c = (e.textContent ?? "").split(`
`);
    for (const f of c)
      t.push(Ot(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${jt(f)}</w:t></w:r>`));
    return;
  }
  if (r === "UL" || r === "OL") {
    su(e, r === "OL" ? 2 : 1, 0, t, n);
    return;
  }
  if (r === "HR") {
    t.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>');
    return;
  }
  if (r === "FIGURE") {
    const c = e.querySelector("figcaption");
    t.push(Ot(fn(e.querySelector("img") ?? e, o, n))), c && t.push(Ot(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${jt(c.textContent ?? "")}</w:t></w:r>`, { style: "Caption" }));
    return;
  }
  if (r === "TABLE") {
    t.push(yh(e, n));
    return;
  }
  t.push(Ot(fn(e, o, n), { pPrRaw: i }));
}
function su(e, t, n, r, o) {
  for (const i of Array.from(e.children)) {
    if (i.tagName !== "LI") continue;
    const a = i, s = Array.from(i.children).filter((p) => p.tagName === "UL" || p.tagName === "OL"), l = Array.from(i.childNodes).filter(
      (p) => !(p.nodeType === Node.ELEMENT_NODE && (p.tagName === "UL" || p.tagName === "OL"))
    ), c = $o(a, {}), f = l.map((p) => fn(p, c, o)).join("");
    r.push(Ot(f, { numId: t, ilvl: n, pPrRaw: ea(a) }));
    for (const p of s) su(p, p.tagName === "OL" ? 2 : 1, n + 1, r, o);
  }
}
function yh(e, t) {
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>${Array.from(e.querySelectorAll("tr")).map((o) => `<w:tr>${Array.from(o.querySelectorAll("th,td")).map((a) => {
    const s = a, l = ['<w:tcW w:w="0" w:type="auto"/>'], c = Number(s.getAttribute("colspan") || "1");
    c > 1 && l.push(`<w:gridSpan w:val="${c}"/>`);
    const f = $o(s, {});
    return `<w:tc><w:tcPr>${l.join("")}</w:tcPr>${Ot(fn(s, f, t), { pPrRaw: ea(s) })}</w:tc>`;
  }).join("")}</w:tr>`).join("")}</w:tbl>`;
}
const Xn = (e) => Math.round(e / 25.4 * 1440);
function wh(e) {
  if (!e)
    return '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';
  const t = e.marginMm;
  return `<w:sectPr><w:pgSz w:w="${Xn(e.widthMm)}" w:h="${Xn(e.heightMm)}"/><w:pgMar w:top="${Xn(t.top)}" w:right="${Xn(t.right)}" w:bottom="${Xn(t.bottom)}" w:left="${Xn(t.left)}"/></w:sectPr>`;
}
function vh(e, t, n) {
  const r = document.createElement("div");
  r.innerHTML = e;
  const o = [];
  for (const i of Array.from(r.childNodes))
    i.nodeType === Node.ELEMENT_NODE ? bh(i, o, t) : i.nodeType === Node.TEXT_NODE && (i.nodeValue ?? "").trim() && o.push(Ot(`<w:r><w:t xml:space="preserve">${jt(i.nodeValue ?? "")}</w:t></w:r>`));
  return o.length === 0 && o.push(Ot("")), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${o.join("")}${wh(n)}</w:body></w:document>`;
}
const Ch = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
function xh(e) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...e.mediaExts].map((n) => `<Default Extension="${n}" ContentType="${Ch[n] ?? "application/octet-stream"}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
}
const Eh = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
function Th(e) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${e.rels.join("")}</Relationships>`;
}
function Ms(e) {
  let t = "";
  for (let n = 0; n < 9; n++) {
    const r = 720 * (n + 1), o = e === "bullet" ? '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>' : `<w:numFmt w:val="decimal"/><w:lvlText w:val="%${n + 1}."/>`;
    t += `<w:lvl w:ilvl="${n}"><w:start w:val="1"/>${o}<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${r}" w:hanging="360"/></w:pPr></w:lvl>`;
  }
  return t;
}
const Nh = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0">${Ms(
  "bullet"
)}</w:abstractNum><w:abstractNum w:abstractNumId="1">${Ms(
  "decimal"
)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
function Sh(e, t) {
  const n = new TextEncoder(), r = fh(), o = vh(e, r, t);
  return dh([
    { name: "[Content_Types].xml", data: n.encode(xh(r)) },
    { name: "_rels/.rels", data: n.encode(Eh) },
    { name: "word/document.xml", data: n.encode(o) },
    { name: "word/_rels/document.xml.rels", data: n.encode(Th(r)) },
    { name: "word/numbering.xml", data: n.encode(Nh) },
    ...r.media
  ]);
}
function Ah(e, t = "document.docx", n) {
  const r = Sh(e, n), o = new Blob([r.buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }), i = URL.createObjectURL(o), a = document.createElement("a");
  a.href = i, a.download = t.endsWith(".docx") ? t : `${t}.docx`, document.body.appendChild(a), a.click(), a.remove(), URL.revokeObjectURL(i);
}
const kh = {
  STRONG: "**",
  B: "**",
  EM: "_",
  I: "_",
  S: "~~",
  STRIKE: "~~",
  DEL: "~~"
};
function nn(e) {
  if (e.nodeType === Node.TEXT_NODE)
    return (e.nodeValue ?? "").replace(/​/g, "");
  if (e.nodeType !== Node.ELEMENT_NODE) return "";
  const t = e, n = t.tagName, r = Array.from(t.childNodes).map(nn).join("");
  if (n === "BR") return `
`;
  if (n === "CODE") return `\`${t.textContent ?? ""}\``;
  if (n === "A") {
    const i = t.getAttribute("href") ?? "";
    return `[${r}](${i})`;
  }
  if (n === "IMG") {
    const i = t.getAttribute("src") ?? "";
    return `![${t.getAttribute("alt") ?? ""}](${i})`;
  }
  const o = kh[n];
  return o && r.trim() ? `${o}${r}${o}` : r;
}
function lu(e, t) {
  const n = e.tagName === "OL", r = e.classList.contains("pagedly-checklist"), o = "  ".repeat(t), i = [];
  let a = 1;
  for (const s of Array.from(e.children)) {
    if (s.tagName !== "LI") continue;
    const l = Array.from(s.children).filter(
      (h) => h.tagName === "UL" || h.tagName === "OL"
    ), f = Array.from(s.childNodes).filter(
      (h) => !(h.nodeType === Node.ELEMENT_NODE && (h.tagName === "UL" || h.tagName === "OL"))
    ).map(nn).join("").trim();
    let p;
    r ? p = `- [${s.getAttribute("data-checked") === "true" ? "x" : " "}]` : n ? p = `${a}.` : p = "-", i.push(`${o}${p} ${f}`);
    for (const h of l) i.push(lu(h, t + 1));
    a += 1;
  }
  return i.join(`
`);
}
function Rh(e) {
  const t = Array.from(e.querySelectorAll("tr"));
  if (t.length === 0) return "";
  const n = (i) => Array.from(i.querySelectorAll("th,td")).map(
    (a) => Array.from(a.childNodes).map(nn).join("").trim().replace(/\|/g, "\\|")
  ), r = n(t[0]), o = [
    `| ${r.join(" | ")} |`,
    `| ${r.map(() => "---").join(" | ")} |`
  ];
  for (const i of t.slice(1)) {
    const a = n(i);
    o.push(`| ${a.join(" | ")} |`);
  }
  return o.join(`
`);
}
function _h(e) {
  var r, o, i;
  const t = [], n = (o = (r = e.querySelector(".pagedly-toc__title")) == null ? void 0 : r.textContent) == null ? void 0 : o.trim();
  n && t.push(`**${n}**`, "");
  for (const a of Array.from(e.querySelectorAll(".pagedly-toc__entry"))) {
    const s = (((i = a.querySelector(".pagedly-toc__text")) == null ? void 0 : i.textContent) ?? "").trim();
    s && t.push(`- ${s}`);
  }
  return t.join(`
`);
}
function cu(e) {
  const t = e.tagName;
  if (/^H[1-6]$/.test(t)) {
    const n = Number(t[1]);
    return `${"#".repeat(n)} ${Array.from(e.childNodes).map(nn).join("").trim()}`;
  }
  if (t === "DIV" && e.classList.contains("pagedly-toc"))
    return _h(e);
  if (t === "P" || t === "DIV")
    return Array.from(e.childNodes).map(nn).join("").trim();
  if (t === "UL" || t === "OL") return lu(e, 0);
  if (t === "BLOCKQUOTE")
    return Array.from(e.childNodes).map((r) => r.nodeType === Node.ELEMENT_NODE ? cu(r) : nn(r)).join(`
`).trim().split(`
`).map((r) => `> ${r}`).join(`
`);
  if (t === "PRE")
    return "```\n" + (e.textContent ?? "").replace(/\n$/, "") + "\n```";
  if (t === "HR") return "---";
  if (t === "FIGURE") {
    const n = e.querySelector("img"), r = e.querySelector("figcaption"), o = n ? nn(n) : "";
    return r ? `${o}
*${r.textContent ?? ""}*` : o;
  }
  return t === "TABLE" ? Rh(e) : t === "IMG" ? nn(e) : Array.from(e.childNodes).map(nn).join("").trim();
}
function Ri(e) {
  const t = document.createElement("div");
  t.innerHTML = e;
  const n = [];
  for (const r of Array.from(t.childNodes))
    if (r.nodeType === Node.TEXT_NODE) {
      const o = (r.nodeValue ?? "").trim();
      o && n.push(o);
    } else if (r.nodeType === Node.ELEMENT_NODE) {
      const o = cu(r);
      o.trim() && n.push(o);
    }
  return n.join(`

`).replace(/\n{3,}/g, `

`).trim() + `
`;
}
const _i = (e) => e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function Kn(e) {
  const t = [];
  let n = e.replace(/`([^`]+)`/g, (r, o) => (t.push(`<code>${_i(o)}</code>`), `\0${t.length - 1}\0`));
  return n = _i(n), n = n.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (r, o, i) => `<img src="${On(i)}" alt="${o.replace(/"/g, "&quot;")}" />`
  ), n = n.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (r, o, i) => `<a href="${On(i)}">${o}</a>`), n = n.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"), n = n.replace(/~~([^~]+)~~/g, "<s>$1</s>"), n = n.replace(new RegExp("(?:^|(?<=\\s))_([^_]+)_(?=\\s|$)", "g"), "<em>$1</em>"), n = n.replace(new RegExp("(?:^|(?<=[^*]))\\*([^*]+)\\*", "g"), "<em>$1</em>"), n = n.replace(/ (\d+) /g, (r, o) => t[Number(o)]), n;
}
function uu(e) {
  const t = e.replace(/\r\n/g, `
`).split(`
`), n = [];
  let r = 0, o = null, i = !1;
  const a = () => {
    o && (n.push(i ? "</ul>" : `</${o}>`), o = null, i = !1);
  };
  for (; r < t.length; ) {
    const s = t[r];
    if (/^```/.test(s)) {
      a();
      const h = [];
      for (r += 1; r < t.length && !/^```/.test(t[r]); )
        h.push(t[r]), r += 1;
      r += 1, n.push(`<pre><code>${_i(h.join(`
`))}</code></pre>`);
      continue;
    }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(s)) {
      a(), n.push("<hr />"), r += 1;
      continue;
    }
    const l = /^(#{1,6})\s+(.*)$/.exec(s);
    if (l) {
      a(), n.push(`<h${l[1].length}>${Kn(l[2].trim())}</h${l[1].length}>`), r += 1;
      continue;
    }
    if (/^>\s?/.test(s)) {
      a();
      const h = [];
      for (; r < t.length && /^>\s?/.test(t[r]); )
        h.push(t[r].replace(/^>\s?/, "")), r += 1;
      n.push(`<blockquote>${Kn(h.join(" "))}</blockquote>`);
      continue;
    }
    const c = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(s);
    if (c) {
      i || (a(), n.push('<ul class="pagedly-checklist">'), o = "ul", i = !0);
      const h = c[1].toLowerCase() === "x";
      n.push(`<li data-checked="${h}">${Kn(c[2].trim())}</li>`), r += 1;
      continue;
    }
    const f = /^\s*[-*+]\s+(.*)$/.exec(s);
    if (f) {
      (o !== "ul" || i) && (a(), n.push("<ul>"), o = "ul"), n.push(`<li>${Kn(f[1].trim())}</li>`), r += 1;
      continue;
    }
    const p = /^\s*\d+[.)]\s+(.*)$/.exec(s);
    if (p) {
      o !== "ol" && (a(), n.push("<ol>"), o = "ol"), n.push(`<li>${Kn(p[1].trim())}</li>`), r += 1;
      continue;
    }
    if (s.trim() === "") {
      a(), r += 1;
      continue;
    }
    a(), n.push(`<p>${Kn(s.trim())}</p>`), r += 1;
  }
  return a(), n.join("");
}
async function Lh(e) {
  const t = globalThis.DecompressionStream;
  if (!t) throw new Error("DecompressionStream unavailable; cannot inflate DOCX");
  const n = new t("deflate-raw"), r = new Response(e).body.pipeThrough(n), o = await new Response(r).arrayBuffer();
  return new Uint8Array(o);
}
async function Dn(e, t) {
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength);
  let r = -1;
  for (let s = e.length - 22; s >= 0; s--) {
    if (n.getUint32(s, !0) !== 101010256) continue;
    const l = n.getUint16(s + 20, !0);
    if (s + 22 + l === e.length) {
      r = s;
      break;
    }
  }
  if (r < 0) return null;
  const o = n.getUint16(r + 10, !0);
  let i = n.getUint32(r + 16, !0);
  const a = new TextDecoder();
  for (let s = 0; s < o && n.getUint32(i, !0) === 33639248; s++) {
    const l = n.getUint16(i + 10, !0), c = n.getUint32(i + 20, !0), f = n.getUint16(i + 28, !0), p = n.getUint16(i + 30, !0), h = n.getUint16(i + 32, !0), v = n.getUint32(i + 42, !0);
    if (a.decode(e.subarray(i + 46, i + 46 + f)) === t) {
      const b = n.getUint16(v + 26, !0), E = n.getUint16(v + 28, !0), x = v + 30 + b + E, w = e.subarray(x, x + c);
      return l === 0 ? w.slice() : l === 8 ? Lh(w) : null;
    }
    i += 46 + f + p + h;
  }
  return null;
}
const at = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", du = "http://schemas.openxmlformats.org/drawingml/2006/main", ta = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", Ph = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", Mh = "http://schemas.openxmlformats.org/package/2006/relationships", rt = (e, t) => e.getElementsByTagNameNS(at, t)[0] ?? null, Ut = (e) => e ? e.getAttributeNS(at, "val") ?? e.getAttribute("w:val") : null, Oh = (e) => e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function yr(e, t) {
  return Array.from(e.children).filter((n) => n.localName === t);
}
const Os = (e) => !!e && /^[0-9a-fA-F]{3,6}$/.test(e);
function Dh(e) {
  const t = [], n = Ut(rt(e, "sz"));
  if (n && /^\d+$/.test(n)) {
    const f = Number(n) / 2;
    f > 0 && f < 400 && t.push(`font-size:${f}pt`);
  }
  const r = Ut(rt(e, "color"));
  Os(r) && t.push(`color:#${r.length === 3 ? r : r.padStart(6, "0")}`);
  const o = rt(e, "highlight"), i = Ut(o);
  i && i !== "none" && /^[a-zA-Z]+$/.test(i) && t.push(`background-color:${i}`);
  const a = rt(e, "shd"), s = a ? a.getAttributeNS(at, "fill") ?? a.getAttribute("w:fill") : null;
  Os(s) && t.push(`background-color:#${s}`);
  const l = rt(e, "rFonts"), c = l ? l.getAttributeNS(at, "ascii") ?? l.getAttribute("w:ascii") : null;
  return c && /^[\w \-]+$/.test(c) && t.push(`font-family:'${c}'`), t.join(";");
}
const fu = /* @__PURE__ */ new Map(), na = /* @__PURE__ */ new Map();
async function Ih(e) {
  const t = await Dn(e, "word/_rels/document.xml.rels");
  if (!t) return [];
  const n = new DOMParser().parseFromString(new TextDecoder().decode(t), "application/xml"), r = n.getElementsByTagNameNS(Mh, "Relationship");
  return r.length ? Array.from(r) : Array.from(n.getElementsByTagName("Relationship"));
}
function $h(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const r = n.getAttribute("Id"), o = n.getAttribute("Type") ?? "", i = n.getAttribute("Target") ?? "", a = n.getAttribute("TargetMode") ?? "";
    r && i && o.endsWith("/hyperlink") && a === "External" && t.set(r, i);
  }
  return t;
}
const tn = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function Bh(e) {
  const t = [];
  let n = 0;
  for (; n + 2 < e.length; n += 3) {
    const o = e[n] << 16 | e[n + 1] << 8 | e[n + 2];
    t.push(
      tn[o >> 18 & 63] + tn[o >> 12 & 63] + tn[o >> 6 & 63] + tn[o & 63]
    );
  }
  const r = e.length - n;
  if (r === 1) {
    const o = e[n] << 16;
    t.push(tn[o >> 18 & 63] + tn[o >> 12 & 63] + "==");
  } else if (r === 2) {
    const o = e[n] << 16 | e[n + 1] << 8;
    t.push(tn[o >> 18 & 63] + tn[o >> 12 & 63] + tn[o >> 6 & 63] + "=");
  }
  return t.join("");
}
const Fh = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
}, Hh = /* @__PURE__ */ new Set(["svg", "emf", "wmf"]);
function zh(e) {
  const t = e.trim(), n = t.startsWith("/") ? t : `word/${t}`, r = [];
  for (const o of n.split("/"))
    !o || o === "." || (o === ".." ? r.pop() : r.push(o));
  return r.join("/");
}
async function Wh(e, t, n) {
  var i;
  const r = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Set();
  for (const a of Array.from(t.getElementsByTagNameNS(du, "blip"))) {
    const s = a.getAttributeNS(ta, "embed") ?? a.getAttribute("r:embed");
    s && o.add(s);
  }
  if (!o.size) return r;
  for (const a of n) {
    const s = a.getAttribute("Id"), l = a.getAttribute("Type") ?? "", c = a.getAttribute("Target") ?? "";
    if (!s || !c || !o.has(s) || !l.endsWith("/image")) continue;
    const f = (((i = /\.([A-Za-z0-9]+)$/.exec(c)) == null ? void 0 : i[1]) ?? "").toLowerCase();
    if (Hh.has(f)) continue;
    const p = Fh[f] ?? "image/png";
    try {
      const h = await Dn(e, zh(c));
      if (!h || !h.length) continue;
      r.set(s, `data:${p};base64,${Bh(h)}`);
    } catch {
    }
  }
  return r;
}
const ri = 700, Ds = 9525;
function jh(e, t) {
  const n = e.getElementsByTagNameNS(du, "blip")[0];
  if (!n) return "";
  const r = n.getAttributeNS(ta, "embed") ?? n.getAttribute("r:embed"), o = r ? t.get(r) : void 0;
  if (!o) return "";
  const i = On(o);
  if (!i) return "";
  let a = "";
  const s = e.getElementsByTagNameNS(Ph, "extent")[0], l = s == null ? void 0 : s.getAttribute("cx"), c = s == null ? void 0 : s.getAttribute("cy");
  if (l && c && /^\d+$/.test(l) && /^\d+$/.test(c)) {
    let f = Math.round(Number(l) / Ds), p = Math.round(Number(c) / Ds);
    f > 0 && p > 0 && (f > ri && (p = Math.max(1, Math.round(p * ri / f)), f = ri), a = ` width="${f}" height="${p}"`);
  }
  return `<img src="${i}"${a} style="max-width:100%;height:auto;">`;
}
const Uh = " ";
function Is(e, t) {
  const n = rt(e, "rPr"), r = [];
  let o = !1;
  for (const a of Array.from(e.children))
    switch (a.localName) {
      case "t": {
        const s = a.textContent ?? "";
        s && (r.push(Oh(s)), o = !0);
        break;
      }
      case "br":
        r.push("<br>");
        break;
      case "tab":
        r.push(Uh), o = !0;
        break;
      case "drawing":
        r.push(jh(a, t));
        break;
    }
  let i = r.join("");
  if (!i) return "";
  if (n && o) {
    const a = Dh(n);
    a && (i = `<span style="${a}">${i}</span>`), rt(n, "b") && (i = `<strong>${i}</strong>`), rt(n, "i") && (i = `<em>${i}</em>`), rt(n, "u") && (i = `<u>${i}</u>`), rt(n, "strike") && (i = `<s>${i}</s>`);
  }
  return i;
}
function pu(e, t, n = na) {
  const r = [];
  for (const i of Array.from(e.children))
    if (i.localName === "r") r.push(Is(i, t));
    else if (i.localName === "hyperlink") {
      const a = yr(i, "r").map((p) => Is(p, t)).join(""), s = i.getAttributeNS(ta, "id") ?? i.getAttribute("r:id"), l = i.getAttributeNS(at, "anchor") ?? i.getAttribute("w:anchor"), c = s ? n.get(s) : void 0, f = c ? On(c) : l ? On(`#${l}`) : "";
      r.push(f && a ? `<a href="${f}">${a}</a>` : a);
    }
  return r.join("") || "<br>";
}
const qh = 10, Vh = 1;
function mu(e) {
  if (!e) return {};
  const t = (s) => e.getAttributeNS(at, s) ?? e.getAttribute(`w:${s}`), n = {}, r = t("after"), o = t("before"), i = t("line"), a = t("lineRule");
  if (r != null && /^\d+$/.test(r) && (n.after = Number(r) / 20), o != null && /^\d+$/.test(o) && (n.before = Number(o) / 20), i && /^\d+$/.test(i) && (!a || a === "auto")) {
    const s = Number(i) / 240;
    s > 0.5 && s < 4 && (n.lineHeight = s);
  } else (!a || a === "auto") && (n.lineHeight = Vh);
  return n;
}
function Xh(e) {
  const t = e.getElementsByTagNameNS(at, "docDefaults")[0], n = t ? Ut(rt(t, "sz")) : null;
  if (n && /^\d+$/.test(n)) return Number(n) / 2;
  for (const r of Array.from(e.getElementsByTagNameNS(at, "style")))
    if ((r.getAttributeNS(at, "type") ?? r.getAttribute("w:type")) === "paragraph" && (r.getAttributeNS(at, "default") ?? r.getAttribute("w:default")) === "1") {
      const i = Ut(rt(r, "sz"));
      if (i && /^\d+$/.test(i)) return Number(i) / 2;
    }
  return qh;
}
function gu(e) {
  var r;
  const t = e.getElementsByTagNameNS(at, "docDefaults")[0], n = t ? ((r = t.getElementsByTagNameNS(at, "pPrDefault")[0]) == null ? void 0 : r.getElementsByTagNameNS(at, "pPr")[0]) ?? null : null;
  return { ...mu(n ? rt(n, "spacing") : null), fontPt: Xh(e) };
}
function Kh(e) {
  const t = (o) => {
    const i = o ? rt(o, "rFonts") : null;
    return i ? i.getAttributeNS(at, "ascii") ?? i.getAttribute("w:ascii") : null;
  }, n = e.getElementsByTagNameNS(at, "docDefaults")[0] ?? null;
  let r = t(n);
  if (!r) {
    for (const o of Array.from(e.getElementsByTagNameNS(at, "style")))
      if ((o.getAttributeNS(at, "type") ?? o.getAttribute("w:type")) === "paragraph" && (o.getAttributeNS(at, "default") ?? o.getAttribute("w:default")) === "1") {
        r = t(o);
        break;
      }
  }
  return r && /^[\w \-]+$/.test(r) ? r : void 0;
}
async function Gh(e) {
  try {
    const t = await Dn(e, "word/styles.xml");
    if (!t) return null;
    const n = new DOMParser().parseFromString(new TextDecoder().decode(t), "application/xml"), r = gu(n), o = { fontPt: r.fontPt };
    r.lineHeight != null && (o.lineHeight = r.lineHeight);
    const i = Kh(n);
    return i && (o.fontFamily = i), o;
  } catch {
    return null;
  }
}
const $s = 288;
function Yh(e) {
  const t = e ? rt(e, "ind") : null;
  if (!t) return [];
  const n = (f) => {
    const p = t.getAttributeNS(at, f) ?? t.getAttribute(`w:${f}`);
    return p != null && /^-?\d+$/.test(p) ? Number(p) / 20 : null;
  }, r = (f) => Math.max(-$s, Math.min($s, f)), o = (f) => `${Math.round(r(f) * 100) / 100}pt`, i = [];
  let a = n("left") ?? n("start");
  const s = n("right") ?? n("end"), l = n("hanging"), c = n("firstLine");
  return l != null && l > 0 ? (i.push(`text-indent:${o(-l)}`), a = (a ?? 0) + l) : c != null && c > 0 && i.push(`text-indent:${o(c)}`), a != null && a !== 0 && i.push(`margin-left:${o(a)}`), s != null && s !== 0 && i.push(`margin-right:${o(s)}`), i;
}
function Qh(e, t) {
  const n = [], r = e ? Ut(rt(e, "jc")) : null, o = { center: "center", right: "right", both: "justify", end: "right" };
  r && o[r] && n.push(`text-align:${o[r]}`), n.push(...Yh(e));
  const i = mu(e ? rt(e, "spacing") : null), a = i.after ?? t.after, s = i.before ?? t.before, l = i.lineHeight ?? t.lineHeight;
  return a != null && n.push(`margin-bottom:${Math.min(a, 72).toFixed(1)}pt`), s != null && n.push(`margin-top:${Math.min(s, 72).toFixed(1)}pt`), l != null && n.push(`line-height:${l.toFixed(3)}`), n.join(";");
}
const Zh = /* @__PURE__ */ new Map();
async function Jh(e) {
  const t = /* @__PURE__ */ new Map();
  try {
    const n = await Dn(e, "word/numbering.xml");
    if (!n) return t;
    const r = new DOMParser().parseFromString(new TextDecoder().decode(n), "application/xml"), o = (a, s) => a.getAttributeNS(at, s) ?? a.getAttribute(`w:${s}`), i = /* @__PURE__ */ new Map();
    for (const a of Array.from(r.getElementsByTagNameNS(at, "abstractNum"))) {
      const s = o(a, "abstractNumId");
      if (s == null) continue;
      const l = /* @__PURE__ */ new Map();
      for (const c of yr(a, "lvl")) {
        const f = o(c, "ilvl"), p = Ut(rt(c, "numFmt"));
        f != null && /^\d+$/.test(f) && p && l.set(Number(f), p);
      }
      i.set(s, l);
    }
    for (const a of Array.from(r.getElementsByTagNameNS(at, "num"))) {
      const s = o(a, "numId"), l = Ut(rt(a, "abstractNumId"));
      if (s == null || l == null) continue;
      const c = i.get(l);
      c && t.set(s, c);
    }
  } catch {
  }
  return t;
}
function eb(e, t, n = fu, r = na, o = Zh) {
  var T, b;
  const i = rt(e, "pPr"), a = Ut(i ? rt(i, "pStyle") : null) ?? "", s = pu(e, n, r), l = Qh(i, t), c = l ? ` style="${l}"` : "", f = t.fontPt ? `font-size:${t.fontPt}pt` : "", p = (E) => {
    const x = [f, E].filter(Boolean).join(";");
    return x ? ` style="${x}"` : "";
  }, h = /^Heading([1-6])$/.exec(a);
  if (h) return `<h${h[1]}${c}>${s}</h${h[1]}>`;
  if (/^(Title|Subtitle)$/i.test(a)) return `<h1${c}>${s}</h1>`;
  if (/^Quote$/i.test(a)) return `<blockquote${p(l)}>${s}</blockquote>`;
  const v = i ? rt(i, "numPr") : null;
  if (v) {
    const E = Ut(rt(v, "numId")), x = Ut(rt(v, "ilvl")), w = x != null && /^\d+$/.test(x) ? Math.min(Number(x), 8) : 0, k = E ? ((T = o.get(E)) == null ? void 0 : T.get(w)) ?? ((b = o.get(E)) == null ? void 0 : b.get(0)) : void 0;
    return `<li data-list="${k ? k === "bullet" ? "ul" : "ol" : E === "2" ? "ol" : "ul"}" data-ilvl="${w}"${p(l)}>${s}</li>`;
  }
  return `<p${p(l)}>${s}</p>`;
}
function tb(e, t = fu, n = na) {
  return `<table class="pagedly-table"><tbody>${yr(e, "tr").map((o) => `<tr>${yr(o, "tc").map((a) => `<td>${yr(a, "p").map((s) => pu(s, t, n)).join("<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function nb(e) {
  const t = [], n = [], r = () => {
    const i = n.pop(), a = `<${i.tag}>${i.items.join("")}</${i.tag}>`, s = n[n.length - 1];
    if (!s) {
      t.push(a);
      return;
    }
    s.items.length ? s.items[s.items.length - 1] = s.items[s.items.length - 1].replace(/<\/li>$/, `${a}</li>`) : s.items.push(`<li>${a}</li>`);
  }, o = () => {
    for (; n.length; ) r();
  };
  for (const i of e) {
    const a = /^<li data-list="(ul|ol)"(?: data-ilvl="(\d+)")?([^>]*)>([\s\S]*)<\/li>$/.exec(i);
    if (!a) {
      o(), t.push(i);
      continue;
    }
    const s = a[1], l = a[2] != null ? Number(a[2]) : 0, c = a[3];
    for (; n.length && n[n.length - 1].ilvl > l; ) r();
    n.length && n[n.length - 1].ilvl === l && n[n.length - 1].tag !== s && r(), (!n.length || n[n.length - 1].ilvl < l) && n.push({ tag: s, ilvl: l, items: [] }), n[n.length - 1].items.push(`<li${c}>${a[4]}</li>`);
  }
  return o(), t.join("");
}
async function rb(e) {
  const t = await Dn(e, "word/document.xml");
  if (!t) throw new Error("word/document.xml not found in DOCX");
  const n = new DOMParser().parseFromString(new TextDecoder().decode(t), "application/xml"), r = n.getElementsByTagNameNS(at, "body")[0];
  if (!r) return "";
  let o = {};
  const i = await Dn(e, "word/styles.xml");
  if (i) {
    const p = new DOMParser().parseFromString(new TextDecoder().decode(i), "application/xml");
    o = gu(p);
  }
  const a = await Ih(e), s = await Wh(e, n, a), l = $h(a), c = await Jh(e), f = [];
  for (const p of Array.from(r.children))
    p.localName === "p" ? f.push(eb(p, o, s, l, c)) : p.localName === "tbl" && f.push(tb(p, s, l));
  return nb(f);
}
async function ob(e) {
  try {
    const t = await Dn(e, "word/document.xml");
    if (!t) return null;
    const r = new DOMParser().parseFromString(new TextDecoder().decode(t), "application/xml").getElementsByTagNameNS(at, "sectPr");
    if (!r.length) return null;
    const o = r[r.length - 1], i = rt(o, "pgSz"), a = rt(o, "pgMar");
    if (!i || !a) return null;
    const s = (w, k) => {
      const D = w.getAttributeNS(at, k) ?? w.getAttribute(`w:${k}`);
      return D != null && /^\d+$/.test(D) ? Number(D) : null;
    }, l = (w) => Math.round(w / 20 * (25.4 / 72) * 10) / 10, c = s(i, "w"), f = s(i, "h"), p = s(a, "top"), h = s(a, "right"), v = s(a, "bottom"), T = s(a, "left");
    if (c == null || f == null || c <= 0 || f <= 0 || p == null || h == null || v == null || T == null) return null;
    const b = l(c), E = l(f);
    if (b < 50 || b > 1200 || E < 50 || E > 1200) return null;
    const x = { top: l(p), right: l(h), bottom: l(v), left: l(T) };
    return x.left + x.right >= b || x.top + x.bottom >= E ? null : { widthMm: b, heightMm: E, marginMm: x };
  } catch {
    return null;
  }
}
function ib(e, t) {
  if (t === "`")
    return e === "``" ? { command: "formatCodeBlock" } : null;
  if (t !== " ") return null;
  const n = /^(#{1,6})$/.exec(e);
  return n ? { command: "formatBlock", value: `h${n[1].length}` } : /^[-*+]$/.test(e) ? { command: "insertUnorderedList" } : /^\d{1,9}[.)]$/.test(e) ? { command: "insertOrderedList" } : /^\[[ xX]?\]$/.test(e) ? { command: "insertChecklist" } : e === ">" ? { command: "toggleBlockquote" } : null;
}
function ab(e, t) {
  if (t === "-" && /-$/.test(e) && !/--$/.test(e))
    return { removeBefore: 1, insert: "—" };
  if (t === "." && /\.\.$/.test(e))
    return { removeBefore: 2, insert: "…" };
  if (t === ")") {
    if (/\(c$/i.test(e)) return { removeBefore: 2, insert: "©" };
    if (/\(r$/i.test(e)) return { removeBefore: 2, insert: "®" };
    if (/\(tm$/i.test(e)) return { removeBefore: 3, insert: "™" };
  }
  return null;
}
const hr = (e) => e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function sb(e, t) {
  if (t === "`") {
    const n = /`([^`]+)$/.exec(e);
    return n ? {
      removeBefore: n[1].length + 1,
      html: `<code>${hr(n[1])}</code>`
    } : null;
  }
  if (t === "*") {
    const n = /\*\*([^*]+)\*$/.exec(e);
    if (n)
      return {
        removeBefore: n[1].length + 3,
        html: `<strong>${hr(n[1])}</strong>`
      };
    const r = /(?:^|[^*])\*([^*]+)$/.exec(e);
    return r ? {
      removeBefore: r[1].length + 1,
      html: `<em>${hr(r[1])}</em>`
    } : null;
  }
  if (t === "_") {
    const n = /(?:^|[^_])_([^_]+)$/.exec(e);
    return n ? {
      removeBefore: n[1].length + 1,
      html: `<em>${hr(n[1])}</em>`
    } : null;
  }
  if (t === "~") {
    const n = /~~([^~]+)~$/.exec(e);
    return n ? {
      removeBefore: n[1].length + 3,
      html: `<s>${hr(n[1])}</s>`
    } : null;
  }
  return null;
}
const lb = /(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
function cb(e) {
  const t = lb.exec(e);
  if (!t) return null;
  let n = t[1];
  for (; n.length && /[.,;:!?)\]}'"]$/.test(n); )
    n = n.slice(0, -1);
  if (n.length < 4) return null;
  const r = /^www\./i.test(n) ? `https://${n}` : n;
  return { url: n, href: r, length: n.length };
}
const Bs = (e) => {
  var t, n, r;
  return (
    // Atomic media that must not be split mid-element. NOT tables —
    // those reflow row-by-row across pages by design.
    /^(img|figure|svg|hr|video)$/i.test(e.tagName) || ((t = e.classList) == null ? void 0 : t.contains("pagedly-keep-together")) || ((n = e.style) == null ? void 0 : n.breakInside) === "avoid" || ((r = e.style) == null ? void 0 : r.pageBreakInside) === "avoid"
  );
}, ub = { right: "{page} / {total}" };
function db(e, t) {
  if (e) return e;
  if (t !== !1)
    return { ...ub };
}
const oi = {
  bold: !1,
  italic: !1,
  underline: !1,
  strikethrough: !1,
  superscript: !1,
  subscript: !1,
  fontSize: "",
  unorderedList: !1,
  orderedList: !1,
  block: "p",
  align: "",
  link: !1,
  linkHref: "",
  blockquote: !1,
  pasteFormatting: "clean",
  canUndo: !1,
  canRedo: !1,
  reflowState: "idle",
  pageCount: 1,
  characterCount: 0,
  wordCount: 0,
  isEmpty: !0
};
function fb(e) {
  const t = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, {
    acceptNode(s) {
      let l = s.parentElement;
      for (; l && l !== e; ) {
        if (l.getAttribute("aria-hidden") === "true")
          return NodeFilter.FILTER_REJECT;
        l = l.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  }), n = [];
  let r = t.nextNode();
  for (; r; )
    n.push(r.nodeValue ?? ""), r = t.nextNode();
  const o = n.join(" ").replace(/​/g, "").replace(/\s+/g, " ").trim(), i = o.length, a = o ? o.split(" ").filter(Boolean).length : 0;
  return { characterCount: i, wordCount: a, isEmpty: i === 0 };
}
const Fs = [
  { id: "p", label: "Text", description: "Just start writing with plain text.", group: "Basic blocks", icon: rl, keywords: ["p", "text", "paragraph", "body", "plain"], command: "formatBlock", value: "p" },
  { id: "h1", label: "Heading 1", description: "Big section heading.", group: "Basic blocks", icon: gl, keywords: ["h1", "title", "heading", "big"], feature: "headings", command: "formatBlock", value: "h1" },
  { id: "h2", label: "Heading 2", description: "Medium section heading.", group: "Basic blocks", icon: hl, keywords: ["h2", "heading", "medium"], feature: "headings", command: "formatBlock", value: "h2" },
  { id: "h3", label: "Heading 3", description: "Small section heading.", group: "Basic blocks", icon: bl, keywords: ["h3", "heading", "subtitle", "small"], feature: "headings", command: "formatBlock", value: "h3" },
  { id: "ul", label: "Bulleted list", description: "Create a simple bulleted list.", group: "Basic blocks", icon: il, keywords: ["ul", "bullet", "unordered", "list"], feature: "bulletList", command: "insertUnorderedList" },
  { id: "ol", label: "Numbered list", description: "Create a list with numbering.", group: "Basic blocks", icon: al, keywords: ["ol", "number", "ordered", "list"], feature: "numberedList", command: "insertOrderedList" },
  { id: "check", label: "To-do list", description: "Track tasks with a checklist.", group: "Basic blocks", icon: sl, keywords: ["todo", "task", "check", "checklist"], feature: "checklist", command: "insertChecklist" },
  { id: "quote", label: "Quote", description: "Capture a quote.", group: "Basic blocks", icon: Sd, keywords: ["quote", "blockquote", "citation"], feature: "blockquote", command: "toggleBlockquote" },
  { id: "code", label: "Code", description: "Capture a code snippet.", group: "Basic blocks", icon: ol, keywords: ["code", "pre", "snippet"], feature: "codeBlock", command: "formatCodeBlock" },
  { id: "hr", label: "Divider", description: "Visually divide blocks.", group: "Basic blocks", icon: cl, keywords: ["hr", "divider", "rule", "separator"], feature: "horizontalRule", command: "insertHorizontalRule" },
  { id: "table", label: "Table", description: "Add a simple table.", group: "Basic blocks", icon: dl, keywords: ["table", "grid"], feature: "table", command: "insertTable", value: JSON.stringify({ rows: 3, cols: 3, header: !0 }) },
  { id: "image", label: "Image", description: "Upload an image file.", group: "Media", icon: ll, keywords: ["image", "img", "picture", "photo", "upload"], feature: "image", image: !0 },
  { id: "pagebreak", label: "Page break", description: "Start a new page here.", group: "Document", icon: Ad, keywords: ["page", "break", "pagebreak"], feature: "pageBreak", command: "insertPageBreak" },
  { id: "sectionbreak", label: "Section break", description: "New sheet, page numbering restarts.", group: "Document", icon: pl, keywords: ["section", "break", "numbering", "restart"], feature: "sections", command: "insertSectionBreak" },
  // NB: "Two columns" (toggleColumns) is deliberately NOT a slash item — slash
  // runs on a fresh empty block, so a selection TOGGLE applied there is an
  // invisible no-op that reads as "broken". It lives in the toolbar + palette.
  { id: "toc", label: "Table of contents", description: "Page-numbered list of headings.", group: "Document", icon: fl, keywords: ["toc", "contents", "index"], feature: "toc", command: "insertTableOfContents" },
  { id: "xref", label: "Cross-reference", description: "Insert a “see p. N” reference.", group: "Document", icon: ml, keywords: ["cross", "reference", "xref", "see", "page"], feature: "toc", command: "insertCrossReference" },
  { id: "leader", label: "Leader row", description: "Label … dotted leader … value.", group: "Document", icon: li, keywords: ["leader", "dots", "tab", "price", "row"], feature: "leaders", command: "insertLeader" },
  { id: "footnote", label: "Footnote", description: "Add a bottom-of-page note.", group: "Document", icon: ul, keywords: ["footnote", "note", "endnote"], footnote: !0, command: "insertFootnote" }
], Hs = ["Basic blocks", "Media", "Document"];
function zs(e, t = 1600) {
  return new Promise((n, r) => {
    const o = new FileReader();
    o.onerror = r, o.onload = () => {
      const i = String(o.result ?? ""), a = new Image();
      a.onerror = r, a.onload = () => {
        const { naturalWidth: s, naturalHeight: l } = a;
        if (s === 0 || l === 0) {
          n({ src: i, w: 0, h: 0 });
          return;
        }
        const c = s > t || l > t;
        if (!c && i.length < 7e5) {
          n({ src: i, w: s, h: l });
          return;
        }
        const f = c ? t / Math.max(s, l) : 1, p = Math.round(s * f), h = Math.round(l * f), v = document.createElement("canvas");
        v.width = p, v.height = h;
        const T = v.getContext("2d");
        if (!T) {
          n({ src: i, w: s, h: l });
          return;
        }
        T.drawImage(a, 0, 0, p, h);
        const E = /^image\/(png|gif|webp)$/i.test(e.type) ? v.toDataURL("image/png") : v.toDataURL("image/jpeg", 0.85);
        n({ src: E, w: p, h });
      }, a.src = i;
    }, o.readAsDataURL(e);
  });
}
function pb(e) {
  const t = e.trim().split(/\s+/).map((a) => {
    const s = /^(\d+(?:\.\d+)?)mm$/i.exec(a);
    return s ? Number(s[1]) : NaN;
  });
  if (t.some((a) => Number.isNaN(a)) || t.length === 0 || t.length > 4)
    return { top: 20, right: 20, bottom: 20, left: 20 };
  const [n, r = n, o = n, i = r] = t;
  return { top: n, right: r, bottom: o, left: i };
}
function Ws(e, t) {
  if (e.nodeType === Node.TEXT_NODE) return { textNode: e, offset: t };
  if (t > 0) {
    let n = e.childNodes[t - 1] ?? null;
    for (; n && n.nodeType !== Node.TEXT_NODE; ) n = n.lastChild;
    if (n && n.nodeType === Node.TEXT_NODE)
      return { textNode: n, offset: n.length };
  }
  return null;
}
function js(e) {
  if (e.querySelector("img, table, hr, figure")) return !1;
  const t = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, {
    acceptNode(r) {
      let o = r.parentElement;
      for (; o && o !== e; ) {
        if (o.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
        o = o.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n = t.nextNode();
  for (; n; ) {
    if ((n.nodeValue ?? "").replace(/​/g, "").trim().length > 0) return !1;
    n = t.nextNode();
  }
  return !0;
}
const mb = go(function(t, n) {
  var va, Ca, xa, Ea, Ta, Na, Sa;
  const r = X(null), o = Ne(
    () => {
      var u;
      return ((u = r.current) == null ? void 0 : u.getContentEl()) ?? null;
    },
    []
  ), i = Ne(() => {
    const u = o(), m = (u == null ? void 0 : u.closest(".pagedly-editor--ce")) ?? u ?? null, C = typeof document < "u" ? document.activeElement : null;
    return !!(m && C && m.contains(C));
  }, [o]), a = X(/* @__PURE__ */ new Set()), s = Ne((u, m) => {
    a.current.has(u) || (a.current.add(u), console.warn(`[paged-html-editor] ${m}`));
  }, []);
  t.viewMode && t.viewMode !== "edit" && s(
    "viewMode",
    `viewMode="${t.viewMode}" (preview) is not yet supported.`
  ), t.onReflowStateChange && s(
    "onReflowStateChange",
    'onReflowStateChange is not yet wired — reflowState is always reported as "idle".'
  ), t.printCss && s("printCss", "printCss is not yet wired — printing uses the bundled @media print rules."), (t.readOnlyChromeSelector || t.editableRootSelector) && s(
    "regionSelectors",
    "readOnlyChromeSelector / editableRootSelector are not yet wired (no sub-region editing mode)."
  );
  const [l, c] = Qe(() => ({
    ...oi,
    // Reflect the initial paste mode so the toolbar toggle shows the
    // correct pressed state before the first selectionchange.
    pasteFormatting: t.pasteFormatting === "rich" ? "rich" : "clean"
  })), f = X(l);
  f.current = l;
  const p = X(
    /* @__PURE__ */ new Set()
  ), h = X(null), [v, T] = Qe(
    t.pasteFormatting === "rich" ? "rich" : "clean"
  ), b = X(v);
  b.current = v;
  const [E, x] = Qe(
    ((va = t.documentMetrics) == null ? void 0 : va.geometry) ?? null
  ), w = X(null), [k, D] = Qe(
    ((Ca = t.documentMetrics) == null ? void 0 : Ca.defaults) ?? null
  ), j = t.documentMetrics;
  Ze(() => {
    j && (j.geometry && x(j.geometry), j.defaults && D(j.defaults));
  }, [j]);
  const q = X(t.onDocumentMetricsChange);
  q.current = t.onDocumentMetricsChange, Ze(() => {
    if (!k) return;
    const u = o();
    if (!u) return;
    const { fontPt: m, lineHeight: C, fontFamily: y } = k;
    m != null && m > 0 && m < 400 && u.style.setProperty("--pagedly-font-size", `${m}pt`), C != null && C > 0.5 && C < 4 && u.style.setProperty("--pagedly-line-height", String(C)), y && u.style.setProperty("--pagedly-font-family", `'${y}'`);
  }, [k, o]);
  const H = si(() => Kg(t.features), [t.features]), Q = X(H);
  Q.current = H;
  const be = X(t.readOnly);
  be.current = t.readOnly;
  const ke = X(t.onImageInsert);
  ke.current = t.onImageInsert;
  const we = X(t.maxImageBytes);
  we.current = t.maxImageBytes;
  const $e = X(t.imageAccept);
  $e.current = t.imageAccept;
  const Re = X(t.onPageCountChange);
  Re.current = t.onPageCountChange;
  const Me = X(0), V = X(null);
  Ze(() => {
    var m;
    const u = l.pageCount;
    V.current !== u && (V.current = u, (m = Re.current) == null || m.call(Re, u));
  }, [l.pageCount]);
  const [ve, _e] = Qe(null), de = Ne(() => {
    if (!Q.current.table) {
      _e(null);
      return;
    }
    const u = typeof window < "u" ? window.getSelection() : null, m = As((u == null ? void 0 : u.anchorNode) ?? null), C = (m == null ? void 0 : m.closest("table")) ?? null;
    if (!C || !C.closest(".pagedly-ce-content")) {
      _e(null);
      return;
    }
    const y = C.getBoundingClientRect();
    _e({ top: Math.max(6, y.top - 42), left: Math.round(y.left) });
  }, []), [Le, Ve] = Qe(null), st = X(null), [et, tt] = Qe(null), [nt, ot] = Qe(null), z = X(et);
  z.current = et;
  const ee = Ne(() => {
    const u = typeof window < "u" ? window.getSelection() : null;
    if (u && u.rangeCount > 0) {
      const y = u.getRangeAt(0).getBoundingClientRect();
      if (y && (y.top || y.left))
        return {
          top: Math.min(y.bottom + 6, window.innerHeight - 60),
          left: Math.min(Math.max(y.left, 8), window.innerWidth - 340)
        };
    }
    const m = o(), C = m == null ? void 0 : m.getBoundingClientRect();
    return { top: ((C == null ? void 0 : C.top) ?? 80) + 40, left: ((C == null ? void 0 : C.left) ?? 80) + 40 };
  }, [o]), Be = Ne(() => {
    const u = typeof window < "u" ? window.getSelection() : null;
    u && u.rangeCount > 0 && (h.current = u.getRangeAt(0).cloneRange());
  }, []), it = Ne(
    (u, m, C) => {
      Be();
      const y = ee();
      ot(null), tt({ ...y, title: u, items: m, index: 0, onPick: C });
    },
    [ee, Be]
  ), Oe = Ne(
    (u, m, C, y) => {
      Be();
      const A = ee();
      tt(null), ot({ ...A, title: u, placeholder: m, initial: C, onSubmit: y });
    },
    [ee, Be]
  );
  Ze(() => {
    if (!et) return;
    const u = (m) => {
      const C = z.current;
      if (C) {
        if (m.key === "Escape")
          m.preventDefault(), m.stopPropagation(), tt(null);
        else if (m.key === "ArrowDown")
          m.preventDefault(), m.stopPropagation(), tt((y) => y && { ...y, index: (y.index + 1) % y.items.length });
        else if (m.key === "ArrowUp")
          m.preventDefault(), m.stopPropagation(), tt((y) => y && { ...y, index: (y.index - 1 + y.items.length) % y.items.length });
        else if (m.key === "Enter") {
          m.preventDefault(), m.stopPropagation();
          const y = C.items[Math.min(C.index, C.items.length - 1)];
          tt(null), y && C.onPick(y.id);
        }
      }
    };
    return document.addEventListener("keydown", u, !0), () => document.removeEventListener("keydown", u, !0);
  }, [et]);
  const We = Ne(() => {
    const u = window.getSelection();
    if (!u || u.rangeCount === 0 || !u.isCollapsed) return null;
    const m = u.getRangeAt(0);
    let C = m.endContainer, y = m.endOffset;
    if (C.nodeType !== Node.TEXT_NODE)
      if (y > 0) {
        let se = C.childNodes[y - 1] ?? null;
        for (; se && se.nodeType !== Node.TEXT_NODE; ) se = se.lastChild;
        if (se && se.nodeType === Node.TEXT_NODE)
          C = se, y = se.length;
        else
          return null;
      } else
        return null;
    const A = o();
    if (!A || !A.contains(C)) return null;
    for (let se = C; se && se !== A; se = se.parentNode)
      if (se.nodeType === Node.ELEMENT_NODE) {
        const J = se.tagName;
        if (J === "PRE" || J === "CODE") return null;
      }
    const R = C, P = R.data.slice(0, y), $ = /(?:^|\s)\/([^\s/]*)$/.exec(P);
    if (!$) return null;
    const B = $[1], Z = y - B.length - 1;
    return { textNode: R, slashStart: Z, caretOffset: y, query: B };
  }, []), I = Ne(() => {
    if (!Q.current.slashMenu) {
      Le && Ve(null), st.current = null;
      return;
    }
    const u = We();
    if (!u) {
      Le && Ve(null), st.current = null;
      return;
    }
    const m = window.getSelection();
    let C = null;
    if (m && m.rangeCount > 0 && (C = m.getRangeAt(0).getBoundingClientRect(), (!C || C.top === 0 && C.left === 0) && u.textNode.parentElement && (C = u.textNode.parentElement.getBoundingClientRect())), !C) return;
    const y = st.current !== u.query;
    st.current = u.query, Ve((A) => ({
      top: Math.round(C.bottom + 4),
      left: Math.round(C.left),
      query: u.query,
      index: y || !A ? 0 : A.index
    }));
  }, [We, Le]), [ce, ue] = Qe(
    null
  ), xe = X(t.aiProvider);
  xe.current = t.aiProvider;
  const [Et, Ct] = Qe(!1), _t = X(!1), kt = X(t.commands);
  kt.current = t.commands;
  const Lt = X(t.suggesting);
  Lt.current = t.suggesting;
  const Ft = X(t.onCommentAdd);
  Ft.current = t.onCommentAdd;
  const Jt = X(t.onCommentClick);
  Jt.current = t.onCommentClick;
  const [xt, In] = Qe(!1);
  Ze(() => {
    if (!xt) return;
    const u = (m) => {
      m.key === "Escape" && (m.preventDefault(), In(!1));
    };
    return document.addEventListener("keydown", u, !0), () => document.removeEventListener("keydown", u, !0);
  }, [xt]);
  const [pr, $n] = Qe(null), ln = Ne(() => {
    if (!t.placeholder) {
      $n((A) => A && null);
      return;
    }
    const u = o();
    if (!u || !js(u)) {
      $n((A) => A && null);
      return;
    }
    const C = u.querySelector(
      ".pagedly-ce-page p, .pagedly-ce-page h1, .pagedly-ce-page h2, .pagedly-ce-page div"
    ) ?? u.querySelector(".pagedly-ce-page");
    if (!C) {
      $n((A) => A && null);
      return;
    }
    const y = C.getBoundingClientRect();
    $n({ top: Math.round(y.top + 1), left: Math.round(y.left + 2) });
  }, [t.placeholder]), [cn, mr] = Qe(!1), [vn, Cn] = Qe([]), Bn = X(cn);
  Bn.current = cn;
  const xn = Ne(() => {
    if (!Bn.current || !Q.current.outline) return;
    const u = o();
    if (!u) {
      Cn([]);
      return;
    }
    const m = Array.from(
      u.querySelectorAll("h1, h2, h3, h4, h5, h6")
    ).filter((C) => !C.closest('[aria-hidden="true"]'));
    Cn(
      m.map((C) => ({
        level: Number(C.tagName[1]),
        text: (C.textContent ?? "").trim() || "(untitled)"
      }))
    );
  }, []), Fn = Ne((u) => {
    const m = o();
    if (!m) return;
    const y = Array.from(
      m.querySelectorAll("h1, h2, h3, h4, h5, h6")
    ).filter((A) => !A.closest('[aria-hidden="true"]'))[u];
    y && y.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []), [Hn, zn] = Qe(
    null
  ), un = X(null), Xt = Ne(() => {
    if (!Q.current.image) {
      un.current = null, zn((y) => y && null);
      return;
    }
    const u = o(), m = (u == null ? void 0 : u.querySelector('img[data-pagedly-selected="true"]')) ?? null;
    if (un.current = m, !m) {
      zn((y) => y && null);
      return;
    }
    const C = m.getBoundingClientRect();
    zn({ top: Math.max(6, C.top - 42), left: Math.round(C.left) });
  }, []), $r = (u) => u.closest("figure.pagedly-figure") ?? u, Wn = Ne((u) => {
    const m = un.current;
    if (!m) return;
    const C = $r(m);
    C.getAttribute("data-align") === u ? C.removeAttribute("data-align") : C.setAttribute("data-align", u);
    const y = m.closest(".pagedly-ce-content");
    y == null || y.dispatchEvent(
      new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
    ), Xt();
  }, [Xt]), Bo = Ne(() => {
    const u = un.current;
    if (!u) return;
    const m = u.closest(".pagedly-ce-content"), C = u.closest("figure.pagedly-figure");
    if (C) {
      const y = C.getAttribute("data-align");
      y ? u.setAttribute("data-align", y) : u.removeAttribute("data-align"), C.replaceWith(u);
    } else {
      const y = document.createElement("figure");
      y.className = "pagedly-figure";
      const A = u.getAttribute("data-align");
      A && (y.setAttribute("data-align", A), u.removeAttribute("data-align"));
      const R = document.createElement("figcaption");
      R.textContent = "Caption", u.replaceWith(y), y.appendChild(u), y.appendChild(R);
      const P = document.createRange();
      P.selectNodeContents(R);
      const $ = window.getSelection();
      $ == null || $.removeAllRanges(), $ == null || $.addRange(P);
    }
    m == null || m.dispatchEvent(
      new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
    ), Xt();
  }, [Xt]), Br = Ne(() => {
    const u = un.current;
    !u || typeof window > "u" || Oe("Alt text", "Describe the image (accessibility)", u.alt ?? "", (m) => {
      u.alt = m;
      const C = u.closest(".pagedly-ce-content");
      C == null || C.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertReplacementText" })
      );
    });
  }, [Oe]), [En, Fr] = Qe(!1), [bt, Tn] = Qe(""), [Kt, Hr] = Qe(""), [$t, zr] = Qe({ matchCase: !1, wholeWord: !1, regex: !1 }), N = X($t);
  N.current = $t;
  const M = X(null), L = X(-1), te = Ne((u) => {
    if (!u) return null;
    const m = N.current;
    let C = m.regex ? u : u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    m.wholeWord && (C = `(?<![\\w])(?:${C})(?![\\w])`);
    try {
      return new RegExp(C, m.matchCase ? "g" : "gi");
    } catch {
      return null;
    }
  }, []), pe = Ne(
    (u) => {
      const m = te(u);
      if (!m) return [];
      const C = o();
      if (!C) return [];
      const y = [], A = document.createTreeWalker(C, NodeFilter.SHOW_TEXT, {
        acceptNode(P) {
          let $ = P.parentElement;
          for (; $ && $ !== C; ) {
            if ($.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
            $ = $.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let R;
      for (; R = A.nextNode(); ) {
        const P = R, $ = P.textContent ?? "";
        m.lastIndex = 0;
        let B;
        for (; (B = m.exec($)) !== null; ) {
          if (B[0].length === 0) {
            m.lastIndex++;
            continue;
          }
          const Z = document.createRange();
          Z.setStart(P, B.index), Z.setEnd(P, B.index + B[0].length), y.push(Z);
        }
      }
      return y;
    },
    [te]
  ), Y = Ne(
    (u, m) => {
      var P;
      const C = window;
      if (!((P = C.CSS) != null && P.highlights) || !C.Highlight) return;
      const y = "pagedly-find-match", A = "pagedly-find-active";
      if (C.CSS.highlights.delete(y), C.CSS.highlights.delete(A), u.length === 0) return;
      const R = u.filter(($, B) => B !== m);
      R.length > 0 && C.CSS.highlights.set(y, new C.Highlight(...R)), m >= 0 && m < u.length && C.CSS.highlights.set(A, new C.Highlight(u[m]));
    },
    []
  ), ye = Ne(() => {
    var m;
    const u = window;
    (m = u.CSS) != null && m.highlights && (u.CSS.highlights.delete("pagedly-find-match"), u.CSS.highlights.delete("pagedly-find-active"));
  }, []), Ee = Ne(
    (u, m, C) => {
      const y = window.getSelection();
      if (!y) return;
      y.removeAllRanges(), y.addRange(u);
      const A = u.getBoundingClientRect();
      (A.top < 100 || A.bottom > window.innerHeight - 100) && (u.startContainer.parentElement ?? document.body).scrollIntoView({
        behavior: "smooth",
        block: "center"
      }), h.current = u.cloneRange(), m && typeof C == "number" && Y(m, C);
    },
    [Y]
  ), ge = Ne(() => {
    const u = pe(bt);
    if (u.length === 0) {
      ye();
      return;
    }
    L.current = (L.current + 1) % u.length, Ee(u[L.current], u, L.current);
  }, [ye, pe, bt, Ee]), ie = Ne(() => {
    const u = pe(bt);
    if (u.length === 0) {
      ye();
      return;
    }
    L.current = L.current <= 0 ? u.length - 1 : L.current - 1, Ee(u[L.current], u, L.current);
  }, [ye, pe, bt, Ee]), ne = Ne(() => {
    if (!bt) return;
    const u = pe(bt);
    if (u.length === 0) return;
    let m = L.current;
    (m < 0 || m >= u.length) && (m = 0);
    const C = u[m];
    C.deleteContents(), Kt && C.insertNode(document.createTextNode(Kt));
    const y = o();
    y == null || y.dispatchEvent(
      new InputEvent("input", { bubbles: !0, inputType: "insertText" })
    ), L.current = m - 1;
  }, [pe, bt, Kt]), Se = Ne(() => {
    if (!bt) return;
    const u = pe(bt);
    if (u.length === 0) return;
    for (let C = u.length - 1; C >= 0; C--) {
      const y = u[C];
      y.deleteContents(), Kt && y.insertNode(document.createTextNode(Kt));
    }
    const m = o();
    m == null || m.dispatchEvent(
      new InputEvent("input", { bubbles: !0, inputType: "insertText" })
    ), L.current = -1;
  }, [pe, bt, Kt]), oe = Ne(() => {
    Fr(!0), L.current = -1, requestAnimationFrame(() => {
      var u;
      return (u = M.current) == null ? void 0 : u.focus();
    });
  }, []), le = Ne(() => {
    Fr(!1), Tn(""), Hr(""), L.current = -1, ye();
  }, [ye]);
  Ze(() => {
    if (!En) return;
    const u = () => {
      if (!bt) {
        ye();
        return;
      }
      const y = pe(bt);
      Y(y, L.current);
    };
    u();
    const m = o();
    if (!m) return;
    const C = () => {
      requestAnimationFrame(u);
    };
    return m.addEventListener("input", C), () => m.removeEventListener("input", C);
  }, [ye, pe, En, bt, $t, Y]);
  const me = Ne(() => {
    var Ge, dt, gt, zt, At, He;
    const u = typeof window < "u" ? window.getSelection() : null;
    if (!u || u.rangeCount === 0) return oi;
    const m = u.anchorNode;
    if (!m) return oi;
    let C = m, y = !1, A = null;
    for (; C; ) {
      if (C.nodeType === Node.ELEMENT_NODE && ((Ge = C.classList) != null && Ge.contains("pagedly-ce-content"))) {
        y = !0, A = C;
        break;
      }
      C = C.parentNode;
    }
    if (!y) return f.current;
    try {
      const Xe = u.getRangeAt(0), De = h.current;
      (!Xe.collapsed || !De || De.collapsed || !document.body.contains(De.startContainer)) && (h.current = Xe.cloneRange());
    } catch {
    }
    let R = "p", P = !1, $ = m;
    for (; $ && $.nodeType !== Node.ELEMENT_NODE; )
      $ = $.parentNode;
    for (; $; ) {
      const De = (dt = $.tagName) == null ? void 0 : dt.toLowerCase();
      De === "blockquote" && (P = !0), (De === "h1" || De === "h2" || De === "h3" || De === "h4" || De === "h5" || De === "h6" || De === "p") && (R = De), $ = $.parentNode;
    }
    const B = (Xe) => {
      try {
        return document.queryCommandState(Xe);
      } catch {
        return !1;
      }
    };
    let Z = "";
    B("justifyCenter") ? Z = "center" : B("justifyRight") ? Z = "right" : B("justifyFull") ? Z = "justify" : B("justifyLeft") && (Z = "left");
    let se = !1, J = "", re = m;
    for (; re; ) {
      if (re.nodeType === Node.ELEMENT_NODE && ((gt = re.tagName) == null ? void 0 : gt.toLowerCase()) === "a") {
        se = !0, J = re.getAttribute("href") ?? "";
        break;
      }
      re = re.parentNode;
    }
    const je = ((zt = o()) == null ? void 0 : zt.querySelectorAll(".pagedly-ce-page").length) || 0 || 1;
    let Fe = { characterCount: 0, wordCount: 0, isEmpty: !1 };
    A && (Q.current.wordCount ? Fe = fb(A) : Fe.isEmpty = js(A));
    let ut = "";
    {
      const Xe = m, De = Xe.nodeType === Node.TEXT_NODE ? Xe.parentElement : Xe;
      if (De) {
        const ft = window.getComputedStyle(De);
        if (ft.fontSize) {
          const Nt = parseFloat(ft.fontSize);
          ut = Number.isFinite(Nt) ? `${Math.round(Nt)}px` : ft.fontSize;
        }
      }
    }
    return {
      bold: B("bold"),
      italic: B("italic"),
      underline: B("underline"),
      strikethrough: B("strikeThrough"),
      superscript: B("superscript"),
      subscript: B("subscript"),
      fontSize: ut,
      unorderedList: B("insertUnorderedList"),
      orderedList: B("insertOrderedList"),
      block: R,
      align: Z,
      link: se,
      linkHref: J,
      blockquote: P,
      pasteFormatting: b.current,
      canUndo: ((At = r.current) == null ? void 0 : At.canUndo()) ?? !1,
      canRedo: ((He = r.current) == null ? void 0 : He.canRedo()) ?? !1,
      reflowState: "idle",
      pageCount: je,
      characterCount: Fe.characterCount,
      wordCount: Fe.wordCount,
      isEmpty: Fe.isEmpty
    };
  }, []), ae = Ne(() => {
    const u = { ...me(), pasteFormatting: b.current };
    c(u), p.current.forEach((m) => m(u));
  }, [me]);
  Ze(() => {
    const u = o();
    if (!u) return;
    const m = (C) => {
      var P;
      const y = C.target, A = (P = y == null ? void 0 : y.closest) == null ? void 0 : P.call(y, "li");
      if (!A || !A.closest("ul.pagedly-checklist")) return;
      const R = A.getBoundingClientRect();
      C.clientX - R.left > 28 || (C.preventDefault(), A.setAttribute(
        "data-checked",
        A.getAttribute("data-checked") === "true" ? "false" : "true"
      ), u.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertText" })
      ));
    };
    return u.addEventListener("click", m), () => u.removeEventListener("click", m);
  }, []), Ze(() => {
    const u = () => {
      ae(), de(), I(), xn(), ln();
    };
    document.addEventListener("selectionchange", u);
    const m = () => {
      de(), Xt(), ln();
    };
    window.addEventListener("scroll", m, !0), window.addEventListener("resize", m);
    const C = o(), y = (A) => {
      var B, Z, se, J, re, je, Fe, ut;
      window.setTimeout(Xt, 0);
      const R = (Z = (B = A.target) == null ? void 0 : B.closest) == null ? void 0 : Z.call(B, ".pagedly-comment");
      if (R) {
        const Ge = R.getAttribute("data-comment-id");
        Ge && ((se = Jt.current) == null || se.call(Jt, Ge));
      }
      const P = (re = (J = A.target) == null ? void 0 : J.closest) == null ? void 0 : re.call(J, ".pagedly-toc__entry");
      if (P) {
        const Ge = Number(P.getAttribute("data-toc-index"));
        Number.isFinite(Ge) && Fn(Ge);
      }
      const $ = (Fe = (je = A.target) == null ? void 0 : je.closest) == null ? void 0 : Fe.call(je, ".pagedly-xref");
      if ($) {
        const Ge = $.getAttribute("data-xref-target"), dt = Ge ? (ut = o()) == null ? void 0 : ut.querySelector(`[data-xref-id="${Ge}"]`) : null;
        if (dt)
          dt.scrollIntoView({ behavior: "smooth", block: "center" });
        else {
          const gt = Number($.getAttribute("data-xref-index"));
          Number.isFinite(gt) && Fn(gt);
        }
      }
    };
    return C == null || C.addEventListener("click", y), () => {
      document.removeEventListener("selectionchange", u), window.removeEventListener("scroll", m, !0), window.removeEventListener("resize", m), C == null || C.removeEventListener("click", y);
    };
  }, [ae, de, I, Xt, xn, ln]), Ze(() => {
    ln();
  }, [l.isEmpty, ln]), Ze(() => {
    cn && xn();
  }, [cn, xn]), Ze(() => {
    const u = (m) => {
      (m.key === "f" || m.key === "F") && (m.metaKey || m.ctrlKey) && Q.current.find && i() && (m.preventDefault(), oe());
    };
    return document.addEventListener("keydown", u), () => document.removeEventListener("keydown", u);
  }, [oe, i]), Ze(() => {
    if (!En) return;
    const u = (m) => {
      m.key === "Escape" && (m.preventDefault(), le());
    };
    return document.addEventListener("keydown", u), () => document.removeEventListener("keydown", u);
  }, [En, le]), Ze(() => {
    const u = () => {
      var A;
      const m = window.getSelection();
      if (!m || m.rangeCount === 0) return;
      const C = m.getRangeAt(0);
      if (C.collapsed) return;
      let y = C.startContainer;
      for (; y; ) {
        if (y.nodeType === Node.ELEMENT_NODE && ((A = y.classList) != null && A.contains("pagedly-ce-content"))) {
          h.current = C.cloneRange();
          return;
        }
        y = y.parentNode;
      }
    };
    return document.addEventListener("mousedown", u, !0), () => document.removeEventListener("mousedown", u, !0);
  }, []);
  const Ue = Ne(() => {
    const u = typeof window < "u" ? window.getSelection() : null;
    if (u && u.rangeCount > 0) {
      const A = u.getRangeAt(0).startContainer, R = A.nodeType === Node.TEXT_NODE ? A.parentElement : A;
      if (R && R.closest && R.closest(".pagedly-ce-content"))
        return !0;
    }
    const m = h.current;
    if (!m) return !1;
    const C = r.current;
    if (!C || !document.body.contains(m.startContainer) || !document.body.contains(m.endContainer))
      return !1;
    C.focus();
    const y = window.getSelection();
    return y ? (y.removeAllRanges(), y.addRange(m), !0) : !1;
  }, []), Te = Ne(() => {
    const u = (y, A, R, P) => {
      var Z;
      Ue();
      const $ = (A ?? "image").replace(/"/g, "&quot;"), B = R && P && R > 0 && P > 0 ? ` width="${R}" height="${P}"` : "";
      (Z = r.current) == null || Z.execCommand(
        "insertHTML",
        `<img src="${y}" alt="${$}"${B} style="max-width:100%;height:auto;" />`
      );
    }, m = ke.current;
    if (m)
      return Promise.resolve().then(() => m()).then((y) => {
        if (!y) return;
        const A = typeof y == "string" ? { src: y } : y;
        A != null && A.src && u(A.src, A.alt);
      }).catch(() => {
      });
    const C = (y) => zs(y);
    return new Promise((y) => {
      Ue();
      const A = document.createElement("input");
      A.type = "file", A.accept = $e.current ?? "image/*", A.style.position = "fixed", A.style.left = "-9999px", A.style.opacity = "0";
      let R = !1;
      const P = () => {
        R || (R = !0, A.remove(), y());
      };
      A.addEventListener("change", () => {
        var se;
        const B = (se = A.files) == null ? void 0 : se[0];
        if (!B) {
          P();
          return;
        }
        const Z = we.current;
        if (Z && B.size > Z) {
          s(
            "maxImageBytes",
            `Image rejected: ${B.size} bytes exceeds maxImageBytes (${Z}).`
          ), P();
          return;
        }
        C(B).then(({ src: J, w: re, h: je }) => {
          J && u(J, B.name, re, je), P();
        }).catch(P);
      });
      const $ = () => {
        window.removeEventListener("focus", $), setTimeout(() => {
          (!A.files || A.files.length === 0) && P();
        }, 300);
      };
      window.addEventListener("focus", $), document.body.appendChild(A), A.click();
    });
  }, [Ue, s]), Ce = Ne(
    (u, m) => {
      var A, R, P, $, B, Z, se, J, re, je, Fe, ut, Ge, dt, gt, zt, At, He, Xe, De, ft, Nt, jn, Aa, ka, Ra, _a, La, Pa, Ma, Oa, Da, Ia, $a, Ba, Fa, Ha, za, Wa;
      const C = (A = kt.current) == null ? void 0 : A[u];
      if (C) {
        Ue();
        const S = o();
        C(m, {
          content: S,
          selection: typeof window < "u" ? window.getSelection() : null,
          runCommand: (_, W) => he.current(_, W),
          insertHtml: (_) => {
            var W;
            return (W = r.current) == null ? void 0 : W.execCommand("insertHTML", _);
          },
          notifyChange: () => S == null ? void 0 : S.dispatchEvent(
            new InputEvent("input", { bubbles: !0, inputType: "insertText" })
          )
        }), ae();
        return;
      }
      const y = Gg[u];
      if (!(y && !Q.current[y]) && !(u === "insertFootnote" && Q.current.footnotes === "off")) {
        switch (Ue(), u) {
          case "setFontSize": {
            if (!m) break;
            let S = null;
            const _ = h.current;
            if (_ && !_.collapsed && document.body.contains(_.startContainer) && document.body.contains(_.endContainer))
              S = _;
            else {
              const O = window.getSelection();
              if (O && O.rangeCount > 0) {
                const F = O.getRangeAt(0);
                F.collapsed || (S = F);
              }
            }
            if (!S || S.collapsed || !document.body.contains(S.startContainer) || !document.body.contains(S.endContainer))
              break;
            const W = [];
            if (S.commonAncestorContainer.nodeType === Node.TEXT_NODE)
              W.push(S.commonAncestorContainer);
            else {
              const O = document.createTreeWalker(
                S.commonAncestorContainer,
                NodeFilter.SHOW_TEXT,
                {
                  acceptNode(fe) {
                    return S.intersectsNode(fe) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                  }
                }
              );
              let F;
              for (; F = O.nextNode(); ) W.push(F);
            }
            const U = [];
            for (let O = W.length - 1; O >= 0; O--) {
              const F = W[O], fe = F.textContent ?? "", G = F === S.startContainer ? S.startOffset : 0, Pe = F === S.endContainer ? S.endOffset : fe.length;
              if (G >= Pe) continue;
              let Ie = F;
              G > 0 && (Ie = F.splitText(G));
              const pt = Pe - G;
              pt < Ie.textContent.length && Ie.splitText(pt);
              const Mt = document.createElement("span");
              Mt.style.fontSize = m, (R = Ie.parentNode) == null || R.insertBefore(Mt, Ie), Mt.appendChild(Ie), U.push(Mt);
            }
            if (U.length > 0) {
              const O = window.getSelection();
              if (O) {
                const F = document.createRange(), fe = U[U.length - 1], G = U[0];
                F.setStart(fe, 0), F.setEnd(G, G.childNodes.length), O.removeAllRanges(), O.addRange(F), h.current = F.cloneRange();
              }
              ($ = (P = U[0]) == null ? void 0 : P.closest(".pagedly-ce-content")) == null || $.dispatchEvent(
                new InputEvent("input", { bubbles: !0, inputType: "insertText" })
              );
            }
            break;
          }
          case "formatBlock": {
            const S = m ?? "p", _ = S.startsWith("<") ? S : `<${S}>`;
            (B = r.current) != null && B.execCommand("formatBlock", _) || (Z = r.current) == null || Z.execCommand("formatBlock", S);
            break;
          }
          case "toggleBlockquote": {
            const S = window.getSelection();
            if (!S || S.rangeCount === 0) break;
            let _ = S.anchorNode, W = !1;
            for (; _; ) {
              if (_.nodeType === Node.ELEMENT_NODE && ((se = _.tagName) == null ? void 0 : se.toLowerCase()) === "blockquote") {
                W = !0;
                break;
              }
              _ = _.parentNode;
            }
            const U = W ? "p" : "blockquote";
            (J = r.current) != null && J.execCommand("formatBlock", `<${U}>`) || (re = r.current) == null || re.execCommand("formatBlock", U);
            break;
          }
          case "formatCodeBlock": {
            const S = window.getSelection();
            if (!S || S.rangeCount === 0) break;
            let _ = S.anchorNode, W = !1;
            for (; _; ) {
              if (_.nodeType === Node.ELEMENT_NODE && ((je = _.tagName) == null ? void 0 : je.toLowerCase()) === "pre") {
                W = !0;
                break;
              }
              _ = _.parentNode;
            }
            const U = W ? "p" : "pre";
            (Fe = r.current) != null && Fe.execCommand("formatBlock", `<${U}>`) || (ut = r.current) == null || ut.execCommand("formatBlock", U);
            break;
          }
          case "toggleInlineCode": {
            const S = window.getSelection();
            if (!S || S.rangeCount === 0 || S.isCollapsed) break;
            let _ = S.anchorNode, W = null;
            for (; _; ) {
              if (_.nodeType === Node.ELEMENT_NODE && ((Ge = _.tagName) == null ? void 0 : Ge.toLowerCase()) === "code") {
                W = _;
                break;
              }
              _ = _.parentNode;
            }
            if (W) {
              const U = W.parentNode, O = W.closest(".pagedly-ce-content");
              if (U) {
                const F = document.createTextNode(W.textContent ?? "");
                U.replaceChild(F, W);
                const fe = document.createRange();
                fe.setStart(F, F.length), fe.collapse(!0), S.removeAllRanges(), S.addRange(fe), O == null || O.dispatchEvent(
                  new InputEvent("input", { bubbles: !0, inputType: "insertText" })
                );
              }
            } else {
              const U = (O) => O.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              (dt = r.current) == null || dt.execCommand("insertHTML", `<code>${U(S.toString())}</code>`);
            }
            break;
          }
          case "removeFormat": {
            (gt = r.current) == null || gt.execCommand("removeFormat");
            const S = window.getSelection();
            if (S && S.rangeCount > 0) {
              const _ = S.getRangeAt(0);
              if (!_.collapsed) {
                const W = _.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? _.commonAncestorContainer : _.commonAncestorContainer.parentElement;
                if (W) {
                  const U = Array.from(W.querySelectorAll("span"));
                  for (const O of U) {
                    if (!_.intersectsNode(O)) continue;
                    const F = O.parentNode;
                    if (F) {
                      for (; O.firstChild; ) F.insertBefore(O.firstChild, O);
                      F.removeChild(O);
                    }
                  }
                }
              }
            }
            break;
          }
          case "setFontColor": {
            if (!m) break;
            (zt = r.current) == null || zt.execCommand("foreColor", m);
            break;
          }
          case "setHighlightColor": {
            if (!m) break;
            if (m === "transparent" || m === "") {
              const S = window.getSelection();
              if (S && S.rangeCount > 0) {
                const _ = S.getRangeAt(0), W = _.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? _.commonAncestorContainer : _.commonAncestorContainer.parentElement;
                if (W) {
                  const U = Array.from(
                    W.querySelectorAll("[style*='background']")
                  );
                  for (const O of U)
                    _.intersectsNode(O) && (O.style.backgroundColor = "", (At = O.getAttribute("style")) != null && At.trim() || O.removeAttribute("style"));
                  (He = W.closest(".pagedly-ce-content")) == null || He.dispatchEvent(
                    new InputEvent("input", { bubbles: !0, inputType: "insertText" })
                  );
                }
              }
              break;
            }
            (Xe = r.current) != null && Xe.execCommand("hiliteColor", m) || (De = r.current) == null || De.execCommand("backColor", m);
            break;
          }
          case "setFontFamily": {
            if (!m) {
              const S = window.getSelection();
              if (S && S.rangeCount > 0) {
                const _ = S.getRangeAt(0), W = _.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? _.commonAncestorContainer : _.commonAncestorContainer.parentElement;
                if (W) {
                  const U = Array.from(W.querySelectorAll("font[face]"));
                  for (const F of U) {
                    if (!_.intersectsNode(F)) continue;
                    const fe = F.parentNode;
                    if (fe) {
                      for (; F.firstChild; ) fe.insertBefore(F.firstChild, F);
                      fe.removeChild(F);
                    }
                  }
                  const O = Array.from(
                    W.querySelectorAll("[style*='font-family']")
                  );
                  for (const F of O)
                    _.intersectsNode(F) && (F.style.fontFamily = "", (ft = F.getAttribute("style")) != null && ft.trim() || F.removeAttribute("style"));
                  (Nt = W.closest(".pagedly-ce-content")) == null || Nt.dispatchEvent(
                    new InputEvent("input", { bubbles: !0, inputType: "insertText" })
                  );
                }
              }
              break;
            }
            (jn = r.current) == null || jn.execCommand("fontName", m);
            break;
          }
          case "insertPageBreak": {
            (Aa = r.current) == null || Aa.execCommand(
              "insertHTML",
              '<div class="pagedly-page-break" aria-hidden="true"></div><p><br></p>'
            );
            break;
          }
          case "insertSectionBreak": {
            (ka = r.current) == null || ka.execCommand(
              "insertHTML",
              '<div class="pagedly-section-break" aria-hidden="true"></div><p><br></p>'
            );
            break;
          }
          case "tableInsertRowAbove":
          case "tableInsertRowBelow":
          case "tableInsertColumnBefore":
          case "tableInsertColumnAfter":
          case "tableDeleteRow":
          case "tableDeleteColumn":
          case "tableMergeRight":
          case "tableMergeDown":
          case "tableSplitCell":
          case "tableDelete": {
            const S = window.getSelection(), _ = As((S == null ? void 0 : S.anchorNode) ?? null);
            if (!_) break;
            const W = _.closest(".pagedly-ce-content");
            let U = _;
            if (u === "tableInsertRowAbove") Rs(_, "above");
            else if (u === "tableInsertRowBelow") Rs(_, "below");
            else if (u === "tableInsertColumnBefore") _s(_, "before");
            else if (u === "tableInsertColumnAfter") _s(_, "after");
            else if (u === "tableMergeRight") {
              if (!Zg(_)) break;
            } else if (u === "tableMergeDown") {
              if (!Jg(_)) break;
            } else if (u === "tableSplitCell") {
              if (!eh(_)) break;
            } else if (u === "tableDeleteRow") {
              if (!Yg(_)) break;
              U = null;
            } else if (u === "tableDeleteColumn") {
              if (!Qg(_)) break;
              U = null;
            } else u === "tableDelete" && (U = th(_));
            if (U) {
              const O = document.createRange();
              O.selectNodeContents(U), O.collapse(!0);
              const F = window.getSelection();
              F == null || F.removeAllRanges(), F == null || F.addRange(O);
            }
            W == null || W.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "insertTable": {
            if (!m) break;
            let S = 0, _ = 0, W = !1;
            try {
              const G = JSON.parse(m);
              S = Math.max(1, Math.min(G.rows ?? 0, 30)), _ = Math.max(1, Math.min(G.cols ?? 0, 30)), W = !!G.header;
            } catch {
              break;
            }
            if (S === 0 || _ === 0) break;
            const U = (G) => `<${G}><br></${G}>`, O = W ? `<thead><tr>${U("th").repeat(_)}</tr></thead>` : "", F = Array.from(
              { length: W ? S - 1 : S },
              () => `<tr>${U("td").repeat(_)}</tr>`
            ).join(""), fe = `<table class="pagedly-table">${O}<tbody>${F}</tbody></table><p><br></p>`;
            (Ra = r.current) == null || Ra.execCommand("insertHTML", fe);
            break;
          }
          case "setPasteFormatting": {
            const S = m === "rich" ? "rich" : "clean";
            b.current = S, T(S);
            break;
          }
          case "pastePlain": {
            const S = r.current;
            S && typeof navigator < "u" && ((_a = navigator.clipboard) != null && _a.readText) && navigator.clipboard.readText().then((_) => {
              _ && (Ue(), S.execCommand("insertText", _));
            }).catch(() => {
            });
            break;
          }
          case "insertFootnote": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_ || !_.contains(S.anchorNode)) break;
            if (Q.current.footnotes === "footnotes") {
              if (m == null) {
                Oe("Footnote", "Footnote text…", "", (O) => {
                  O.trim() && he.current("insertFootnote", O.trim());
                });
                break;
              }
              const W = m;
              if (!W.trim()) break;
              const U = Sg(_, S, W.trim());
              if (U) {
                const O = document.createRange();
                O.setStartAfter(U), O.collapse(!0), S.removeAllRanges(), S.addRange(O);
              }
            } else {
              const W = oh(_, S);
              if (W) {
                const U = document.createRange();
                U.selectNodeContents(W), U.collapse(!0), S.removeAllRanges(), S.addRange(U);
              }
            }
            _.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "indent":
          case "outdent": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_) break;
            const W = S.getRangeAt(0), U = (Ie) => {
              var pt, Mt, ja, Ua;
              return ((pt = Ie.classList) == null ? void 0 : pt.contains("pagedly-ce-page")) || ((Mt = Ie.classList) == null ? void 0 : Mt.contains("pagedly-ce-header")) || ((ja = Ie.classList) == null ? void 0 : ja.contains("pagedly-ce-footer")) || ((Ua = Ie.classList) == null ? void 0 : Ua.contains("pagedly-endnotes"));
            }, O = Array.from(
              _.querySelectorAll("p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,div")
            ).filter(
              (Ie) => !U(Ie) && Ie.closest(".pagedly-ce-page") && W.intersectsNode(Ie)
            ), F = O.filter(
              (Ie) => !O.some((pt) => pt !== Ie && Ie.contains(pt))
            ), fe = 2.5, G = 10, Pe = u === "indent" ? 1 : -1;
            for (const Ie of F) {
              const pt = parseFloat((Ie.style.marginLeft || "0").replace("em", "")) || 0, Mt = Math.max(0, Math.min(G, Math.round(pt / fe) + Pe));
              Ie.style.marginLeft = Mt === 0 ? "" : `${Mt * fe}em`;
            }
            _.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "setLineSpacing": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_) break;
            const W = S.getRangeAt(0), U = (G) => {
              var Pe, Ie, pt, Mt;
              return ((Pe = G.classList) == null ? void 0 : Pe.contains("pagedly-ce-page")) || ((Ie = G.classList) == null ? void 0 : Ie.contains("pagedly-ce-header")) || ((pt = G.classList) == null ? void 0 : pt.contains("pagedly-ce-footer")) || ((Mt = G.classList) == null ? void 0 : Mt.contains("pagedly-endnotes"));
            }, O = Array.from(
              _.querySelectorAll("p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,div")
            ).filter(
              (G) => !U(G) && G.closest(".pagedly-ce-page") && W.intersectsNode(G)
            ), F = O.filter(
              (G) => !O.some((Pe) => Pe !== G && G.contains(Pe))
            ), fe = (m ?? "").trim();
            for (const G of F) G.style.lineHeight = fe;
            _.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "toggleKeepTogether":
          case "toggleKeepWithNext":
          case "togglePageBreakBefore":
          case "toggleColumns": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_) break;
            const W = S.getRangeAt(0), U = u === "toggleKeepTogether" ? "pagedly-keep-together" : u === "toggleKeepWithNext" ? "pagedly-keep-with-next" : u === "toggleColumns" ? "pagedly-columns" : "pagedly-break-before", O = (G) => {
              var Pe, Ie, pt;
              return ((Pe = G.classList) == null ? void 0 : Pe.contains("pagedly-ce-page")) || ((Ie = G.classList) == null ? void 0 : Ie.contains("pagedly-ce-header")) || ((pt = G.classList) == null ? void 0 : pt.contains("pagedly-ce-footer"));
            }, F = Array.from(
              _.querySelectorAll("p,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol,table,figure")
            ).filter(
              (G) => !O(G) && G.closest(".pagedly-ce-page") && W.intersectsNode(G)
            ), fe = F.filter(
              (G) => !F.some((Pe) => Pe !== G && G.contains(Pe))
            );
            for (const G of fe) G.classList.toggle(U);
            _.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "importDocx": {
            const S = document.createElement("input");
            S.type = "file", S.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", S.style.position = "fixed", S.style.left = "-9999px", S.addEventListener("change", () => {
              var W;
              const _ = (W = S.files) == null ? void 0 : W[0];
              if (!_) {
                S.remove();
                return;
              }
              _.arrayBuffer().then(async (U) => {
                var Pe, Ie;
                const O = new Uint8Array(U), F = await rb(O);
                Ue(), (Pe = r.current) == null || Pe.execCommand("insertHTML", F), ae();
                const fe = await ob(O);
                fe && x(fe);
                const G = await Gh(O);
                G && D(G), (fe || G) && ((Ie = q.current) == null || Ie.call(q, {
                  geometry: fe ?? void 0,
                  defaults: G ?? void 0
                }));
              }).catch(() => {
              }).finally(() => S.remove());
            }), document.body.appendChild(S), S.click();
            break;
          }
          case "exportDocx": {
            Ah(((La = r.current) == null ? void 0 : La.getHTML()) ?? "", "document.docx", w.current ?? void 0);
            break;
          }
          case "exportMarkdown": {
            if (typeof window > "u") break;
            const S = Ri(((Pa = r.current) == null ? void 0 : Pa.getHTML()) ?? ""), _ = new Blob([S], { type: "text/markdown" }), W = URL.createObjectURL(_), U = document.createElement("a");
            U.href = W, U.download = "document.md", document.body.appendChild(U), U.click(), U.remove(), URL.revokeObjectURL(W);
            break;
          }
          case "copyAsMarkdown": {
            const S = Ri(((Ma = r.current) == null ? void 0 : Ma.getHTML()) ?? "");
            typeof navigator < "u" && navigator.clipboard && navigator.clipboard.writeText(S);
            break;
          }
          case "importMarkdown": {
            if (typeof document > "u") break;
            const S = document.createElement("input");
            S.type = "file", S.accept = ".md,.markdown,.txt,text/markdown,text/plain", S.style.position = "fixed", S.style.left = "-9999px", S.addEventListener("change", () => {
              var U;
              const _ = (U = S.files) == null ? void 0 : U[0];
              if (!_) {
                S.remove();
                return;
              }
              const W = new FileReader();
              W.onload = () => {
                var F;
                const O = pn(uu(String(W.result ?? "")));
                Ue(), (F = r.current) == null || F.execCommand("insertHTML", O), ae();
              }, W.onerror = () => S.remove(), W.readAsText(_), S.remove();
            }), document.body.appendChild(S), S.click();
            break;
          }
          case "insertCrossReference": {
            const S = o(), _ = window.getSelection();
            if (!S || !_ || _.rangeCount === 0 || !S.contains(_.anchorNode)) break;
            const W = Array.from(
              S.querySelectorAll("h1,h2,h3,h4,h5,h6")
            ).filter((Pe) => !Pe.closest('[aria-hidden="true"]') && !Pe.closest(".pagedly-toc"));
            if (W.length === 0) break;
            const U = m != null ? Number(m) : NaN;
            if (!Number.isFinite(U)) {
              it(
                "Reference which heading?",
                W.map((Pe, Ie) => ({
                  id: String(Ie),
                  label: (Pe.textContent ?? "").trim().slice(0, 60) || `Heading ${Ie + 1}`
                })),
                (Pe) => he.current("insertCrossReference", Pe)
              );
              break;
            }
            if (U < 0 || U >= W.length) break;
            const O = W[U];
            let F = O.getAttribute("data-xref-id");
            if (!F) {
              let Pe = Me.current;
              for (; S.querySelector(`[data-xref-id="xr${Pe}"]`); ) Pe++;
              F = `xr${Pe}`, Me.current = Pe + 1, O.setAttribute("data-xref-id", F);
            }
            const fe = document.createElement("span");
            fe.className = "pagedly-xref", fe.setAttribute("data-xref-target", F), fe.setAttribute("data-xref-index", String(U)), fe.setAttribute("contenteditable", "false"), fe.textContent = "p. ?", _.getRangeAt(0).insertNode(fe);
            const G = document.createRange();
            G.setStartAfter(fe), G.collapse(!0), _.removeAllRanges(), _.addRange(G), S.dispatchEvent(new InputEvent("input", { bubbles: !0, inputType: "insertText" }));
            break;
          }
          case "insertTableOfContents": {
            const S = o();
            if (!S) break;
            S.querySelectorAll(".pagedly-toc").forEach((O) => {
              var fe;
              const F = O.parentElement;
              O.remove(), F && F !== S && !((fe = F.textContent) != null && fe.trim()) && F.children.length;
            });
            const _ = Rg(S), W = window.getSelection();
            let U = !1;
            if (W && W.rangeCount > 0 && S.contains(W.anchorNode)) {
              let O = W.anchorNode;
              for (; O && O.parentElement !== null && !((Da = (Oa = O.parentElement) == null ? void 0 : Oa.classList) != null && Da.contains("pagedly-ce-page")); )
                O = O.parentElement;
              O && ((Ia = O.closest) != null && Ia.call(O, ".pagedly-ce-page")) && (($a = O.parentElement) == null || $a.insertBefore(_, O), U = !0);
            }
            if (!U) {
              const O = S.querySelector(".pagedly-ce-page");
              O == null || O.insertBefore(_, O.firstChild);
            }
            for (let O = 0; O < 3 && ((Ba = r.current) == null || Ba.reflow(), !!_g(S)); O++)
              ;
            S.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "insertLeader": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_ || !_.contains(S.anchorNode)) break;
            const W = (() => {
              let O = S.anchorNode;
              for (; O && O !== _; ) {
                if (O.nodeType === Node.ELEMENT_NODE) {
                  const F = O.getAttribute("data-section-id");
                  if (F) return F;
                }
                O = O.parentNode;
              }
              return null;
            })(), U = W ? ` data-section-id="${W}"` : "";
            (Fa = r.current) == null || Fa.execCommand(
              "insertHTML",
              `<p class="pagedly-leader"${U}><span class="pagedly-leader__label">Item</span><span class="pagedly-leader__dots" contenteditable="false"></span><span class="pagedly-leader__value">0</span></p><p${U}><br></p>`
            );
            break;
          }
          case "addComment": {
            const S = window.getSelection();
            if (!S || S.rangeCount === 0 || S.isCollapsed) break;
            const _ = S.getRangeAt(0), W = _.toString();
            if (!W.trim()) break;
            const U = `cmt-${Math.random().toString(36).slice(2, 10)}`, O = document.createElement("span");
            O.className = "pagedly-comment", O.setAttribute("data-comment-id", U);
            try {
              _.surroundContents(O);
            } catch {
              const G = _.extractContents();
              O.appendChild(G), _.insertNode(O);
            }
            const F = document.createRange();
            F.setStartAfter(O), F.collapse(!0), S.removeAllRanges(), S.addRange(F);
            const fe = O.closest(".pagedly-ce-content");
            fe == null || fe.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            ), (Ha = Ft.current) == null || Ha.call(Ft, U, W);
            break;
          }
          case "resolveComment": {
            if (!m) break;
            const S = o(), _ = S == null ? void 0 : S.querySelector(
              `.pagedly-comment[data-comment-id="${m}"]`
            );
            if (!_ || !_.parentNode) break;
            for (; _.firstChild; ) _.parentNode.insertBefore(_.firstChild, _);
            _.remove(), S == null || S.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "acceptChange":
          case "rejectChange":
          case "acceptAllChanges":
          case "rejectAllChanges": {
            const S = o();
            if (!S) break;
            const _ = u === "acceptChange" || u === "acceptAllChanges", W = u === "acceptAllChanges" || u === "rejectAllChanges", U = (F) => {
              var Pe;
              const fe = F.tagName.toLowerCase();
              if (_ ? fe === "ins" : fe === "del")
                for (; F.firstChild; ) (Pe = F.parentNode) == null || Pe.insertBefore(F.firstChild, F);
              F.remove();
            };
            let O = [];
            if (W)
              O = Array.from(S.querySelectorAll("ins, del"));
            else {
              const F = window.getSelection();
              let G = (F == null ? void 0 : F.anchorNode) ?? null;
              for (; G && G !== S; ) {
                if (G.nodeType === Node.ELEMENT_NODE && /^(ins|del)$/i.test(G.tagName)) {
                  O = [G];
                  break;
                }
                G = G.parentNode;
              }
            }
            if (O.length === 0) break;
            for (const F of O) U(F);
            S.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          case "insertChecklist": {
            const S = window.getSelection(), _ = o();
            if (!S || S.rangeCount === 0 || !_) break;
            let W = null, U = null, O = S.anchorNode;
            for (; O && O !== _; ) {
              if (O.nodeType === Node.ELEMENT_NODE) {
                const F = O;
                if ((za = F.classList) != null && za.contains("pagedly-checklist")) {
                  W = F;
                  break;
                }
                !U && /^(p|h[1-6]|div|blockquote|pre)$/i.test(F.tagName) && (U = F);
              }
              O = O.parentNode;
            }
            if (W) {
              const F = W.parentNode, fe = W.getAttribute("data-section-id"), G = document.createDocumentFragment();
              let Pe = null;
              for (const Ie of Array.from(W.children)) {
                const pt = document.createElement("p");
                for (fe && pt.setAttribute("data-section-id", fe); Ie.firstChild; ) pt.appendChild(Ie.firstChild);
                pt.firstChild || pt.appendChild(document.createElement("br")), Pe || (Pe = pt), G.appendChild(pt);
              }
              if (F == null || F.replaceChild(G, W), Pe) {
                const Ie = document.createRange();
                Ie.selectNodeContents(Pe), Ie.collapse(!0), S.removeAllRanges(), S.addRange(Ie);
              }
            } else if (U) {
              const F = U.getAttribute("data-section-id"), fe = document.createElement("ul");
              fe.className = "pagedly-checklist", F && fe.setAttribute("data-section-id", F);
              const G = document.createElement("li");
              for (G.setAttribute("data-checked", "false"); U.firstChild; ) G.appendChild(U.firstChild);
              G.firstChild || G.appendChild(document.createElement("br")), fe.appendChild(G), U.replaceWith(fe);
              const Pe = document.createRange();
              Pe.selectNodeContents(G), Pe.collapse(!0), S.removeAllRanges(), S.addRange(Pe);
            } else break;
            _.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            break;
          }
          default:
            (Wa = r.current) == null || Wa.execCommand(u, m);
        }
        ae();
      }
    },
    [ae, Ue, s]
  ), he = X(Ce);
  he.current = Ce;
  const yt = Ne((u) => {
    const m = Q.current, C = u.toLowerCase();
    return Fs.filter((y) => y.footnote ? m.footnotes !== "off" : y.feature ? !!m[y.feature] : !0).filter((y) => C ? y.label.toLowerCase().includes(C) || y.keywords.some((A) => A.includes(C)) : !0).sort((y, A) => Hs.indexOf(y.group) - Hs.indexOf(A.group));
  }, []), wt = X(Le);
  wt.current = Le;
  const ht = Ne(
    (u) => {
      const m = We(), C = o();
      if (m) {
        const y = document.createRange();
        y.setStart(m.textNode, m.slashStart), y.setEnd(m.textNode, m.caretOffset), y.deleteContents();
        const A = document.createRange();
        A.setStart(m.textNode, m.slashStart), A.collapse(!0);
        const R = window.getSelection();
        R == null || R.removeAllRanges(), R == null || R.addRange(A);
      }
      if (Ve(null), st.current = null, u.image) {
        C == null || C.dispatchEvent(
          new InputEvent("input", { bubbles: !0, inputType: "insertText" })
        ), Te();
        return;
      }
      u.command && he.current(u.command, u.value);
    },
    [We]
  );
  Ze(() => {
    const u = (m) => {
      const C = wt.current;
      if (!C) return;
      const y = yt(C.query), A = y.length;
      if (m.key === "Escape")
        m.preventDefault(), m.stopPropagation(), Ve(null), st.current = null;
      else if (m.key === "ArrowDown")
        m.preventDefault(), m.stopPropagation(), A && Ve((R) => R && { ...R, index: (R.index + 1) % A });
      else if (m.key === "ArrowUp")
        m.preventDefault(), m.stopPropagation(), A && Ve((R) => R && { ...R, index: (R.index - 1 + A) % A });
      else if (m.key === "Enter" || m.key === "Tab") {
        if (A === 0) return;
        m.preventDefault(), m.stopPropagation(), ht(y[Math.min(C.index, A - 1)]);
      }
    };
    return document.addEventListener("keydown", u, !0), () => document.removeEventListener("keydown", u, !0);
  }, [yt, ht]), Ze(() => {
    const u = o();
    if (!u) return;
    const m = /^(P|H[1-6]|DIV|BLOCKQUOTE|LI|PRE)$/, C = ($, B) => {
      if ($.nodeType === Node.TEXT_NODE)
        return { textNode: $, offset: B };
      if (B > 0) {
        let Z = $.childNodes[B - 1] ?? null;
        for (; Z && Z.nodeType !== Node.TEXT_NODE; )
          Z = Z.lastChild;
        if (Z && Z.nodeType === Node.TEXT_NODE)
          return { textNode: Z, offset: Z.length };
      }
      return null;
    }, y = ($) => {
      let B = $;
      for (; B && B !== u; ) {
        if (B.nodeType === Node.ELEMENT_NODE) {
          const Z = B.tagName;
          if (Z === "PRE" || Z === "CODE") return !0;
        }
        B = B.parentNode;
      }
      return !1;
    }, A = ($) => {
      switch ($.command) {
        case "formatBlock":
          return "headings";
        case "insertUnorderedList":
          return "bulletList";
        case "insertOrderedList":
          return "numberedList";
        case "insertChecklist":
          return "checklist";
        case "toggleBlockquote":
          return "blockquote";
        case "formatCodeBlock":
          return "codeBlock";
      }
    }, R = ($, B, Z, se) => {
      const J = B - Z, re = document.createRange();
      re.setStart($, J), re.setEnd($, B), re.deleteContents();
      const je = document.createRange();
      return je.setStart($, J), je.collapse(!0), je.insertNode(se), se;
    }, P = ($) => {
      const B = $;
      if (Lt.current || B.inputType !== "insertText") return;
      const Z = B.data;
      if (Z == null || Z.length !== 1) return;
      const se = Q.current;
      if (!se.markdownShortcuts && !se.smartTypography && !se.autoLink) return;
      const J = window.getSelection();
      if (!J || J.rangeCount === 0 || !J.isCollapsed) return;
      const re = J.getRangeAt(0), je = re.endContainer, Fe = re.endOffset;
      if (!u.contains(je)) return;
      const ut = y(je), Ge = C(je, Fe), dt = (Ge == null ? void 0 : Ge.textNode) ?? null, gt = (Ge == null ? void 0 : Ge.offset) ?? 0, zt = dt ? dt.data.slice(0, gt) : "";
      let At = null;
      {
        let He = je;
        for (; He && He !== u; ) {
          if (He.nodeType === Node.ELEMENT_NODE && m.test(He.tagName)) {
            At = He;
            break;
          }
          He = He.parentNode;
        }
      }
      if (se.markdownShortcuts && At && !ut) {
        const He = document.createRange();
        He.setStart(At, 0), He.setEnd(je, Fe);
        const Xe = He.toString(), De = ib(Xe, Z);
        if (De) {
          if (!Q.current[A(De)]) return;
          B.preventDefault(), He.deleteContents();
          const ft = document.createRange();
          ft.setStart(At, 0), ft.collapse(!0), J.removeAllRanges(), J.addRange(ft), De.command === "formatBlock" ? he.current("formatBlock", De.value) : he.current(De.command);
          return;
        }
      }
      if (!ut) {
        if (se.markdownShortcuts && dt && (Z === "*" || Z === "_" || Z === "`" || Z === "~")) {
          const He = sb(zt, Z);
          if (He && gt - He.removeBefore >= 0) {
            B.preventDefault();
            const Xe = document.createElement("template");
            Xe.innerHTML = He.html;
            const De = Xe.content, ft = De.lastChild;
            if (R(dt, gt, He.removeBefore, De), ft && ft.parentNode) {
              const Nt = document.createTextNode("​");
              ft.parentNode.insertBefore(Nt, ft.nextSibling);
              const jn = document.createRange();
              jn.setStart(Nt, 1), jn.collapse(!0), J.removeAllRanges(), J.addRange(jn);
            }
            u.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            return;
          }
        }
        if (se.smartTypography && dt) {
          const He = ab(zt, Z);
          if (He && gt - He.removeBefore >= 0) {
            B.preventDefault();
            const Xe = document.createTextNode(He.insert);
            R(dt, gt, He.removeBefore, Xe);
            const De = document.createRange();
            De.setStartAfter(Xe), De.collapse(!0), J.removeAllRanges(), J.addRange(De), u.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            return;
          }
        }
        if (se.autoLink && dt && Z === " ") {
          const He = cb(zt);
          if (He && gt - He.length >= 0) {
            B.preventDefault();
            const Xe = document.createElement("a");
            Xe.setAttribute("href", He.href), Xe.textContent = He.url, R(dt, gt, He.length, Xe);
            const De = document.createTextNode(" "), ft = document.createRange();
            ft.setStartAfter(Xe), ft.collapse(!0), ft.insertNode(De);
            const Nt = document.createRange();
            Nt.setStartAfter(De), Nt.collapse(!0), J.removeAllRanges(), J.addRange(Nt), u.dispatchEvent(
              new InputEvent("input", { bubbles: !0, inputType: "insertText" })
            );
            return;
          }
        }
      }
    };
    return u.addEventListener("beforeinput", P, !0), () => u.removeEventListener("beforeinput", P, !0);
  }, []), Ze(() => {
    const u = o();
    if (!u) return;
    const m = (C) => {
      var $, B, Z, se;
      if (!Lt.current) return;
      const y = C, A = window.getSelection();
      if (!A || A.rangeCount === 0) return;
      const R = A.getRangeAt(0);
      if (!u.contains(R.startContainer)) return;
      const P = (J, re = !0) => {
        const je = document.createRange();
        je.setStart(J, re ? J.length : 0), je.collapse(!0), A.removeAllRanges(), A.addRange(je);
      };
      if (y.inputType === "insertText") {
        const J = y.data ?? "";
        if (!J) return;
        if (y.preventDefault(), y.stopImmediatePropagation(), !R.collapsed) {
          const Fe = R.extractContents(), ut = Fe.childNodes.length === 1 && (($ = Fe.firstChild) == null ? void 0 : $.tagName) === "INS", Ge = document.createElement("ins");
          if (Ge.textContent = J, ut)
            R.insertNode(Ge);
          else {
            const dt = document.createElement("del");
            dt.appendChild(Fe), R.insertNode(dt), dt.after(Ge);
          }
          P(Ge.firstChild), u.dispatchEvent(new InputEvent("input", { bubbles: !0, inputType: "insertText" }));
          return;
        }
        const re = Ws(R.startContainer, R.startOffset), je = (B = re == null ? void 0 : re.textNode.parentElement) == null ? void 0 : B.tagName.toLowerCase();
        if (re && je === "ins") {
          re.textNode.insertData(re.offset, J);
          const Fe = document.createRange();
          Fe.setStart(re.textNode, re.offset + J.length), Fe.collapse(!0), A.removeAllRanges(), A.addRange(Fe);
        } else if (re && je === "del") {
          const Fe = re.textNode.parentElement, ut = document.createElement("ins");
          ut.textContent = J, Fe.after(ut), P(ut.firstChild);
        } else {
          const Fe = document.createElement("ins");
          Fe.textContent = J, R.insertNode(Fe), P(Fe.firstChild);
        }
        u.dispatchEvent(new InputEvent("input", { bubbles: !0, inputType: "insertText" }));
        return;
      }
      if (/^delete/.test(y.inputType || "")) {
        if (!R.collapsed) {
          y.preventDefault(), y.stopImmediatePropagation();
          const Xe = R.extractContents();
          if (!(Xe.childNodes.length === 1 && ((Z = Xe.firstChild) == null ? void 0 : Z.tagName) === "INS")) {
            const ft = document.createElement("del");
            ft.appendChild(Xe), R.insertNode(ft);
            const Nt = document.createRange();
            Nt.setStartAfter(ft), Nt.collapse(!0), A.removeAllRanges(), A.addRange(Nt);
          }
          u.dispatchEvent(new InputEvent("input", { bubbles: !0, inputType: "deleteContent" }));
          return;
        }
        if (y.inputType !== "deleteContentBackward" && y.inputType !== "deleteContentForward")
          return;
        const J = y.inputType === "deleteContentBackward", re = Ws(R.startContainer, R.startOffset);
        if (!re) return;
        const je = (se = re.textNode.parentElement) == null ? void 0 : se.tagName.toLowerCase();
        if (je === "ins" && J) return;
        if (je === "del") {
          y.preventDefault(), y.stopImmediatePropagation();
          const Xe = re.textNode.parentElement, De = document.createRange();
          J ? De.setStartBefore(Xe) : De.setStartAfter(Xe), De.collapse(!0), A.removeAllRanges(), A.addRange(De);
          return;
        }
        const Fe = re.textNode, ut = re.offset, Ge = J ? ut - 1 : ut, dt = Fe.data;
        if (Ge < 0 || Ge >= dt.length) return;
        y.preventDefault(), y.stopImmediatePropagation();
        const gt = document.createRange();
        gt.setStart(Fe, Ge), gt.setEnd(Fe, Ge + 1);
        const zt = gt.extractContents(), At = document.createElement("del");
        At.appendChild(zt), gt.insertNode(At);
        const He = document.createRange();
        J ? He.setStartBefore(At) : He.setStartAfter(At), He.collapse(!0), A.removeAllRanges(), A.addRange(He), u.dispatchEvent(new InputEvent("input", { bubbles: !0, inputType: "deleteContent" }));
      }
    };
    return u.addEventListener("beforeinput", m, !0), () => u.removeEventListener("beforeinput", m, !0);
  }, []), Ze(() => {
    const u = o();
    if (!u) return;
    const m = (R) => {
      if (!R) return "";
      const P = document.createElement("div");
      return P.innerHTML = pn(R), P.textContent ?? "";
    }, C = (R, P, $) => {
      var J;
      const B = document.createElement("ins");
      if (R.split(/\r\n?|\n/).forEach((re, je) => {
        je > 0 && B.appendChild(document.createElement("br")), re && B.appendChild(document.createTextNode(re));
      }), !B.firstChild) return;
      if (P.collapsed)
        P.insertNode(B);
      else {
        const re = P.extractContents();
        if (re.childNodes.length === 1 && ((J = re.firstChild) == null ? void 0 : J.tagName) === "INS")
          P.insertNode(B);
        else {
          const Fe = document.createElement("del");
          Fe.appendChild(re), P.insertNode(Fe), Fe.after(B);
        }
      }
      const se = document.createRange();
      se.setStartAfter(B), se.collapse(!0), $.removeAllRanges(), $.addRange(se), u.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertFromPaste" })
      );
    }, y = (R) => {
      if (!Lt.current || be.current || !(R.target instanceof Node) || !u.contains(R.target)) return;
      const P = R.clipboardData;
      if (!P) return;
      const $ = P.getData("text/plain") || m(P.getData("text/html"));
      if (!$) return;
      const B = window.getSelection();
      !B || B.rangeCount === 0 || !u.contains(B.anchorNode) || (R.preventDefault(), R.stopImmediatePropagation(), C($, B.getRangeAt(0), B));
    }, A = (R) => {
      var re, je, Fe;
      if (be.current || !(R.target instanceof Node) || !u.contains(R.target)) return;
      const P = R.dataTransfer;
      if (!P || (((re = P.files) == null ? void 0 : re.length) ?? 0) > 0) return;
      const $ = P.getData("text/html"), B = P.getData("text/plain");
      if (!$ && !B) return;
      const Z = document, se = ((je = Z.caretRangeFromPoint) == null ? void 0 : je.call(Z, R.clientX, R.clientY)) ?? null;
      if (!se || !u.contains(se.startContainer)) return;
      const J = window.getSelection();
      if (J)
        if (Lt.current) {
          const ut = B || m($);
          if (!ut) return;
          R.preventDefault(), R.stopImmediatePropagation(), J.removeAllRanges(), J.addRange(se), C(ut, se, J);
        } else $ && (R.preventDefault(), R.stopImmediatePropagation(), J.removeAllRanges(), J.addRange(se), (Fe = r.current) == null || Fe.execCommand("insertHTML", pn($)));
    };
    return document.addEventListener("paste", y, !0), document.addEventListener("drop", A, !0), () => {
      document.removeEventListener("paste", y, !0), document.removeEventListener("drop", A, !0);
    };
  }, []), Ze(() => {
    const u = o();
    if (!u) return;
    const m = (C) => {
      if (C.key !== "Tab") return;
      const y = window.getSelection();
      if (!y || y.rangeCount === 0) return;
      const A = y.anchorNode;
      if (!A || !u.contains(A)) return;
      const R = ah(A, u);
      if (!R) return;
      const P = R.parentElement, $ = Q.current, B = P == null ? void 0 : P.classList.contains("pagedly-checklist"), Z = (P == null ? void 0 : P.tagName) === "OL";
      if (!(B ? $.checklist : Z ? $.numberedList : $.bulletList)) return;
      const J = C.shiftKey ? lh(R) : sh(R);
      if (!J) {
        C.preventDefault();
        return;
      }
      C.preventDefault();
      const re = document.createRange();
      re.selectNodeContents(J), re.collapse(!1), y.removeAllRanges(), y.addRange(re), u.dispatchEvent(
        new InputEvent("input", { bubbles: !0, inputType: "insertText" })
      );
    };
    return u.addEventListener("keydown", m), () => u.removeEventListener("keydown", m);
  }, []), Ze(() => {
    const u = o();
    if (!u) return;
    const m = async (R) => {
      var P;
      try {
        const { src: $, w: B, h: Z } = await zs(R);
        if (!$) return;
        const se = B > 0 && Z > 0 ? ` width="${B}" height="${Z}"` : "", J = (R.name || "image").replace(/"/g, "&quot;");
        (P = r.current) == null || P.execCommand(
          "insertHTML",
          `<img src="${$}" alt="${J}"${se} style="max-width:100%;height:auto;" />`
        );
      } catch {
      }
    }, C = (R) => {
      var se, J;
      if (be.current || !Q.current.image) return;
      const P = we.current, $ = Array.from(((se = R.dataTransfer) == null ? void 0 : se.files) ?? []).filter(
        (re) => /^image\//i.test(re.type) && (!P || re.size <= P)
      );
      if ($.length === 0) return;
      R.preventDefault();
      const B = document, Z = ((J = B.caretRangeFromPoint) == null ? void 0 : J.call(B, R.clientX, R.clientY)) ?? null;
      if (Z) {
        const re = window.getSelection();
        re == null || re.removeAllRanges(), re == null || re.addRange(Z);
      }
      (async () => {
        for (const re of $) await m(re);
      })();
    }, y = (R) => {
      var P;
      Q.current.image && Array.from(((P = R.dataTransfer) == null ? void 0 : P.items) ?? []).some(($) => $.kind === "file") && R.preventDefault();
    }, A = (R) => {
      var se;
      if (be.current || !Q.current.image) return;
      const P = Array.from(((se = R.clipboardData) == null ? void 0 : se.items) ?? []), $ = P.find((J) => /^image\//i.test(J.type)), B = P.some((J) => J.type === "text/html");
      if (!$ || B) return;
      const Z = $.getAsFile();
      Z && (R.preventDefault(), R.stopImmediatePropagation(), m(Z));
    };
    return u.addEventListener("drop", C), u.addEventListener("dragover", y), u.addEventListener("paste", A, !0), () => {
      u.removeEventListener("drop", C), u.removeEventListener("dragover", y), u.removeEventListener("paste", A, !0);
    };
  }, []);
  const Ke = Ne(() => {
    var u;
    (u = r.current) != null && u.undo ? r.current.undo() : document.execCommand("undo"), ae();
  }, [ae]), ct = Ne(() => {
    var u;
    (u = r.current) != null && u.redo ? r.current.redo() : document.execCommand("redo"), ae();
  }, [ae]), ze = Ne(
    (u) => {
      const m = Q.current, C = [], y = (P, $, B, Z, se) => C.push({ id: P, label: $, keywords: B, enabled: Z, perform: se });
      for (const P of Fs) {
        const $ = P.footnote ? m.footnotes !== "off" : P.feature ? !!m[P.feature] : !0;
        y(`ins-${P.id}`, P.label, P.keywords.join(" "), $, () => {
          P.image ? Te() : P.command && he.current(P.command, P.value);
        });
      }
      y("bold", "Bold", "bold strong", !!m.bold, () => he.current("bold")), y("italic", "Italic", "italic emphasis", !!m.italic, () => he.current("italic")), y("underline", "Underline", "underline", !!m.underline, () => he.current("underline")), y("strike", "Strikethrough", "strike", !!m.strikethrough, () => he.current("strikeThrough")), y("align-left", "Align left", "align left", !!m.alignment, () => he.current("justifyLeft")), y("align-center", "Align center", "align center", !!m.alignment, () => he.current("justifyCenter")), y("align-right", "Align right", "align right", !!m.alignment, () => he.current("justifyRight")), y("indent", "Increase indent", "indent", !!m.indent, () => he.current("indent")), y("outdent", "Decrease indent", "outdent", !!m.indent, () => he.current("outdent")), y("undo", "Undo", "undo", !0, () => Ke()), y("redo", "Redo", "redo", !0, () => ct()), y("find", "Find & replace", "find search replace", !!m.find, () => oe()), y("selectall", "Select all", "select all", !0, () => document.execCommand("selectAll")), y("outline", "Toggle document outline", "outline navigation headings toc", !!m.outline, () => mr((P) => !P)), y("shortcuts", "Keyboard shortcuts", "shortcuts help keys cheatsheet", !0, () => In(!0));
      const A = !!m.ai && !!xe.current;
      y("ai-rewrite", "AI: Rewrite selection", "ai rewrite rephrase", A, () => void Je("rewrite")), y("ai-shorten", "AI: Make shorter", "ai shorten concise", A, () => void Je("shorten")), y("ai-expand", "AI: Make longer", "ai expand elaborate", A, () => void Je("expand")), y("ai-summarize", "AI: Summarize", "ai summarize summary", A, () => void Je("summarize")), y("ai-grammar", "AI: Fix grammar & spelling", "ai grammar spelling proofread", A, () => void Je("fixGrammar")), y("ai-tone", "AI: Change tone…", "ai tone formal casual", A, () => {
        Oe("Change tone", "e.g. formal, friendly", "", (P) => {
          P.trim() && Je("changeTone", P.trim());
        });
      }), y("ai-translate", "AI: Translate…", "ai translate language", A, () => {
        Oe("Translate to", "e.g. German, Spanish", "", (P) => {
          P.trim() && Je("translate", P.trim());
        });
      }), y("print", "Print", "print", !!m.print, () => {
        typeof window < "u" && window.print();
      }), y("pdf", "Download as PDF", "pdf export download", !!m.downloadPdf, () => {
        typeof window < "u" && requestAnimationFrame(() => window.print());
      }), y("docx", "Export as DOCX", "docx word export download", !!m.exportDocx, () => he.current("exportDocx")), y("docx-import", "Import DOCX", "docx word import open", !!m.importDocx, () => he.current("importDocx")), y("md-copy", "Copy as Markdown", "markdown md copy clipboard", !!m.exportMarkdown, () => he.current("copyAsMarkdown")), y("md-export", "Export as Markdown", "markdown md export download", !!m.exportMarkdown, () => he.current("exportMarkdown")), y("md-import", "Import Markdown", "markdown md import open file", !!m.importMarkdown, () => he.current("importMarkdown")), y("comment", "Add comment", "comment annotate note", !!m.comments, () => he.current("addComment")), y("accept-all", "Accept all changes", "accept track changes", !!m.trackChanges, () => he.current("acceptAllChanges")), y("reject-all", "Reject all changes", "reject track changes", !!m.trackChanges, () => he.current("rejectAllChanges")), y("keep-together", "Keep block together", "keep together no split break", !!m.pageBreak, () => he.current("toggleKeepTogether")), y("keep-with-next", "Keep with next block", "keep with next paragraph", !!m.pageBreak, () => he.current("toggleKeepWithNext")), y("break-before", "Page break before block", "page break before split", !!m.pageBreak, () => he.current("togglePageBreakBefore")), y("columns", "Two columns", "columns column layout two toggle", !!m.columns, () => he.current("toggleColumns"));
      const R = u.toLowerCase().trim();
      return C.filter((P) => P.enabled).filter((P) => !R || P.label.toLowerCase().includes(R) || P.keywords.includes(R) || P.keywords.split(" ").some(($) => $.startsWith(R))).map(({ id: P, label: $, perform: B }) => ({ id: P, label: $, perform: B }));
    },
    [Ke, ct, oe, Te]
  );
  Ze(() => {
    const u = (m) => {
      if ((m.key === "k" || m.key === "K") && (m.metaKey || m.ctrlKey)) {
        if (!Q.current.commandPalette || !i() && !ce) return;
        m.preventDefault(), ue((C) => C ? null : { query: "", index: 0 });
      }
    };
    return document.addEventListener("keydown", u, !0), () => document.removeEventListener("keydown", u, !0);
  }, [ce, i]);
  const Je = Ne(
    async (u, m) => {
      var P;
      const C = xe.current;
      if (!C || !Q.current.ai || _t.current) return;
      Ue();
      const y = window.getSelection();
      if (!y || y.rangeCount === 0) return;
      const A = y.getRangeAt(0).toString();
      if (!A.trim()) return;
      const R = y.getRangeAt(0).cloneRange();
      _t.current = !0, Ct(!0);
      try {
        const $ = await C({ action: u, text: A, instruction: m });
        if ($ != null) {
          const B = o();
          !!B && B.contains(R.startContainer) && B.contains(R.endContainer) && R.toString() === A && (y.removeAllRanges(), y.addRange(R), (P = r.current) == null || P.execCommand("insertText", $), ae());
        }
      } catch {
      } finally {
        _t.current = !1, Ct(!1);
      }
    },
    [Ue, ae, o]
  ), qe = Ne((u) => {
    ue(null), u.perform();
  }, []);
  Ze(() => {
    if (t.actionsRef)
      return t.actionsRef.current = {
        undo: Ke,
        redo: ct,
        selectAll: () => document.execCommand("selectAll"),
        openFind: oe
      }, () => {
        t.actionsRef && (t.actionsRef.current = null);
      };
  }, [t.actionsRef, Ke, ct, oe]);
  const vt = Ne((u) => {
    if (typeof window > "u") return;
    const m = u == null ? void 0 : u.filename, C = document.title;
    m && (document.title = m), requestAnimationFrame(() => {
      window.print(), m && setTimeout(() => {
        document.title = C;
      }, 100);
    });
  }, []);
  Li(
    n,
    () => ({
      focus: () => {
        var u;
        return (u = r.current) == null ? void 0 : u.focus();
      },
      reflow: () => {
        var u;
        return (u = r.current) == null || u.reflow(), Promise.resolve();
      },
      flush: () => {
        var u;
        return Promise.resolve(((u = r.current) == null ? void 0 : u.getHTML()) ?? "");
      },
      undo: Ke,
      redo: ct,
      selectAll: () => {
        document.execCommand("selectAll");
      },
      openFind: oe,
      closeFind: le,
      runCommand: Ce,
      insertHtml: (u) => {
        var m;
        (m = r.current) == null || m.execCommand("insertHTML", u);
      },
      setHtml: (u) => {
        var m, C;
        (m = r.current) == null || m.setHTML(u), ma(((C = r.current) == null ? void 0 : C.getHTML()) ?? u), ae();
      },
      getBlocks: () => {
        var u;
        return ((u = r.current) == null ? void 0 : u.getBlocks()) ?? [];
      },
      replaceBlock: (u, m) => {
        var C;
        return ((C = r.current) == null ? void 0 : C.replaceBlock(u, m)) ?? !1;
      },
      insertImage: (u, m) => {
        var A;
        const C = On(u), y = m ? `<img src="${C}" alt="${m.replace(/"/g, "&quot;")}" />` : `<img src="${C}" />`;
        (A = r.current) == null || A.execCommand("insertHTML", y);
      },
      requestImageInsert: Te,
      getState: () => f.current,
      subscribe: (u) => (p.current.add(u), u(f.current), () => {
        p.current.delete(u);
      }),
      downloadPdf: vt
    }),
    [oe, le, Te, ct, Ce, Ke, s, vt]
  );
  const Tt = si(
    () => ({
      focus: () => {
        var u;
        return (u = r.current) == null ? void 0 : u.focus();
      },
      reflow: () => Promise.resolve(),
      flush: () => {
        var u;
        return Promise.resolve(((u = r.current) == null ? void 0 : u.getHTML()) ?? "");
      },
      undo: Ke,
      redo: ct,
      selectAll: () => document.execCommand("selectAll"),
      openFind: oe,
      closeFind: le,
      runCommand: Ce,
      insertHtml: (u) => {
        var m;
        (m = r.current) == null || m.execCommand("insertHTML", u);
      },
      insertImage: (u, m) => {
        var A;
        const C = On(u), y = m ? `<img src="${C}" alt="${m.replace(/"/g, "&quot;")}" />` : `<img src="${C}" />`;
        (A = r.current) == null || A.execCommand("insertHTML", y);
      },
      requestImageInsert: Te,
      getState: () => f.current,
      subscribe: (u) => (p.current.add(u), u(f.current), () => {
        p.current.delete(u);
      }),
      // The Toolbar's PDF button is disabled unless its handle exposes this.
      downloadPdf: vt
    }),
    [Te, ct, Ce, Ke, vt]
  ), Pt = t.toolbar !== !1, Ht = typeof t.toolbar == "function" ? t.toolbar : null, Rt = t.onChange, gr = t.sanitizeHtml, Wr = X(Rt);
  Wr.current = Rt;
  const ua = X(gr);
  ua.current = gr;
  const Nn = X(t.onSave);
  Nn.current = t.onSave;
  const Fo = X(t.autoSave);
  Fo.current = t.autoSave;
  const da = X(t.autoSaveDelayMs ?? 1500);
  da.current = t.autoSaveDelayMs ?? 1500;
  const [fa, Ho] = Qe("idle"), Sn = X(null), jr = X(!0), zo = X(0), pa = X(""), ma = Ne((u) => {
    const m = ua.current, C = m ? m(u) : u;
    pa.current = C;
    const y = Wr.current;
    if (y && y(C), Fo.current && Nn.current) {
      Sn.current !== null && window.clearTimeout(Sn.current), Ho("saving");
      const A = ++zo.current;
      Sn.current = window.setTimeout(() => {
        var R;
        Sn.current = null, Promise.resolve((R = Nn.current) == null ? void 0 : R.call(Nn, C)).then(() => {
          jr.current && A === zo.current && Ho("saved");
        }).catch(() => {
          jr.current && A === zo.current && Ho("idle");
        });
      }, da.current);
    }
  }, []);
  Ze(() => (jr.current = !0, () => {
    jr.current = !1, Sn.current !== null && (window.clearTimeout(Sn.current), Sn.current = null, Fo.current && Nn.current && Promise.resolve(Nn.current(pa.current)).catch(() => {
    }));
  }), []);
  const Mu = t.toolbarPosition ?? "sticky", Ou = t.toolbarLayout ?? "compact", Du = t.viewMode ?? "edit", Iu = Ne((u) => {
    if (Bs(u)) return !0;
    const m = u.tagName;
    if (m === "P" || m === "LI") {
      const C = parseFloat(getComputedStyle(u).lineHeight) || 24, y = u.clientHeight;
      if (y > 0 && y <= C * 3 + 4) return !0;
    }
    return !1;
  }, []), ga = {
    A4: [210, 297],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6]
  }, [ha, ba] = ga[t.pageSize ?? "A4"] ?? ga.A4, ya = t.pageOrientation === "landscape", Wo = (E == null ? void 0 : E.widthMm) ?? (ya ? ba : ha), jo = (E == null ? void 0 : E.heightMm) ?? (ya ? ha : ba), Uo = E ? `${E.marginMm.top}mm ${E.marginMm.right}mm ${E.marginMm.bottom}mm ${E.marginMm.left}mm` : t.pageMargin ?? "20mm", wa = 25.4 / 96, $u = Math.round(Wo / wa), Bu = Math.round(jo / wa), Fu = {
    "--pagedly-page-width": `${$u}px`,
    "--pagedly-page-height": `${Bu}px`,
    "--pagedly-page-padding": Uo
  };
  return w.current = {
    widthMm: Wo,
    heightMm: jo,
    marginMm: pb(Uo)
  }, /* @__PURE__ */ K(
    "div",
    {
      className: [
        "pagedly-editor",
        "pagedly-editor--ce",
        `pagedly-editor--toolbar-${Mu}`,
        `pagedly-editor--toolbar-layout-${Ou}`,
        `pagedly-editor--view-${Du}`,
        H.hyphenation ? "pagedly-editor--hyphenate" : "",
        t.className
      ].filter(Boolean).join(" "),
      style: Fu,
      children: [
        Pt ? (
          // Wrap in .pagedly-editor__toolbar-row so the toolbar gets the
          // same sticky / centered / surface treatment as the legacy +
          // pageNode engines (rules live in src/styles/default.css).
          // Without this wrapper the toolbar renders bare-against the
          // desk and loses sticky positioning, background, and the
          // layout-full A4-width cap.
          /* @__PURE__ */ d("div", { className: "pagedly-editor__toolbar-row", children: Ht ? Ht(l) : /* @__PURE__ */ d(
            ig,
            {
              editor: Tt,
              state: l,
              disabled: t.readOnly,
              onCommand: Ce,
              onUndo: Ke,
              onRedo: ct,
              features: H,
              labels: t.labels
            }
          ) })
        ) : null,
        En ? /* @__PURE__ */ K(
          "div",
          {
            className: "pagedly-editor__find",
            role: "search",
            onKeyDown: (u) => {
              u.key === "Escape" && (u.preventDefault(), le());
            },
            children: [
              /* @__PURE__ */ d(
                "input",
                {
                  ref: M,
                  className: "pagedly-editor__find-input",
                  type: "search",
                  placeholder: t.findPlaceholder ?? "Find",
                  value: bt,
                  "aria-label": "Find",
                  onChange: (u) => {
                    Tn(u.target.value), L.current = -1;
                  },
                  onKeyDown: (u) => {
                    u.key === "Enter" && (u.preventDefault(), u.shiftKey ? ie() : ge());
                  }
                }
              ),
              /* @__PURE__ */ K("span", { className: "pagedly-editor__find-opts", role: "group", "aria-label": "Find options", children: [
                /* @__PURE__ */ d(
                  "button",
                  {
                    type: "button",
                    className: "pagedly-editor__find-opt" + ($t.matchCase ? " pagedly-editor__find-opt--on" : ""),
                    "aria-label": "Match case",
                    "aria-pressed": $t.matchCase,
                    title: "Match case",
                    onClick: () => {
                      zr((u) => ({ ...u, matchCase: !u.matchCase })), L.current = -1;
                    },
                    children: "Aa"
                  }
                ),
                /* @__PURE__ */ d(
                  "button",
                  {
                    type: "button",
                    className: "pagedly-editor__find-opt" + ($t.wholeWord ? " pagedly-editor__find-opt--on" : ""),
                    "aria-label": "Whole word",
                    "aria-pressed": $t.wholeWord,
                    title: "Whole word",
                    onClick: () => {
                      zr((u) => ({ ...u, wholeWord: !u.wholeWord })), L.current = -1;
                    },
                    children: "W"
                  }
                ),
                /* @__PURE__ */ d(
                  "button",
                  {
                    type: "button",
                    className: "pagedly-editor__find-opt" + ($t.regex ? " pagedly-editor__find-opt--on" : ""),
                    "aria-label": "Use regular expression",
                    "aria-pressed": $t.regex,
                    title: "Regular expression",
                    onClick: () => {
                      zr((u) => ({ ...u, regex: !u.regex })), L.current = -1;
                    },
                    children: ".*"
                  }
                )
              ] }),
              /* @__PURE__ */ d(
                "input",
                {
                  className: "pagedly-editor__find-input",
                  type: "text",
                  placeholder: "Replace",
                  value: Kt,
                  "aria-label": "Replace",
                  onChange: (u) => Hr(u.target.value)
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "pagedly-editor__find-button",
                  "aria-label": "Previous match",
                  onClick: ie,
                  children: "↑"
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "pagedly-editor__find-button",
                  "aria-label": "Next match",
                  onClick: ge,
                  children: "↓"
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "pagedly-editor__find-button",
                  onClick: ne,
                  disabled: !bt,
                  children: "Replace"
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "pagedly-editor__find-button",
                  onClick: Se,
                  disabled: !bt,
                  children: "All"
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "pagedly-editor__find-button",
                  "aria-label": "Close find",
                  onClick: le,
                  children: "✕"
                }
              )
            ]
          }
        ) : null,
        /* @__PURE__ */ d(
          Xg,
          {
            ref: r,
            html: t.html,
            onChange: ma,
            doNotBreak: H.widowControl ? Iu : Bs,
            pageHeaderHtml: t.pageHeaderHtml,
            pageFooterHtml: db(
              t.pageFooterHtml,
              t.showPageNumbers
            ),
            changeDebounceMs: t.reflowDelayMs,
            pasteFormatting: v,
            pageWidthMm: Wo,
            pageHeightMm: jo,
            pagePadding: Uo,
            watermark: t.watermark,
            runningHead: t.runningHead,
            differentFirstPage: t.differentFirstPage,
            readOnly: t.readOnly
          }
        ),
        ve && H.table && !t.readOnly ? /* @__PURE__ */ d(
          "div",
          {
            className: "pagedly-table-menu",
            role: "toolbar",
            "aria-label": "Table tools",
            style: { position: "fixed", top: ve.top, left: ve.left },
            children: [
              ["Insert row above", "tableInsertRowAbove", "↑+"],
              ["Insert row below", "tableInsertRowBelow", "↓+"],
              ["Insert column left", "tableInsertColumnBefore", "←+"],
              ["Insert column right", "tableInsertColumnAfter", "→+"],
              ["Merge right", "tableMergeRight", "⇥|"],
              ["Merge down", "tableMergeDown", "⤓|"],
              ["Split cell", "tableSplitCell", "⊟"],
              ["Delete row", "tableDeleteRow", "↥✕"],
              ["Delete column", "tableDeleteColumn", "↦✕"],
              ["Delete table", "tableDelete", "🗑"]
            ].map(([u, m, C]) => /* @__PURE__ */ d(
              "button",
              {
                type: "button",
                className: "pagedly-table-menu__button",
                "aria-label": u,
                title: u,
                onMouseDown: (y) => y.preventDefault(),
                onClick: () => Ce(m),
                children: C
              },
              m
            ))
          }
        ) : null,
        Le && H.slashMenu && !t.readOnly ? (() => {
          const u = yt(Le.query);
          if (u.length === 0) return null;
          const m = Math.min(Le.index, u.length - 1);
          return /* @__PURE__ */ d(
            "div",
            {
              className: "pagedly-slash-menu",
              role: "listbox",
              "aria-label": "Insert",
              style: { position: "fixed", top: Le.top, left: Le.left },
              children: u.map((C, y) => {
                const A = C.icon, R = y === 0 || C.group !== u[y - 1].group, P = y === m;
                return /* @__PURE__ */ K(zu, { children: [
                  R ? /* @__PURE__ */ d("div", { className: "pagedly-slash-menu__group", children: C.group }) : null,
                  /* @__PURE__ */ K(
                    "button",
                    {
                      type: "button",
                      role: "option",
                      "aria-selected": P,
                      ref: ($) => {
                        P && $ && $.scrollIntoView({ block: "nearest" });
                      },
                      className: "pagedly-slash-menu__item" + (P ? " pagedly-slash-menu__item--active" : ""),
                      onMouseDown: ($) => $.preventDefault(),
                      onMouseEnter: () => Ve(($) => $ && { ...$, index: y }),
                      onClick: () => ht(C),
                      children: [
                        /* @__PURE__ */ d("span", { className: "pagedly-slash-menu__icon", "aria-hidden": !0, children: /* @__PURE__ */ d(A, { size: 18, strokeWidth: 1.75 }) }),
                        /* @__PURE__ */ K("span", { className: "pagedly-slash-menu__body", children: [
                          /* @__PURE__ */ d("span", { className: "pagedly-slash-menu__label", children: C.label }),
                          /* @__PURE__ */ d("span", { className: "pagedly-slash-menu__desc", children: C.description })
                        ] })
                      ]
                    }
                  )
                ] }, C.id);
              })
            }
          );
        })() : null,
        et ? /* @__PURE__ */ K(
          "div",
          {
            className: "pagedly-picker pagedly-picker--list",
            role: "listbox",
            "aria-label": et.title,
            style: { position: "fixed", top: et.top, left: et.left },
            onMouseDown: (u) => u.preventDefault(),
            children: [
              /* @__PURE__ */ d("div", { className: "pagedly-picker__title", children: et.title }),
              /* @__PURE__ */ d("div", { className: "pagedly-picker__list", children: et.items.map((u, m) => /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  role: "option",
                  "aria-selected": m === et.index,
                  ref: (C) => {
                    m === et.index && C && C.scrollIntoView({ block: "nearest" });
                  },
                  className: "pagedly-picker__item" + (m === et.index ? " pagedly-picker__item--active" : ""),
                  onMouseEnter: () => tt((C) => C && { ...C, index: m }),
                  onClick: () => {
                    tt(null), Ue(), u && et.onPick(u.id);
                  },
                  children: u.label
                },
                u.id
              )) }),
              /* @__PURE__ */ d("div", { className: "pagedly-picker__hint", children: "↑↓ to choose · Enter to confirm · Esc to cancel" })
            ]
          }
        ) : null,
        nt ? /* @__PURE__ */ K(
          "div",
          {
            className: "pagedly-picker pagedly-picker--input",
            role: "dialog",
            "aria-label": nt.title,
            style: { position: "fixed", top: nt.top, left: nt.left },
            onMouseDown: (u) => u.stopPropagation(),
            children: [
              /* @__PURE__ */ d("div", { className: "pagedly-picker__title", children: nt.title }),
              /* @__PURE__ */ d(
                "input",
                {
                  className: "pagedly-picker__input",
                  type: "text",
                  autoFocus: !0,
                  defaultValue: nt.initial,
                  placeholder: nt.placeholder,
                  onKeyDown: (u) => {
                    if (u.key === "Enter") {
                      u.preventDefault();
                      const m = u.target.value, C = nt.onSubmit;
                      ot(null), Ue(), C(m);
                    } else u.key === "Escape" && (u.preventDefault(), ot(null));
                  }
                }
              ),
              /* @__PURE__ */ d("div", { className: "pagedly-picker__hint", children: "Enter to confirm · Esc to cancel" })
            ]
          }
        ) : null,
        Hn && H.image && !t.readOnly ? /* @__PURE__ */ d(
          "div",
          {
            className: "pagedly-image-menu",
            role: "toolbar",
            "aria-label": "Image tools",
            style: { position: "fixed", top: Hn.top, left: Hn.left },
            children: [
              ["Align left", () => Wn("left"), "⌐"],
              ["Align center", () => Wn("center"), "≡"],
              ["Align right", () => Wn("right"), "¬"],
              ["Caption", () => Bo(), "❝"],
              ["Alt text", () => Br(), "alt"]
            ].map(([u, m, C]) => /* @__PURE__ */ d(
              "button",
              {
                type: "button",
                className: "pagedly-image-menu__button",
                "aria-label": u,
                title: u,
                onMouseDown: (y) => y.preventDefault(),
                onClick: m,
                children: C
              },
              u
            ))
          }
        ) : null,
        ce && H.commandPalette && !t.readOnly ? (() => {
          var C;
          const u = ze(ce.query), m = Math.min(ce.index, Math.max(u.length - 1, 0));
          return /* @__PURE__ */ d(
            "div",
            {
              className: "pagedly-palette__backdrop",
              onMouseDown: (y) => {
                y.target === y.currentTarget && ue(null);
              },
              children: /* @__PURE__ */ K("div", { className: "pagedly-palette", role: "dialog", "aria-label": "Command palette", children: [
                /* @__PURE__ */ d(
                  "input",
                  {
                    className: "pagedly-palette__input",
                    autoFocus: !0,
                    placeholder: ((C = t.labels) == null ? void 0 : C.commandPalette) ?? "Type a command…",
                    value: ce.query,
                    onChange: (y) => ue((A) => A && { query: y.target.value, index: 0 }),
                    onKeyDown: (y) => {
                      const A = ze(ce.query), R = A.length;
                      y.key === "Escape" ? (y.preventDefault(), ue(null)) : y.key === "ArrowDown" ? (y.preventDefault(), R && ue((P) => P && { ...P, index: (P.index + 1) % R })) : y.key === "ArrowUp" ? (y.preventDefault(), R && ue((P) => P && { ...P, index: (P.index - 1 + R) % R })) : y.key === "Enter" && (y.preventDefault(), R && qe(A[Math.min(ce.index, R - 1)]));
                    }
                  }
                ),
                /* @__PURE__ */ d("div", { className: "pagedly-palette__list", role: "listbox", children: u.length === 0 ? /* @__PURE__ */ d("div", { className: "pagedly-palette__empty", children: "No matches" }) : u.map((y, A) => /* @__PURE__ */ d(
                  "button",
                  {
                    type: "button",
                    role: "option",
                    "aria-selected": A === m,
                    className: "pagedly-palette__item" + (A === m ? " pagedly-palette__item--active" : ""),
                    onMouseDown: (R) => R.preventDefault(),
                    onMouseEnter: () => ue((R) => R && { ...R, index: A }),
                    onClick: () => qe(y),
                    children: y.label
                  },
                  y.id
                )) })
              ] })
            }
          );
        })() : null,
        pr && t.placeholder && !t.readOnly ? /* @__PURE__ */ d(
          "div",
          {
            className: "pagedly-placeholder",
            "aria-hidden": !0,
            style: { position: "fixed", top: pr.top, left: pr.left },
            children: t.placeholder
          }
        ) : null,
        Et ? /* @__PURE__ */ d("div", { className: "pagedly-ai-busy", role: "status", "aria-live": "polite", children: ((xa = t.labels) == null ? void 0 : xa.aiWorking) ?? "AI is working…" }) : null,
        t.autoSave && t.onSave && fa !== "idle" ? /* @__PURE__ */ d("div", { className: "pagedly-save-status", role: "status", "aria-live": "polite", children: fa === "saving" ? ((Ea = t.labels) == null ? void 0 : Ea.saving) ?? "Saving…" : ((Ta = t.labels) == null ? void 0 : Ta.saved) ?? "Saved" }) : null,
        xt ? /* @__PURE__ */ d(
          "div",
          {
            className: "pagedly-palette__backdrop",
            onMouseDown: (u) => {
              u.target === u.currentTarget && In(!1);
            },
            children: /* @__PURE__ */ K("div", { className: "pagedly-shortcuts", role: "dialog", "aria-label": "Keyboard shortcuts", children: [
              /* @__PURE__ */ K("div", { className: "pagedly-shortcuts__header", children: [
                /* @__PURE__ */ d("span", { children: ((Na = t.labels) == null ? void 0 : Na.shortcuts) ?? "Keyboard shortcuts" }),
                /* @__PURE__ */ d("button", { type: "button", "aria-label": "Close", onClick: () => In(!1), children: "✕" })
              ] }),
              /* @__PURE__ */ d("dl", { className: "pagedly-shortcuts__list", children: [
                ["Bold", "⌘/Ctrl + B"],
                ["Italic", "⌘/Ctrl + I"],
                ["Underline", "⌘/Ctrl + U"],
                ["Find & replace", "⌘/Ctrl + F"],
                ["Command palette", "⌘/Ctrl + K"],
                ["Insert menu", "/ (slash)"],
                ["Nest / un-nest list item", "Tab / Shift + Tab"],
                ["Undo / Redo", "⌘/Ctrl + Z / ⇧Z"]
              ].map(([u, m]) => /* @__PURE__ */ K("div", { className: "pagedly-shortcuts__row", children: [
                /* @__PURE__ */ d("dt", { children: u }),
                /* @__PURE__ */ d("dd", { children: m })
              ] }, u)) })
            ] })
          }
        ) : null,
        cn && H.outline && !t.readOnly ? /* @__PURE__ */ K("div", { className: "pagedly-outline", role: "navigation", "aria-label": "Document outline", children: [
          /* @__PURE__ */ K("div", { className: "pagedly-outline__header", children: [
            /* @__PURE__ */ d("span", { children: ((Sa = t.labels) == null ? void 0 : Sa.outline) ?? "Outline" }),
            /* @__PURE__ */ d(
              "button",
              {
                type: "button",
                className: "pagedly-outline__close",
                "aria-label": "Close outline",
                onClick: () => mr(!1),
                children: "✕"
              }
            )
          ] }),
          /* @__PURE__ */ d("div", { className: "pagedly-outline__list", children: vn.length === 0 ? /* @__PURE__ */ d("div", { className: "pagedly-outline__empty", children: "No headings yet" }) : vn.map((u, m) => /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              className: "pagedly-outline__item",
              style: { paddingLeft: 8 + (u.level - 1) * 12 },
              onClick: () => Fn(m),
              children: u.text
            },
            m
          )) })
        ] }) : null
      ]
    }
  );
}), gb = "data-pagedly-editable-root-ref";
function hu(e) {
  let t = null;
  const n = (o) => (t || (t = e.ownerDocument.createElement("p"), e.insertBefore(t, o)), t), r = () => {
    t = null;
  };
  for (const o of Array.from(e.childNodes)) {
    if (o.nodeType === Node.COMMENT_NODE) {
      o.remove();
      continue;
    }
    if (o.nodeType === Node.TEXT_NODE) {
      let a = o.textContent ?? "";
      if (!yu(a)) {
        o.remove();
        continue;
      }
      if (a.includes(`
`) && (a = a.replace(/\s*\n\s*/g, " "), t || (a = a.trimStart()), bb(o) && (a = a.trimEnd())), !a) {
        o.remove();
        continue;
      }
      n(o).appendChild(e.ownerDocument.createTextNode(a)), o.remove();
      continue;
    }
    if (o.nodeType !== Node.ELEMENT_NODE) {
      r();
      continue;
    }
    const i = o;
    if (bu(i)) {
      r();
      continue;
    }
    n(i).appendChild(i);
  }
}
function hb(e) {
  const t = [e, ...Array.from(e.querySelectorAll("*"))];
  for (const n of t) {
    n.classList.contains("pagedjs_hyphen") && wb(n), n.removeAttribute("data-ref"), n.removeAttribute("data-id"), n.removeAttribute("data-pagedly-ref"), n.removeAttribute(gb), n.removeAttribute("data-pagedly-readonly-source"), n.removeAttribute("data-split-from"), n.removeAttribute("data-split-to"), n.removeAttribute("data-previous-break-after"), n.removeAttribute("data-break-before"), n.removeAttribute("data-undisplayed"), n.removeAttribute("contenteditable"), n.removeAttribute("spellcheck"), n.removeAttribute("aria-readonly"), n.removeAttribute("tabindex");
    for (const r of Array.from(n.classList))
      r.startsWith("pagedjs_") && n.classList.remove(r);
    n.classList.length === 0 && n.removeAttribute("class");
  }
}
function bb(e) {
  let t = e.nextSibling;
  for (; t; ) {
    if (t.nodeType === Node.COMMENT_NODE) {
      t = t.nextSibling;
      continue;
    }
    if (t.nodeType === Node.TEXT_NODE && !yu(t.textContent ?? "")) {
      t = t.nextSibling;
      continue;
    }
    return t.nodeType !== Node.ELEMENT_NODE ? !0 : bu(t);
  }
  return !0;
}
function bu(e) {
  return yb.has(e.tagName);
}
const yb = /* @__PURE__ */ new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "IMG",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TEMPLATE",
  // section-anchor sentinels — must stay at top level, never wrapped in a paragraph
  "UL"
]);
function wb(e) {
  var o;
  const t = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  let n = null, r = t.nextNode();
  for (; r; )
    n = r, r = t.nextNode();
  (o = n == null ? void 0 : n.textContent) != null && o.endsWith("‑") && (n.textContent = n.textContent.slice(0, -1));
}
function yu(e) {
  return e.replace(/\s+/g, " ").trim();
}
const Qn = "data-section-id", rn = "data-section-anchor", Zn = "data-section-id", Rn = "data-generated-letter-chrome", eo = "data-checked", to = "data-align", no = "data-comment-id", ra = /* @__PURE__ */ new Set([
  "data-att-id",
  "data-text-align",
  eo,
  to,
  no,
  "data-toc-index",
  "data-toc-level",
  "data-xref-index",
  "data-xref-id",
  "data-xref-target",
  "data-fn",
  "data-fn-text",
  "data-fn-note"
]), vb = /* @__PURE__ */ new Set([
  ...ra,
  Qn,
  rn,
  Zn,
  Rn
]);
function Cb(e, t = {}) {
  return t.bodyHtml ?? xb(e);
}
function xb(e) {
  return e.sections.map((t) => jb(t.id) + Ab(t)).join("");
}
function Eb(e, t = []) {
  const n = Ir(`<div>${e}</div>`), r = n ? Array.from(n.querySelectorAll(".letter-body")) : [], o = r.length > 0 ? r.map((i) => i.innerHTML).join("") : e;
  return {
    bodyHtml: o,
    sections: Nb(o, t)
  };
}
function Tb(e, t) {
  return {
    ...e,
    sections: e.sections.map((n) => {
      if (!Object.prototype.hasOwnProperty.call(t, n.id)) return n;
      const r = wu(t[n.id] ?? "");
      return r === n.html ? n : { ...n, html: r };
    })
  };
}
function Nb(e, t = []) {
  const n = Ub(t), r = n[0], o = Ir(`<div>${e}</div>`), i = o == null ? void 0 : o.body.firstElementChild, a = {};
  if (!i) return a;
  let s = null, l = [], c = !1;
  const f = /* @__PURE__ */ new Set(), p = /* @__PURE__ */ new Set(), h = () => {
    s != null && (a[s] = (a[s] ?? "") + l.join(""), f.add(s)), l = [];
  };
  for (const v of Array.from(i.childNodes)) {
    if (v.nodeType === Node.ELEMENT_NODE) {
      const T = v;
      if (T.hasAttribute(rn)) {
        c = !0, h(), s = T.getAttribute(Zn), s && (p.add(s), f.delete(s));
        continue;
      }
      if (qb(T)) {
        c = !0;
        continue;
      }
      const b = T.getAttribute(Qn);
      b ? (c = !0, b !== s && (f.has(b) && !p.has(b) || (h(), s = b))) : s == null && r && (s = r), l.push(Rb(T));
      continue;
    }
    v.nodeType === Node.TEXT_NODE && (s == null && r && (s = r), l.push(kr(v.textContent ?? "")));
  }
  h();
  for (const v of Object.keys(a))
    a[v] = wu(a[v]);
  if (!c && r && e.trim())
    for (const v of n.slice(1)) a[v] = "";
  return a;
}
function Sb(e, t = "") {
  var r;
  const n = (r = e.employer) == null ? void 0 : r.signatureDataUrl;
  return vu(n) ? `<div class="signature-image"${t}><img src="${aa(n)}" alt="" /></div>` : "";
}
function oa(e) {
  if (typeof window > "u") return e;
  const t = Pi.sanitize(e, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "sub",
      "sup",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "span",
      "div",
      "img",
      "figure",
      "figcaption",
      "ins",
      "del",
      "template"
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "colspan",
      "rowspan",
      "src",
      "alt",
      "title",
      "width",
      "height",
      "class",
      "style",
      "data-att-id",
      "data-text-align",
      eo,
      to,
      no,
      "data-toc-index",
      "data-toc-level",
      "data-xref-index",
      "data-xref-id",
      "data-xref-target",
      "data-fn",
      "data-fn-text",
      "data-fn-note",
      Qn,
      rn,
      Zn,
      Rn,
      "contenteditable"
    ],
    ADD_ATTR: [
      "target",
      eo,
      to,
      no,
      "data-toc-index",
      "data-toc-level",
      "data-xref-index",
      "data-xref-id",
      "data-xref-target",
      "data-fn",
      "data-fn-text",
      "data-fn-note",
      Qn,
      rn,
      Zn,
      Rn,
      "contenteditable"
    ],
    ADD_URI_SAFE_ATTR: [
      "target",
      "contenteditable",
      "data-att-id",
      "data-text-align",
      eo,
      to,
      no,
      "data-toc-index",
      "data-toc-level",
      "data-xref-index",
      "data-xref-id",
      "data-xref-target",
      "data-fn",
      "data-fn-text",
      "data-fn-note",
      Qn,
      rn,
      Zn,
      Rn
    ],
    ALLOW_DATA_ATTR: !1,
    KEEP_CONTENT: !0,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/(?!\/)|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i
  });
  return _b(t);
}
function Ab(e) {
  const t = oa(e.html || ""), n = Ir(`<div>${t}</div>`), r = n == null ? void 0 : n.body.firstElementChild;
  if (!r) return t;
  hu(r);
  for (const o of Array.from(r.children))
    o.setAttribute(Qn, e.id);
  return r.innerHTML;
}
function wu(e) {
  return kb(oa(e));
}
function kb(e) {
  const t = Ir(`<div>${e}</div>`), n = t == null ? void 0 : t.body.firstElementChild;
  if (!n) return e;
  for (const r of Array.from(n.querySelectorAll(`[${Rn}]`)))
    r.remove();
  for (const r of Array.from(n.querySelectorAll(`[${rn}]`)))
    r.remove();
  for (const r of [n, ...Array.from(n.querySelectorAll("*"))])
    ia(r, ra), r.removeAttribute("role"), r.removeAttribute("aria-multiline");
  return n.innerHTML;
}
function Rb(e) {
  const t = e.cloneNode(!0);
  if (t.nodeType === Node.ELEMENT_NODE) {
    const n = t;
    hb(n);
    for (const r of Array.from(n.querySelectorAll(`[${Rn}]`)))
      r.remove();
    for (const r of Array.from(n.querySelectorAll(`[${rn}]`)))
      r.remove();
    for (const r of [n, ...Array.from(n.querySelectorAll("*"))])
      ia(r, ra), r.removeAttribute("role"), r.removeAttribute("aria-multiline");
    return n.outerHTML;
  }
  return kr(t.textContent ?? "");
}
function _b(e) {
  const t = Ir(`<div>${e}</div>`), n = t == null ? void 0 : t.body.firstElementChild;
  if (!n) return e;
  for (const r of Array.from(n.querySelectorAll("*")))
    ia(r, vb), Lb(r), Pb(r);
  return n.innerHTML;
}
function ia(e, t) {
  for (const n of Array.from(e.attributes))
    n.name.startsWith("data-") && !t.has(n.name) && e.removeAttribute(n.name);
}
function Lb(e) {
  if (e.tagName !== "A") return;
  const t = e.getAttribute("target");
  if (!t) return;
  const n = t.toLowerCase();
  if (!["_blank", "_self", "_parent", "_top"].includes(n)) {
    e.removeAttribute("target");
    return;
  }
  e.setAttribute("target", n), n === "_blank" && e.setAttribute("rel", "noopener noreferrer");
}
function Pb(e) {
  const t = e.getAttribute("style");
  if (!t) return;
  if (e.hasAttribute(rn)) {
    e.setAttribute("style", "display:none");
    return;
  }
  const n = [];
  if (/^(P|DIV|H1|H2|H3|H4|H5|H6|LI|TD|TH|BLOCKQUOTE|PRE)$/.test(e.tagName)) {
    const l = Mb(t);
    l && n.push(`text-align: ${l}`);
    const c = Us(t, "margin-left");
    c && n.push(`margin-left: ${c}`);
    const f = Us(t, "margin-right");
    f && n.push(`margin-right: ${f}`);
    const p = Db(t);
    p && n.push(`text-indent: ${p}`);
    const h = Ob(t);
    h && n.push(`line-height: ${h}`);
    const v = Vs(t, "margin-top");
    v && n.push(`margin-top: ${v}`);
    const T = Vs(t, "margin-bottom");
    T && n.push(`margin-bottom: ${T}`);
  }
  const o = qs(t, "color");
  o && n.push(`color: ${o}`);
  const i = qs(t, "background-color");
  i && n.push(`background-color: ${i}`);
  const a = $b(t);
  a && n.push(`font-size: ${a}`);
  const s = Bb(t);
  if (s && n.push(`font-family: ${s}`), e.tagName === "IMG") {
    const l = Ib(t), c = Fb(t);
    l && n.push(`width: ${l}`), c && n.push(`max-width: ${c}`), (l || c) && n.push("height: auto");
  }
  n.length ? e.setAttribute("style", `${n.join("; ")};`) : e.removeAttribute("style");
}
function Mb(e) {
  var n;
  const t = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\b/i.exec(e);
  return ((n = t == null ? void 0 : t[1]) == null ? void 0 : n.toLowerCase()) ?? "";
}
function Ob(e) {
  const t = /(?:^|;)\s*line-height\s*:\s*(\d+(?:\.\d+)?)\s*(?:;|$)/i.exec(e);
  if (!t) return "";
  const n = Number(t[1]);
  return !Number.isFinite(n) || n < 0.5 || n > 4 ? "" : `${n}`;
}
function Us(e, t) {
  const r = new RegExp(`(?:^|;)\\s*${t}\\s*:\\s*(\\d+(?:\\.\\d+)?)(em|px|pt)\\b`, "i").exec(e);
  if (!r) return "";
  const o = Number(r[1]), i = r[2].toLowerCase();
  return !Number.isFinite(o) || o <= 0 ? "" : i === "em" ? `${Math.min(o, 30)}em` : i === "pt" ? `${Math.round(Math.min(o, 288) * 100) / 100}pt` : `${Math.round(Math.min(o, 480))}px`;
}
function Db(e) {
  const t = /(?:^|;)\s*text-indent\s*:\s*(-?\d+(?:\.\d+)?)(pt|px|em)\b/i.exec(e);
  if (!t) return "";
  const n = Number(t[1]), r = t[2].toLowerCase();
  if (!Number.isFinite(n) || n === 0) return "";
  const o = r === "pt" ? 288 : r === "px" ? 384 : 30, i = Math.max(-o, Math.min(o, n));
  return `${Math.round(i * 100) / 100}${r}`;
}
function Ib(e) {
  const t = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)(px|%)(?=[\s;]|$)/i.exec(e);
  if (!t) return "";
  const n = Number(t[1]), r = t[2].toLowerCase();
  return !Number.isFinite(n) || n <= 0 ? "" : r === "%" ? `${Math.min(n, 100)}%` : `${Math.round(Math.min(n, 2e3))}px`;
}
function qs(e, t) {
  const r = new RegExp(`(?:^|;)\\s*${t}\\s*:\\s*([^;]+)`, "i").exec(e);
  if (!r) return "";
  const o = r[1].trim();
  return /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(o) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(o) || /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/i.test(o) ? o : /^[a-z]{3,20}$/i.test(o) && o.toLowerCase() !== "transparent" ? o.toLowerCase() : "";
}
function $b(e) {
  const t = /(?:^|;)\s*font-size\s*:\s*(\d+(?:\.\d+)?)(pt|px|em|rem|%)(?=[\s;]|$)/i.exec(e);
  if (!t) return "";
  const n = Number(t[1]), r = t[2].toLowerCase();
  return !Number.isFinite(n) || n <= 0 ? "" : `${Math.min(n, r === "pt" ? 200 : r === "px" ? 260 : r === "%" ? 600 : 16)}${r}`;
}
function Bb(e) {
  const t = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(e);
  if (!t) return "";
  const n = t[1].trim().replace(/\s+/g, " ");
  return /[()<>{}\\]/.test(n) || !/^[\w '",\- ]+$/.test(n) ? "" : n.slice(0, 120);
}
function Vs(e, t) {
  const r = new RegExp(`(?:^|;)\\s*${t}\\s*:\\s*(\\d+(?:\\.\\d+)?)(pt|px|em|rem)(?=[\\s;]|$)`, "i").exec(e);
  if (!r) return "";
  const o = Number(r[1]), i = r[2].toLowerCase();
  return !Number.isFinite(o) || o < 0 ? "" : `${Math.min(o, i === "pt" ? 96 : i === "px" ? 128 : 8)}${i}`;
}
function Fb(e) {
  const t = /(?:^|;)\s*max-width\s*:\s*(\d+(?:\.\d+)?)(px|%)(?=[\s;]|$)/i.exec(e);
  if (!t) return "";
  const n = Number(t[1]), r = t[2].toLowerCase();
  return !Number.isFinite(n) || n <= 0 ? "" : r === "%" ? `${Math.min(n, 100)}%` : `${Math.round(Math.min(n, 2e3))}px`;
}
function Hb(e) {
  var n;
  const t = (n = e.employer) == null ? void 0 : n.letterheadDataUrl;
  return vu(t) ? `<div class="letterhead"><img src="${aa(t)}" alt="" /></div>` : "";
}
function zb(e) {
  const t = (e.evidence ?? []).filter((r) => Wb(r) === "attached");
  return t.length === 0 ? "" : `<section class="attachments-section page-break-before">
    <h2>Attachments</h2>
    <ol class="attachments-list">${t.map((r, o) => {
    const i = r.filename || `${r.kind || "Evidence"} item`, a = r.content ? ` - ${kr(r.content)}` : "";
    return `<li><strong>${kr(i)}</strong>${a}<span class="att-num">[Attachment ${o + 1}]</span></li>`;
  }).join(`
`)}</ol>
  </section>`;
}
function Wb(e) {
  return e.displayMode ?? "attached";
}
function jb(e) {
  return `<template ${rn} ${Zn}="${aa(e)}"></template>`;
}
function Ub(e) {
  return e.map((t) => typeof t == "string" ? t : t.id);
}
function qb(e) {
  return e.hasAttribute(Rn);
}
function Ir(e) {
  return typeof DOMParser > "u" ? null : new DOMParser().parseFromString(e, "text/html");
}
function vu(e) {
  if (typeof e != "string") return !1;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(e))
    return !0;
  if (!/^https:\/\//i.test(e)) return !1;
  try {
    return new URL(e), !0;
  } catch {
    return !1;
  }
}
function kr(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function aa(e) {
  return kr(e);
}
function Xs(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const zy = go(
  function({
    draft: t,
    printCss: n,
    className: r,
    canvasClassName: o,
    toolbar: i = !0,
    toolbarPosition: a = "sticky",
    toolbarLayout: s = "full",
    viewMode: l,
    editorRef: c,
    actionsRef: f,
    onChange: p,
    onDraftChange: h,
    onSectionChange: v,
    onSave: T,
    autoSave: b,
    autoSaveDelayMs: E,
    readOnly: x,
    findPlaceholder: w = "Find in letter",
    reflowDelayMs: k,
    realtimePagination: D,
    pageHeaderHtml: j,
    pageFooterHtml: q,
    showPageNumbers: H,
    pasteFormatting: Q,
    features: be,
    labels: ke,
    aiProvider: we,
    suggesting: $e,
    commands: Re,
    pageSize: Me,
    pageOrientation: V,
    pageMargin: ve,
    documentMetrics: _e,
    onDocumentMetricsChange: de,
    watermark: Le,
    runningHead: Ve,
    differentFirstPage: st,
    placeholder: et,
    onCommentAdd: tt,
    onCommentClick: nt
  }, ot) {
    const z = X(null), ee = X(null), Be = X(t);
    Be.current = t;
    const it = Cb(t);
    Ze(() => {
      const I = () => {
        var Ft, Jt;
        const ue = Be.current, xe = Array.from(
          document.querySelectorAll(".pagedly-ce-page")
        );
        if (xe.length === 0) return;
        const Et = Hb(ue);
        if (Et) {
          const xt = document.createElement("div");
          xt.className = "pagedly-print-chrome pagedly-print-chrome--letterhead", xt.innerHTML = Et, xe[0].insertBefore(xt, xe[0].firstChild);
        }
        const Ct = Sb(ue), _t = ((Ft = ue.employer) == null ? void 0 : Ft.signatoryName) ?? "", kt = ((Jt = ue.employer) == null ? void 0 : Jt.signatoryTitle) ?? "";
        if (Ct || _t) {
          const xt = document.createElement("div");
          xt.className = "pagedly-print-chrome pagedly-print-chrome--signature", xt.innerHTML = `${Ct}${_t ? `<div class="pagedly-print-signatory"><div>${Xs(_t)}</div>${kt ? `<div class="pagedly-print-signatory-title">${Xs(kt)}</div>` : ""}</div>` : ""}`, xe[xe.length - 1].appendChild(xt);
        }
        const Lt = zb(ue);
        if (Lt) {
          const xt = document.createElement("div");
          xt.className = "pagedly-print-chrome pagedly-print-chrome--attachments", xt.innerHTML = Lt, xe[xe.length - 1].appendChild(xt);
        }
      }, ce = () => {
        var ue;
        for (const xe of Array.from(
          document.querySelectorAll(".pagedly-print-chrome")
        ))
          (ue = xe.parentNode) == null || ue.removeChild(xe);
      };
      return window.addEventListener("beforeprint", I), window.addEventListener("afterprint", ce), () => {
        window.removeEventListener("beforeprint", I), window.removeEventListener("afterprint", ce);
      };
    }, []), Li(
      ot,
      () => ({
        focus: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.focus();
        },
        reflow: () => {
          var I;
          return ((I = z.current) == null ? void 0 : I.reflow()) ?? Promise.resolve();
        },
        flush: () => {
          var I;
          return ((I = z.current) == null ? void 0 : I.flush()) ?? Promise.resolve(it);
        },
        undo: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.undo();
        },
        redo: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.redo();
        },
        selectAll: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.selectAll();
        },
        openFind: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.openFind();
        },
        closeFind: () => {
          var I;
          return (I = z.current) == null ? void 0 : I.closeFind();
        },
        runCommand: (I, ce) => {
          var ue;
          return (ue = z.current) == null ? void 0 : ue.runCommand(I, ce);
        },
        insertHtml: (I) => {
          var ce;
          return (ce = z.current) == null ? void 0 : ce.insertHtml(I);
        },
        setHtml: (I) => {
          var ce, ue;
          return (ue = (ce = z.current) == null ? void 0 : ce.setHtml) == null ? void 0 : ue.call(ce, I);
        },
        getBlocks: () => {
          var I, ce;
          return ((ce = (I = z.current) == null ? void 0 : I.getBlocks) == null ? void 0 : ce.call(I)) ?? [];
        },
        replaceBlock: (I, ce) => {
          var ue, xe;
          return ((xe = (ue = z.current) == null ? void 0 : ue.replaceBlock) == null ? void 0 : xe.call(ue, I, ce)) ?? !1;
        },
        insertImage: (I, ce) => {
          var ue;
          return (ue = z.current) == null ? void 0 : ue.insertImage(I, ce);
        },
        requestImageInsert: () => {
          var I;
          return ((I = z.current) == null ? void 0 : I.requestImageInsert()) ?? Promise.resolve();
        },
        getState: () => {
          var I;
          return ((I = z.current) == null ? void 0 : I.getState()) ?? Si;
        },
        subscribe: (I) => z.current ? z.current.subscribe(I) : (I(Si), () => {
        }),
        downloadPdf: (I) => {
          var ce, ue;
          return (ue = (ce = z.current) == null ? void 0 : ce.downloadPdf) == null ? void 0 : ue.call(ce, I);
        }
      }),
      [it]
    );
    const Oe = Ne(
      (I) => {
        const ce = Be.current, ue = Eb(I, ce.sections), xe = Tb(ce, ue.sections), Et = {
          fullHtml: I,
          bodyHtml: ue.bodyHtml,
          sections: ue.sections,
          draft: xe
        };
        Be.current = xe;
        for (const Ct of ce.sections) {
          if (!Object.prototype.hasOwnProperty.call(ue.sections, Ct.id)) continue;
          const _t = ue.sections[Ct.id] ?? "";
          _t !== Ct.html && (v == null || v(ce.id, Ct.id, _t));
        }
        return h == null || h(xe), p == null || p(Et), ee.current = Et, Et;
      },
      [p, h, v]
    ), We = Ne(
      (I) => {
        z.current = I, c && (c.current = I);
      },
      [c]
    );
    return /* @__PURE__ */ d(
      mb,
      {
        ref: We,
        html: it,
        onChange: Oe,
        onSave: async (I) => {
          var ue;
          const ce = ((ue = ee.current) == null ? void 0 : ue.fullHtml) === I ? ee.current : Oe(I);
          await (T == null ? void 0 : T(ce));
        },
        autoSave: b ?? (T ? !0 : void 0),
        autoSaveDelayMs: E,
        readOnly: x,
        findPlaceholder: w,
        sanitizeHtml: oa,
        toolbar: i,
        toolbarPosition: a,
        toolbarLayout: s,
        viewMode: l,
        className: ["pagedly-editor--letter", r].filter(Boolean).join(" "),
        canvasClassName: o,
        actionsRef: f,
        reflowDelayMs: k,
        realtimePagination: D,
        pageHeaderHtml: j,
        pageFooterHtml: q,
        showPageNumbers: H,
        pasteFormatting: Q,
        features: be,
        labels: ke,
        aiProvider: we,
        suggesting: $e,
        commands: Re,
        pageSize: Me,
        pageOrientation: V,
        pageMargin: ve,
        documentMetrics: _e,
        onDocumentMetricsChange: de,
        watermark: Le,
        runningHead: Ve,
        differentFirstPage: st,
        placeholder: et,
        onCommentAdd: tt,
        onCommentClick: nt
      }
    );
  }
), sa = Math.round(8.27 * 96), Cu = Math.round(11.69 * 96), Vb = Math.round(96), Xb = Math.round(1.2 * 96), Kb = Math.round(1.1 * 96), Gb = sa - Kb * 2, xu = Cu - Vb - Xb;
function Wy(e, t = {}) {
  if (!Number.isFinite(e) || e <= 0) return 1;
  const n = t.pageWidthPx ?? sa, r = t.minScale ?? 0.25, o = t.gutterPx ?? 8, i = Math.max(0, e - o);
  return Math.min(1, Math.max(r, i / n));
}
function Yb(e = {}) {
  const t = e.margin ?? "1in 1.1in 1.2in 1.1in", n = e.fontFamily ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', r = e.fontSize ?? "11pt", o = e.lineHeight ?? 1.55, i = e.textColor ?? "#111827", a = e.pageBackground ?? "#ffffff", s = e.pageBorderColor ?? "#e5e7eb", l = e.pageShadow ?? "0 2px 8px rgba(15, 23, 42, 0.04), 0 14px 36px rgba(15, 23, 42, 0.10)", c = e.showPageNumbers !== !1 ? `
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: ${n};
      font-size: 9pt;
      color: #6b7280;
      padding-top: 0.35in;
    }` : "";
  return `
  @page {
    size: A4;
    margin: ${t};
    ${c}
  }

  .pagedjs_pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 0;
    zoom: var(--pagedly-page-scale, 1);
  }

  .pagedjs_page {
    width: ${sa}px;
    height: ${Cu}px;
    background: ${a};
    color: ${i};
    border: 1px solid ${s};
    border-radius: 4px;
    box-shadow: ${l};
    margin: 0 !important;
    font-family: ${n};
    font-size: ${r};
    line-height: ${o};
  }

  .pagedjs_page_content {
    overflow: visible;
  }

  .pagedly-source-root {
    outline: none;
    min-height: 1px;
    overflow-wrap: anywhere;
  }

  .pagedly-source-root p { margin: 0 0 8pt; }
  .pagedly-source-root h1,
  .pagedly-source-root h2,
  .pagedly-source-root h3,
  .pagedly-source-root h4 {
    margin: 14pt 0 6pt;
    line-height: 1.25;
  }
  .pagedly-source-root h1 { font-size: 18pt; }
  .pagedly-source-root h2 { font-size: 14pt; }
  .pagedly-source-root h3 { font-size: 12pt; }
  .pagedly-source-root ul { list-style: disc; padding-left: 1.5em; margin: 6pt 0; }
  .pagedly-source-root ol { list-style: decimal; padding-left: 1.5em; margin: 6pt 0; }
  .pagedly-source-root li { margin: 2pt 0; overflow-wrap: anywhere; }
  .pagedly-source-root blockquote {
    border-left: 2px solid #d1d5db;
    margin: 8pt 0;
    padding-left: 10pt;
    color: #4b5563;
  }
  .pagedly-source-root table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 8pt 0;
  }
  .pagedly-source-root th,
  .pagedly-source-root td {
    border: 1px solid #d1d5db;
    padding: 4pt 7pt;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .pagedly-source-root img {
    max-width: 100%;
    max-height: ${xu - 24}px;
    height: auto;
    object-fit: contain;
    border-radius: 3px;
    margin: 6pt 0;
  }
  /*
   * Break-inside rules are scoped to the elements paged.js actually
   * lays out (its rendered .pagedjs_page wrapper around .letter-body).
   * Applying them to .pagedly-source-root at the source level was wrong:
   * it also constrained the .letter-body container itself, leaving
   * paged.js with no way to split content across pages.
   * Match HRLETTER's proven selectors: direct children of .letter-body
   * inside a rendered page, excluding hidden section anchors.
   */
  .pagedjs_page .letter-body > p,
  .pagedjs_page .letter-body > h1,
  .pagedjs_page .letter-body > h2,
  .pagedjs_page .letter-body > h3,
  .pagedjs_page .letter-body > h4,
  .pagedjs_page .letter-body > div:not([data-section-anchor]),
  .pagedjs_page .letter-body > blockquote,
  .pagedjs_page .letter-body table,
  .pagedjs_page .letter-body figure,
  .pagedjs_page .letter-body img,
  .pagedjs_page .letter-body li {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Headings should stick with the next paragraph rather than being split. */
  .pagedjs_page .letter-body > h1,
  .pagedjs_page .letter-body > h2,
  .pagedjs_page .letter-body > h3,
  .pagedjs_page .letter-body > h4 {
    break-after: avoid;
    page-break-after: avoid;
  }

  .pagedly-source-root hr.letter-rule {
    border: none;
    border-top: 1px solid #d1d5db;
    margin: 14pt 0;
  }

  .pagedly-source-root .letterhead {
    margin-bottom: 18pt;
    text-align: center;
  }
  .pagedly-source-root .letterhead img {
    max-width: 100%;
    max-height: 120px;
  }

  .pagedly-source-root .signature-image {
    margin: 6pt 0;
  }
  .pagedly-source-root .signature-image img {
    max-height: 54px;
  }

  .pagedly-source-root .attachment-ref {
    color: #4b5563;
    font-style: italic;
  }

  .pagedly-source-root .attachments-section {
    margin-top: 18pt;
  }
  .pagedly-source-root .attachments-section h2 {
    padding-bottom: 4pt;
    border-bottom: 1px solid #d1d5db;
    margin-bottom: 8pt;
  }
  .pagedly-source-root .attachments-list {
    list-style: decimal;
    padding-left: 1.2em;
  }
  .pagedly-source-root .attachments-list .att-num {
    margin-left: 6pt;
    color: #6b7280;
    font-size: 9pt;
  }

  .pagedly-source-root .page-break-before {
    break-before: page;
    page-break-before: always;
  }

  @media (max-width: 640px) {
    .pagedjs_pages { gap: 18px; }
    .pagedjs_page {
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.10), 0 18px 44px rgba(15, 23, 42, 0.14);
    }
  }
`;
}
function jy(e = {}) {
  return Yb({
    fontFamily: e.fontFamily ?? '"Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: e.fontSize ?? "11pt",
    lineHeight: e.lineHeight ?? 1.55,
    textColor: e.textColor ?? "#0f172a",
    pageBackground: e.pageBackground ?? "#ffffff",
    pageBorderColor: e.pageBorderColor ?? "#e2e8f0",
    pageShadow: e.pageShadow ?? "0 2px 8px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06)",
    margin: e.margin ?? "1in 1.1in 1.2in 1.1in",
    showPageNumbers: e.showPageNumbers
  });
}
function Uy(e, t = {}) {
  if (typeof document > "u") return e;
  const n = new DOMParser().parseFromString(e, "text/html");
  Jb(n.body), Eu(n.body);
  const r = n.body.innerHTML || e, i = (t.sanitizeHtml ?? Zb)(r), s = new DOMParser().parseFromString(`<div>${i}</div>`, "text/html").body.firstElementChild;
  if (!s) return "";
  for (const l of Array.from(s.querySelectorAll("*")))
    ry(l);
  return oy(s), ly(t.plainText, s) ? Qb(t.plainText ?? "") : s.innerHTML;
}
function Qb(e) {
  return e ? /[\r\n]/.test(e) ? e.split(/\r\n|\r|\n/).map((n) => n.replace(/^[ \t]+|[ \t]+$/g, "")).filter(Boolean).map((n) => `<p>${po(n)}</p>`).join("") : po(e) : "";
}
function Zb(e) {
  return typeof window > "u" ? e : Pi.sanitize(e, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "sub",
      "sup",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "span",
      "div",
      "img",
      "figure",
      "figcaption",
      "section",
      "header",
      "footer",
      "template"
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "colspan",
      "rowspan",
      "src",
      "alt",
      "title",
      "width",
      "height",
      "class",
      "style",
      "data-generated-chrome"
    ],
    ALLOW_DATA_ATTR: !1,
    KEEP_CONTENT: !0,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/(?!\/)|blob:|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i
  });
}
function Jb(e) {
  var o;
  const t = document.createTreeWalker(e, NodeFilter.SHOW_COMMENT), n = [];
  let r = t.nextNode();
  for (; r; )
    n.push(r), r = t.nextNode();
  for (const i of n) (o = i.parentNode) == null || o.removeChild(i);
  for (const i of ["style", "meta", "link", "script", "xml"])
    for (const a of Array.from(e.querySelectorAll(i))) a.remove();
  for (const i of Array.from(e.querySelectorAll("*")))
    i.tagName.toLowerCase().includes(":") && i.replaceWith(...Array.from(i.childNodes));
}
function Eu(e) {
  for (const r of Array.from(e.children))
    Eu(r);
  let t = null, n = null;
  for (const r of Array.from(e.childNodes)) {
    if (r.nodeType !== Node.ELEMENT_NODE || !ey(r)) {
      t = null, n = null;
      continue;
    }
    const o = r, i = ty(o);
    (!t || n !== i) && (t = document.createElement(i), n = i, e.insertBefore(t, o));
    const a = document.createElement("li");
    a.innerHTML = ny(o), t.appendChild(a), o.remove();
  }
}
function ey(e) {
  if (!["P", "DIV"].includes(e.tagName)) return !1;
  const t = e.getAttribute("class") ?? "", n = e.getAttribute("style") ?? "";
  return /MsoListParagraph/i.test(t) || /mso-list\s*:/i.test(n);
}
function ty(e) {
  const t = (e.textContent ?? "").trim();
  return /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]\s+/i.test(t) ? "ol" : "ul";
}
function ny(e) {
  const t = (e.textContent ?? "").replace(/^\s*(?:[\u2022\u00b7\u25cf\u25cb\u25aa\-\*o]|\d+|[a-z]|[ivxlcdm]+)[.)]?\s+/i, "").trim();
  return po(t);
}
function ry(e) {
  const t = e.tagName, n = /* @__PURE__ */ new Set(), r = dy(e.getAttribute("style") ?? "");
  t === "A" ? (n.add("href"), n.add("target"), n.add("rel")) : t === "IMG" ? (n.add("src"), n.add("alt"), n.add("title"), n.add("width"), n.add("height")) : (t === "TD" || t === "TH") && (n.add("colspan"), n.add("rowspan")), r && /^(P|DIV|H1|H2|H3|H4|LI|TD|TH)$/.test(t) && n.add("style");
  for (const o of Array.from(e.attributes))
    n.has(o.name) || e.removeAttribute(o.name);
  r && e.setAttribute("style", `text-align: ${r};`);
}
function oy(e) {
  Tu(e), Nu(e), hu(e), sy(e);
}
function Tu(e) {
  for (const t of Array.from(e.children))
    Tu(t);
  for (const t of Array.from(e.children)) {
    if (!/^(P|DIV)$/.test(t.tagName) || t.querySelector("table, ul, ol, li, blockquote, img, figure")) continue;
    const n = iy(t);
    if (!(n.length <= 1)) {
      for (const r of n) {
        const o = e.ownerDocument.createElement(t.tagName.toLowerCase());
        for (const i of Array.from(t.attributes))
          o.setAttribute(i.name, i.value);
        o.innerHTML = r, e.insertBefore(o, t);
      }
      t.remove();
    }
  }
}
function iy(e) {
  const t = [];
  let n = [], r = !1;
  const o = () => {
    const i = n.join("").trim();
    i && t.push(i), n = [], r = !1;
  };
  for (const i of Array.from(e.childNodes)) {
    if (i instanceof HTMLBRElement) {
      r ? o() : r = !0;
      continue;
    }
    r && (n.push("<br>"), r = !1), n.push(ay(i));
  }
  return o(), t;
}
function ay(e) {
  return e.nodeType === Node.TEXT_NODE ? po(e.textContent ?? "") : e.nodeType === Node.ELEMENT_NODE ? e.outerHTML : "";
}
function Nu(e) {
  for (const t of Array.from(e.children))
    Nu(t);
  for (const t of Array.from(e.children)) {
    if (t.tagName !== "DIV" || t.querySelector("p, h1, h2, h3, h4, ul, ol, table, blockquote, figure, section, header, footer"))
      continue;
    const n = e.ownerDocument.createElement("p");
    for (const r of Array.from(t.attributes)) n.setAttribute(r.name, r.value);
    n.innerHTML = t.innerHTML, t.replaceWith(n);
  }
}
function sy(e) {
  for (const t of Array.from(e.children))
    /^(P|DIV)$/.test(t.tagName) && ((t.textContent ?? "").trim() || t.querySelector("img, br, hr, table") || t.remove());
}
function ly(e, t) {
  return !e || !/[\r\n]/.test(e) || t.querySelector("table, ul, ol, li, img, figure") ? !1 : Ks(cy(t)) === Ks(e);
}
function Ks(e) {
  return e.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function cy(e) {
  return Array.from(e.childNodes).map(Su).join("");
}
function Su(e) {
  if (e.nodeType === Node.TEXT_NODE) return e.textContent ?? "";
  if (!(e instanceof HTMLElement)) return "";
  if (e instanceof HTMLBRElement) return `
`;
  const t = Array.from(e.childNodes).map(Su).join("");
  return uy(e) ? `${t}
` : t;
}
function uy(e) {
  return /^(P|DIV|H1|H2|H3|H4|BLOCKQUOTE|LI|TABLE|UL|OL|SECTION|ARTICLE|HEADER|FOOTER)$/.test(e.tagName);
}
function dy(e) {
  var n;
  const t = /text-align\s*:\s*(left|center|right|justify)\b/i.exec(e);
  return ((n = t == null ? void 0 : t[1]) == null ? void 0 : n.toLowerCase()) ?? "";
}
function po(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fy(e) {
  return e.nodeType !== Node.ELEMENT_NODE ? !1 : ["BR", "IMG", "HR"].includes(e.tagName);
}
const Gs = "data-pagedly-editable-root-ref";
let py = 0;
const my = xu - 24;
function qy(e, t = {}) {
  if (typeof document > "u") return e;
  const r = new DOMParser().parseFromString(`<div>${e}</div>`, "text/html").body.firstElementChild;
  if (!r) return e;
  const o = {
    maxBlockHeightPx: t.maxBlockHeightPx ?? my,
    contentWidthPx: t.contentWidthPx ?? Gb,
    maxHardTextChunkChars: t.maxHardTextChunkChars ?? 500,
    tableCellChunkChars: t.tableCellChunkChars ?? 650,
    editableRootSelector: t.editableRootSelector ?? ""
  };
  gy(r, o.editableRootSelector);
  const i = hy(o.contentWidthPx);
  try {
    return ku(r, o.maxBlockHeightPx), Au(r, i, o), r.innerHTML;
  } finally {
    i.remove();
  }
}
function gy(e, t) {
  if (!t) return;
  let n = [];
  try {
    n = Array.from(e.querySelectorAll(t)).filter(
      (r) => {
        var o;
        return !((o = r.parentElement) != null && o.closest(t));
      }
    );
  } catch {
    return;
  }
  for (const r of n)
    r.hasAttribute(Gs) || r.setAttribute(Gs, String(py++));
}
function Au(e, t, n) {
  for (const r of Array.from(e.children)) {
    if (ku(r, n.maxBlockHeightPx), yy(r)) {
      ii(r, Cy(r, t, n));
      continue;
    }
    if (r.tagName === "TABLE") {
      ii(r, xy(r, t, n));
      continue;
    }
    Au(r, t, n), wy(r) && nr(r, t) > n.maxBlockHeightPx && ii(r, Ru(r, t, n));
  }
}
function hy(e) {
  const t = document.createElement("div");
  return Object.assign(t.style, {
    position: "absolute",
    left: "-100000px",
    top: "0",
    width: `${e}px`,
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "visible",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: "11pt",
    lineHeight: "1.55",
    color: "#111827"
  }), document.body.appendChild(t), t;
}
function nr(e, t) {
  t.replaceChildren(document.importNode(e, !0));
  const n = t.firstElementChild;
  return (n == null ? void 0 : n.getBoundingClientRect().height) ?? 0;
}
function ii(e, t) {
  if (t.length === 0) {
    e.remove();
    return;
  }
  e.replaceWith(...t);
}
function ku(e, t) {
  const n = e.tagName === "IMG" ? [e] : Array.from(e.querySelectorAll("img"));
  for (const r of n)
    by(r, {
      "max-width": "100%",
      "max-height": `${t}px`,
      height: "auto",
      "object-fit": "contain"
    });
}
function by(e, t) {
  var o;
  const n = (o = e.getAttribute("style")) == null ? void 0 : o.trim(), r = Object.entries(t).map(([i, a]) => `${i}: ${a};`).join(" ");
  e.setAttribute("style", [n, r].filter(Boolean).join(" "));
}
function yy(e) {
  return e.tagName === "UL" || e.tagName === "OL";
}
function wy(e) {
  return ["P", "DIV", "BLOCKQUOTE", "LI"].includes(e.tagName) && !!ca(e.textContent ?? "");
}
function Ru(e, t, n) {
  if (!ca(e.textContent ?? "")) return [e];
  const r = vy(e, t, n);
  return r.length <= 1 ? [e] : r;
}
function vy(e, t, n) {
  const r = _u(e.textContent ?? "");
  if (r.length === 0) return [e];
  const o = [];
  let i = 0;
  for (; i < r.length; ) {
    let a = 1, s = r.length - i, l = 1;
    for (; a <= s; ) {
      const f = Math.floor((a + s) / 2), p = Ys(r, i, f), h = ai(e, p.start, p.end);
      nr(h, t) <= n.maxBlockHeightPx ? (l = f, a = f + 1) : s = f - 1;
    }
    const c = Ys(r, i, l);
    if (l === 1 && c.end - c.start > n.maxHardTextChunkChars)
      for (const f of Lu(
        c.start,
        c.end,
        n.maxHardTextChunkChars
      ))
        o.push(ai(e, f.start, f.end));
    else
      o.push(ai(e, c.start, c.end));
    i += l;
  }
  return o;
}
function _u(e) {
  const t = [], n = /\S+/g;
  let r = n.exec(e);
  for (; r; )
    t.push({ start: r.index, end: r.index + r[0].length }), r = n.exec(e);
  return t;
}
function Ys(e, t, n) {
  const r = e[t], o = e[t + n - 1] ?? r;
  return { start: r.start, end: o.end };
}
function Lu(e, t, n) {
  const r = [];
  for (let o = e; o < t; o += n)
    r.push({ start: o, end: Math.min(o + n, t) });
  return r;
}
function ai(e, t, n) {
  const r = e.cloneNode(!1);
  return r.removeAttribute("data-pagedly-ref"), r.appendChild(Pu(e, t, n)), r;
}
function Pu(e, t, n) {
  const r = e.ownerDocument.createDocumentFragment(), o = e.ownerDocument.createTreeWalker(
    e,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  );
  let i = 0, a = o.nextNode();
  for (; a; ) {
    if (a.nodeType === Node.TEXT_NODE) {
      const s = a.textContent ?? "", l = i, c = i + s.length, f = Math.max(t, l), p = Math.min(n, c);
      if (f < p) {
        const h = e.ownerDocument.createTextNode(
          s.slice(f - l, p - l)
        );
        Qs(r, e, a, h);
      }
      i = c;
    } else fy(a) && i >= t && i <= n && Qs(r, e, a, a.cloneNode(!0));
    if (i >= n) break;
    a = o.nextNode();
  }
  return r;
}
function Qs(e, t, n, r) {
  let o = r, i = n.parentElement;
  for (; i && i !== t; ) {
    const a = i.cloneNode(!1);
    a.removeAttribute("data-pagedly-ref"), a.appendChild(o), o = a, i = i.parentElement;
  }
  e.appendChild(o);
}
function Cy(e, t, n) {
  const r = e.ownerDocument, o = Array.from(e.children).filter((l) => l.tagName === "LI").flatMap(
    (l) => nr(l, t) > n.maxBlockHeightPx ? Ru(l, t, n) : [l.cloneNode(!0)]
  );
  if (o.length === 0) return [e];
  const i = [];
  let a = Number(e.getAttribute("start") || "1"), s = Zs(e, r, a);
  for (const l of o)
    if (s.appendChild(l.cloneNode(!0)), nr(s, t) > n.maxBlockHeightPx && s.children.length > 1) {
      const c = s.lastElementChild;
      c && s.removeChild(c), i.push(s), a += s.children.length, s = Zs(e, r, a), c && s.appendChild(c);
    }
  return s.children.length > 0 && i.push(s), i;
}
function Zs(e, t, n) {
  const r = t.createElement(e.tagName.toLowerCase());
  return la(e, r), r.removeAttribute("data-pagedly-ref"), e.tagName === "OL" && n > 1 && r.setAttribute("start", String(n)), r;
}
function xy(e, t, n) {
  const r = Ey(e).flatMap(
    (a) => Ty(a, t, n)
  );
  if (r.length === 0) return [e];
  const o = [];
  let i = Js(e);
  for (const a of r)
    if (el(i, a.cloneNode(!0)), nr(i, t) > n.maxBlockHeightPx && tl(i) > 1) {
      const s = i.querySelector("tbody"), l = s == null ? void 0 : s.lastElementChild;
      l && (s == null || s.removeChild(l)), o.push(i), i = Js(e), l && el(i, l);
    }
  return tl(i) > 0 && o.push(i), o;
}
function Ey(e) {
  const t = Array.from(e.querySelectorAll("tbody > tr"));
  return t.length > 0 ? t : Array.from(e.children).filter(
    (n) => n.tagName === "TR"
  );
}
function Ty(e, t, n) {
  var s;
  if (nr(ky(e), t) <= n.maxBlockHeightPx)
    return [e.cloneNode(!0)];
  const r = Array.from(e.children).filter(
    (l) => l.tagName === "TD" || l.tagName === "TH"
  ), o = r.map((l) => Ny(l, n.tableCellChunkChars)), i = Math.max(...o.map((l) => l.length), 1), a = [];
  for (let l = 0; l < i; l++) {
    const c = e.ownerDocument.createElement("tr");
    la(e, c), c.removeAttribute("data-pagedly-ref");
    for (let f = 0; f < r.length; f++) {
      const p = r[f], h = p.cloneNode(!1), v = ((s = o[f]) == null ? void 0 : s[l]) ?? p.ownerDocument.createDocumentFragment();
      h.appendChild(v), c.appendChild(h);
    }
    a.push(c);
  }
  return a;
}
function Ny(e, t) {
  const n = e.textContent ?? "";
  return ca(n) ? Ay(n, t).map((o) => Pu(e, o.start, o.end)) : [Sy(e)];
}
function Sy(e) {
  const t = e.ownerDocument.createDocumentFragment();
  for (const n of Array.from(e.childNodes))
    t.appendChild(n.cloneNode(!0));
  return t;
}
function Ay(e, t) {
  const n = _u(e);
  if (n.length === 0) return [{ start: 0, end: e.length }];
  const r = [];
  let o = n[0].start, i = o;
  for (const a of n) {
    if (a.end - a.start > t) {
      i > o && r.push({ start: o, end: i }), r.push(...Lu(a.start, a.end, t)), o = a.end, i = a.end;
      continue;
    }
    i === o && (o = a.start), a.end - o > t && i > o && (r.push({ start: o, end: i }), o = a.start), i = a.end;
  }
  return i > o && r.push({ start: o, end: i }), r;
}
function Js(e) {
  const t = e.ownerDocument.createElement("table");
  la(e, t), t.removeAttribute("data-pagedly-ref");
  for (const n of [":scope > caption", ":scope > colgroup", ":scope > thead"]) {
    const r = e.querySelector(n);
    r && t.appendChild(r.cloneNode(!0));
  }
  return t.appendChild(e.ownerDocument.createElement("tbody")), t;
}
function el(e, t) {
  let n = e.querySelector("tbody");
  n || (n = e.ownerDocument.createElement("tbody"), e.appendChild(n)), n.appendChild(t);
}
function tl(e) {
  return e.querySelectorAll("tbody > tr").length;
}
function ky(e) {
  const t = e.ownerDocument.createElement("table"), n = e.ownerDocument.createElement("tbody");
  return n.appendChild(e.cloneNode(!0)), t.appendChild(n), t;
}
function la(e, t) {
  for (const n of Array.from(e.attributes))
    n.name !== "data-pagedly-ref" && t.setAttribute(n.name, n.value);
}
function ca(e) {
  return e.replace(/\s+/g, " ").trim();
}
const Ry = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikeThrough",
  inlineCode: "toggleInlineCode"
}, _y = {
  bullet: "insertUnorderedList",
  numbered: "insertOrderedList",
  checklist: "insertChecklist",
  quote: "toggleBlockquote",
  code: "formatCodeBlock"
}, Ly = {
  left: "justifyLeft",
  center: "justifyCenter",
  right: "justifyRight",
  justify: "justifyFull"
}, Py = (e) => e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), My = (e) => {
  if (typeof document < "u") {
    const t = document.createElement("div");
    return t.innerHTML = e, (t.textContent ?? "").replace(/​/g, "");
  }
  return e.replace(/<[^>]+>/g, " ").replace(/​/g, "").replace(/\s+/g, " ").trim();
};
function Vy(e) {
  return {
    getHtml: () => e.flush(),
    getText: async () => My(await e.flush()),
    getMarkdown: async () => Ri(await e.flush()),
    // The agent facade is the LLM/MCP entry point — every HTML-bearing call is
    // untrusted and goes through sanitizeEditorHtml before reaching the engine's
    // execCommand("insertHTML") / innerHTML sinks. Trusted-internal callers of
    // the same handle methods (slash menu, engine self-insertions) are untouched.
    insertMarkdown: (t) => e.insertHtml(pn(uu(t))),
    getState: () => e.getState(),
    subscribe: (t) => e.subscribe(t),
    insertHtml: (t) => e.insertHtml(pn(t)),
    setHtml: (t) => {
      var n;
      return (n = e.setHtml) == null ? void 0 : n.call(e, pn(t));
    },
    getBlocks: () => {
      var t;
      return ((t = e.getBlocks) == null ? void 0 : t.call(e)) ?? [];
    },
    replaceBlock: (t, n) => {
      var r;
      return ((r = e.replaceBlock) == null ? void 0 : r.call(e, t, pn(n))) ?? !1;
    },
    insertText: (t) => e.insertHtml(Py(t)),
    insertImage: (t, n) => e.insertImage(t, n),
    setMark: (t) => e.runCommand(Ry[t]),
    setBlock: (t) => e.runCommand("formatBlock", t),
    toggleBlock: (t) => e.runCommand(_y[t]),
    align: (t) => e.runCommand(Ly[t]),
    insertTable: (t, n, r = !0) => e.runCommand("insertTable", JSON.stringify({ rows: t, cols: n, header: r })),
    undo: () => e.undo(),
    redo: () => e.redo(),
    selectAll: () => e.selectAll(),
    focus: () => e.focus(),
    reflow: () => e.reflow(),
    run: (t, n) => e.runCommand(t, n)
  };
}
const Xy = [
  { name: "get_html", description: "Return the document's current HTML.", parameters: { type: "object", properties: {} } },
  { name: "get_text", description: "Return the document's current plain text.", parameters: { type: "object", properties: {} } },
  { name: "get_markdown", description: "Return the document as Markdown.", parameters: { type: "object", properties: {} } },
  { name: "get_blocks", description: "List top-level blocks with stable ids (pid, tag, text).", parameters: { type: "object", properties: {} } },
  { name: "replace_block", description: "Replace a block's content by its pid.", parameters: { type: "object", properties: { pid: { type: "string" }, html: { type: "string" } }, required: ["pid", "html"] } },
  { name: "insert_markdown", description: "Insert content from a Markdown string at the caret.", parameters: { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"] } },
  { name: "insert_html", description: "Insert raw HTML at the caret.", parameters: { type: "object", properties: { html: { type: "string" } }, required: ["html"] } },
  { name: "insert_text", description: "Insert plain text at the caret.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "insert_image", description: "Insert an image by URL or data URL.", parameters: { type: "object", properties: { src: { type: "string" }, alt: { type: "string" } }, required: ["src"] } },
  { name: "set_mark", description: "Toggle an inline mark on the selection.", parameters: { type: "object", properties: { mark: { type: "string", enum: ["bold", "italic", "underline", "strikethrough", "inlineCode"] } }, required: ["mark"] } },
  { name: "set_block", description: "Set the current block type.", parameters: { type: "object", properties: { block: { type: "string", enum: ["p", "h1", "h2", "h3", "h4", "h5", "h6"] } }, required: ["block"] } },
  { name: "toggle_block", description: "Toggle a list or structural block.", parameters: { type: "object", properties: { kind: { type: "string", enum: ["bullet", "numbered", "checklist", "quote", "code"] } }, required: ["kind"] } },
  { name: "align", description: "Set paragraph alignment.", parameters: { type: "object", properties: { dir: { type: "string", enum: ["left", "center", "right", "justify"] } }, required: ["dir"] } },
  { name: "insert_table", description: "Insert a table.", parameters: { type: "object", properties: { rows: { type: "number" }, cols: { type: "number" }, header: { type: "boolean" } }, required: ["rows", "cols"] } },
  { name: "undo", description: "Undo the last edit.", parameters: { type: "object", properties: {} } },
  { name: "redo", description: "Redo the last undone edit.", parameters: { type: "object", properties: {} } }
];
async function Ky(e, t, n = {}) {
  switch (t) {
    case "get_html":
      return e.getHtml();
    case "get_text":
      return e.getText();
    case "get_markdown":
      return e.getMarkdown();
    case "get_blocks":
      return e.getBlocks();
    case "replace_block":
      return e.replaceBlock(String(n.pid ?? ""), String(n.html ?? ""));
    case "insert_markdown":
      return e.insertMarkdown(String(n.markdown ?? ""));
    case "insert_html":
      return e.insertHtml(String(n.html ?? ""));
    case "insert_text":
      return e.insertText(String(n.text ?? ""));
    case "insert_image":
      return e.insertImage(String(n.src ?? ""), n.alt ? String(n.alt) : void 0);
    case "set_mark":
      return e.setMark(n.mark);
    case "set_block":
      return e.setBlock(n.block);
    case "toggle_block":
      return e.toggleBlock(n.kind);
    case "align":
      return e.align(n.dir);
    case "insert_table":
      return e.insertTable(Number(n.rows), Number(n.cols), n.header);
    case "undo":
      return e.undo();
    case "redo":
      return e.redo();
    default:
      throw new Error(`Unknown editor tool: ${t}`);
  }
}
export {
  Xg as ContentEditableEditor,
  uo as DEFAULT_FEATURES,
  Xy as EDITOR_AGENT_TOOLS,
  mb as Editor,
  Hy as FEATURES_FULL,
  Fy as FEATURES_MINIMAL,
  zy as LetterEditor,
  ig as Toolbar,
  Wy as calculatePageScale,
  Yb as createA4PrintCss,
  Vy as createEditorAgent,
  jy as createPagedLetterPrintCss,
  rb as docxToHtml,
  Ah as downloadDocx,
  Sh as htmlToDocx,
  Ri as htmlToMarkdown,
  Ky as invokeEditorTool,
  uu as markdownToHtml,
  Kg as resolveFeatures,
  On as safeUrl,
  pn as sanitizeEditorHtml,
  Uy as sanitizePastedHtml,
  qy as splitOversizedHtml
};
//# sourceMappingURL=pagedly.js.map
