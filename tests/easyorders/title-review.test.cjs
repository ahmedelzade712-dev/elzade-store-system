const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}, processMock = process) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, process: processMock, console,
    require(name) { if (!(name in imports)) throw new Error('Unexpected dependency: ' + name); return imports[name]; },
  }, { filename: file });
  return module.exports;
}
const helper = load('lib/integrations/easyorders/title-review.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const polluted = {
  title: ' بيجامة أنيقة ', description: 'AI must not save this',
  color_name: 'AI color', visible_details: ['AI detail'], price: 1, sku: 'changed',
};

test('AI output and approval export allow only the commercial name', () => {
  assert.deepEqual(plain(helper.parseTitleDraft(JSON.stringify(polluted))), { title: 'بيجامة أنيقة' });
  assert.deepEqual(plain(helper.approvedTitlePayload('product-1', { ...polluted, approved: true })), {
    erp_product_id: 'product-1', display_title: 'بيجامة أنيقة',
  });
  assert.throws(() => helper.approvedTitlePayload('p', { title: 'name', approved: false }), /approval/);
});
test('legacy browser drafts drop AI descriptions and require name-only reapproval', () => {
  const old = { p: { ...polluted, approved: true, image_url: 'https://example.test/image', updated_at: 'date' } };
  const before = JSON.stringify(old);
  const restored = helper.restoreTitleDrafts(old, true);
  assert.deepEqual(Object.keys(restored.p).sort(), ['approved', 'image_url', 'title', 'updated_at']);
  assert.equal(restored.p.approved, false);
  assert.equal(JSON.stringify(old), before);
  assert.equal(helper.restoreTitleDrafts(old).p.approved, true);
});
test('invalid titles are rejected without falling back to description', () => {
  for (const value of [null, {}, { title: '' }, { title: ' ' }, { title: 1 }, { title: 'x'.repeat(121) }, { description: 'not a title' }]) {
    assert.throws(() => helper.titleOnly(value));
  }
});
test('suggestion route returns title only and performs no ERP or EasyOrders writes', async () => {
  const original = { id: '11111111-1111-1111-1111-111111111111',
    main_image_url: 'https://example.test/storage/v1/object/public/product-images/item.jpg',
    fabric: 'ستان', description: ' وصف ERP الأصلي\nيبقى كما هو 100%  ', color: 'أسود', sku: 'SKU-1', price: 99 };
  const snapshot = JSON.stringify(original);
  let prompt = '';
  const reads = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from(table) {
      reads.push(table);
      const value = table === 'profiles' ? { role: 'admin', is_active: true }
        : table === 'products' ? original : [{ color: original.color }];
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: value }),
        then(resolve) { return Promise.resolve({ data: value }).then(resolve); },
      };
      return query; // No insert/update/delete methods: any attempted write fails the test.
    },
  };
  class FakeAI {
    responses = { create: async (input) => {
      prompt = input.input[0].content[0].text;
      return { output_text: JSON.stringify(polluted) };
    } };
  }
  const route = load('app/api/integrations/easyorders/suggest-product/route.ts', {
    openai: FakeAI,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabaseAdmin': { supabaseAdmin: db },
    '@/lib/integrations/easyorders/title-review': helper,
  }, { env: { VERCEL_ENV: 'preview', OPENAI_API_KEY: 'test-only-not-a-key', NEXT_PUBLIC_SUPABASE_URL: 'https://example.test' } });
  const response = await route.POST(new Request('https://example.test/suggest', {
    method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: original.id, description: 'ignored client description' }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).draft, { title: 'بيجامة أنيقة' });
  assert.match(prompt, /بمفتاح واحد فقط: title/);
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(reads, ['profiles', 'products', 'product_variants']);
});
