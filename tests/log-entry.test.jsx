// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
//    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
//    License for the specific language governing permissions and limitations
//    under the License.

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// --- Mocks (hoisted) ---
vi.mock('@openan/shared-workflow', () => ({
    UnifiedWorkflow: vi.fn(() => null),
    transformWorkflowToReactFlow: vi.fn(() => ({ nodes: [], edges: [] })),
}));
vi.mock('../plugins/execution-center/src/execution_statistics/index.jsx', () => ({
    default: vi.fn(() => null),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }),
}));
// lucide-react icons are presentational; stub each named import so the DOM stays
// clean. (A Proxy mock breaks named-import live bindings in vitest.)
vi.mock('lucide-react', () => {
    const Stub = () => null;
    return {
        Play: Stub, StopCircle: Stub, Terminal: Stub, AlertCircle: Stub,
        Search: Stub, History: Stub, Plus: Stub, Bot: Stub,
        PanelLeftOpen: Stub, PanelLeftClose: Stub, ChevronDown: Stub,
        ChevronRight: Stub, Hash: Stub, Trash2: Stub, Clock: Stub,
        CheckCircle2: Stub, XCircle: Stub, RotateCcw: Stub, MessageSquare: Stub,
        BarChart3: Stub, SlidersHorizontal: Stub, LayoutList: Stub, X: Stub,
        FileText: Stub, ChevronUp: Stub, Loader: Stub,
    };
});

import { parseProtobufText, parseLogData, renderInlineMarkdown, MarkdownRenderer, LogEntry } from '../plugins/execution-center/src/index.jsx';

// --- Helpers ---
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

const mount = async (element) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(element));
    await flush();
    return { container, root };
};

const unmount = async (root, container) => {
    await act(async () => root.unmount());
    container.remove();
};

const t = key => key;

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    document.body.innerHTML = '';
});

// ═══════════════════════════════════════════════════════════
// parseProtobufText
// ═══════════════════════════════════════════════════════════

test('TC-EXECHELP-001 | parseProtobufText null input returns text null and metadata null', () => {
    // 输入: null  预期: {text: null, metadata: null}  断言: 非字符串守卫分支
    expect(parseProtobufText(null)).toEqual({ text: null, metadata: null });
});

test('TC-EXECHELP-002 | parseProtobufText undefined input returns text undefined and metadata null', () => {
    // 输入: undefined  预期: {text: undefined, metadata: null}  断言: falsy 守卫
    expect(parseProtobufText(undefined)).toEqual({ text: undefined, metadata: null });
});

test('TC-EXECHELP-003 | parseProtobufText non-string number returns raw as text with null metadata', () => {
    // 输入: 42 (number)  预期: {text: 42, metadata: null}  断言: typeof 守卫
    expect(parseProtobufText(42)).toEqual({ text: 42, metadata: null });
});

test('TC-EXECHELP-004 | parseProtobufText extracts message_id and role into metadata', () => {
    // 输入: protobuf with message_id + role + multi-line parts  预期: metadata populated, text from parts
    // 断言: metadata fields + text value — 改坏 message_id/role 正则即失败
    const input = 'message_id: "msg-123"\nrole: user\nparts {\n  text: "hello world"\n}';
    const result = parseProtobufText(input);
    expect(result.metadata).toEqual({ message_id: 'msg-123', role: 'user' });
    expect(result.text).toBe('hello world');
});

test('TC-EXECHELP-005 | parseProtobufText inline parts extracts text', () => {
    // 输入: single-line `parts { text: "..." }`  预期: text extracted inline  断言: partsInlineMatch branch
    const input = 'parts { text: "inline content" }';
    const result = parseProtobufText(input);
    expect(result.text).toBe('inline content');
    expect(result.metadata).toEqual({});
});

test('TC-EXECHELP-006 | parseProtobufText multi-line parts block joins text entries', () => {
    // 输入: multi-line parts with two text fields  预期: texts joined by newline  断言: inParts loop + join
    const input = 'parts {\n  text: "first line"\n  text: "second line"\n}';
    const result = parseProtobufText(input);
    expect(result.text).toBe('first line\nsecond line');
});

