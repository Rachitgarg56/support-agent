import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

function citationPlugin(validIds: Set<string>, messageId: string) {
  return () => (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (!node.children || node.type === "link" || node.type === "linkReference") return;
      const children: MarkdownNode[] = [];

      for (const child of node.children) {
        if (child.type !== "text" || !child.value) {
          visit(child);
          children.push(child);
          continue;
        }

        let from = 0;
        for (const match of child.value.matchAll(/\[(\d+)\]/g)) {
          const id = match[1];
          if (!validIds.has(id)) continue;
          if (match.index > from) children.push({ type: "text", value: child.value.slice(from, match.index) });
          children.push({
            type: "link",
            url: `#source-${messageId}-${id}`,
            children: [{ type: "text", value: `[${id}]` }],
          });
          from = match.index + match[0].length;
        }
        if (from < child.value.length) children.push({ type: "text", value: child.value.slice(from) });
      }

      node.children = children;
    }

    visit(tree);
  };
}

export function AnswerContent({ text, messageId, citationIds }: { text: string; messageId: string; citationIds: string[] }) {
  const validIds = new Set(citationIds);
  return (
    <div className="answer-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, citationPlugin(validIds, messageId)]}
        components={{
          img({ alt }) {
            return <span>{alt || "Image omitted"}</span>;
          },
          a({ href, children }) {
            if (href?.startsWith(`#source-${messageId}-`)) {
              const id = href.slice(`#source-${messageId}-`.length);
              if (validIds.has(id)) return <a className="inline-citation" href={href} aria-label={`View source ${id}`} onClick={() => {
                const source = document.getElementById(`source-${messageId}-${id}`);
                if (source instanceof HTMLDetailsElement) source.open = true;
              }}>{children}</a>;
            }
            if (!href || !/^https?:\/\//i.test(href)) return <>{children}</>;
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
        }}
      >{text}</ReactMarkdown>
    </div>
  );
}
