import { describe, expect, it } from 'vitest';
import { applyAll, getPath, parseJSONL, resolve, safeUrl, setPath } from '../src/lib/a2ui/model';
import { type A2UIMessage, SHIPPIN_CATALOG } from '../src/lib/a2ui/types';

const basic = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const spec = parseJSONL(`{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"${basic}"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["t"]},{"id":"t","component":"Text","text":{"path":"/user/name"}}]}}
not json
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/user","value":{"name":"Alice"}}}`);

describe('A2UI surface state', () => {
	it('parses JSONL, skips bad lines and resolves bound text', () => {
		expect(spec).toHaveLength(3);
		const s = applyAll(spec).main;
		expect(s.components.root.component).toBe('Column');
		expect(resolve((s.components.t as { text: { path: string } }).text, s.data)).toBe('Alice');
	});

	it('drops unknown catalogs, unknown components and wrong versions', () => {
		const ms = [
			{ version: 'v0.9', createSurface: { surfaceId: 'x', catalogId: 'https://evil.example/catalog' } },
			{ version: 'v0.9', createSurface: { surfaceId: 'y', catalogId: SHIPPIN_CATALOG } },
			{
				version: 'v0.9',
				updateComponents: {
					surfaceId: 'y',
					components: [
						{ id: 'root', component: 'Script', src: 'x' },
						{ id: 'ok', component: 'Divider' }
					]
				}
			},
			{ version: 'v0.8', deleteSurface: { surfaceId: 'y' } }
		] as unknown as A2UIMessage[];
		const s = applyAll(ms);
		expect(s.x).toBeUndefined();
		expect(Object.keys(s.y.components)).toEqual(['ok']);
	});

	it('keeps the first of two creates, deletes, and ignores updates to missing surfaces', () => {
		const c: A2UIMessage = { version: 'v0.9', createSurface: { surfaceId: 'a', catalogId: SHIPPIN_CATALOG } };
		const u: A2UIMessage = { version: 'v0.9', updateDataModel: { surfaceId: 'a', value: { n: 1 } } };
		expect(applyAll([c, u, c]).a.data).toEqual({ n: 1 });
		expect(applyAll([c, { version: 'v0.9', deleteSurface: { surfaceId: 'a' } }]).a).toBeUndefined();
		expect(applyAll([u])).toEqual({});
	});

	it('reads and writes JSON pointers immutably', () => {
		const d = { list: [{ name: 'a' }, { name: 'b' }], 'x/y': 1 };
		expect(getPath(d, 'name', '/list/1')).toBe('b');
		expect(getPath(d, '/x~1y')).toBe(1);
		expect(setPath(d, '/list/0/name', 'z')).toEqual({ list: [{ name: 'z' }, { name: 'b' }], 'x/y': 1 });
		expect(setPath({ a: 1, b: 2 }, '/a', undefined)).toEqual({ b: 2 });
		expect(setPath({}, '/new/deep', true)).toEqual({ new: { deep: true } });
		expect(d.list[0].name).toBe('a');
	});

	it('cannot be used to poison prototypes', () => {
		setPath({}, '/__proto__/polluted', true);
		setPath({}, '/a/constructor/prototype/polluted', true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(getPath({}, '/__proto__')).toBeUndefined();
		expect(getPath({}, '/toString')).toBeUndefined();
		const s = applyAll([
			{ version: 'v0.9', createSurface: { surfaceId: '__proto__', catalogId: SHIPPIN_CATALOG } }
		]);
		expect(Object.keys(s)).toEqual([]);
	});

	it('only lets web links open', () => {
		expect(safeUrl('https://shippin.tech/x')).toBe('https://shippin.tech/x');
		expect(safeUrl('javascript:alert(1)')).toBeNull();
		expect(safeUrl('data:text/html,hi')).toBeNull();
		expect(safeUrl(5)).toBeNull();
	});
});
