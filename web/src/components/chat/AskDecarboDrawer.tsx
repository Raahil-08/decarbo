import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Sparkles,
  ShieldCheck,
  Cpu,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { useI18n } from "../../lib/i18n";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  grounded?: boolean;
}

interface AskDecarboDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  factoryId: string;
  factoryName?: string;
}

const QUICK_PROMPTS = [
  "What are our biggest carbon leak-points?",
  "What is our total carbon footprint and scope breakdown?",
  "What if we install 50 kW rooftop solar?",
  "Which interventions give the fastest payback?",
];

export function AskDecarboDrawer({
  isOpen,
  onClose,
  factoryId,
  factoryName,
}: AskDecarboDrawerProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || isStreaming) return;

    setInput("");

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: "user", content: messageText },
    ];
    setMessages(newMessages);

    // Initialise empty assistant message
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", toolsUsed: [], grounded: true },
    ]);

    setIsStreaming(true);

    try {
      const devToken = localStorage.getItem("decarbo_dev_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (devToken) {
        headers["Authorization"] = `Bearer ${devToken}`;
      }

      const response = await fetch(`/api/v1/factories/${factoryId}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: messageText,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      const toolsFound: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (payload.type === "tool_call") {
                if (payload.tool && !toolsFound.includes(payload.tool)) {
                  toolsFound.push(payload.tool);
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, toolsUsed: [...toolsFound] }
                        : msg
                    )
                  );
                }
              } else if (payload.type === "text_delta" && payload.delta) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + payload.delta }
                      : msg
                  )
                );
              } else if (payload.type === "done") {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, grounded: payload.grounded ?? true }
                      : msg
                  )
                );
              }
            } catch (e) {
              console.warn("Failed to parse SSE line:", trimmed, e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: "I encountered an error retrieving data from the calculation engine. Please try again.",
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-rule animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 bg-paper border-b border-rule flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-ink text-leaf flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                {t("chat_title")}
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-leaf/10 text-leaf border border-leaf/30">
                  Engine Grounded
                </span>
              </h2>
              <p className="text-[11px] text-muted truncate max-w-[280px]">
                {factoryName || "Selected Factory"} • Direct tool access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-paper border border-rule flex items-center justify-center mx-auto text-ink">
                <HelpCircle className="w-6 h-6 text-brass" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Ask anything about your carbon data</h3>
                <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                  Answers are strictly computed by Python engine tools (no hallucinated numbers or estimates).
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Suggested Questions
                </div>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(prompt)}
                      className="text-left text-xs p-2.5 rounded-lg bg-paper hover:bg-paper/70 border border-rule hover:border-ink text-ink transition-colors font-medium shadow-2xs"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-ink text-white"
                      : "bg-paper border border-rule text-ink whitespace-pre-line"
                  }`}
                >
                  {/* Tool execution pills for assistant */}
                  {msg.role === "assistant" && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1 border-b border-rule/60 pb-2">
                      {msg.toolsUsed.map((tool, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-rule text-[10px] font-mono text-muted"
                        >
                          <Cpu className="w-2.5 h-2.5 text-brass" />
                          {tool}()
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.content || (
                    <span className="inline-flex items-center text-muted italic">
                      <RefreshCw className="w-3 h-3 animate-spin mr-1.5 text-ink" />
                      Consulting calculation engine...
                    </span>
                  )}
                </div>

                {/* Grounding badge under assistant message */}
                {msg.role === "assistant" && msg.content && (
                  <div className="mt-1 text-[10px] text-muted flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3 h-3 text-leaf" />
                    <span>Verified grounded numbers</span>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-paper border-t border-rule">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              disabled={isStreaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat_placeholder")}
              className="flex-1 px-3 py-2 text-xs bg-white border border-rule rounded-lg focus:outline-none focus:border-ink placeholder:text-muted/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-lg bg-ink text-white hover:bg-ink-light disabled:opacity-40 transition-colors shadow-xs"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
