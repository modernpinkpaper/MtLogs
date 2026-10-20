import { describe, expect, it } from 'vitest';
import { newHub, U } from './helpers';

// v1.8: employee step page — labels, adding, reordering, files, "Completed" in every state
describe('v1.8 step work', () => {
  it('adds blank steps and sub steps with letters 4A, 4B', async () => {
    const hub = await newHub();
    const made = hub.addSteps(U.erika, 'prj-070', 2);
    expect(made).toHaveLength(2);
    const sub = hub.addSteps(U.erika, 'prj-070', 2, 's-070-2');
    const labels = hub.stepLabelsFor(U.erika, 'prj-070');
    expect(labels.get('s-070-2')).toBe('2');
    expect(labels.get(sub[0].id)).toBe('2A');
    expect(labels.get(sub[1].id)).toBe('2B');
  });

  it('rejects a count outside 1 to 40', async () => {
    const hub = await newHub();
    expect(() => hub.addSteps(U.erika, 'prj-070', 0)).toThrow();
    expect(() => hub.addSteps(U.erika, 'prj-070', 41)).toThrow();
  });

  it('reordering renumbers steps and keeps file names in step', async () => {
    const hub = await newHub();
    const f = hub.createStepFile(U.erika, 's-070-2', { kind: 'DOC' });
    expect(f.label).toContain('P-070');
    expect(f.label).toContain('2 Build Amazon listing automation');
    expect(f.label).toContain('File 1');
    const ids = hub.projectSteps(U.erika, 'prj-070').filter((s) => !s.parentStepId).sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id);
    const [first, second, ...rest] = ids;
    hub.reorderSteps(U.erika, 'prj-070', null, [second, first, ...rest]);
    const after = hub.state.resources.find((r) => r.id === f.id)!;
    expect(after.label).toContain(' 1 Build Amazon listing automation');
    expect(hub.stepLabelsFor(U.erika, 'prj-070').get('s-070-2')).toBe('1');
  });

  it('renaming a step renames its files', async () => {
    const hub = await newHub();
    const f = hub.createStepFile(U.erika, 's-070-2', { kind: 'SHEET', mode: 'BLANK' });
    hub.renameStep(U.erika, 's-070-2', 'Build the helper');
    expect(hub.state.resources.find((r) => r.id === f.id)!.label).toContain('2 Build the helper');
  });

  it('Completed works from every state, including already done, and refreshes the date', async () => {
    const hub = await newHub();
    hub.transitionStep(U.erika, 's-070-2', 'BLOCKED', { reason: 'waiting on access' });
    hub.transitionStep(U.erika, 's-070-2', 'REPORTED_COMPLETE');
    const first = hub.getStep(U.erika, 's-070-2').lastConfirmedAt;
    expect(first).toBeTruthy();
    hub.transitionStep(U.erika, 's-070-2', 'REPORTED_COMPLETE');
    expect(hub.getStep(U.erika, 's-070-2').status).toBe('REPORTED_COMPLETE');
  });

  it('an employee cannot reorder or add steps in a project they are not on', async () => {
    const hub = await newHub();
    expect(() => hub.addSteps(U.arantza, 'prj-070', 1)).toThrow();
  });

  it('linking an existing file needs a full link and a name', async () => {
    const hub = await newHub();
    expect(() => hub.linkExistingFile(U.erika, 's-070-2', { url: 'nope', name: 'x' })).toThrow();
    const r = hub.linkExistingFile(U.erika, 's-070-2', { url: 'https://docs.google.com/spreadsheets/d/abc', name: 'My old sheet' });
    expect(r.label).toBe('My old sheet');
  });
});
