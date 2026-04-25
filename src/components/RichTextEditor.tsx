import { useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { uploadEditorImage } from "@/lib/uploadEditorImage";
import "@/components/rich-text/rich-text.css";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  userId: string | undefined;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
};

function normalizeHtml(s: string): string {
  const t = s?.trim() ?? "";
  return t || "<p></p>";
}

/** 태그 사이 공백만 무시 — 본문 단어 공백은 유지해 setContent 루프만 끊음 */
function compactBetweenTags(s: string): string {
  return normalizeHtml(s).trim().replace(/>\s+</g, "><");
}

function htmlLooselyEqual(a: string, b: string): boolean {
  return compactBetweenTags(a) === compactBetweenTags(b);
}

function MenuBar({
  editor,
  userId,
  disabled,
}: {
  editor: Editor;
  userId: string | undefined;
  disabled?: boolean;
}) {
  const addImage = useCallback(() => {
    if (disabled) return;
    if (!userId) {
      window.alert("이미지를 넣으려면 로그인이 필요합니다.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        window.alert("이미지는 4MB 이하만 업로드할 수 있습니다.");
        return;
      }
      try {
        const url = await uploadEditorImage(userId, file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
      }
    };
    input.click();
  }, [editor, userId, disabled]);

  const setLink = useCallback(() => {
    if (disabled) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("링크 URL (비우면 링크 제거)", prev ?? "https://");
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }, [editor, disabled]);

  return (
    <div className="rich-text-editor__toolbar" role="toolbar" aria-label="텍스트 서식">
      <button
        type="button"
        className={editor.isActive("heading", { level: 2 }) ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        disabled={disabled}
        title="제목"
      >
        H2
      </button>
      <button
        type="button"
        className={editor.isActive("bold") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled}
        title="굵게"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={editor.isActive("italic") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled}
        title="기울임"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className={editor.isActive("underline") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={disabled}
        title="밑줄"
      >
        U
      </button>
      <button
        type="button"
        className={editor.isActive("strike") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={disabled}
        title="취소선"
      >
        S
      </button>
      <button
        type="button"
        className={editor.isActive("bulletList") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={disabled}
        title="글머리"
      >
        • 목록
      </button>
      <button
        type="button"
        className={editor.isActive("orderedList") ? "is-active" : undefined}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={disabled}
        title="번호"
      >
        1. 목록
      </button>
      <button
        type="button"
        className={editor.isActive("link") ? "is-active" : undefined}
        onClick={setLink}
        disabled={disabled}
        title="링크"
      >
        링크
      </button>
      <button type="button" onClick={addImage} disabled={disabled} title="이미지">
        이미지
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        title="실행 취소"
      >
        ↩
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        title="다시 실행"
      >
        ↪
      </button>
    </div>
  );
}

/**
 * React 19에서 제거된 `findDOMNode`를 쓰는 react-quill 대신 TipTap 사용.
 */
export function RichTextEditor({ value, onChange, placeholder, userId, disabled, compact, id }: Props) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: "https",
            HTMLAttributes: {
              rel: "noopener noreferrer",
              target: "_blank",
            },
          },
        }),
        Image.configure({
          inline: false,
          allowBase64: false,
        }),
        Placeholder.configure({
          placeholder: placeholder ?? "내용을 입력하세요.",
        }),
      ],
      content: normalizeHtml(value),
      editable: !disabled,
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
      editorProps: {
        attributes: {
          class: "tiptap",
        },
      },
    },
    [placeholder]
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeHtml(value);
    const cur = editor.getHTML();
    if (htmlLooselyEqual(next, cur)) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        id={id}
        className={`rich-text-editor rich-text-editor--loading${compact ? " rich-text-editor--compact" : ""}`}
        aria-busy="true"
      >
        <span className="rich-text-editor__loading-text">에디터 준비 중…</span>
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`rich-text-editor${compact ? " rich-text-editor--compact" : ""}${disabled ? " rich-text-editor--disabled" : ""}`}
    >
      <MenuBar editor={editor} userId={userId} disabled={disabled} />
      <EditorContent editor={editor} />
    </div>
  );
}
