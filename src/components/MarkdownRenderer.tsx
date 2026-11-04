import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="chatripe-markdown text-slate-800 text-[13px] leading-relaxed break-words space-y-2.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            if (!inline && (match || codeString.includes('\n'))) {
              return (
                <CodeBlock
                  language={match ? match[1] : ''}
                  code={codeString}
                />
              );
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-200/70 text-[#082b5c] font-mono text-[12px] font-semibold"
                {...props}
              >
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="leading-relaxed mb-2 last:mb-0">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="text-lg font-bold text-[#082b5c] mt-4 mb-2 pb-1 border-b border-slate-200">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold text-[#082b5c] mt-3 mb-1.5">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-semibold text-[#0a3d78] mt-2.5 mb-1">{children}</h3>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-3 border-[#69b7e6] pl-3 py-1 my-2 bg-sky-50/60 rounded-r text-slate-700 italic">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return <th className="px-3 py-2 bg-slate-100 font-semibold text-slate-700">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 border-t border-slate-100">{children}</td>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0a58ca] hover:underline font-medium inline-flex items-center gap-0.5"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

