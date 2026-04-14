import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type ReactQuill from "react-quill";
import { uploadEditorImage } from "@/lib/uploadEditorImage";
import "@/components/rich-text/rich-text.css";

type ReactQuillComponent = typeof ReactQuill;

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Firebase Auth uid — required for image upload */
  userId: string | undefined;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
};

function PlainFallback({
  value,
  onChange,
  placeholder,
  disabled,
  compact,
  id,
}: Props) {
  const rows = compact ? 8 : 14;
  return (
    <div id={id} className={`rich-text-editor rich-text-editor--fallback${compact ? " rich-text-editor--compact" : ""}`}>
      <textarea
        className="add-passage__control add-passage__intro rich-text-editor__fallback-textarea"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck
      />
      <p className="rich-text-editor__fallback-note" role="status">
        서식 도구를 불러오지 못했습니다. 위 입력란에 HTML을 직접 쓰거나, 페이지를 새로고침해 보세요.
      </p>
    </div>
  );
}

function QuillEditorInner({
  RQ,
  value,
  onChange,
  placeholder,
  userId,
  disabled,
  compact,
  id,
}: Props & { RQ: ReactQuillComponent }) {
  const quillRef = useRef<ReactQuill | null>(null);

  const imageHandler = useCallback(() => {
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
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        const range = editor.getSelection(true);
        const index = range ? range.index : editor.getLength();
        editor.insertEmbed(index, "image", url, "user");
        editor.setSelection(index + 1, 0);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
      }
    };
    input.click();
  }, [userId]);

  const modules: ComponentProps<ReactQuillComponent>["modules"] = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: imageHandler,
        },
      },
      clipboard: {
        matchVisual: false,
      },
    }),
    [imageHandler]
  );

  const formats: ComponentProps<ReactQuillComponent>["formats"] = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "link",
    "image",
  ];

  return (
    <div
      id={id}
      className={`rich-text-editor${compact ? " rich-text-editor--compact" : ""}${disabled ? " rich-text-editor--disabled" : ""}`}
    >
      <RQ
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
}

/**
 * Quill은 동적 import — 메인 번들에서 제외해 초기 로드/호환 문제로 전체 앱이 멈추는 것을 방지합니다.
 */
export function RichTextEditor(props: Props) {
  const [RQ, setRQ] = useState<ReactQuillComponent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await import("react-quill/dist/quill.snow.css");
        const m = await import("react-quill");
        if (!cancelled) setRQ(() => m.default);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <PlainFallback {...props} />;
  }
  if (!RQ) {
    return (
      <div
        id={props.id}
        className={`rich-text-editor rich-text-editor--loading${props.compact ? " rich-text-editor--compact" : ""}`}
        aria-busy="true"
      >
        <span className="rich-text-editor__loading-text">에디터 준비 중…</span>
      </div>
    );
  }

  return <QuillEditorInner RQ={RQ} {...props} />;
}
