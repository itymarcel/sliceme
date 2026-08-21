import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type GcodeSourceEditorHandle = {
  setLine: (lineNumber: number) => void;
};

type GcodeSourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectedLineChange: (lineNumber: number) => void;
};

export const GcodeSourceEditor = forwardRef<GcodeSourceEditorHandle, GcodeSourceEditorProps>(
  ({ value, onChange, onSelectedLineChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView>();
    const syncingRef = useRef(false);
    const selectedLineRef = useRef(1);

    useEffect(() => {
      if (!containerRef.current) return;
      const view = new EditorView({
        parent: containerRef.current,
        state: EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            history(),
            drawSelection(),
            dropCursor(),
            rectangularSelection(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            highlightSelectionMatches(),
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
            EditorView.contentAttributes.of({ 'aria-label': 'G-code source' }),
            EditorView.updateListener.of((update) => {
              if (syncingRef.current) return;
              if (update.docChanged) onChange(update.state.doc.toString());
              if (update.selectionSet || update.docChanged) {
                const selectedLine = update.state.doc.lineAt(update.state.selection.main.head).number;
                if (selectedLine !== selectedLineRef.current) {
                  selectedLineRef.current = selectedLine;
                  onSelectedLineChange(selectedLine);
                }
              }
            }),
            EditorView.theme({
              '&': { height: '100%', backgroundColor: '#080d12', color: '#d8e5ee', fontSize: '11px' },
              '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.55' },
              '.cm-content': { padding: '10px 0' },
              '.cm-gutters': { backgroundColor: '#0b1219', color: '#526578', borderRight: '1px solid #22303d' },
              '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(137,255,142,.09)' },
              '&.cm-focused': { outline: 'none' },
              '&.cm-focused .cm-cursor': { borderLeftColor: '#89ff8e' },
              '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(96,165,250,.28) !important' },
            }),
          ],
        }),
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = undefined;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      syncingRef.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      syncingRef.current = false;
    }, [value]);

    useImperativeHandle(ref, () => ({
      setLine: (lineNumber) => {
        const view = viewRef.current;
        if (!view) return;
        const bounded = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
        const line = view.state.doc.line(bounded);
        syncingRef.current = true;
        selectedLineRef.current = bounded;
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        });
        view.focus();
        syncingRef.current = false;
      },
    }), []);

    return <div ref={containerRef} className="gcode-source-editor" data-gcode-editor="true" />;
  },
);

GcodeSourceEditor.displayName = 'GcodeSourceEditor';
