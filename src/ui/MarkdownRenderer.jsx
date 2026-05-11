// Minimal markdown renderer for Gemini responses.
//
// Supports:
//   * bullet lists (lines starting with '*', '-', or '•')
//   * inline bold via **double-asterisks**
//   * paragraphs
//
// Anything more (tables, code blocks, links) we'd take a real renderer for,
// but Gemini's "concise bullet summary" outputs only need these primitives.

import { useMemo } from 'react';

export function MarkdownRenderer({ content }) {
  const rendered = useMemo(() => {
    if (!content) return null;
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    const elements = [];
    let listItems = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 space-y-1 mb-3">
            {listItems}
          </ul>,
        );
        listItems = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const isItem = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');

      if (isItem) {
        const itemContent = trimmed.substring(2);
        const parts = itemContent.split(/(\*\*.*?\*\*)/g);
        listItems.push(
          <li key={index}>
            {parts.map((part, i) =>
              part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
            )}
          </li>,
        );
      } else {
        flushList();
        const parts = line.split(/(\*\*.*?\*\*)/g);
        elements.push(
          <p key={index} className="mb-3">
            {parts.map((part, i) =>
              part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
            )}
          </p>,
        );
      }
    });

    flushList();
    return elements;
  }, [content]);

  return <div>{rendered}</div>;
}

export default MarkdownRenderer;
