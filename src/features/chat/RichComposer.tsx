"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link2,
  ListOrdered,
  List,
  Quote,
  Code,
  SquareCode,
  Cloud,
  Monitor,
  Plus,
  Smile,
  AtSign,
  Send,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/Primitives";
import type { ChatMessage } from "@/lib/chat-types";
import { messageOf, request } from "./client";
import { DrivePicker, resumeDrivePicker } from "./DrivePicker";
import styles from "./Chat.module.css";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀", "👀", "🔥", "✨", "🙌", "💯"];

type Member = {
  role: "ADMIN" | "MEMBER";
  user: { id: string; name: string | null; email: string | null; image?: string | null };
};

export function RichComposer({
  channelId,
  workspaceId,
  parentId,
  disabled,
  workspaceMembers,
  onSent,
  onUpdateStatus,
  onTyping,
  onEditLastMessage,
  alsoToLabel,
}: {
  channelId: string;
  workspaceId: string;
  parentId: string | null;
  disabled: boolean;
  workspaceMembers: Member[];
  onSent: (message: ChatMessage) => void;
  onUpdateStatus: (clientId: string, status: "sending" | "failed" | "sent", confirmed?: ChatMessage) => void;
  onTyping: () => void;
  onEditLastMessage?: () => void;
  // In a thread: where "Also send to" posts the reply, such as #general.
  alsoToLabel?: string;
}) {
  const [alsoInChannel, setAlsoInChannel] = useState(false);
  // Tiptap does not re-render on each keystroke, so emptiness is kept in state for the Send button.
  const [empty, setEmpty] = useState(true);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stagedFiles, setStagedFiles] = useState<{ id: string; fileName: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!resumeDrivePicker(channelId)) return;
    const id = window.setTimeout(() => setShowDrive(true), 0);
    return () => window.clearTimeout(id);
  }, [channelId]);

  useEffect(() => {
    if (!showAttachMenu) return;
    function onPointerDown(event: MouseEvent) {
      if (!attachMenuRef.current?.contains(event.target as Node)) setShowAttachMenu(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowAttachMenu(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAttachMenu]);
  const onSendRef = useRef<() => void>(() => {});
  const showMentionMenuRef = useRef(showMentionMenu);
  const onEditLastMessageRef = useRef(onEditLastMessage);

  useEffect(() => {
    showMentionMenuRef.current = showMentionMenu;
  }, [showMentionMenu]);

  useEffect(() => {
    onEditLastMessageRef.current = onEditLastMessage;
  }, [onEditLastMessage]);

  // Mention candidates
  const mentionCandidates = useMemo(() => {
    if (!showMentionMenu) return [];
    const list: { id: string; label: string; kind: string }[] = [
      { id: "channel", label: "@channel", kind: "Notify everyone in this channel" },
      { id: "here", label: "@here", kind: "Notify active people in this channel" },
    ];
    for (const m of workspaceMembers) {
      if (m.user.name) {
        list.push({ id: m.user.id, label: `@${m.user.name}`, kind: m.user.email ?? "" });
      }
    }
    const q = mentionQuery.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q)).slice(0, 5);
  }, [showMentionMenu, mentionQuery, workspaceMembers]);

  const mentionCandidatesRef = useRef(mentionCandidates);

  useEffect(() => {
    mentionCandidatesRef.current = mentionCandidates;
  }, [mentionCandidates]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        dropcursor: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      Placeholder.configure({
        placeholder: parentId ? "Reply to thread…" : "Write a message…",
        emptyEditorClass: styles.isEditorEmpty,
      }),
    ],
    editorProps: {
      attributes: {
        "aria-label": parentId ? "Reply to thread" : "Message",
        role: "textbox",
        class: styles.tiptapEditor,
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          if (showMentionMenuRef.current && mentionCandidatesRef.current.length > 0) {
            event.preventDefault();
            insertMention(mentionCandidatesRef.current[0].label);
            return true;
          }
          event.preventDefault();
          onSendRef.current();
          return true;
        }
        if (event.key === "ArrowUp" && view.state.doc.textContent.length === 0 && onEditLastMessageRef.current) {
          event.preventDefault();
          onEditLastMessageRef.current();
          return true;
        }
        if (event.key === "Escape") {
          setShowMentionMenu(false);
          setShowEmojiPicker(false);
          return false;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setEmpty(editor.isEmpty);
      const text = editor.getText();
      if (text.trim()) {
        onTyping();
      }

      // Check if '@' mention should trigger
      const { state } = editor;
      const { from } = state.selection;
      const textBefore = state.doc.textBetween(Math.max(0, from - 30), from, "\n", "\0");
      const lastAt = textBefore.lastIndexOf("@");
      if (lastAt !== -1 && !/\s/.test(textBefore.slice(lastAt + 1))) {
        setMentionQuery(textBefore.slice(lastAt + 1));
        setShowMentionMenu(true);
      } else {
        setShowMentionMenu(false);
      }
    },
  });

  function insertMention(label: string) {
    if (!editor) return;
    const { state } = editor;
    const { from } = state.selection;
    const textBefore = state.doc.textBetween(Math.max(0, from - 30), from, "\n", "\0");
    const lastAt = textBefore.lastIndexOf("@");
    if (lastAt !== -1) {
      const startPos = from - (textBefore.length - lastAt);
      editor.chain().focus().deleteRange({ from: startPos, to: from }).insertContent(`${label} `).run();
    } else {
      editor.chain().focus().insertContent(`${label} `).run();
    }
    setShowMentionMenu(false);
  }

  function handleToggleLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function handleInsertEmoji(emoji: string) {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
    setShowEmojiPicker(false);
  }

  function handleMentionButtonClick() {
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
    setShowMentionMenu(true);
    setMentionQuery("");
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await request<{ attachment: { id: string; fileName: string; size: number } }>(
          `/api/workspaces/${workspaceId}/attachments`,
          { method: "POST", body: formData }
        );
        setStagedFiles(prev => [...prev, res.attachment]);
      } catch (e) {
        setError(messageOf(e));
      }
    }
    setUploading(false);
  }

  const handleSend = async () => {
    if (!editor || disabled || busy) return;
    const text = editor.getText().trim();
    if (!text && !stagedFiles.length) return;

    // Handle slash commands
    if (text === "/shrug") {
      editor.commands.setContent("¯\\_(ツ)_/¯");
    } else if (text === "/clear") {
      editor.commands.clearContent();
      return;
    } else if (text.startsWith("/topic ")) {
      const newTopic = text.slice(7).trim();
      await request(`/api/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ topic: newTopic }),
      });
      editor.commands.clearContent();
      return;
    }

    const docJson = editor.getJSON();
    const body = JSON.stringify(docJson);

    const clientId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: `opt-${clientId}`,
      channelId,
      body,
      createdAt: new Date().toISOString(),
      sender: { id: "me", name: "You" },
      replyCount: 0,
      threadRootId: parentId,
      parentId,
      alsoInChannel: Boolean(parentId && alsoInChannel),
      clientId,
      clientMessageId: clientId,
      status: "sending",
      attachments: stagedFiles.map(f => ({ ...f, mimeType: "file", storageKey: "" })),
    };

    const attachmentIds = stagedFiles.map(f => f.id);
    onSent(optimisticMessage);
    editor.commands.clearContent();
    setEmpty(true);
    setStagedFiles([]);
    setBusy(true);
    setError("");

    try {
      const result = await request<{ message: ChatMessage }>(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body,
          parentId,
          threadRootId: parentId,
          clientId,
          clientMessageId: clientId,
          attachmentIds,
          ...(parentId && alsoInChannel && { alsoInChannel: true }),
        }),
      });
      onUpdateStatus(clientId, "sent", result.message);
    } catch (err) {
      setError(messageOf(err));
      onUpdateStatus(clientId, "failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    onSendRef.current = handleSend;
  });

  const isEditorEmpty = !editor || empty;

  return (
    <div className={styles.composer}>
      {error && (
        <p role="alert" className={styles.error}>
          <span>{error}</span>
          <button type="button" onClick={handleSend}>Retry</button>
        </p>
      )}

      {/* MENTION AUTOCOMPLETE POPUP */}
      {showMentionMenu && mentionCandidates.length > 0 && (
        <div className={styles.mentionMenu}>
          {mentionCandidates.map(candidate => (
            <button
              key={candidate.id}
              type="button"
              className={styles.mentionItem}
              onClick={() => insertMention(candidate.label)}
            >
              <strong>{candidate.label}</strong>
              <small className={styles.mentionKind}>{candidate.kind}</small>
            </button>
          ))}
        </div>
      )}

      {/* EMOJI PICKER POPOVER */}
      {showEmojiPicker && (
        <div className={styles.composerEmojiPopover}>
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              className={styles.emojiQuickBtn}
              onClick={() => handleInsertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setShowEmojiPicker(false)}
            aria-label="Close emoji picker"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className={styles.slackComposerBox}>
        {/* TOP FORMATTING TOOLBAR */}
        {showToolbar && (
          <div className={styles.composerTopToolbar} role="toolbar" aria-label="Formatting options">
            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("bold") ? styles.active : ""}`}
              title="Bold (Ctrl+B)"
              aria-label="Bold"
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("italic") ? styles.active : ""}`}
              title="Italic (Ctrl+I)"
              aria-label="Italic"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("underline") ? styles.active : ""}`}
              title="Underline (Ctrl+U)"
              aria-label="Underline"
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("strike") ? styles.active : ""}`}
              title="Strikethrough (Ctrl+Shift+X)"
              aria-label="Strikethrough"
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough size={14} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("link") ? styles.active : ""}`}
              title="Link (Ctrl+K)"
              aria-label="Link"
              onClick={handleToggleLink}
            >
              <Link2 size={14} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("orderedList") ? styles.active : ""}`}
              title="Numbered list (Ctrl+Shift+7)"
              aria-label="Numbered list"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("bulletList") ? styles.active : ""}`}
              title="Bullet list (Ctrl+Shift+8)"
              aria-label="Bullet list"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("blockquote") ? styles.active : ""}`}
              title="Quote (Ctrl+Shift+B)"
              aria-label="Quote"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={14} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("code") ? styles.active : ""}`}
              title="Inline code (Ctrl+E)"
              aria-label="Inline code"
              onClick={() => editor?.chain().focus().toggleCode().run()}
            >
              <Code size={14} />
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${editor?.isActive("codeBlock") ? styles.active : ""}`}
              title="Code block (Ctrl+Alt+C)"
              aria-label="Code block"
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            >
              <SquareCode size={14} />
            </button>
          </div>
        )}

        {/* STAGED ATTACHMENTS */}
        {stagedFiles.length > 0 && (
          <div className={styles.stagedAttachments}>
            {stagedFiles.map(file => (
              <span key={file.id} className={styles.stagedChip}>
                <Paperclip size={12} />
                <span>{file.fileName}</span>
                <button
                  type="button"
                  onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== file.id))}
                  className={styles.stagedRemove}
                  aria-label={`Remove ${file.fileName}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* EDITOR CONTENT AREA */}
        <div className={styles.editorContentWrapper}>
          <EditorContent editor={editor} />
        </div>

        {/* BOTTOM ROW */}
        <div className={styles.composerBottomRow}>
          <div className={styles.composerLeftTools}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={e => handleFileUpload(e.target.files)}
            />

            <div className={styles.attachMenuWrap} ref={attachMenuRef}>
              <button
                type="button"
                className={`${styles.composerActionBtn} ${showAttachMenu ? styles.active : ""}`}
                title="Attach file or image"
                aria-label="Attach file"
                aria-haspopup="menu"
                aria-expanded={showAttachMenu}
                disabled={disabled || uploading}
                onClick={() => setShowAttachMenu(open => !open)}
              >
                <Plus size={16} />
              </button>
              {showAttachMenu && (
                <div className={styles.attachMenu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowDrive(true);
                    }}
                  >
                    <Cloud size={15} />
                    Upload from Drive
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAttachMenu(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Monitor size={15} />
                    Browse from the computer
                  </button>
                </div>
              )}
            </div>

            {/* 2. Aa (show or hide formatting toolbar) */}
            <button
              type="button"
              className={`${styles.composerActionBtn} ${showToolbar ? styles.active : ""}`}
              title={showToolbar ? "Hide formatting" : "Show formatting"}
              aria-label="Show or hide formatting toolbar"
              onClick={() => setShowToolbar(prev => !prev)}
            >
              <span className={styles.aaLabel}>Aa</span>
            </button>

            {/* 3. Emoji picker */}
            <button
              type="button"
              className={`${styles.composerActionBtn} ${showEmojiPicker ? styles.active : ""}`}
              title="Add emoji"
              aria-label="Emoji picker"
              onClick={() => setShowEmojiPicker(prev => !prev)}
            >
              <Smile size={16} />
            </button>

            {/* 4. @ (mention members) */}
            <button
              type="button"
              className={styles.composerActionBtn}
              title="Mention someone (@)"
              aria-label="Mention members"
              onClick={handleMentionButtonClick}
            >
              <AtSign size={16} />
            </button>
          </div>

          <div className={styles.composerRightTools}>
            {parentId && alsoToLabel && (
              <label className={styles.alsoSend}>
                <input type="checkbox" checked={alsoInChannel} onChange={event => setAlsoInChannel(event.target.checked)} />
                Also send to {alsoToLabel}
              </label>
            )}
            <Button
              aria-label={parentId ? "Send reply" : "Send message"}
              variant="primary"
              disabled={disabled || busy || (isEditorEmpty && !stagedFiles.length)}
              onClick={handleSend}
            >
              <Send size={14} />
              <span>{busy ? "Sending…" : "Send"}</span>
            </Button>
          </div>
        </div>
      </div>
      {showDrive && (
        <DrivePicker
          workspaceId={workspaceId}
          channelId={channelId}
          onClose={() => setShowDrive(false)}
          onAttached={file => {
            setStagedFiles(prev => [...prev, file]);
            setShowDrive(false);
          }}
        />
      )}
    </div>
  );
}
