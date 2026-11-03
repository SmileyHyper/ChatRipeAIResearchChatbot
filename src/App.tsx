import { FormEvent, useState } from "react"

type IconName = "arrow" | "book" | "chat" | "check" | "chevron" | "close" | "compass" | "document" | "extension" | "history" | "innovation" | "menu" | "paperclip" | "plus" | "research" | "settings" | "spark"

function Icon({ name, size = 20 }: { name: IconName size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11.5a8 8 0 0 1-8.5 8 9.4 9.4 0 0 1-4.2-1L3 20l1.5-4.5A8.4 8.4 0 0 1 4 12a8 8 0 0 1 8.5-8A8.2 8.2 0 0 1 21 11.5Z" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    chevron: (
      <>
        <path d="m9 18 6-6-6-6" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5z" />
      </>
    ),
    document: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h4M9 13h6M9 17h6" />
      </>
    ),
    extension: (
      <>
        <path d="M4 18V7l8-4 8 4v11l-8 4z" />
        <path d="m8 13 2.5 2.5L16 10M12 3v4" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    innovation: (
      <>
        <path d="M9 18h6M10 22h4" />
        <path d="M8.2 14.5A7 7 0 1 1 16 14.4c-.8.7-1 1.3-1 2.1H9c0-.8-.2-1.4-.8-2Z" />
        <path d="M12 2v2" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    paperclip: (
      <>
        <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    research: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7zM5 3l.7 2.3L8 6l-2.3.7L5 9l-.7-2.3L2 6l2.3-.7z" />
      </>
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

const history = [
  "Climate-smart farming review",
  "Journal abstract refinement",
  "Community outreach framework",
]

export default function App() {
  const [prompt, setPrompt] = useState("")
  const [activeNav, setActiveNav] = useState("Home")
  const [menuOpen, setMenuOpen] = useState(false)
  const [messages, setMessages] = useState<string[]>([])

  const sendPrompt = (event: FormEvent) => {
    event.preventDefault()
    const value = prompt.trim()
    if (!value) return
    setMessages((current) => [...current, value])
    setPrompt("")
  }

  return (
    <div className="app-shell">
      <button
        className="mobile-menu"
        onClick={() => setMenuOpen(true)}
        aria-label="Open navigation"
      >
        <Icon name="menu" />
      </button>

      {menuOpen && (
        <button
          className="scrim"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <img
              src="/assets/slsu-logo.png"
              alt="Southern Leyte State University seal"
            />
          </div>
          <div>
            <div className="brand-name">ChatRipe</div>
          
          </div>
          <button
            className="close-menu"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </button>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setMessages([])
            setPrompt("")
            setMenuOpen(false)
          }}
        >
          <Icon name="plus" size={18} />
          New conversation
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          {[
            ["Home", "compass"],
            ["Conversations", "chat"],
            ["Library", "document"],
          ].map(([label, icon]) => (
            <button
              className={activeNav === label ? "active" : ""}
              onClick={() => {
                setActiveNav(label)
                setMenuOpen(false)
              }}
              key={label}
            >
              <Icon name={icon as IconName} size={19} />
              {label}
            </button>
          ))}
        </nav>

        <div className="history-block">
          <div className="section-label">
            <span>Recent</span>
            <Icon name="history" size={15} />
          </div>
          {history.map((item) => (
            <button
              key={item}
              onClick={() => {
                setPrompt(`Continue our work on: ${item}`)
                setMenuOpen(false)
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button>
            <Icon name="settings" size={18} /> Settings
          </button>
          <div className="profile">
            <div className="avatar">AS</div>
            <div>
              <strong>Scholar</strong>
              <span>Researcher plan</span>
            </div>
            <Icon name="chevron" size={16} />
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <i>/</i>
            <strong>{activeNav}</strong>
          </div>
          <div className="agent-status">
            <span />
            <b>ChatRipe is ready</b>
          </div>
        </header>

        <div className="main-content">
          <section className="hero">
            <div className="eyebrow">
              <Icon name="spark" size={15} /> Your research partner
            </div>
            <h1>
              What will you <em>advance</em> today?
            </h1>
            <p>
              Move from inquiry to impact with an AI agent built for the full
              cycle of scholarly work.
            </p>
          </section>

          {messages.length > 0 && (
            <section className="conversation" aria-live="polite">
              <div className="user-message">
                {messages[messages.length - 1]}
              </div>
              <div className="agent-message">
                <div className="mini-mark">R</div>
                <div>
                  <strong>I'm ready to work through this with you.</strong>
                  <p>
                    I’ll break the task into clear steps, surface useful
                    evidence, and keep the outcome aligned with your goal.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="composer-section">
            <form className="composer" onSubmit={sendPrompt}>
              <label htmlFor="prompt">Ask ChatRipe anything</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Describe what you're working on, or ask a research question..."
                rows={2}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className="attach"
                  aria-label="Attach a file"
                >
                  <Icon name="paperclip" size={19} />
                </button>
                <span>
                  ChatRipe 1.0 <i>•</i> Agent mode
                </span>
                <button
                  type="submit"
                  className="send"
                  disabled={!prompt.trim()}
                  aria-label="Send message"
                >
                  <Icon name="arrow" size={19} />
                </button>
              </div>
            </form>
            <p className="disclaimer">
              ChatRipe can make mistakes. Review important research and citation
              details.
            </p>
          </section>

          <footer>
            <span>
              <Icon name="check" size={14} /> Built for responsible scholarship
            </span>
            <p>Research · Innovation · Publication · Extension</p>
          </footer>
        </div>
      </main>
    </div>
  )
}
