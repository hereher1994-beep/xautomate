'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Hash, RotateCcw, Sparkles, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const LS_KEY = 'xautomate_openrouter_key';

interface ContextTemplateCardProps {
  value: string;
  onChange: (v: string) => void;
  isRunning: boolean;
}

const EXAMPLE_TEMPLATES = [
  'Interesting perspective on {topic}. Have you considered the implications for {domain}?',
  'Great insight! This connects well with recent developments in the space.',
  'Curious about your take on the long-term trajectory here. What\'s your 6-month outlook?',
  'This resonates — been seeing similar patterns. Worth a deeper thread.',
];

const SYSTEM_PROMPT = `You are a text paraphraser. Your ONLY job is to take the user's exact message and output slightly reworded variations of it — nothing more, nothing less.

ABSOLUTE RULES — break any of these and you fail:
1. Output ONLY the reworded text. No explanations, no labels, no "Here is:", no quotes around the output.
2. NEVER add emojis unless the user's original text already contains them. 3. NEVER add exclamation marks unless the user's original text already contains them.
4. NEVER add your own ideas, angles, context, or creative spin.
5. NEVER change the subject, meaning, or intent of what the user wrote.
6. NEVER add hashtags unless the user's original text already has them.
7. Only vary the phrasing slightly — synonyms, word order, sentence restructuring — while keeping the exact same meaning.
8. No character limit — the user has X Premium.
9. Use {username} as a placeholder only if the user's original text references a username.
10. Generate exactly the number of variations the user asks for. Default: 3 variations separated by a blank line.
11. Never add disclaimers, caveats, or meta-commentary.
12. If the user writes in a specific language, keep that language.

EXAMPLE — if user writes: "Just dropped a new video on how I made $10k last month"
CORRECT output:
Just released a new video breaking down how I made $10k last month

Dropped a fresh video showing exactly how I pulled in $10k last month

New video just went live — here's how I made $10k last month

WRONG output (DO NOT DO THIS): anything that adds emojis, exclamation marks, changes the topic, adds warnings, changes the meaning, or sounds like something the user did NOT write.`;

export default function ContextTemplateCard({ value, onChange, isRunning }: ContextTemplateCardProps) {
  const [showExamples, setShowExamples] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [variations, setVariations] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Describe what you want the AI to write');
      return;
    }

    const apiKey = typeof window !== 'undefined' ? (localStorage.getItem(LS_KEY) || '') : '';
    if (!apiKey) {
      toast.error('OpenRouter API key required — add it in the OpenRouter API Key card below');
      return;
    }

    setVariations([]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: aiPrompt.trim() },
          ],
          temperature: 0.85,
          max_tokens: 1200,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `OpenRouter error: ${res.status}`);
      }

      const data = await res.json();
      const text: string = data.content || '';
      const parts = text
        .split(/\n{2,}/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setVariations(parts.length > 0 ? parts : [text.trim()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseVariation = (text: string) => {
    onChange(text);
    toast.success('Template applied!');
  };

  const handleCopyVariation = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const charCount = value.length;

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Context Template</span>
          <span className="text-xs text-red-400 font-medium">Required</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-data text-xs text-muted-foreground">
            {charCount} chars
          </span>
          <button
            type="button"
            onClick={() => setShowAI(p => !p)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors font-medium"
            style={{
              backgroundColor: showAI ? 'rgba(0,212,170,0.15)' : 'rgba(0,212,170,0.07)',
              color: 'var(--primary)',
              border: '1px solid rgba(0,212,170,0.25)',
            }}
          >
            <Sparkles size={11} />
            AI Generate
            {showAI ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      <label className="config-label">Message / Context</label>
      <p className="text-xs text-muted-foreground mb-2">
        The content or context sent each cycle. Use <span className="font-mono-data text-xs">{'{username}'}</span> to interpolate the target handle. No character limit — Premium account.
      </p>

      <textarea
        className="config-textarea min-h-[100px]"
        placeholder="e.g. Interesting perspective on {topic}. What's your take on the long-term implications?"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={isRunning}
        rows={4}
      />

      {/* ── AI Generator Panel ─────────────────────────────────────── */}
      {showAI && (
        <div className="mt-3 rounded-lg p-3 space-y-3"
          style={{ backgroundColor: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.18)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={12} className="text-primary" />
            <span className="text-xs font-semibold text-primary">AI Context Generator</span>
          </div>

          <div>
            <label className="config-label">Describe what you want</label>
            <textarea
              className="config-textarea min-h-[70px] text-xs"
              placeholder={`e.g. "Generate 3 aggressive crypto engagement replies for a Bitcoin bull account. No hashtags, no emojis, sound like a real trader."`}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={3}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Be specific: mention tone, niche, number of variations, style. The AI follows your rules strictly.
            </p>
          </div>

          <button
            type="button"
            className="btn-primary w-full justify-center py-2 text-xs gap-1.5"
            onClick={handleGenerate}
            disabled={isLoading || !aiPrompt.trim()}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Generate Variations
              </>
            )}
          </button>

          {/* Generated variations */}
          {variations.length > 0 && (
            <div className="space-y-2 mt-1">
              <p className="text-xs text-muted-foreground font-medium">
                {variations.length} variation{variations.length !== 1 ? 's' : ''} generated — click to use:
              </p>
              {variations.map((v, i) => (
                <div
                  key={`variation-${i}`}
                  className="rounded p-2.5 group"
                  style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}
                >
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap mb-2">{v}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="btn-primary text-xs py-1 px-2.5 gap-1"
                      onClick={() => handleUseVariation(v)}
                    >
                      Use This
                    </button>
                    <button
                      type="button"
                      className="btn-icon gap-1 text-xs"
                      onClick={() => handleCopyVariation(v, i)}
                      title="Copy to clipboard"
                    >
                      {copiedIdx === i ? <Check size={11} className="text-primary" /> : <Copy size={11} />}
                    </button>
                    <span className="text-xs text-muted-foreground font-mono-data ml-auto">
                      {v.length} chars
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <button
          type="button"
          className="btn-icon gap-1.5 text-xs px-2 py-1 text-muted-foreground"
          style={{ fontSize: '0.75rem' }}
          onClick={() => setShowExamples(p => !p)}
        >
          <Hash size={12} />
          {showExamples ? 'Hide examples' : 'Show examples'}
        </button>
        {value.trim() && (
          <button
            type="button"
            className="btn-icon gap-1 text-xs"
            style={{ fontSize: '0.75rem' }}
            onClick={() => onChange('')}
            disabled={isRunning}
          >
            <RotateCcw size={11} />
            Clear
          </button>
        )}
      </div>

      {showExamples && (
        <div className="mt-2 space-y-1.5">
          {EXAMPLE_TEMPLATES.map((tpl, i) => (
            <button
              key={`tpl-example-${i}`}
              type="button"
              className="w-full text-left text-xs px-2.5 py-2 rounded transition-colors"
              style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--foreground)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)'; }}
              onClick={() => { onChange(tpl); setShowExamples(false); }}
              disabled={isRunning}
            >
              {tpl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}