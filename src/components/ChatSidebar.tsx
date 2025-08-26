import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: string;
  type: "user" | "assistant";
}

export interface ChatSidebarProps {
  /** Title displayed in the sidebar header */
  title?: string;
  /** Whether the sidebar is visible */
  isVisible?: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Callback when a message is sent */
  onSendMessage?: (message: string) => void;
  /** Custom width for the sidebar */
  width?: string | number;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Initial messages to display */
  initialMessages?: ChatMessage[];
  /** Custom response generator function */
  generateResponse?: (userMessage: string) => Promise<string>;
  /** Whether to show action buttons (copy/regenerate) */
  showActionButtons?: boolean;
  /** Custom CSS class for the sidebar container */
  className?: string;
}

export default function ChatSidebar({
  title = "Chat",
  isVisible = true,
  onClose,
  onSendMessage,
  width = 350,
  placeholder = "Type here...",
  initialMessages = [],
  generateResponse,
  showActionButtons = true,
  className = "",
}: ChatSidebarProps) {
  const [chatInput, setChatInput] = useState("");
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const scrollToBottom = () => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const defaultGenerateResponse = async (
    userMessage: string,
  ): Promise<string> => {
    // Default canned response - can be overridden via props
    return `
      <h3>Default Response</h3>
      <ul>
        <li><strong>You said:</strong> "${userMessage}"</li>
        <li>This is a default response. You can customize this by passing a generateResponse function.</li>
      </ul>
      <p class="text-xs mt-4">This response was generated automatically.</p>
    `;
  };

  const handleSendMessage = async () => {
    const userText = chatInput.trim();
    if (userText === "" || isLoading) return;

    // Call external callback if provided
    if (onSendMessage) {
      onSendMessage(userText);
    }

    // Add user message
    const timestamp = getCurrentTime();
    const messageGroup = document.createElement("div");
    messageGroup.className =
      "user-message-box w-full p-3 bg-white border border-gray-200 rounded-lg font-sans text-xs flex justify-between items-center shadow-sm";
    messageGroup.style.boxShadow = "0px 1px 2px 0px rgba(0,0,0,0.07)";
    messageGroup.innerHTML = `
      <p>${userText}</p>
      <span class="message-timestamp text-xs text-gray-300 ml-2 whitespace-nowrap">${timestamp}</span>
    `;

    if (chatHistoryRef.current) {
      chatHistoryRef.current.appendChild(messageGroup);
    }

    setChatInput("");
    setIsLoading(true);

    // Show loading indicator
    const loaderDiv = document.createElement("div");
    loaderDiv.id = "loading-indicator";
    loaderDiv.className = "flex justify-center items-center p-2";
    loaderDiv.innerHTML = `<div class="loader"></div>`;

    if (chatHistoryRef.current) {
      chatHistoryRef.current.appendChild(loaderDiv);
    }

    scrollToBottom();

    try {
      // Generate AI response
      const responseGenerator = generateResponse || defaultGenerateResponse;
      const responseHTML = await responseGenerator(userText);

      // Remove loading indicator
      const loader = document.getElementById("loading-indicator");
      if (loader) {
        loader.remove();
      }

      const llmResponseContainer = document.createElement("div");
      llmResponseContainer.className = "llm-response text-gray-700";

      let responseContent = responseHTML;

      // Add action buttons if enabled
      if (showActionButtons) {
        responseContent += `
          <div class="mt-4 flex items-center justify-end gap-x-2">
            <button class="action-btn w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none" title="Copy response" data-action="copy">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
            </button>
            <button class="action-btn w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none" title="Regenerate response" data-action="regenerate">
              <span class="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>
        `;
      }

      llmResponseContainer.innerHTML = responseContent;

      if (chatHistoryRef.current) {
        chatHistoryRef.current.appendChild(llmResponseContainer);
      }

      setIsLoading(false);
      scrollToBottom();
    } catch (error) {
      console.error("Error generating response:", error);
      setIsLoading(false);

      // Remove loading indicator
      const loader = document.getElementById("loading-indicator");
      if (loader) {
        loader.remove();
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (button: HTMLElement) => {
    const llmResponseElement = button.closest(".llm-response");
    if (llmResponseElement) {
      const clone = llmResponseElement.cloneNode(true) as HTMLElement;
      const actionButtons = clone.querySelector(
        ".flex.items-center.justify-end",
      );
      if (actionButtons) {
        actionButtons.remove();
      }
      const textToCopy = clone.innerText || clone.textContent || "";

      const tempTextarea = document.createElement("textarea");
      tempTextarea.value = textToCopy.trim();
      document.body.appendChild(tempTextarea);
      tempTextarea.select();
      try {
        document.execCommand("copy");
        const originalIcon = button.innerHTML;
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-green-500"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;
        setTimeout(() => {
          button.innerHTML = originalIcon;
        }, 2000);
      } catch (err) {
        console.error("Failed to copy text: ", err);
      }
      document.body.removeChild(tempTextarea);
    }
  };

  const handleRegenerate = async (button: HTMLElement) => {
    const llmResponseElement = button.closest(".llm-response");
    if (llmResponseElement) {
      llmResponseElement.remove();
    }

    setIsLoading(true);

    const loaderDiv = document.createElement("div");
    loaderDiv.id = "loading-indicator";
    loaderDiv.className = "flex justify-center items-center p-2";
    loaderDiv.innerHTML = `<div class="loader"></div>`;

    if (chatHistoryRef.current) {
      chatHistoryRef.current.appendChild(loaderDiv);
    }

    scrollToBottom();

    try {
      // Get the last user message to regenerate response
      const userMessages = chatHistoryRef.current?.querySelectorAll(
        ".user-message-box p",
      );
      const lastUserMessage =
        userMessages?.[userMessages.length - 1]?.textContent ||
        "Please regenerate";

      const responseGenerator = generateResponse || defaultGenerateResponse;
      const responseHTML = await responseGenerator(lastUserMessage);

      // Remove loading indicator
      const loader = document.getElementById("loading-indicator");
      if (loader) {
        loader.remove();
      }

      const llmResponseContainer = document.createElement("div");
      llmResponseContainer.className = "llm-response text-gray-700";

      let responseContent = responseHTML;

      if (showActionButtons) {
        responseContent += `
          <div class="mt-4 flex items-center justify-end gap-x-2">
            <button class="action-btn w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none" title="Copy response" data-action="copy">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
            </button>
            <button class="action-btn w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none" title="Regenerate response" data-action="regenerate">
              <span class="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>
        `;
      }

      llmResponseContainer.innerHTML = responseContent;

      if (chatHistoryRef.current) {
        chatHistoryRef.current.appendChild(llmResponseContainer);
      }

      setIsLoading(false);
      scrollToBottom();
    } catch (error) {
      console.error("Error regenerating response:", error);
      setIsLoading(false);

      const loader = document.getElementById("loading-indicator");
      if (loader) {
        loader.remove();
      }
    }
  };

  useEffect(() => {
    const chatHistory = chatHistoryRef.current;
    if (!chatHistory) return;

    const handleClick = (event: Event) => {
      const button = (event.target as HTMLElement).closest(".action-btn");
      if (!button) return;

      const action = (button as HTMLElement).dataset.action;
      if (action === "copy") {
        handleCopy(button as HTMLElement);
      } else if (action === "regenerate") {
        handleRegenerate(button as HTMLElement);
      }
    };

    chatHistory.addEventListener("click", handleClick);
    return () => chatHistory.removeEventListener("click", handleClick);
  }, []);

  // Render initial messages on mount
  useEffect(() => {
    if (initialMessages.length > 0 && chatHistoryRef.current) {
      initialMessages.forEach((message) => {
        if (message.type === "user") {
          const messageGroup = document.createElement("div");
          messageGroup.className =
            "user-message-box w-full p-3 bg-white border border-gray-200 rounded-lg font-sans text-xs flex justify-between items-center shadow-sm";
          messageGroup.style.boxShadow = "0px 1px 2px 0px rgba(0,0,0,0.07)";
          messageGroup.innerHTML = `
            <p>${message.text}</p>
            <span class="message-timestamp text-xs text-gray-300 ml-2 whitespace-nowrap">${message.timestamp}</span>
          `;
          chatHistoryRef.current.appendChild(messageGroup);
        } else {
          const llmResponseContainer = document.createElement("div");
          llmResponseContainer.className = "llm-response text-gray-700";
          llmResponseContainer.innerHTML = message.text;
          chatHistoryRef.current.appendChild(llmResponseContainer);
        }
      });
      scrollToBottom();
    }
  }, [initialMessages]);

  if (!isVisible) return null;

  const sidebarWidth = typeof width === "number" ? `${width}px` : width;

  return (
    <aside
      className={`chat-sidebar shrink-0 bg-gray-50 border-l border-gray-200 flex flex-col h-screen ${className}`}
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div
        className="relative flex items-center justify-between w-full pl-4 pr-2 py-1 border-b shadow-sm shrink-0"
        style={{ borderBottomColor: "oklch(0.3039 0.04 213.68 / 0.1)" }}
      >
        <span className="font-semibold text-sm">{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center px-2 py-0.5 text-gray-700 font-semibold text-xs rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      {/* Chat History Area */}
      <div
        id="chat-history"
        ref={chatHistoryRef}
        className="flex-grow overflow-y-auto pt-6 px-4 space-y-4"
      ></div>

      {/* Input area */}
      <div className="relative mt-4 shrink-0 pb-[5px] px-[5px]">
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="w-full h-24 p-3 pr-20 bg-white border border-gray-300 rounded-lg resize-none transition font-sans text-xs"
          placeholder={placeholder}
        />
        <div className="absolute bottom-3 right-3">
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            className="flex items-center gap-x-1 px-2 py-0.5 text-gray-700 font-semibold text-xs rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none disabled:opacity-50"
          >
            Send
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="w-3 h-3"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m7.49 12-3.75 3.75m0 0 3.75 3.75m-3.75-3.75h16.5V4.499"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
