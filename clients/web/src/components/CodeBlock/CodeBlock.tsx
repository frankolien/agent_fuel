import { useState, type ReactNode } from "react";

export type Lang = "ts" | "bash";

export function CodeBlock({ children, lang = "ts" }: { children: string; lang?: Lang }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable on insecure origins — ignore
    }
  };
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-[12px] border border-[var(--color-line)] bg-surface px-5 py-4 pr-16 font-mono text-[13px] leading-[1.65] text-fg-2">
        {highlight(children, lang)}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-2.5 right-2.5 rounded-full border border-[var(--color-line)] bg-surface px-2.5 py-1 font-mono text-[11px] text-muted opacity-0 transition hover:border-[var(--color-line-2)] hover:text-fg group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

const TS_KEYWORDS = new Set([
  "const", "let", "var", "await", "async", "import", "from", "new", "return",
  "if", "else", "function", "type", "interface", "export", "default", "true",
  "false", "null", "undefined", "for", "of", "in", "switch", "case", "break",
  "class", "extends", "implements", "public", "private", "protected",
  "readonly", "as", "try", "catch", "throw",
]);

const BASH_BUILTINS = new Set([
  "cd", "ls", "cat", "echo", "export", "curl", "git", "npm", "node", "cargo",
  "anchor", "solana", "kill", "mkdir", "rm", "cp", "mv", "grep", "sed", "awk",
  "pnpm", "yarn", "bun",
]);

type Tok = { cls: string; text: string };

function highlight(src: string, lang: Lang): ReactNode[] {
  const tokens = lang === "bash" ? tokenizeBash(src) : tokenizeTs(src);
  return tokens.map((t, i) =>
    t.cls ? (
      <span key={i} className={t.cls}>
        {t.text}
      </span>
    ) : (
      <span key={i}>{t.text}</span>
    ),
  );
}

function tokenizeTs(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const cm = rest.match(/^\/\/[^\n]*/);
    if (cm) {
      out.push({ cls: "text-muted-2", text: cm[0] });
      i += cm[0].length;
      continue;
    }
    const bcm = rest.match(/^\/\*[\s\S]*?\*\//);
    if (bcm) {
      out.push({ cls: "text-muted-2", text: bcm[0] });
      i += bcm[0].length;
      continue;
    }
    const tpl = rest.match(/^`(?:\\.|[^`\\])*`/);
    if (tpl) {
      out.push({ cls: "text-[var(--color-syntax-string)]", text: tpl[0] });
      i += tpl[0].length;
      continue;
    }
    const str = rest.match(/^(["'])(?:\\.|(?!\1)[^\\\n])*\1/);
    if (str) {
      out.push({ cls: "text-[var(--color-syntax-string)]", text: str[0] });
      i += str[0].length;
      continue;
    }
    const num = rest.match(/^\d[\d_]*(?:\.\d+)?/);
    if (num) {
      out.push({ cls: "text-fg", text: num[0] });
      i += num[0].length;
      continue;
    }
    const id = rest.match(/^[A-Za-z_$][\w$]*/);
    if (id) {
      const word = id[0];
      if (TS_KEYWORDS.has(word)) {
        out.push({ cls: "text-mint", text: word });
      } else if (/^\s*\(/.test(rest.slice(word.length))) {
        out.push({ cls: "text-[var(--color-syntax-fn)]", text: word });
      } else {
        out.push({ cls: "", text: word });
      }
      i += word.length;
      continue;
    }
    const ws = rest.match(/^\s+/);
    if (ws) {
      out.push({ cls: "", text: ws[0] });
      i += ws[0].length;
      continue;
    }
    out.push({ cls: "text-muted", text: rest.charAt(0) });
    i += 1;
  }
  return out;
}

function tokenizeBash(src: string): Tok[] {
  const out: Tok[] = [];
  const lines = src.split(/(\n)/);
  for (const line of lines) {
    if (line === "\n") {
      out.push({ cls: "", text: line });
      continue;
    }
    if (/^\s*#/.test(line)) {
      out.push({ cls: "text-muted-2", text: line });
      continue;
    }
    let i = 0;
    let sawFirstWord = false;
    while (i < line.length) {
      const rest = line.slice(i);
      const str = rest.match(/^(["'])(?:\\.|(?!\1)[^\\])*\1/);
      if (str) {
        out.push({ cls: "text-[var(--color-syntax-string)]", text: str[0] });
        i += str[0].length;
        continue;
      }
      const flag = rest.match(/^--?[\w-]+/);
      if (flag) {
        out.push({ cls: "text-mint-soft", text: flag[0] });
        i += flag[0].length;
        continue;
      }
      const word = rest.match(/^[A-Za-z_][\w./-]*/);
      if (word) {
        const w = word[0];
        if (!sawFirstWord && BASH_BUILTINS.has(w.split("/").pop() || w)) {
          out.push({ cls: "text-mint", text: w });
          sawFirstWord = true;
        } else {
          out.push({ cls: "", text: w });
          sawFirstWord = true;
        }
        i += w.length;
        continue;
      }
      const ws = rest.match(/^\s+/);
      if (ws) {
        out.push({ cls: "", text: ws[0] });
        i += ws[0].length;
        continue;
      }
      out.push({ cls: "text-muted", text: rest.charAt(0) });
      i += 1;
    }
  }
  return out;
}

/** Compact code block — same look as CodeBlock but inline (no copy button, no my-5). */
export function CodeBlockCompact({ children, lang = "ts" }: { children: string; lang?: Lang }) {
  return (
    <pre className="overflow-x-auto rounded-[10px] border border-[var(--color-line)] bg-surface px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-fg-2">
      {highlight(children, lang)}
    </pre>
  );
}
