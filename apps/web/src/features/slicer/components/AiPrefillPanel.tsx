import { LoaderCircle, Sparkles } from 'lucide-react';

export function AiPrefillPanel({ description, loading, onDescriptionChange, onPrefill }: {
  description: string;
  loading: boolean;
  onDescriptionChange: (description: string) => void;
  onPrefill: () => void;
}) {
  return (
    <section className="ai-prefill panel">
      <label htmlFor="ai-prefill-description"><Sparkles size={13} /><strong>AI prefill</strong><span>Applies global settings</span></label>
      <textarea id="ai-prefill-description" rows={2} maxLength={2000} placeholder="Strong PETG bracket, minimal supports…" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
      <button className="button primary" type="button" disabled={!description.trim() || loading} onClick={onPrefill}>
        {loading ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
        {loading ? 'Generating…' : 'Prefill slicer settings'}
      </button>
    </section>
  );
}
