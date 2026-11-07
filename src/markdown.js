// Minimal Markdown → HTML. Escapes input first, so output is safe for innerHTML.
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = s => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  .replace(/`([^`]+)`/g, "<code>$1</code>");

export function md(src = "") {
  const out = []; let para = [], list = null, quote = [];
  const fp = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const fl = () => { if (list) out.push(`<${list.t}>${list.i.map(x => `<li>${inline(x)}</li>`).join("")}</${list.t}>`); list = null; };
  const fq = () => { if (quote.length) out.push(`<blockquote>${md(quote.join("\n"))}</blockquote>`); quote = []; };
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd(); let m;
    if (/^\s*>\s?/.test(l)) { fp(); fl(); quote.push(l.replace(/^\s*>\s?/, "")); continue; }
    fq();
    if (!l.trim()) { fp(); fl(); continue; }
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { fp(); fl(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = l.match(/^\s*[-*]\s+(.*)/))) { fp(); if (list?.t !== "ul") { fl(); list = { t: "ul", i: [] }; } list.i.push(m[1]); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { fp(); if (list?.t !== "ol") { fl(); list = { t: "ol", i: [] }; } list.i.push(m[1]); continue; }
    fl(); para.push(l.trim());
  }
  fp(); fl(); fq();
  return out.join("");
}
