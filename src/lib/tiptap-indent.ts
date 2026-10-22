import { Extension, type CommandProps } from "@tiptap/core";

/**
 * Gmail-style "Indent more" / "Indent less" for paragraphs and headings
 * (lists nest with Tab instead). Stored as a level, written out as an inline
 * margin-left, which every email client keeps. From SEKOOL's editor.
 */
export type IndentOptions = {
  types: string[];
  minLevel: number;
  maxLevel: number;
  stepPx: number;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return { types: ["paragraph", "heading"], minLevel: 0, maxLevel: 8, stepPx: 24 };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const margin = parseInt(element.style.marginLeft || "0", 10);
              return margin > 0 ? Math.round(margin / this.options.stepPx) : 0;
            },
            renderHTML: (attributes) => {
              const level = attributes.indent as number;
              return level ? { style: `margin-left: ${level * this.options.stepPx}px` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const applyDelta = (delta: number) => (props: CommandProps) => {
      const { tr, dispatch } = props;
      const { from, to } = props.state.selection;
      let changed = false;
      props.state.doc.nodesBetween(from, to, (node, pos) => {
        if (!this.options.types.includes(node.type.name)) return;
        const current = (node.attrs.indent as number) ?? 0;
        const next = Math.min(this.options.maxLevel, Math.max(this.options.minLevel, current + delta));
        if (next !== current) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    };
    return {
      indent: () => (props: CommandProps) => applyDelta(1)(props),
      outdent: () => (props: CommandProps) => applyDelta(-1)(props),
    };
  },

  addKeyboardShortcuts() {
    // Tab indents a paragraph; inside a list the list's own Tab (nesting) runs first.
    return {
      Tab: () => (this.editor.isActive("listItem") ? false : this.editor.commands.indent()),
      "Shift-Tab": () => (this.editor.isActive("listItem") ? false : this.editor.commands.outdent()),
    };
  },
});