test('TC-EXECHELP-007 | parseProtobufText converts escaped backslash-n to newline', () => {
    // 输入: parts text with literal \n  预期: converted to real newline  断言: replace(/\\n/g, '\n')
    const input = 'parts { text: "hello\\nworld" }';
    const result = parseProtobufText(input);
    expect(result.text).toBe('hello\nworld');
});

test('TC-EXECHELP-008 | parseProtobufText plain text with text pattern extracts via fallback', () => {
    // 输入: non-protobuf text containing `text: "..."`  预期: fallback regex extracts inner text
    // 断言: textOnlyMatch fallback branch — 改坏 fallback 即返回整串
    const input = 'some prefix text: "extracted" suffix';
    const result = parseProtobufText(input);
    expect(result.text).toBe('extracted');
});

test('TC-EXECHELP-009 | parseProtobufText plain text without pattern returns raw as text', () => {
    // 输入: plain text without any recognised pattern  预期: raw returned as text, empty metadata
    // 断言: else branch (result.text = raw)
    const input = 'just some plain text without patterns';
    const result = parseProtobufText(input);
    expect(result.text).toBe(input);
    expect(result.metadata).toEqual({});
});

test('TC-EXECHELP-010 | parseProtobufText skips empty lines during parsing', () => {
    // 输入: protobuf with blank lines between fields  预期: blank lines skipped, metadata correct
    // 断言: `if (!trimmed) continue` guard
    const input = '\n\nmessage_id: "m1"\n\n\nrole: user\n';
    const result = parseProtobufText(input);
    expect(result.metadata).toEqual({ message_id: 'm1', role: 'user' });
});

// ═══════════════════════════════════════════════════════════
// renderInlineMarkdown
// ═══════════════════════════════════════════════════════════

test('TC-EXECHELP-011 | renderInlineMarkdown null returns empty string', () => {
    // 输入: null  预期: ''  断言: falsy guard
    expect(renderInlineMarkdown(null)).toBe('');
});

test('TC-EXECHELP-012 | renderInlineMarkdown empty string returns empty string', () => {
    // 输入: ''  预期: ''  断言: falsy guard
    expect(renderInlineMarkdown('')).toBe('');
});

