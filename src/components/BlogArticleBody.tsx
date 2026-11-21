import { Fragment, type ReactNode } from "react";
import { isSafeHref, type BlogSection } from "@/lib/milo/markdown";

// Inline markup is limited to [label](href) and **bold**; everything else is React-escaped text.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] === undefined) {
      out.push(<strong key={key++}>{m[3]}</strong>);
    } else if (!isSafeHref(m[2])) {
      out.push(m[1]); // unsafe schemes render as plain text
    } else {
      const external = /^https?:\/\//.test(m[2]) && !m[2].includes("milogrowth.com");
      out.push(
        <a
          key={key++}
          href={m[2]}
          className="underline underline-offset-2 hover:text-primary"
          {...(external ? { rel: "noopener", target: "_blank" } : {})}
        >
          {m[1]}
        </a>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Section({ section }: { section: BlogSection }) {
  switch (section.type) {
    case "p":
      return (
        <p className="my-4 leading-relaxed text-foreground/85">{renderInline(section.text)}</p>
      );
    case "h2":
      return <h2 className="mt-10 mb-3 font-display text-2xl">{section.text}</h2>;
    case "h3":
      return <h3 className="mt-7 mb-2 font-display text-xl">{section.text}</h3>;
    case "ul":
    case "ol": {
      const List = section.type;
      return (
        <List
          className={`my-4 space-y-1.5 pl-6 text-foreground/85 ${section.type === "ul" ? "list-disc" : "list-decimal"}`}
        >
          {section.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="my-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left">
                {section.headers.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0 align-top">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote className="my-6 border-l-2 border-border pl-4 italic text-muted-foreground">
          {renderInline(section.text)}
        </blockquote>
      );
    case "image":
      // src was validated (http(s) or site-relative) at intake and again on read.
      return (
        <figure className="my-6">
          <img
            src={section.src}
            alt={section.alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-auto w-full rounded-lg border border-border"
          />
          {section.caption ? (
            <figcaption className="mt-2 text-sm text-muted-foreground">
              {section.caption}
            </figcaption>
          ) : null}
        </figure>
      );
  }
}

export function BlogArticleBody({ sections }: { sections: BlogSection[] }) {
  return (
    <Fragment>
      {sections.map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </Fragment>
  );
}
