import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Dropcursor } from "@tiptap/extension-dropcursor";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { uploadEditorImageWithProgress } from "@/lib/editorUploads";
import { escapeHtmlAttr, escapeHtmlText } from "@/lib/richTextUtils";
import { RichTextImageLayoutDialog, type RichTextImageLayoutChoice } from "@/components/rich-text/RichTextImageLayoutDialog";
import { RichImageSliderExtension } from "@/components/rich-text/richImageSliderExtension";
import "@/components/rich-text/rich-text.css";

export type RichTextEditorHandle = {
  insertImageUrls: (urls: string[], layout?: RichTextImageLayoutChoice) => void;
  insertFileLinks: (items: { url: string; name: string }[]) => void;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  userId: string | undefined;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  /** 업로드 진행률(0–100), 이미지·드롭 업로드 시에만 호출 */
  onUploadProgress?: (percent: number | null) => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function looksLikeImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif)$/i.test(f.name);
}

function normalizeHtml(s: string): string {
  const t = s?.trim() ?? "";
  return t || "<p></p>";
}

function compactBetweenTags(s: string): string {
  return normalizeHtml(s).trim().replace(/>\s+</g, "><");
}

function htmlLooselyEqual(a: string, b: string): boolean {
  return compactBetweenTags(a) === compactBetweenTags(b);
}

function insertUrlsWithLayout(editor: Editor, urls: string[], layout: RichTextImageLayoutChoice) {
  if (layout === "slider") {
    editor.chain().focus().insertRichImageSlider(urls).run();
  } else {
    for (const u of urls) {
      if (!u.trim()) continue;
      editor.chain().focus().setImage({ src: u.trim() }).run();
    }
  }
}

function offerUrlsAfterUpload(
  editor: Editor | null,
  urls: string[],
  openLayoutChoice: (urls: string[]) => void
) {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean);
  if (!cleaned.length || !editor) return;
  if (cleaned.length === 1) {
    editor.chain().focus().setImage({ src: cleaned[0] }).run();
  } else {
    openLayoutChoice(cleaned);
  }
}