test('TC-EXECHELP-013 | renderInlineMarkdown plain text wraps in span', async () => {
    // 输入: plain text  预期: single span  断言: no-match branch pushes span with remaining
    const { container, root } = await mount(<div>{renderInlineMarkdown('just text')}</div>);
    try {
        expect(container.textContent).toBe('just text');
        expect(container.querySelector('span').textContent).toBe('just text');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-014 | renderInlineMarkdown bold renders strong element', async () => {
    // 输入: **bold text**  预期: <strong>  断言: bold branch
    const { container, root } = await mount(<div>{renderInlineMarkdown('**bold text**')}</div>);
    try {
        expect(container.querySelector('strong').textContent).toBe('bold text');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-015 | renderInlineMarkdown code renders code element', async () => {
    // 输入: `code text`  预期: <code>  断言: code branch
    const { container, root } = await mount(<div>{renderInlineMarkdown('`code text`')}</div>);
    try {
        expect(container.querySelector('code').textContent).toBe('code text');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-016 | renderInlineMarkdown mixed bold and code preserves order', async () => {
    // 输入: **bold** and `code`  预期: strong before code  断言: index comparison + ordering
    const { container, root } = await mount(<div>{renderInlineMarkdown('**bold** and `code`')}</div>);
    try {
        const els = [...container.querySelectorAll('strong, code')];
        expect(els).toHaveLength(2);
        expect(els[0].tagName).toBe('STRONG');
        expect(els[0].textContent).toBe('bold');
        expect(els[1].tagName).toBe('CODE');
        expect(els[1].textContent).toBe('code');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-017 | renderInlineMarkdown text before and after markdown', async () => {
    // 输入: before **mid** after  预期: span + strong + span  断言: leading-span branch + trailing span
    const { container, root } = await mount(<div>{renderInlineMarkdown('before **mid** after')}</div>);
    try {
        expect(container.textContent).toBe('before mid after');
        expect(container.querySelector('strong').textContent).toBe('mid');
    } finally { await unmount(root, container); }
});

// ═══════════════════════════════════════════════════════════
// MarkdownRenderer
// ═══════════════════════════════════════════════════════════

test('TC-EXECHELP-018 | MarkdownRenderer empty text returns null', async () => {
    // 输入: text=""  预期: null render  断言: no .markdown-body, no children
    const { container, root } = await mount(<MarkdownRenderer text="" />);
    try {
        expect(container.querySelector('.markdown-body')).toBeNull();
        expect(container.children.length).toBe(0);
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-019 | MarkdownRenderer null text returns null', async () => {
    // 输入: text=null  预期: null render  断言: falsy guard
    const { container, root } = await mount(<MarkdownRenderer text={null} />);
    try {
        expect(container.querySelector('.markdown-body')).toBeNull();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-020 | MarkdownRenderer renders h3 header', async () => {
    // 输入: ### Section Title  预期: <h3>  断言: h3Match branch
    const { container, root } = await mount(<MarkdownRenderer text={'### Section Title'} />);
    try {
        expect(container.querySelector('h3').textContent).toBe('Section Title');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-021 | MarkdownRenderer renders h2 header', async () => {
    // 输入: ## Subtitle  预期: <h2>  断言: h2Match branch
    const { container, root } = await mount(<MarkdownRenderer text={'## Subtitle'} />);
    try {
        expect(container.querySelector('h2').textContent).toBe('Subtitle');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-022 | MarkdownRenderer renders h1 header', async () => {
    // 输入: # Main Title  预期: <h1>  断言: h1Match branch
    const { container, root } = await mount(<MarkdownRenderer text={'# Main Title'} />);
    try {
        expect(container.querySelector('h1').textContent).toBe('Main Title');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-023 | MarkdownRenderer renders unordered list with dash', async () => {
    // 输入: - item one / - item two  预期: <ul><li> x2  断言: ulMatch branch + while loop
    const { container, root } = await mount(<MarkdownRenderer text={'- item one\n- item two'} />);
    try {
        const items = container.querySelectorAll('ul li');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toBe('item one');
        expect(items[1].textContent).toBe('item two');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-024 | MarkdownRenderer renders unordered list with asterisk', async () => {
    // 输入: * star item  预期: <ul><li>  断言: `*` alternative in ulMatch
    const { container, root } = await mount(<MarkdownRenderer text={'* star item'} />);
    try {
        expect(container.querySelector('ul li').textContent).toBe('star item');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-025 | MarkdownRenderer renders ordered list', async () => {
    // 输入: 1. first / 2. second  预期: <ol><li> x2  断言: olMatch branch
    const { container, root } = await mount(<MarkdownRenderer text={'1. first\n2. second'} />);
    try {
        const items = container.querySelectorAll('ol li');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toBe('first');
        expect(items[1].textContent).toBe('second');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-026 | MarkdownRenderer renders table with header and body', async () => {
    // 输入: markdown table with separator row  预期: <table> with th + td  断言: tableRowMatch + isSeparator filter
    const { container, root } = await mount(<MarkdownRenderer text={'| Name | Value |\n|---|---|\n| a | b |'} />);
    try {
        const ths = container.querySelectorAll('th');
        expect(ths).toHaveLength(2);
        expect(ths[0].textContent).toBe('Name');
        expect(ths[1].textContent).toBe('Value');
        const tds = container.querySelectorAll('td');
        expect(tds).toHaveLength(2);
        expect(tds[0].textContent).toBe('a');
        expect(tds[1].textContent).toBe('b');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-027 | MarkdownRenderer renders code block', async () => {
    // 输入: ``` fenced code ```  预期: <pre><code> with raw lines  断言: codeBlockMatch branch
    const { container, root } = await mount(<MarkdownRenderer text={'```\ncode line 1\ncode line 2\n```'} />);
    try {
        expect(container.querySelector('pre code').textContent).toBe('code line 1\ncode line 2');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-028 | MarkdownRenderer renders blockquote', async () => {
    // 输入: > quoted text  预期: <blockquote>  断言: blockquoteMatch branch
    const { container, root } = await mount(<MarkdownRenderer text={'> quoted text'} />);
    try {
        expect(container.querySelector('blockquote').textContent).toContain('quoted text');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-029 | MarkdownRenderer renders horizontal rule', async () => {
    // 输入: above / --- / below  预期: <hr>  断言: hrMatch branch (not ulMatch, since no space+content)
    const { container, root } = await mount(<MarkdownRenderer text={'above\n---\nbelow'} />);
    try {
        expect(container.querySelector('hr')).toBeTruthy();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-030 | MarkdownRenderer renders bold in paragraph via renderInlineMarkdown', async () => {
    // 输入: **bold paragraph**  预期: <p><strong>  断言: paragraph path + inline bold
    const { container, root } = await mount(<MarkdownRenderer text={'**bold paragraph**'} />);
    try {
        expect(container.querySelector('p strong').textContent).toBe('bold paragraph');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-031 | MarkdownRenderer renders inline code in paragraph', async () => {
    // 输入: `inline code`  预期: <p><code>  断言: paragraph path + inline code
    const { container, root } = await mount(<MarkdownRenderer text={'`inline code`'} />);
    try {
        expect(container.querySelector('p code').textContent).toBe('inline code');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-032 | MarkdownRenderer renders plain paragraph', async () => {
    // 输入: plain text  预期: <p>  断言: default paragraph branch
    const { container, root } = await mount(<MarkdownRenderer text={'just a paragraph'} />);
    try {
        expect(container.querySelector('p').textContent).toBe('just a paragraph');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-033 | MarkdownRenderer converts escaped backslash-n to newline creating two paragraphs', async () => {
    // 输入: 'line one\\nline two' (literal backslash-n)  预期: two <p> elements after \n conversion
    // 断言: text.replace(/\\n/g, '\n') at top of component
    const { container, root } = await mount(<MarkdownRenderer text={'line one\\nline two'} />);
    try {
        const ps = container.querySelectorAll('p');
        expect(ps).toHaveLength(2);
        expect(ps[0].textContent).toBe('line one');
        expect(ps[1].textContent).toBe('line two');
    } finally { await unmount(root, container); }
});

// ═══════════════════════════════════════════════════════════
// parseLogData
// ═══════════════════════════════════════════════════════════

test('TC-EXECHELP-034 | parseLogData agent_request with string request parses as protobuf', () => {
    // 输入: agent_request, data.request is string  预期: type 'protobuf'  断言: protobuf branch
    const data = { request: 'parts { text: "hello" }' };
    const result = parseLogData(data, 'agent_request');
    expect(result.type).toBe('protobuf');
    expect(result.parsed.text).toBe('hello');
});

test('TC-EXECHELP-035 | parseLogData agent_request with object request unwraps nested request', () => {
    // 输入: agent_request, data.request is {request: {...}}  预期: unwrapped inner object, type 'json'
    // 断言: parsed.request unwrap branch
    const data = { request: { request: { text: 'inner content' } } };
    const result = parseLogData(data, 'agent_request');
    expect(result.type).toBe('json');
    expect(result.parsed).toEqual({ text: 'inner content' });
});

test('TC-EXECHELP-036 | parseLogData agent_response with string response parses JSON', () => {
    // 输入: agent_response, data.response is JSON string  预期: parsed object, type 'json'
    // 断言: JSON.parse path for response
    const data = { response: '{"key":"value","num":42}' };
    const result = parseLogData(data, 'agent_response');
    expect(result.type).toBe('json');
    expect(result.parsed).toEqual({ key: 'value', num: 42 });
});

test('TC-EXECHELP-037 | parseLogData agent_response with object response unwraps nested response', () => {
    // 输入: agent_response, data.response is {response: {...}}  预期: unwrapped inner, type 'json'
    // 断言: parsed.response unwrap branch
    const data = { response: { response: { message: 'unwrapped' } } };
    const result = parseLogData(data, 'agent_response');
    expect(result.type).toBe('json');
    expect(result.parsed).toEqual({ message: 'unwrapped' });
});

test('TC-EXECHELP-038 | parseLogData invalid JSON string returns text type', () => {
    // 输入: agent_response with malformed JSON string  预期: raw string, type 'text'
    // 断言: catch branch
    const data = { response: '{not valid json' };
    const result = parseLogData(data, 'agent_response');
    expect(result.type).toBe('text');
    expect(result.parsed).toBe('{not valid json');
});

test('TC-EXECHELP-039 | parseLogData merges event-level metadata into object parsed', () => {
    // 输入: object parsed + data.metadata  预期: metadata merged into parsed.metadata
    // 断言: Object.assign merge branch
    const data = { request: { text: 'content' }, metadata: { source: 'test', version: '1' } };
    const result = parseLogData(data, 'agent_request');
    expect(result.type).toBe('json');
    expect(result.parsed).toEqual({ text: 'content', metadata: { source: 'test', version: '1' } });
});

test('TC-EXECHELP-040 | parseLogData wraps string parsed with metadata into object', () => {
    // 输入: string parsed (JSON string scalar) + data.metadata  预期: {response, metadata} wrapper
    // 断言: `else if (data.metadata && typeof parsed === 'string')` branch
    const data = { response: '"plain string"', metadata: { tag: 'meta' } };
    const result = parseLogData(data, 'agent_response');
    expect(result.type).toBe('json');
    expect(result.parsed).toEqual({ response: 'plain string', metadata: { tag: 'meta' } });
});

// ═══════════════════════════════════════════════════════════
// LogEntry
// ═══════════════════════════════════════════════════════════

test('TC-EXECHELP-041 | LogEntry renders agent_request with agent name and content', async () => {
    // 输入: agent_request event with protobuf request  预期: agent name + parsed text visible
    // 断言: data-agent attr + displayText from protobuf
    const event = { type: 'agent_request', data: { agent: 'agent-1', request: 'parts { text: "request content" }' }, timestamp: 1000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('agent-1');
        expect(container.textContent).toContain('request content');
        expect(container.querySelector('[data-agent="agent-1"]')).toBeTruthy();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-042 | LogEntry renders agent_response with content', async () => {
    // 输入: agent_response event with JSON response  预期: agent name + parsed text visible
    // 断言: blue/purple styling + findText extracts text field
    const event = { type: 'agent_response', data: { agent: 'agent-2', response: '{"text":"response content"}' }, timestamp: 2000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('agent-2');
        expect(container.textContent).toContain('response content');
        expect(container.querySelector('[class*="bg-purple-50"]')).toBeTruthy();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-043 | LogEntry renders negotiation_request with amber styling', async () => {
    // 输入: negotiation_request event  预期: negotiation_request label + amber badge  断言: isNegotiation branch
    const event = { type: 'negotiation_request', data: { agent: 'agent-3', response: '{"concern":"need more info"}' }, timestamp: 3000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('execution.negotiation_request');
        expect(container.textContent).toContain('need more info');
        expect(container.querySelector('[class*="bg-amber-50"]')).toBeTruthy();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-044 | LogEntry renders negotiation_resolved label', async () => {
    // 输入: negotiation_resolved event  预期: negotiation_resolved label + clarification text
    const event = { type: 'negotiation_resolved', data: { agent: 'agent-4', response: '{"clarification":"resolved issue"}' }, timestamp: 4000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('execution.negotiation_resolved');
        expect(container.textContent).toContain('resolved issue');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-045 | LogEntry renders negotiation_failed with rose styling', async () => {
    // 输入: negotiation_failed event  预期: negotiation_failed label + rose badge  断言: isNegotiationFailed branch
    const event = { type: 'negotiation_failed', data: { agent: 'agent-5', response: '{"reason":"no agreement"}' }, timestamp: 5000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('execution.negotiation_failed');
        expect(container.textContent).toContain('no agreement');
        expect(container.querySelector('[class*="bg-rose-50"]')).toBeTruthy();
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-046 | LogEntry showRaw toggle displays JSON pre and switches button label', async () => {
    // 输入: agent_response event, click view_detail button  预期: <pre> with JSON, label switches to show_less
    // 断言: showRaw state toggle + isJson pre branch
    const event = { type: 'agent_response', data: { agent: 'agent-6', response: '{"text":"raw content"}' }, timestamp: 6000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.querySelector('pre')).toBeNull();
        const viewBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('execution.view_detail'));
        expect(viewBtn).toBeTruthy();
        await act(async () => Simulate.click(viewBtn));
        await flush();
        const pre = container.querySelector('pre');
        expect(pre).toBeTruthy();
        expect(pre.textContent).toContain('"text"');
        expect(pre.textContent).toContain('raw content');
        expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('execution.show_less'))).toBe(true);
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-047 | LogEntry showMeta toggle reveals protobuf metadata fields', async () => {
    // 输入: agent_request protobuf with metadata, click request_meta button  预期: metadata fields revealed
    // 断言: showMeta state toggle + metadata panel render
    const event = { type: 'agent_request', data: { agent: 'agent-7', request: 'message_id: "meta-id"\nrole: assistant\nparts { text: "content" }' }, timestamp: 7000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        const metaBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('execution.request_meta'));
        expect(metaBtn).toBeTruthy();
        expect(container.textContent).not.toContain('meta-id');
        await act(async () => Simulate.click(metaBtn));
        await flush();
        expect(container.textContent).toContain('meta-id');
        expect(container.textContent).toContain('assistant');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-048 | LogEntry empty displayText shows no_text placeholder', async () => {
    // 输入: agent_response with empty object response  预期: execution.no_text placeholder visible
    // 断言: displayText falsy branch
    const event = { type: 'agent_response', data: { agent: 'agent-8', response: '{}' }, timestamp: 8000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('execution.no_text');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-049 | LogEntry isSelected applies blue selection styling', async () => {
    // 输入: isSelected=true  预期: blue selection classes on outer div  断言: isSelected styling branch
    const event = { type: 'agent_request', data: { agent: 'agent-9', request: 'parts { text: "sel" }' }, timestamp: 9000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={true} />);
    try {
        const outer = container.querySelector('[data-agent="agent-9"]');
        expect(outer.className).toContain('bg-blue-500/5');
        expect(outer.className).toContain('border-blue-500');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-050 | LogEntry findText surfaces metadata string values longer than 10 chars', async () => {
    // 输入: parsed object with no text fields but metadata holding a long string  预期: long metadata value shown
    // 断言: findText metadata-entry branch (obj.metadata + val.length > 10)
    const event = { type: 'agent_response', data: { agent: 'agent-10', response: '{"metadata":{"source":"a-very-long-source-value"}}' }, timestamp: 10000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('a-very-long-source-value');
    } finally { await unmount(root, container); }
});

test('TC-EXECHELP-051 | LogEntry findText recurses into nested object properties', async () => {
    // 输入: parsed object with nested {text: ...} and no direct/fields  预期: nested text surfaced
    // 断言: findText Object.keys recursive fallback branch
    const event = { type: 'agent_response', data: { agent: 'agent-11', response: '{"nested":{"text":"deep text"}}' }, timestamp: 11000 };
    const { container, root } = await mount(<LogEntry event={event} isDark={false} t={t} isSelected={false} />);
    try {
        expect(container.textContent).toContain('deep text');
    } finally { await unmount(root, container); }
});
