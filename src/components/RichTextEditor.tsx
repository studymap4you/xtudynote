import { useCallback, useMemo, useRef, type ComponentProps } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { uploadEditorImage } from "@/lib/uploadEditorImage";
import "@/components/rich-text/rich-text.css";

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

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  userId,
  disabled,
  compact,
  id,
}: Props) {
  const quillRef = useRef<ReactQuill>(null);

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

  const modules: ComponentProps<typeof ReactQuill>["modules"] = useMemo(
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

  const formats: ComponentProps<typeof ReactQuill>["formats"] = [
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
      <ReactQuill
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
