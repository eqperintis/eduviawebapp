"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Indent } from "@/lib/tiptap-indent";
import { normalizeLink, toEditorHtml } from "@/lib/email/rich-text";

/**
 * The email body editor: bold, italic, underline, headings, lists, links,
 * alignment, indent, quotes and dividers, like writing in Gmail. It saves
 * HTML; the server keeps only this formatting and inlines the styles so it
 * looks the same in every inbox (see lib/email/rich-render.ts).
 */

export function useEmailEditor(initial: string | null | undefined, onChange: (html: string) => void) {
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        code: false,
        codeBlock: false,
        // Not autolink: it makes a link keep growing as you type after it.
        link: { openOnClick: false, autolink: false, linkOnPaste: true, defaultProtocol: "https" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Indent,
    ],
    content: toEditorHtml(initial),
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { class: "rte-content", "aria-label": "Email", role: "textbox", "aria-multiline": "true" } },
  });
}

function Tool({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rte-btn"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: pressing a tool must not blur the editor first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const ICON = { size: 16, strokeWidth: 2 } as const;

export function RichTextEditor({ editor }: { editor: Editor | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [hadLink, setHadLink] = useState(false);
  const [linkError, setLinkError] = useState("");

  // Lights each tool up for whatever the cursor is in.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      link: e?.isActive("link") ?? false,
      left: e?.isActive({ textAlign: "left" }) ?? false,
      center: e?.isActive({ textAlign: "center" }) ?? false,
      right: e?.isActive({ textAlign: "right" }) ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  const chain = () => editor!.chain().focus();

  const openLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").run();
    const { from, to } = editor.state.selection;
    const href = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkText(editor.state.doc.textBetween(from, to, " "));
    setLinkUrl(href);
    setHadLink(Boolean(href));
    setLinkError("");
    dialogRef.current?.showModal();
  };

  const applyLink = () => {
    if (!editor) return;
    const href = normalizeLink(linkUrl);
    if (!href) {
      setLinkError("Enter a web address (eduvia.my), an email address, or a {{variable}}.");
      return;
    }
    const { from, to } = editor.state.selection;
    const current = editor.state.doc.textBetween(from, to, " ");
    const text = linkText.trim() || current || linkUrl.trim();
    if (text !== current) {
      // New words, or none selected: put the linked words in place of the selection.
      chain()
        .insertContentAt({ from, to }, { type: "text", text, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      chain().extendMarkRange("link").setLink({ href }).run();
    }
    dialogRef.current?.close();
  };

  const removeLink = () => {
    chain().extendMarkRange("link").unsetLink().run();
    dialogRef.current?.close();
  };

  return (
    <>
      <div className="rte">
        <div className="rte-bar" role="toolbar" aria-label="Formatting">
          <Tool title="Bold (Ctrl+B)" active={state?.bold} onClick={() => chain().toggleBold().run()}>
            <Bold {...ICON} />
          </Tool>
          <Tool title="Italic (Ctrl+I)" active={state?.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic {...ICON} />
          </Tool>
          <Tool title="Underline (Ctrl+U)" active={state?.underline} onClick={() => chain().toggleUnderline().run()}>
            <Underline {...ICON} />
          </Tool>
          <Tool title="Strikethrough" active={state?.strike} onClick={() => chain().toggleStrike().run()}>
            <Strikethrough {...ICON} />
          </Tool>
          <span className="rte-sep" />
          <Tool title="Big heading" active={state?.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
            <Heading1 {...ICON} />
          </Tool>
          <Tool title="Small heading" active={state?.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2 {...ICON} />
          </Tool>
          <span className="rte-sep" />
          <Tool title="Link (Ctrl+K)" active={state?.link} onClick={openLink}>
            <LinkIcon {...ICON} />
          </Tool>
          <Tool title="Bulleted list" active={state?.bullet} onClick={() => chain().toggleBulletList().run()}>
            <List {...ICON} />
          </Tool>
          <Tool title="Numbered list" active={state?.ordered} onClick={() => chain().toggleOrderedList().run()}>
            <ListOrdered {...ICON} />
          </Tool>
          <Tool title="Indent less (Shift+Tab)" onClick={() => chain().outdent().run()}>
            <IndentDecrease {...ICON} />
          </Tool>
          <Tool title="Indent more (Tab)" onClick={() => chain().indent().run()}>
            <IndentIncrease {...ICON} />
          </Tool>
          <span className="rte-sep" />
          <Tool title="Align left" active={state?.left} onClick={() => chain().setTextAlign("left").run()}>
            <AlignLeft {...ICON} />
          </Tool>
          <Tool title="Align centre" active={state?.center} onClick={() => chain().setTextAlign("center").run()}>
            <AlignCenter {...ICON} />
          </Tool>
          <Tool title="Align right" active={state?.right} onClick={() => chain().setTextAlign("right").run()}>
            <AlignRight {...ICON} />
          </Tool>
          <span className="rte-sep" />
          <Tool title="Quote" active={state?.quote} onClick={() => chain().toggleBlockquote().run()}>
            <Quote {...ICON} />
          </Tool>
          <Tool title="Divider line" onClick={() => chain().setHorizontalRule().run()}>
            <Minus {...ICON} />
          </Tool>
          <Tool title="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
            <RemoveFormatting {...ICON} />
          </Tool>
          <span className="rte-sep" />
          <Tool title="Undo (Ctrl+Z)" disabled={!state?.canUndo} onClick={() => chain().undo().run()}>
            <Undo2 {...ICON} />
          </Tool>
          <Tool title="Redo (Ctrl+Shift+Z)" disabled={!state?.canRedo} onClick={() => chain().redo().run()}>
            <Redo2 {...ICON} />
          </Tool>
        </div>
        <div
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              openLink();
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="sheet"
        aria-label={hadLink ? "Edit link" : "Add a link"}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        {/* Not a <form>: this sits inside the step's form, and forms can't nest. */}
        <div
          className="card stack"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyLink();
            }
          }}
        >
          <h2>{hadLink ? "Edit link" : "Add a link"}</h2>
          <div className="field">
            <label htmlFor="rte-link-text">Text to show</label>
            <input id="rte-link-text" value={linkText} onChange={(event) => setLinkText(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rte-link-url">Link to</label>
            <input
              id="rte-link-url"
              value={linkUrl}
              autoFocus
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError("");
              }}
            />
            <span className="hint">A web address, an email address, or a {"{{variable}}"} from the form.</span>
          </div>
          {linkError && (
            <p className="notice bad" role="alert">
              {linkError}
            </p>
          )}
          <div className="spread">
            {hadLink ? (
              <button type="button" className="btn danger sm" onClick={removeLink}>
                Remove link
              </button>
            ) : (
              <span />
            )}
            <div className="row">
              <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button type="button" className="btn sm" disabled={!linkUrl.trim()} onClick={applyLink}>
                {hadLink ? "Update link" : "Add link"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
