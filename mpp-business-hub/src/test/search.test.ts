import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';

describe('Search that explains itself', () => {
  it('finds by P-ID, step title, SKU, file name, script name, upload number — each with a reason and a link to the exact place', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const p = hub.searchAll(U.erika, 'P-012');
    expect(p[0]).toMatchObject({ kind: 'Project', why: 'Matches the project number', link: '/projects/prj-012' });
    const sku = hub.searchAll(U.erika, 'FBA_TY001');
    expect(sku.some((h) => h.kind === 'File' && /variation move file/.test(h.title))).toBe(true);
    expect(sku.some((h) => h.kind === 'History' && /Matches activity the computer saw/.test(h.why) && h.link === '/projects/prj-081/steps/s-081-2')).toBe(true);
    const ref = hub.searchAll(U.erika, '99105020742');
    expect(ref[0].why).toMatch(/upload number/);
    const script = hub.searchAll(U.erika, 'Shopify Lister');
    expect(script.find((h) => h.kind === 'File')!.why).toMatch(/Found in the file name, used in Step “Use Shopify Lister/);
    expect(script.find((h) => h.kind === 'Step')!.link).toBe('/projects/prj-012/steps/s-012-3');
    expect(hub.searchAll(U.erika, 'SEO_MASTER_copy').length).toBe(0);
    expect(hub.searchAll(U.erika, 'x')).toEqual([]); // too short to mean anything
  });

  it('pausing does not remove anything from search', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    expect(hub.searchAll(U.erika, 'P-012')[0].link).toBe('/projects/prj-012');
    expect(hub.searchAll(U.dalia, 'Shopify Lister').length).toBeGreaterThan(0);
  });

  it('results are scoped: Arantza sees none of Erika’s projects, nobody sees private items, only the owner sees recommendations and people', async () => {
    const hub = await newHub();
    expect(hub.searchAll(U.arantza, 'P-012')).toEqual([]);
    expect(hub.searchAll(U.arantza, 'Shopify Lister')).toEqual([]);
    for (const uid of [U.erika, U.arantza, U.carolina, U.printA, U.extra]) {
      for (const q of ['Owner Private', 'planning', 'P-D01', 'private', 'financial', 'AF-001', 'toner', 'Erika']) {
        const hits = hub.searchAll(uid, q);
        expect(hits.some((h) => /Private|P-D01|AF-0|Recommendation|Person/.test(`${h.title} ${h.kind}`))).toBe(false);
      }
    }
    expect(hub.searchAll(U.dalia, 'AF-001')[0]).toMatchObject({ kind: 'Recommendation', link: '/owner/ai/af-1' });
    expect(hub.searchAll(U.dalia, 'Owner Private')[0].kind).toBe('Project');
    expect(hub.searchAll(U.dalia, 'Arantza').some((h) => h.kind === 'Person')).toBe(true);
  });
});
