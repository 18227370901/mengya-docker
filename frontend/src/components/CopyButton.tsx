import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export default function CopyButton({ text, className = "", label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(textarea);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition ${
        copied
          ? "bg-green-50 text-green-600"
          : "text-gray-400 hover:bg-gray-50 hover:text-brand-500"
      } ${className}`}
      title={copied ? "已复制" : "复制"}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          {label && "已复制"}
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label && label}
        </>
      )}
    </button>
  );
}