function MenuBar({
  editor,
  disabled,
  onPickImages,
}: {
  editor: Editor;
  disabled: boolean;
  onPickImages: () => void;
}) {
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
    <div className="rich-text-editor__toolbar rich-text-editor__toolbar--sticky" role="toolbar" aria-label="텍스트 서식">
      <div className="rich-text-editor__toolbar-row">
        <span className="rich-text-editor__toolbar-label">제목·본문</span>
        <button
          type="button"
          className={editor.isActive("heading", { level: 1 }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={disabled}
          title="제목 1"
        >
          H1
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled}
          title="제목 2"
        >
          H2
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 3 }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={disabled}
          title="제목 3"
        >
          H3
        </button>
        <button type="button" onClick={() => editor.chain().focus().setParagraph().run()} disabled={disabled} title="본문 단락">
          본문
        </button>
        <span className="rich-text-editor__toolbar-sep" aria-hidden />
        <span className="rich-text-editor__toolbar-label">크기</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().setFontSize("0.875rem").run()}
          disabled={disabled}
          title="작은 본문"
        >
          작게
        </button>
        <button type="button" onClick={() => editor.chain().focus().unsetFontSize().run()} disabled={disabled} title="기본 크기">
          기본
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setFontSize("1.125rem").run()}
          disabled={disabled}
          title="큰 본문"
        >
          크게
        </button>
      </div>

      <div className="rich-text-editor__toolbar-row">
        <span className="rich-text-editor__toolbar-label">서식</span>
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
        <span className="rich-text-editor__toolbar-sep" aria-hidden />
        <label className="rich-text-editor__color-wrap" title="글자 색">
          <span className="rich-text-editor__toolbar-sr">글자 색</span>
          <input
            type="color"
            className="rich-text-editor__color-input"
            disabled={disabled}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              editor.chain().focus().setColor(v).run();
            }}
          />
        </label>
        <button type="button" className="btn-tiny" onClick={() => editor.chain().focus().unsetColor().run()} disabled={disabled} title="글자색 제거">
          글자색 제거
        </button>
        <label className="rich-text-editor__color-wrap" title="배경(형광)">
          <span className="rich-text-editor__toolbar-sr">배경 색</span>
          <input
            type="color"
            className="rich-text-editor__color-input"
            disabled={disabled}
            defaultValue="#fef08a"
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              editor.chain().focus().setBackgroundColor(v).run();
            }}
          />
        </label>
        <button
          type="button"
          className="btn-tiny"
          onClick={() => editor.chain().focus().unsetBackgroundColor().run()}
          disabled={disabled}
          title="배경색 제거"
        >
          배경 제거
        </button>
      </div>

      <div className="rich-text-editor__toolbar-row">
        <span className="rich-text-editor__toolbar-label">목록·정렬</span>
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
        <span className="rich-text-editor__toolbar-sep" aria-hidden />
        <button
          type="button"
          className={editor.isActive({ textAlign: "left" }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          disabled={disabled}
          title="왼쪽 정렬"
        >
          왼쪽
        </button>
        <button
          type="button"
          className={editor.isActive({ textAlign: "center" }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          disabled={disabled}
          title="가운데 정렬"
        >
          가운데
        </button>
        <button
          type="button"
          className={editor.isActive({ textAlign: "right" }) ? "is-active" : undefined}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          disabled={disabled}
          title="오른쪽 정렬"
        >
          오른쪽
        </button>
        <span className="rich-text-editor__toolbar-sep" aria-hidden />
        <button type="button" className={editor.isActive("link") ? "is-active" : undefined} onClick={setLink} disabled={disabled} title="링크">
          링크
        </button>
        <button type="button" onClick={onPickImages} disabled={disabled} title="이미지 (여러 장)">
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
    </div>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, placeholder, userId, disabled, compact, id, onUploadProgress },
  ref
) {
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const afterUploadUrlsRef = useRef<(urls: string[]) => void>(() => {});
  const [layoutDialogUrls, setLayoutDialogUrls] = useState<string[] | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
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
        Underline,
        TextStyleKit.configure({
          fontFamily: false,
          lineHeight: false,
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Image.configure({
          inline: false,
          allowBase64: false,
        }),
        RichImageSliderExtension,
        Placeholder.configure({
          placeholder: placeholder ?? "내용을 입력하세요.",
        }),
        Dropcursor.configure({
          color: "rgba(37, 99, 235, 0.55)",
          width: 2,
        }),
      ],
      content: normalizeHtml(value),
      editable: !disabled,
      onCreate: ({ editor: ed }) => {
        editorRef.current = ed;
      },
      onDestroy: () => {
        editorRef.current = null;
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
      editorProps: {
        attributes: {
          class: "tiptap",
        },
        handleDrop(view, event, _slice, moved) {
          if (disabled || moved) return false;
          if (!(event instanceof DragEvent)) return false;
          const dt = event.dataTransfer;
          if (!dt?.files?.length || !userId) return false;
          const images = Array.from(dt.files).filter(looksLikeImageFile);
          if (!images.length) return false;
          event.preventDefault();
          void (async () => {
            const ed = editorRef.current;
            if (!ed) return;
            const pos =
              view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? ed.state.selection.from;
            ed.chain().focus().setTextSelection(pos).run();
            const urls: string[] = [];
            let done = 0;
            for (const file of images) {
              if (file.size > MAX_IMAGE_BYTES) {
                window.alert(`이미지는 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB 이하만 가능합니다.`);
                continue;
              }
              try {
                const url = await uploadEditorImageWithProgress(userId, file, (p) => {
                  if (p == null) return;
                  const n = images.length;
                  const base = (done / n) * 100;
                  const slice = (p / 100) * (1 / n) * 100;
                  onUploadProgress?.(Math.min(100, Math.round(base + slice)));
                });
                urls.push(url);
                done++;
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
              }
            }
            onUploadProgress?.(null);
            afterUploadUrlsRef.current(urls);
          })();
          return true;
        },
        handlePaste(_view, event) {
          if (disabled || !userId) return false;
          const items = event.clipboardData?.items;
          if (!items?.length) return false;
          const imageItems = Array.from(items).filter((it) => it.type.startsWith("image/"));
          if (!imageItems.length) return false;
          event.preventDefault();
          void (async () => {
            const ed = editorRef.current;
            if (!ed) return;
            const urls: string[] = [];
            let done = 0;
            const toUpload = imageItems
              .map((it) => it.getAsFile())
              .filter((f): f is File => !!f && f.size <= MAX_IMAGE_BYTES);
            for (const file of toUpload) {
              try {
                const url = await uploadEditorImageWithProgress(userId, file, (p) => {
                  if (p == null) return;
                  const n = Math.max(1, toUpload.length);
                  const base = (done / n) * 100;
                  const slice = (p / 100) * (1 / n) * 100;
                  onUploadProgress?.(Math.min(100, Math.round(base + slice)));
                });
                urls.push(url);
                done++;
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "붙여넣기 이미지 업로드에 실패했습니다.");
              }
            }
            onUploadProgress?.(null);
            afterUploadUrlsRef.current(urls);
          })();
          return true;
        },
      },
    },
    [placeholder, disabled, userId, onUploadProgress]
  );

  useEffect(() => {
    afterUploadUrlsRef.current = (urls: string[]) => {
      offerUrlsAfterUpload(editorRef.current, urls, setLayoutDialogUrls);
    };
  }, []);

  const onPickImages = useCallback(() => {
    if (disabled) return;
    if (!userId) {
      window.alert("이미지를 넣으려면 로그인이 필요합니다.");
      return;
    }
    fileInputRef.current?.click();
  }, [disabled, userId]);

  const onImageFilesChanged = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    /** `FileList`는 input과 연결된 live 객체이라, value 초기화 후에는 비어 있을 수 있음 — 먼저 복사 */
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!picked.length || disabled || !userId) return;
    const files = picked.filter(looksLikeImageFile);
    if (!files.length) {
      if (picked.length) window.alert("이미지 파일만 선택해 주세요.");
      return;
    }
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) {
        window.alert(`이미지는 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB 이하만 업로드할 수 있습니다: ${file.name}`);
        return;
      }
    }
    const urls: string[] = [];
    let done = 0;
    try {
      for (const file of files) {
        const url = await uploadEditorImageWithProgress(userId, file, (p) => {
          if (p == null) return;
          const n = files.length;
          const base = (done / n) * 100;
          const slice = (p / 100) * (1 / n) * 100;
          onUploadProgress?.(Math.min(100, Math.round(base + slice)));
        });
        urls.push(url);
        done++;
      }
      onUploadProgress?.(null);
      offerUrlsAfterUpload(editorRef.current, urls, setLayoutDialogUrls);
    } catch (err) {
      onUploadProgress?.(null);
      window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      insertImageUrls(urls: string[], layout: RichTextImageLayoutChoice = "sequential") {
        const ed = editorRef.current;
        if (!ed) return;
        const cleaned = urls.map((u) => u.trim()).filter(Boolean);
        if (!cleaned.length) return;
        insertUrlsWithLayout(ed, cleaned, layout);
      },
      insertFileLinks(items: { url: string; name: string }[]) {
        const ed = editorRef.current;
        if (!ed) return;
        for (const it of items) {
          const href = escapeHtmlAttr(it.url.trim());
          const label = escapeHtmlText(it.name.trim() || "첨부 파일");
          ed.chain().focus().insertContent(`<p><a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a></p>`).run();
        }
      },
    }),
    []
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
      <RichTextImageLayoutDialog
        open={layoutDialogUrls !== null}
        onOpenChange={(open) => {
          if (!open) setLayoutDialogUrls(null);
        }}
        imageCount={layoutDialogUrls?.length ?? 0}
        onChoose={(layout) => {
          if (!editor || !layoutDialogUrls?.length) return;
          insertUrlsWithLayout(editor, layoutDialogUrls, layout);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={!!disabled}
        className="rich-text-editor__hidden-file"
        aria-hidden
        tabIndex={-1}
        onChange={onImageFilesChanged}
      />
      <MenuBar editor={editor} disabled={!!disabled} onPickImages={onPickImages} />
      <EditorContent editor={editor} />
    </div>
  );
});
