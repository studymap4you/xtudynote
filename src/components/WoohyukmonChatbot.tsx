import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { requestWoohyukmonChat, type ChatMessage } from "@/lib/woohyukmonChat";
import styles from "@/components/WoohyukmonChatbot.module.css";

const ICON_SRC = "/assets/woohyukmon-icon.png";

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "안녕! 나는 우혁몬이야. 교재 제작, 영어 학습, 한국어 학습, 사이트 사용법을 도와줄게.\n\nHi! I'm Woohyukmon, your Xuniverse AI learning partner. I can help you create study materials, learn English, practice Korean, and use this site.",
};

function messageLabel(role: ChatMessage["role"]): string {
  return role === "user" ? "You" : "우혁몬";
}

export function WoohyukmonChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, isLoading, error]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const reply = await requestWoohyukmonChat(nextMessages);
      setMessages([...nextMessages, { role: "assistant", content: reply.content }]);
    } catch {
      setError("잠시 문제가 생겼어. 다시 시도해줘.\nSomething went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className={styles.root}>
      {isOpen ? (
        <section className={styles.panel} role="dialog" aria-label="우혁몬 AI 챗봇">
          <header className={styles.header}>
            <img className={styles.headerIcon} src={ICON_SRC} alt="" />
            <div className={styles.headerText}>
              <h2>우혁몬</h2>
              <p>Xuniverse 학습 도우미 AI</p>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="우혁몬 챗봇 닫기"
            >
              ×
            </button>
          </header>

          <div className={styles.messages} aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}
              >
                <span className={styles.messageRole}>{messageLabel(message.role)}</span>
                <p>{message.content}</p>
              </article>
            ))}

            {isLoading ? (
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <span className={styles.messageRole}>우혁몬</span>
                <p>우혁몬이 생각 중...{"\n"}Woohyukmon is thinking...</p>
              </div>
            ) : null}

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about textbooks, English, Korean, or how to use Xuniverse."
              rows={2}
              disabled={isLoading}
              aria-label="우혁몬에게 보낼 메시지"
            />
            <button type="submit" disabled={!canSend}>
              전송
            </button>
          </form>
        </section>
      ) : null}

      <div className={styles.launcherRow}>
        {!isOpen ? (
          <div className={styles.label} aria-hidden>
            <span>우혁몬에게 물어보기</span>
            <strong>Ask Woohyukmon</strong>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.launcher}
          onClick={() => setIsOpen((value) => !value)}
          aria-label={isOpen ? "우혁몬 챗봇 닫기" : "우혁몬 챗봇 열기"}
          aria-expanded={isOpen}
        >
          <img src={ICON_SRC} alt="" />
        </button>
      </div>
    </div>
  );
}
