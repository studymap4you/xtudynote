import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    richImageSlider: {
      insertRichImageSlider: (srcs: string[]) => ReturnType;
    };
  }
}

/** 여러 이미지를 가로 스크롤(스냅) 슬라이드 블록으로 묶습니다. 저장 HTML은 정제 시 유지됩니다. */
export const RichImageSliderExtension = Node.create({
  name: "richImageSlider",
  group: "block",
  content: "image+",
  defining: true,
  isolating: true,

  addCommands() {
    return {
      insertRichImageSlider:
        (srcs: string[]) =>
        ({ commands }) => {
          const content = srcs
            .map((s) => s.trim())
            .filter(Boolean)
            .map((src) => ({ type: "image" as const, attrs: { src } }));
          if (!content.length) return false;
          return commands.insertContent({
            type: this.name,
            content,
          });
        },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-rich-slider="1"]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "rich-image-slider",
        "data-rich-slider": "1",
      }),
      0,
    ];
  },
});
